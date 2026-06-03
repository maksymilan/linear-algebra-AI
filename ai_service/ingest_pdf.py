import os
import re
import argparse
import json
import pymupdf
import psycopg2
import base64
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
from pgvector.psycopg2 import register_vector
from dotenv import load_dotenv
from tqdm import tqdm

from clients import client
from config import resolve_model, settings
from llm import chat_completion
from response_utils import parse_model_json

# 加载环境变量
load_dotenv()

# 获取 Embedding 和 VL 模型
embedding_model = resolve_model("embedding")
vl_model = resolve_model("ocr")


# ---------------------------------------------------------------------------
# OCR 输出清洗
# ---------------------------------------------------------------------------

_NOISE_KEYWORDS = (
    "ctex.cc",
    "ctex.org",
    "latex.codecogs",
    "mathpix",
    "以下是提取",
    "以下为提取",
    "以上是提取",
    "以上为提取",
    "提取结果如下",
    "这是提取的",
    "好的，",
    "好的,",
    "希望对你有帮助",
    "希望能帮到",
    "如果公式较多",
    "如有需要",
    "如需进一步",
    "建议使用",
    "建议你",
    "建议您",
    "推荐使用",
    "排版",
    "祝你学习",
)

_URL_RE = re.compile(r"https?://\S+|www\.\S+|`https?://[^`]+`")
_BACKTICK_URL_RE = re.compile(r"`\s*https?://[^`]+\s*`")


# ---------------------------------------------------------------------------
# 裸 LaTeX 命令自动补 $
# ---------------------------------------------------------------------------
# OCR 模型偶尔漏写 $，导致 \alpha \frac{a}{b} 这类命令以裸文本形式入库，
# 既污染 embedding 语义，又让前端 KaTeX 无法识别。
# 这里线性扫描一遍，遇到"不在 $...$ 内"的 LaTeX 命令段，自动包一对 $。

# 匹配一段数学："\cmd" 或 "\cmd{...}" 或 "^_{...}" 或 "^_单字符"，
# 可以贪婪地吞掉相邻的命令/上下标/简单算符，形成较长的整段。
_MATH_SEG_RE = re.compile(
    r"(?:\\[A-Za-z]+(?:\{[^{}$]*\})*|[_^]\{[^{}$]*\}|[_^][A-Za-z0-9])"
    r"(?:\s*(?:\\[A-Za-z]+(?:\{[^{}$]*\})*|[_^]\{[^{}$]*\}|[_^][A-Za-z0-9]|[=+\-*/.,]|\d+))*"
)
_LOOKS_LIKE_MATH_RE = re.compile(r"\\[A-Za-z]+|[_^][A-Za-z0-9{]")


def auto_wrap_math(text: str) -> str:
    """把裸 LaTeX 命令段自动包裹为 $...$。已在 $...$ 内的段保持原样。"""
    if not text or not _LOOKS_LIKE_MATH_RE.search(text):
        return text

    # 先把已有 $$...$$ / $...$ 段切出来，只对"数学外"的片段做 wrap，避免重复包裹
    parts: list[tuple[str, str]] = []  # [(kind, content)]  kind = 'math' | 'plain'
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch == "$":
            is_double = text[i + 1:i + 2] == "$"
            delim = "$$" if is_double else "$"
            end = text.find(delim, i + len(delim))
            if end == -1:
                # 未闭合的 $，当成普通文本，避免破坏内容
                parts.append(("plain", text[i:]))
                i = n
                break
            parts.append(("math", text[i:end + len(delim)]))
            i = end + len(delim)
        else:
            # 吃到下一个 $ 为止
            j = text.find("$", i)
            if j == -1:
                parts.append(("plain", text[i:]))
                i = n
                break
            parts.append(("plain", text[i:j]))
            i = j

    # 对 plain 片段逐一包裹
    wrapped_parts: list[str] = []
    for kind, seg in parts:
        if kind == "math" or not seg:
            wrapped_parts.append(seg)
            continue

        out: list[str] = []
        k = 0
        while k < len(seg):
            m = _MATH_SEG_RE.search(seg, k)
            if not m:
                out.append(seg[k:])
                break
            s, e = m.start(), m.end()
            out.append(seg[k:s])
            out.append("$" + m.group(0) + "$")
            k = e
        wrapped_parts.append("".join(out))

    return "".join(wrapped_parts)


def sanitize_ocr_text(text: str) -> str:
    """
    清洗单页 OCR 结果：
    1) 去掉模型寒暄/排版建议类整行；
    2) 去除行内裸 URL / 反引号包裹的 URL；
    3) 合并多余空行。
    """
    if not text:
        return ""

    cleaned_lines = []
    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        low = line.strip().lower()
        stripped = line.strip()

        # 空行保留一个，后面再压缩
        if not stripped:
            cleaned_lines.append("")
            continue

        # 含噪声关键词的行整行丢弃
        if any(kw in stripped for kw in _NOISE_KEYWORDS):
            continue

        # 只由 URL 构成（可能被反引号包裹）的行丢弃
        if _URL_RE.fullmatch(stripped) or _BACKTICK_URL_RE.fullmatch(stripped):
            continue

        # 行内 URL 去掉，保留其余文字
        line = _BACKTICK_URL_RE.sub("", line)
        line = _URL_RE.sub("", line)
        # 再次判空
        if not line.strip():
            continue

        # 排除明显只是英文礼貌语的短行
        if low in {"here is the extracted text:", "here is the extraction:", "ok", "okay"}:
            continue

        cleaned_lines.append(line)

    # 压缩连续空行
    result: list[str] = []
    prev_empty = False
    for ln in cleaned_lines:
        if ln.strip() == "":
            if prev_empty:
                continue
            prev_empty = True
        else:
            prev_empty = False
        result.append(ln)

    # 最后再跑一次"裸 LaTeX 命令自动补 $"
    return auto_wrap_math("\n".join(result).strip())


OCR_PROMPT = (
    "你是一个严格的 OCR 引擎，用于提取大学线性代数教材的内容。\n"
    "请严格遵守以下规则：\n"
    "1. 只输出图片上**实际可见**的文字/公式/表格数据；\n"
    "2. 数学公式/记号**必须**用 LaTeX，并**必须**用 $ 包裹：\n"
    "   - 行内公式用 $...$；独立成行的公式用 $$...$$；\n"
    "   - **所有**希腊字母（α β γ λ μ σ φ ψ ω 以及 Γ Δ Σ Ω 等）哪怕只是单独出现，也必须写成 $\\alpha$ $\\beta$ 的形式；\n"
    "   - 所有 \\frac \\sqrt \\sum \\prod \\int \\vec \\overline \\mathbb \\mathbf "
    "\\cdot \\times \\perp \\leq \\geq \\neq 等命令必须被 $ 包裹；\n"
    "   - 下标/上标（如 a_1, x^2, \\beta_{k-1}）必须整体包在 $ 内；\n"
    "   - 向量 / 矩阵记号（如 $\\vec{a}$、$\\mathbf{A}$、$\\boldsymbol{\\alpha}$）必须包 $；\n"
    "   - **绝对禁止**出现不被 $ 包裹的裸反斜杠命令；\n"
    "3. **禁止**添加任何开场白、结束语、解释、排版建议、注意事项、祝福语；\n"
    "4. **禁止**推荐任何外部网站/工具/软件（例如 ctex.cc、Mathpix、LaTeX 编辑器等）；\n"
    "5. **禁止**输出 markdown 代码块标记（```），直接输出纯文本；\n"
    "6. 如果图片空白或无法识别，只回复三个字：`[空白]`。"
)

OCR_REPAIR_PROMPT = """
你是线性代数教材 OCR 质检与结构化抽取器。
请阅读一页 OCR 文本，做三件事：
1. 修复明显 OCR 错字、断行、重复页眉页脚和错误空格。
2. 修复 LaTeX：所有数学公式必须使用合法 LaTeX，并用 $...$ 或 $$...$$ 包裹。
3. 抽取本页出现的习题/例题/思考题，题干、答案、解析能从页面看出才填写，不能看出就留空字符串。

严格限制：
- 不要编造课本没有出现的知识点、答案或证明。
- 不要把普通正文误判为题目。
- 可以补足因 OCR 断行导致的局部上下文，但不要新增外部知识。
- 只输出 JSON，不要输出 Markdown 代码块或解释。

JSON 格式：
{
  "cleaned_text": "修复后的完整页面文本",
  "exercises": [
    {
      "exercise_number": "题号或例题编号，未知则空字符串",
      "stem": "题干",
      "answer": "页面上可见的答案，未知则空字符串",
      "solution": "页面上可见的解析，未知则空字符串",
      "concepts": ["相关概念关键词"],
      "source_excerpt": "用于追溯的原文短摘录"
    }
  ]
}
"""

EXERCISE_EXTRACT_PROMPT = """
你是线性代数教材题目抽取器。
请只从给定的单页教材文本中抽取习题、例题、思考题或练习题。

严格限制：
- 不要抽取普通正文、定义、定理或证明段落。
- 不要编造答案或解析；页面没有明确给出就填空字符串。
- 只输出 JSON，不要输出 Markdown 代码块或解释。

JSON 格式：
{
  "exercises": [
    {
      "exercise_number": "题号或例题编号，未知则空字符串",
      "stem": "题干",
      "answer": "页面上可见的答案，未知则空字符串",
      "solution": "页面上可见的解析，未知则空字符串",
      "concepts": ["相关概念关键词"],
      "source_excerpt": "用于追溯的原文短摘录"
    }
  ]
}
"""


def _normalize_exercises(raw_exercises, page_num):
    exercises = []
    if not isinstance(raw_exercises, list):
        return exercises
    for item in raw_exercises:
        if not isinstance(item, dict):
            continue
        stem = str(item.get("stem") or "").strip()
        if not stem:
            continue
        concepts = item.get("concepts") or []
        if isinstance(concepts, list):
            concepts_text = ", ".join(str(concept).strip() for concept in concepts if str(concept).strip())
        else:
            concepts_text = str(concepts).strip()
        exercises.append(
            {
                "page_num": page_num,
                "exercise_number": str(item.get("exercise_number") or "").strip(),
                "stem": stem,
                "answer": str(item.get("answer") or "").strip(),
                "solution": str(item.get("solution") or "").strip(),
                "concepts": concepts_text,
                "source_excerpt": str(item.get("source_excerpt") or "").strip(),
            }
        )
    return exercises


def repair_ocr_page(page_text, page_num):
    page_text = sanitize_ocr_text(page_text)
    if not settings.ocr_repair_enabled or not page_text or page_text in {"[空白]", "[解析失败]"}:
        return page_text, []

    try:
        response = chat_completion(
            client,
            model=resolve_model("ocr_repair"),
            messages=[
                {"role": "system", "content": OCR_REPAIR_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"页码：{page_num}\n"
                        "请修复并结构化以下 OCR 文本：\n\n"
                        f"{page_text}"
                    ),
                },
            ],
            max_tokens=4096,
            temperature=0.1,
        )
        raw = response.choices[0].message.content or ""
        parsed = parse_model_json(raw)
        if not isinstance(parsed, dict):
            parsed = json.loads(raw)
        cleaned_text = sanitize_ocr_text(str(parsed.get("cleaned_text") or page_text))
        exercises = _normalize_exercises(parsed.get("exercises"), page_num)
        if resolve_model("exercise_extract") != resolve_model("ocr_repair"):
            exercises = extract_exercises_from_page(cleaned_text, page_num)
        return cleaned_text or page_text, exercises
    except Exception as exc:
        print(f"\n[警告] 第 {page_num} 页 OCR 修复/题目抽取失败，使用原始 OCR 文本: {exc}")
        return page_text, []


def extract_exercises_from_page(cleaned_text, page_num):
    if not cleaned_text or cleaned_text in {"[空白]", "[解析失败]"}:
        return []
    try:
        response = chat_completion(
            client,
            model=resolve_model("exercise_extract"),
            messages=[
                {"role": "system", "content": EXERCISE_EXTRACT_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"页码：{page_num}\n"
                        "请从以下页面文本中抽取题目：\n\n"
                        f"{cleaned_text}"
                    ),
                },
            ],
            max_tokens=4096,
            temperature=0.1,
        )
        raw = response.choices[0].message.content or ""
        parsed = parse_model_json(raw)
        if not isinstance(parsed, dict):
            parsed = json.loads(raw)
        return _normalize_exercises(parsed.get("exercises"), page_num)
    except Exception as exc:
        print(f"\n[警告] 第 {page_num} 页题目抽取失败: {exc}")
        return []

def extract_text_via_ocr(pdf_path, textbook_id=None, max_workers=5, return_metadata=False):
    print(f"正在读取 PDF: {pdf_path} (启用大模型 OCR 提取模式, 并发线程: {max_workers}) ...")
    try:
        doc = pymupdf.open(pdf_path)
    except Exception as e:
        print(f"读取 PDF 失败: {e}")
        exit(1)
        
    output_txt_path = pdf_path + ".ocr.txt"
    print(f"OCR 提取结果将实时保存在: {output_txt_path}")
    
    total_pages = len(doc)
    # 如果传了 textbook_id，先更新数据库的 total_pages
    if textbook_id is not None:
        try:
            conn = psycopg2.connect(dbname="LA-DB", user="postgres", password="password", host="localhost", port="5432")
            cur = conn.cursor()
            cur.execute("UPDATE textbooks SET total_pages = %s WHERE id = %s", (total_pages, textbook_id))
            conn.commit()
            cur.close()
            conn.close()
        except Exception as e:
            print(f"更新 total_pages 失败: {e}")
    
    # 尝试读取已有的进度
    completed_pages = set()
    if os.path.exists(output_txt_path):
        with open(output_txt_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("--- 第 ") and " 页 ---" in line:
                    try:
                        page_num = int(line.split("--- 第 ")[1].split(" 页 ---")[0])
                        completed_pages.add(page_num - 1) # page_num 是从 1 开始的，索引从 0 开始
                    except:
                        pass
        print(f"检测到已有解析记录，已完成 {len(completed_pages)} 页，将跳过这些页面...")
        if textbook_id is not None:
             try:
                 conn = psycopg2.connect(dbname="LA-DB", user="postgres", password="password", host="localhost", port="5432")
                 cur = conn.cursor()
                 cur.execute("UPDATE textbooks SET processed_pages = %s WHERE id = %s", (len(completed_pages), textbook_id))
                 conn.commit()
                 cur.close()
                 conn.close()
             except Exception as e:
                 pass

    pages_to_process = [i for i in range(total_pages) if i not in completed_pages]
    
    # 预先分配好结果数组，保证顺序
    results = [""] * total_pages
    exercise_results = []
    
    # 锁用于保护写入文件和更新进度条
    file_lock = Lock()
    
    # 记录目前已完成的总页数（包含之前缓存的）
    current_processed_pages = len(completed_pages)

    def process_page(i):
        page = doc[i]
        pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2))
        img_bytes = pix.tobytes("png")
        base64_image = base64.b64encode(img_bytes).decode('utf-8')
        data_url = f"data:image/png;base64,{base64_image}"
        
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": OCR_PROMPT
                    },
                    {
                        "type": "image_url", 
                        "image_url": {"url": data_url}
                    }
                ]
            }
        ]
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = chat_completion(
                    client,
                    model=vl_model, 
                    messages=messages, 
                    max_tokens=2048,
                    temperature=0.1
                )
                page_text = response.choices[0].message.content or ""
                # 清洗掉模型"排版建议""寒暄"之类的脏行
                page_text, page_exercises = repair_ocr_page(page_text, i + 1)

                formatted_text = f"\n\n--- 第 {i+1} 页 ---\n\n" + page_text + "\n"
                
                # 实时追加写入文件 (加锁防冲突)
                with file_lock:
                    with open(output_txt_path, "a", encoding="utf-8") as f:
                        f.write(formatted_text)
                
                return i, formatted_text, page_exercises
            except Exception as e:
                if attempt < max_retries - 1:
                    time.sleep(2)
                else:
                    print(f"\n[警告] 第 {i+1} 页 OCR 解析失败: {e}")
                    return i, f"\n\n--- 第 {i+1} 页 ---\n\n[解析失败]\n", []

    # 使用线程池并发执行
    with tqdm(total=total_pages, initial=len(completed_pages), desc="AI 视觉 OCR 并发解析") as pbar:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # 提交所有任务
            future_to_page = {executor.submit(process_page, i): i for i in pages_to_process}
            
            # 获取结果
            for future in as_completed(future_to_page):
                page_index, text_result, page_exercises = future.result()
                results[page_index] = text_result
                exercise_results.extend(page_exercises)
                pbar.update(1)
                
                # 实时更新数据库进度
                if textbook_id is not None:
                    with file_lock:
                        current_processed_pages += 1
                        try:
                            conn = psycopg2.connect(dbname="LA-DB", user="postgres", password="password", host="localhost", port="5432")
                            cur = conn.cursor()
                            cur.execute("UPDATE textbooks SET processed_pages = %s WHERE id = %s RETURNING status", (current_processed_pages, textbook_id))
                            updated_status = cur.fetchone()[0]
                            conn.commit()
                            cur.close()
                            conn.close()
                            
                            # 检查是否被取消
                            if updated_status == 'canceled':
                                print("检测到取消信号，终止解析...")
                                executor.shutdown(wait=False, cancel_futures=True)
                                raise Exception("Task canceled by user")
                                
                        except Exception as e:
                            if str(e) == "Task canceled by user":
                                raise e
                            pass

    # 重新读取完整文件，以保证最终 text 变量中的页面顺序是正确的（因为并发写入会导致 txt 文件里顺序错乱）
    # 在实际 RAG 场景中，只要打好了 page chunk，顺序错乱一点点影响不大，但为了安全起见我们这里统一合并
    print("并发提取完成，正在合并文本...")
    final_text = ""
    # 我们这里直接从结果数组中拼接，对于之前已经完成的页面，我们从 txt 里重新提取
    if len(completed_pages) > 0:
         with open(output_txt_path, "r", encoding="utf-8") as f:
             content = f.read()
             # 简单的按页切分并填入 results
             parts = content.split("--- 第 ")
             for part in parts[1:]:
                 try:
                     page_str = part.split(" 页 ---")[0]
                     page_idx = int(page_str) - 1
                     results[page_idx] = f"\n\n--- 第 {page_idx+1} 页 ---" + part.split(" 页 ---", 1)[1]
                 except:
                     pass
                     
    final_text = "".join([res for res in results if res])
    if return_metadata:
        return final_text, exercise_results
    return final_text

def chunk_text(text, chunk_size=800, overlap=100):
    print(f"正在对文本进行语义分块 (Chunk Size: {chunk_size}, Overlap: {overlap}) ...")
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n+", text) if part.strip()]
    chunks = []
    current = ""
    previous_tail = ""

    for paragraph in paragraphs:
        if len(paragraph) > chunk_size:
            if current.strip():
                chunks.append(current.strip())
                previous_tail = current[-overlap:]
                current = ""
            start = 0
            while start < len(paragraph):
                part = paragraph[start:start + chunk_size]
                if previous_tail:
                    part = f"【上下文提示】上一片段结尾：{previous_tail}\n\n{part}"
                chunks.append(part.strip())
                previous_tail = part[-overlap:]
                start += max(1, chunk_size - overlap)
            continue

        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) <= chunk_size:
            current = candidate
            continue

        if current.strip():
            chunks.append(current.strip())
            previous_tail = current[-overlap:]
        current = paragraph

    if current.strip():
        if previous_tail and len(current) + len(previous_tail) + 20 <= chunk_size + overlap:
            current = f"【上下文提示】上一片段结尾：{previous_tail}\n\n{current}"
        chunks.append(current.strip())

    print(f"共生成 {len(chunks)} 个文本块。")
    return chunks

def get_embeddings(texts):
    # 批量获取 embedding
    response = client.embeddings.create(
        input=texts,
        model=embedding_model
    )
    return [data.embedding for data in response.data]

def ingest_exercises_to_db(textbook_id, textbook_name, exercises):
    if not exercises:
        print("未抽取到可入库的题目。")
        return

    print(f"正在写入 {len(exercises)} 道题目...")
    conn = psycopg2.connect(
        dbname=settings.db_name,
        user=settings.db_user,
        password=settings.db_password,
        host=settings.db_host,
        port=settings.db_port,
    )
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM textbook_exercises WHERE textbook_name = %s OR textbook_id = %s",
        (textbook_name, textbook_id),
    )
    for exercise in exercises:
        cur.execute(
            """
            INSERT INTO textbook_exercises
                (textbook_id, textbook_name, page_num, exercise_number, stem, answer, solution, concepts, source_excerpt)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                textbook_id,
                textbook_name,
                exercise.get("page_num"),
                exercise.get("exercise_number", ""),
                exercise.get("stem", ""),
                exercise.get("answer", ""),
                exercise.get("solution", ""),
                exercise.get("concepts", ""),
                exercise.get("source_excerpt", ""),
            ),
        )
    conn.commit()
    cur.close()
    conn.close()


def ingest_to_db(textbook_name, week_num, chunks, textbook_id=None):
    print("正在连接数据库并写入数据...")
    try:
        conn = psycopg2.connect(
            dbname=settings.db_name,
            user=settings.db_user,
            password=settings.db_password,
            host=settings.db_host,
            port=settings.db_port
        )
        register_vector(conn)
        cur = conn.cursor()
    except Exception as e:
        print(f"连接数据库失败，请检查 Docker 是否运行: {e}")
        exit(1)

    # 每次处理 50 个 chunk，防止 API 超时或 payload 过大
    batch_size = 50
    total_batches = (len(chunks) - 1) // batch_size + 1

    cur.execute("DELETE FROM textbook_chunks WHERE textbook_name = %s", (textbook_name,))
    conn.commit()
    
    for i in tqdm(range(0, len(chunks), batch_size), total=total_batches, desc="Embedding & 入库"):
        batch_chunks_raw = chunks[i:i+batch_size]
        # 入库前再清洗一次，避免旧缓存里的脏行流入向量库
        batch_chunks = [sanitize_ocr_text(ch) for ch in batch_chunks_raw]
        # 过滤掉清洗后变空的 chunk
        batch_chunks = [ch for ch in batch_chunks if ch.strip()]
        if not batch_chunks:
            continue
        try:
            embeddings = get_embeddings(batch_chunks)
        except Exception as e:
            print(f"\n获取 Embedding 失败 (批次 {i//batch_size + 1}): {e}")
            continue
        
        for chunk, emb in zip(batch_chunks, embeddings):
            cur.execute(
                "INSERT INTO textbook_chunks (textbook_name, content, embedding, week_num) VALUES (%s, %s, %s, %s)",
                (textbook_name, chunk, emb, week_num)
            )
        conn.commit()
        
    cur.close()
    conn.close()
    print("\n🎉 全部数据入库完成！")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="将课本 PDF 解析、向量化并导入数据库")
    parser.add_argument("--file", required=True, help="PDF 文件路径")
    parser.add_argument("--name", required=True, help="课本名称 (如: 线性代数同济第七版)")
    parser.add_argument("--week", type=int, default=1, help="该内容对应的教学周 (默认: 1)")
    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(f"错误: 找不到文件 {args.file}")
        exit(1)

    text = extract_text_via_ocr(args.file)
    chunks = chunk_text(text)
    ingest_to_db(args.name, args.week, chunks)
