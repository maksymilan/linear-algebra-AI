import os
import re
import argparse
import json
import pymupdf
import psycopg2
import base64
import shutil
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import BoundedSemaphore, Lock
from pgvector.psycopg2 import register_vector
from dotenv import load_dotenv
from tqdm import tqdm

from clients import client
from concepts_taxonomy import (
    EXERCISE_TYPES,
    concepts_prompt_block,
    map_to_standard,
    normalize_question_type,
)
from config import resolve_model, settings
from embedding_utils import create_embeddings
from llm import chat_completion
from ocr_utils import build_vision_ocr_messages
from response_utils import parse_model_json

# 加载环境变量
load_dotenv()

# 获取 VL 模型
vl_model = resolve_model("ocr")
ocr_llm_semaphore = BoundedSemaphore(settings.ocr_max_concurrency)


# ---------------------------------------------------------------------------
# Office 文档（PPT/Word）转 PDF
# ---------------------------------------------------------------------------
_OFFICE_EXTS = {".ppt", ".pptx", ".doc", ".docx"}


def ensure_pdf(path: str) -> str:
    """若是 PPT/Word，用 LibreOffice 转成 PDF 返回新路径；已是 PDF（或其他格式）原样返回。

    依赖服务器安装 LibreOffice（提供 libreoffice / soffice 命令）。
    """
    ext = os.path.splitext(path)[1].lower()
    if ext not in _OFFICE_EXTS:
        return path

    soffice = shutil.which("libreoffice") or shutil.which("soffice")
    if not soffice:
        raise RuntimeError(
            "检测到 PPT/Word 文档，但服务器未安装 LibreOffice（缺少 libreoffice/soffice 命令），无法转换为 PDF。"
        )

    outdir = os.path.dirname(path) or "."
    print(f"检测到 Office 文档，正在用 LibreOffice 转换为 PDF: {path}")
    try:
        subprocess.run(
            [soffice, "--headless", "--convert-to", "pdf", "--outdir", outdir, path],
            check=True,
            capture_output=True,
            timeout=300,
        )
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"LibreOffice 转换失败: {exc.stderr.decode('utf-8', 'ignore')[:500]}")
    except subprocess.TimeoutExpired:
        raise RuntimeError("LibreOffice 转换超时（>300s）")

    pdf_path = os.path.splitext(path)[0] + ".pdf"
    if not os.path.exists(pdf_path):
        raise RuntimeError(f"LibreOffice 转换后未找到输出 PDF: {pdf_path}")
    print(f"转换完成: {pdf_path}")
    return pdf_path


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
_LATEX_DISPLAY_RE = re.compile(r"\\\[(.*?)\\\]", re.DOTALL)
_LATEX_INLINE_RE = re.compile(r"\\\((.*?)\\\)", re.DOTALL)


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
_LATEX_ENV_RE = re.compile(r"\\begin\{([A-Za-z*]+)\}[\s\S]*?\\end\{\1\}")


def normalize_latex_delimiters(text: str) -> str:
    r"""Convert \( \) / \[ \] output to the dollar delimiters used by the UI."""
    if not text:
        return ""

    def display_repl(match):
        content = match.group(1).replace("$", "").strip()
        return f"$${content}$$" if content else ""

    def inline_repl(match):
        content = match.group(1).replace("$", "").strip()
        return f"${content}$" if content else ""

    text = _LATEX_DISPLAY_RE.sub(display_repl, text)
    return _LATEX_INLINE_RE.sub(inline_repl, text)


def _wrap_inline_math(seg: str) -> str:
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
    return "".join(out)


def _wrap_plain_math(seg: str) -> str:
    out: list[str] = []
    last = 0
    for m in _LATEX_ENV_RE.finditer(seg):
        out.append(_wrap_inline_math(seg[last:m.start()]))
        raw_env = m.group(0).strip()
        if raw_env:
            out.append(f"$$\n{raw_env}\n$$")
        last = m.end()
    out.append(_wrap_inline_math(seg[last:]))
    return "".join(out)


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
        wrapped_parts.append(_wrap_plain_math(seg))

    return "".join(wrapped_parts)


def normalize_latex_text(text: str) -> str:
    """统一教材 / 题库入库前的 LaTeX 分隔符与裸公式兜底。"""
    if not text:
        return ""
    return auto_wrap_math(normalize_latex_delimiters(str(text).strip()))


def sanitize_ocr_text(text: str) -> str:
    """
    清洗单页 OCR 结果：
    1) 去掉模型寒暄/排版建议类整行；
    2) 去除行内裸 URL / 反引号包裹的 URL；
    3) 合并多余空行。
    """
    if not text:
        return ""

    text = normalize_latex_delimiters(text)
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
你是线性代数教材 OCR 质检器。请修复一页 OCR 文本，只做两件事：
1. 修复明显 OCR 错字、断行、重复页眉页脚和多余空格。
2. 修复 LaTeX：所有数学公式必须是合法 LaTeX，并用 $...$ 或 $$...$$ 包裹。

严格限制：
- 不要编造课本没有出现的内容，不要新增外部知识。
- 不要删除题目、定义、定理等正文内容。
- 直接输出修复后的纯文本，不要 JSON、不要 Markdown 代码块、不要任何解释或寒暄。
"""

EXERCISE_EXTRACT_PROMPT = """
你是线性代数教材题库抽取器。从给定的教材文本（含【第N页】页码标记，可能横跨多页）中抽取所有题目：例题、课后习题、思考题、练习题。

判定与字段规则：
- exercise_type：取 "example"（正文例题，通常紧跟解答）或 "homework"（课后习题，通常在章节末、常无解答）。
- question_type：从 [计算, 证明, 选择, 填空, 判断, 简答] 中选最贴切的一个；判断不出留空字符串。
- stem：完整题干。若一道题的题干与解答分布在不同页，请合并成一道完整的题，不要拆成两条。
- answer / solution：只填文本中明确给出的答案 / 解析；看不到就留空字符串，严禁编造或自行解题。
- concept_tags：见下方受控知识点词表，只能从中选词，最多 3 个；选不出给空数组 []。
- page_num：该题题干所在页码（整数）。
- source_excerpt：用于追溯的一句原文短摘录。

不要抽取：目录、章节标题编号列表、索引页（如连续的 "5.2.x 矩阵的初等变换" 编号行）、普通正文 / 定义 / 定理 / 证明叙述。

{concepts_block}

只输出 JSON，不要 Markdown 代码块或解释：
{
  "exercises": [
    {
      "exercise_number": "题号或例题编号，如 例3 / 习题2-5，未知留空",
      "stem": "完整题干",
      "answer": "可见答案，未知留空",
      "solution": "可见解析，未知留空",
      "exercise_type": "example 或 homework",
      "question_type": "计算/证明/选择/填空/判断/简答 之一，未知留空",
      "concept_tags": ["从受控词表选, 最多3个"],
      "page_num": 0,
      "source_excerpt": "原文短摘录"
    }
  ]
}
"""


def ocr_chat_completion(*, model, messages, max_tokens, temperature=None):
    kwargs = {
        "messages": messages,
        "max_tokens": max_tokens,
    }
    if temperature is not None:
        kwargs["temperature"] = temperature

    for attempt in range(settings.ocr_call_retries):
        try:
            with ocr_llm_semaphore:
                return chat_completion(client, model=model, **kwargs)
        except Exception:
            if attempt >= settings.ocr_call_retries - 1:
                raise
            time.sleep(min(2 ** attempt, 5))


def _normalize_exercises(raw_exercises, default_page=None):
    exercises = []
    if not isinstance(raw_exercises, list):
        return exercises
    for item in raw_exercises:
        if not isinstance(item, dict):
            continue
        stem = normalize_latex_text(item.get("stem") or "")
        # 跳过空题干，以及被误抽的目录/索引行
        if not stem or _is_index_chunk(stem):
            continue
        answer = normalize_latex_text(item.get("answer") or "")
        solution = normalize_latex_text(item.get("solution") or "")

        # 题目来源类型：模型判定优先，缺失/非法时按有无解答兜底推断
        ex_type = str(item.get("exercise_type") or "").strip().lower()
        if ex_type not in EXERCISE_TYPES:
            ex_type = "example" if (answer or solution) else "homework"

        # 受控知识点 tag（兼容旧 concepts 字段名）
        concept_tags = map_to_standard(item.get("concept_tags") or item.get("concepts") or [])

        page_num = item.get("page_num") or default_page
        try:
            page_num = int(page_num) if page_num is not None else None
        except (TypeError, ValueError):
            page_num = default_page

        exercises.append(
            {
                "page_num": page_num,
                "exercise_number": str(item.get("exercise_number") or "").strip(),
                "stem": stem,
                "answer": answer,
                "solution": solution,
                "exercise_type": ex_type,
                "question_type": normalize_question_type(item.get("question_type") or ""),
                "concept_tags": concept_tags,
                "concepts": "、".join(concept_tags),  # 兼容旧文本列
                "has_answer": bool(answer or solution),
                "source_excerpt": normalize_latex_text(item.get("source_excerpt") or ""),
            }
        )
    return exercises


def repair_ocr_page(page_text, page_num):
    """逐页修复 OCR 文本质量（错字 / 断行 / LaTeX），返回纯文本。题目抽取不在此阶段进行。"""
    page_text = sanitize_ocr_text(page_text)
    if not settings.ocr_repair_enabled or not page_text or page_text in {"[空白]", "[解析失败]"}:
        return page_text

    try:
        response = ocr_chat_completion(
            model=resolve_model("ocr_repair"),
            messages=[
                {"role": "system", "content": OCR_REPAIR_PROMPT},
                {
                    "role": "user",
                    "content": f"页码：{page_num}\n请修复以下 OCR 文本：\n\n{page_text}",
                },
            ],
            max_tokens=4096,
            temperature=0.1,
        )
        cleaned = sanitize_ocr_text(response.choices[0].message.content or "")
        return cleaned or page_text
    except Exception as exc:
        print(f"\n[警告] 第 {page_num} 页 OCR 修复失败，使用原始 OCR 文本: {exc}")
        return page_text


_PAGE_SPLIT_RE = re.compile(r"---\s*第\s*(\d+)\s*页\s*---")


def split_pages(full_text):
    """把 OCR 全文按 '--- 第 N 页 ---' 切成 [(page_num, text)]，并按页码升序排序。

    兼容并发 OCR 导致 .ocr.txt 页面乱序的情况——排序后保证抽题 / 分块按真实页序进行。
    """
    if not full_text:
        return []
    parts = _PAGE_SPLIT_RE.split(full_text)  # [前缀, 页码1, 正文1, 页码2, 正文2, ...]
    pages = []
    for i in range(1, len(parts) - 1, 2):
        try:
            pn = int(parts[i])
        except ValueError:
            continue
        pages.append((pn, (parts[i + 1] or "").strip()))
    pages.sort(key=lambda x: x[0])
    return pages


def _extract_exercises_llm(text_block, default_page):
    """对一段（可能跨页的）文本调用 LLM 抽题，返回规范化后的题目列表。"""
    if not text_block.strip():
        return []
    system_prompt = EXERCISE_EXTRACT_PROMPT.replace("{concepts_block}", concepts_prompt_block())
    try:
        response = ocr_chat_completion(
            model=resolve_model("exercise_extract"),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"请从以下教材文本中抽取题目：\n\n{text_block}"},
            ],
            max_tokens=4096,
            temperature=0.1,
        )
        raw = response.choices[0].message.content or ""
        parsed = parse_model_json(raw)
        if not isinstance(parsed, dict):
            parsed = json.loads(raw)
        return _normalize_exercises(parsed.get("exercises"), default_page)
    except Exception as exc:
        print(f"\n[警告] 题目抽取失败 (起始页 {default_page}): {exc}")
        return []


def _dedup_key(ex):
    num = re.sub(r"\s+", "", ex.get("exercise_number") or "")
    stem = re.sub(r"\s+", "", ex.get("stem") or "")[:40]
    return (num, stem)


def _exercise_progress_path(textbook_name):
    safe = re.sub(r"[^\w一-鿿]+", "_", textbook_name or "textbook").strip("_") or "textbook"
    return os.path.join(tempfile.gettempdir(), f"exercise_progress_{safe}.json")


def _load_exercise_progress(path):
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return set(json.load(f))
        except Exception:
            return set()
    return set()


def _save_exercise_progress(path, done):
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(sorted(done), f)
    except Exception as exc:
        print(f"[警告] 写入抽题进度失败: {exc}")


def _new_db_conn():
    conn = psycopg2.connect(
        dbname=settings.db_name,
        user=settings.db_user,
        password=settings.db_password,
        host=settings.db_host,
        port=settings.db_port,
    )
    register_vector(conn)
    return conn


def _ingest_exercise_batch(textbook_id, textbook_name, exercises):
    """对一批题目做 embedding 并 INSERT（追加，不清空），返回写入条数。线程安全：自建连接。"""
    searchable = []
    texts = []
    for ex in exercises:
        st = exercise_search_text(ex)
        if not st:
            continue
        searchable.append(ex)
        texts.append(st)
    if not searchable:
        return 0

    embeddings = []
    batch_size = 50
    for i in range(0, len(texts), batch_size):
        embeddings.extend(get_embeddings(texts[i:i + batch_size]))

    conn = _new_db_conn()
    cur = conn.cursor()
    try:
        for ex, emb in zip(searchable, embeddings):
            cur.execute(
                """
                INSERT INTO textbook_exercises
                    (textbook_id, textbook_name, page_num, exercise_number, stem, answer, solution,
                     concepts, concept_tags, exercise_type, question_type, has_answer, source_excerpt, embedding)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    textbook_id,
                    textbook_name,
                    ex.get("page_num"),
                    ex.get("exercise_number", ""),
                    ex.get("stem", ""),
                    ex.get("answer", ""),
                    ex.get("solution", ""),
                    ex.get("concepts", ""),
                    ex.get("concept_tags") or [],
                    ex.get("exercise_type", ""),
                    ex.get("question_type", ""),
                    bool(ex.get("has_answer")),
                    ex.get("source_excerpt", ""),
                    emb,
                ),
            )
        conn.commit()
    finally:
        cur.close()
        conn.close()
    return len(searchable)


def _delete_exercises(textbook_id, textbook_name):
    conn = _new_db_conn()
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM textbook_exercises WHERE textbook_name = %s OR textbook_id = %s",
        (textbook_name, textbook_id),
    )
    conn.commit()
    cur.close()
    conn.close()


def _dedup_exercises_in_db(textbook_name):
    """入库后去重：同书内 (题号, 题干前40字) 相同的只保留最小 id。"""
    conn = _new_db_conn()
    cur = conn.cursor()
    cur.execute(
        """
        DELETE FROM textbook_exercises a
        USING textbook_exercises b
        WHERE a.id > b.id
          AND a.textbook_name = %s AND b.textbook_name = %s
          AND COALESCE(a.exercise_number, '') = COALESCE(b.exercise_number, '')
          AND LEFT(a.stem, 40) = LEFT(b.stem, 40)
        """,
        (textbook_name, textbook_name),
    )
    removed = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return removed


def extract_and_ingest_exercises(
    full_text, textbook_id, textbook_name,
    window=3, stride=2, max_workers=5, resume=True,
):
    """并发滑动窗口抽题 + 每窗口增量入库 + 断点续传。

    - 并发：复用 ocr_chat_completion 内的 semaphore 控制实际 API 并发。
    - 增量入库：每个窗口抽完立即写库，进程被中断也不丢已入库的题。
    - 断点续传：进度文件记录已完成窗口，重跑跳过它们；首次运行才清空该书旧题。
    - 去重：入库时允许少量跨窗口重复，全部完成后用 SQL 去重。
    """
    pages = split_pages(full_text)
    if not pages:
        print("题库抽取：未解析到任何页面。")
        return 0

    window_starts = list(range(0, len(pages), max(1, stride)))
    progress_path = _exercise_progress_path(textbook_name)
    done = _load_exercise_progress(progress_path) if resume else set()

    if not done:
        # 首次运行：清空旧题并重置进度
        _delete_exercises(textbook_id, textbook_name)
        if os.path.exists(progress_path):
            try:
                os.remove(progress_path)
            except Exception:
                pass
        done = set()

    todo = [i for i in window_starts if i not in done]
    print(
        f"题库抽取：{len(pages)} 页 / {len(window_starts)} 窗口，"
        f"待处理 {len(todo)}（已完成 {len(done)}），并发 {max_workers} ..."
    )

    lock = Lock()
    total = [0]

    def process_window(i):
        window_pages = pages[i:i + window]
        start_page = window_pages[0][0]
        block = "\n\n".join(f"【第{pn}页】\n{txt}" for pn, txt in window_pages if txt.strip())
        exs = _extract_exercises_llm(block, start_page)
        n = _ingest_exercise_batch(textbook_id, textbook_name, exs)
        with lock:
            done.add(i)
            _save_exercise_progress(progress_path, done)
            total[0] += n
        return n

    with tqdm(total=len(window_starts), initial=len(done), desc="题库抽取") as pbar:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(process_window, i): i for i in todo}
            for fut in as_completed(futures):
                try:
                    fut.result()
                except Exception as exc:
                    print(f"\n[警告] 窗口抽题失败: {exc}")
                pbar.update(1)

    removed = _dedup_exercises_in_db(textbook_name)
    print(f"题库入库完成：写入 {total[0]} 题，去重移除 {removed} 题。")
    # 成功完成，清理进度文件
    if os.path.exists(progress_path):
        try:
            os.remove(progress_path)
        except Exception:
            pass
    return total[0]

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

    # 锁用于保护写入文件和更新进度条
    file_lock = Lock()
    
    # 记录目前已完成的总页数（包含之前缓存的）
    current_processed_pages = len(completed_pages)

    def fallback_page_text(page):
        try:
            return sanitize_ocr_text(page.get_text().strip())
        except Exception:
            return ""

    def process_page(i):
        page = doc[i]
        pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2))
        img_bytes = pix.tobytes("png")
        base64_image = base64.b64encode(img_bytes).decode('utf-8')
        data_url = f"data:image/png;base64,{base64_image}"
        
        messages = build_vision_ocr_messages(vl_model, data_url, OCR_PROMPT)

        try:
            response = ocr_chat_completion(
                model=vl_model,
                messages=messages,
                max_tokens=2048,
                temperature=0.1,
            )
            page_text = response.choices[0].message.content or ""
        except Exception as exc:
            page_text = fallback_page_text(page)
            if page_text:
                print(f"\n[警告] 第 {i+1} 页 OCR 请求失败，已使用 PDF 文本层兜底: {exc}")
            else:
                page_text = "[解析失败]"

        if not page_text.strip():
            page_text = fallback_page_text(page)
            if page_text:
                print(f"\n[警告] 第 {i+1} 页 OCR 模型返回空内容，已使用 PDF 文本层兜底。")
            else:
                page_text = "[空白]"

        # 清洗掉模型"排版建议""寒暄"之类的脏行 + 修复文本质量
        page_text = repair_ocr_page(page_text, i + 1)
        formatted_text = f"\n\n--- 第 {i+1} 页 ---\n\n" + page_text + "\n"

        # 实时追加写入文件 (加锁防冲突)
        with file_lock:
            with open(output_txt_path, "a", encoding="utf-8") as f:
                f.write(formatted_text)

        return i, formatted_text

    # 使用线程池并发执行
    with tqdm(total=total_pages, initial=len(completed_pages), desc="AI 视觉 OCR 并发解析") as pbar:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # 提交所有任务
            future_to_page = {executor.submit(process_page, i): i for i in pages_to_process}
            
            # 获取结果
            for future in as_completed(future_to_page):
                page_index, text_result = future.result()
                results[page_index] = text_result
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
        # 兼容旧签名：题目抽取已移至 extract_exercises_from_fulltext，此处题目恒为空
        return final_text, []
    return final_text

def chunk_text(text, chunk_size=800, overlap=100):
    print(f"正在对文本进行语义分块 (Chunk Size: {chunk_size}, Overlap: {overlap}) ...")
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n+", text) if part.strip()]
    chunks = []
    current = ""

    for paragraph in paragraphs:
        if len(paragraph) > chunk_size:
            # 段落本身超长：先收尾当前块，再对长段落滑动硬切。
            # 仅做内容重叠，不再注入「上下文提示：上一片段结尾…」前缀——那是检索结果重复的根源。
            if current.strip():
                chunks.append(current.strip())
                current = ""
            start = 0
            while start < len(paragraph):
                chunks.append(paragraph[start:start + chunk_size].strip())
                start += max(1, chunk_size - overlap)
            continue

        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) <= chunk_size:
            current = candidate
            continue

        if current.strip():
            chunks.append(current.strip())
        current = paragraph

    if current.strip():
        chunks.append(current.strip())

    print(f"共生成 {len(chunks)} 个文本块。")
    return chunks

_SECTION_NUM_RE = re.compile(r"\d+\.\d+\.\d+")


def _is_index_chunk(text: str) -> bool:
    """目录/习题索引页检测：X.Y.Z 格式的编号出现 8 次以上，说明是索引而非正文内容。"""
    clean = re.sub(r"^【上下文提示】.*?\n\n", "", text, flags=re.DOTALL).strip()
    return len(_SECTION_NUM_RE.findall(clean)) >= 8


def get_embeddings(texts):
    return create_embeddings(texts)


def exercise_search_text(exercise):
    """用于 embedding 的检索文本：聚焦题干 + 知识点 + 题型，不混入大段答案/解析（LaTeX 会稀释语义）。"""
    parts = []
    stem = str(exercise.get("stem") or "").strip()
    if stem:
        parts.append(f"题目：{stem}")
    tags = exercise.get("concept_tags") or []
    if isinstance(tags, (list, tuple)):
        tags_text = "、".join(str(t).strip() for t in tags if str(t).strip())
    else:
        tags_text = str(tags).strip()
    if tags_text:
        parts.append(f"知识点：{tags_text}")
    question_type = str(exercise.get("question_type") or "").strip()
    if question_type:
        parts.append(f"题型：{question_type}")
    return "\n".join(parts)


def ingest_exercises_to_db(textbook_id, textbook_name, exercises):
    """清空该书旧题后一次性批量入库（用于已有完整 exercises 列表的场景）。

    生产流程请用 extract_and_ingest_exercises（并发 + 增量入库 + 断点续传）。
    """
    if not exercises:
        print("未抽取到可入库的题目。")
        return
    print(f"正在写入 {len(exercises)} 道题目...")
    _delete_exercises(textbook_id, textbook_name)
    n = _ingest_exercise_batch(textbook_id, textbook_name, exercises)
    print(f"题目入库完成：{n} 题。")


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
        # 过滤掉清洗后变空的 chunk，以及目录/索引型 chunk
        batch_chunks = [ch for ch in batch_chunks if ch.strip() and not _is_index_chunk(ch)]
        if not batch_chunks:
            continue
        try:
            embeddings = get_embeddings(batch_chunks)
        except Exception as e:
            print(f"\n获取 Embedding 失败 (批次 {i//batch_size + 1}): {e}")
            cur.close()
            conn.close()
            raise
        
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
    parser.add_argument("--file", help="PDF 文件路径（全新解析，逐页 OCR）")
    parser.add_argument("--from-ocr", dest="from_ocr", help="已有 .ocr.txt 路径（跳过 OCR，直接重建分块+题库）")
    parser.add_argument("--name", required=True, help="课本名称 (如: 线性代数同济第七版)")
    parser.add_argument("--week", type=int, default=1, help="该内容对应的教学周 (默认: 1)")
    parser.add_argument("--textbook-id", dest="textbook_id", type=int, default=None, help="课本 ID（可选）")
    parser.add_argument("--skip-exercises", dest="skip_exercises", action="store_true", help="只入正文，不抽题库")
    args = parser.parse_args()

    if args.from_ocr:
        if not os.path.exists(args.from_ocr):
            print(f"错误: 找不到 OCR 文件 {args.from_ocr}")
            exit(1)
        with open(args.from_ocr, "r", encoding="utf-8") as f:
            text = f.read()
        print(f"已从 {args.from_ocr} 读取 OCR 文本（跳过视觉 OCR）。")
    elif args.file:
        if not os.path.exists(args.file):
            print(f"错误: 找不到文件 {args.file}")
            exit(1)
        text = extract_text_via_ocr(args.file)
    else:
        print("错误: 必须提供 --file 或 --from-ocr 之一")
        exit(1)

    chunks = chunk_text(text)
    ingest_to_db(args.name, args.week, chunks, textbook_id=args.textbook_id)

    if not args.skip_exercises:
        extract_and_ingest_exercises(text, args.textbook_id, args.name)

    print("\n✅ 完成。")
