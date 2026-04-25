import os
import argparse
import pymupdf
import psycopg2
import base64
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
from pgvector.psycopg2 import register_vector
from dotenv import load_dotenv
from openai import OpenAI
from tqdm import tqdm

# 加载环境变量
load_dotenv()
api_key = os.getenv("AI_API_KEY", os.getenv("QWEN_API_KEY"))
url = os.getenv("AI_BASE_URL", os.getenv("QWEN_URL"))

# 获取 Embedding 和 VL 模型
embedding_model = os.getenv("AI_EMBEDDING_MODEL", "text-embedding-3-small")
vl_model = os.getenv("AI_VL_MODEL_NAME", "gemini-3.1-pro-preview")

client = OpenAI(api_key=api_key, base_url=url)

def extract_text_via_ocr(pdf_path, max_workers=5):
    print(f"正在读取 PDF: {pdf_path} (启用大模型 OCR 提取模式, 并发线程: {max_workers}) ...")
    try:
        doc = pymupdf.open(pdf_path)
    except Exception as e:
        print(f"读取 PDF 失败: {e}")
        exit(1)
        
    output_txt_path = pdf_path + ".ocr.txt"
    print(f"OCR 提取结果将实时保存在: {output_txt_path}")
    
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

    total_pages = len(doc)
    pages_to_process = [i for i in range(total_pages) if i not in completed_pages]
    
    # 预先分配好结果数组，保证顺序
    results = [""] * total_pages
    
    # 锁用于保护写入文件和更新进度条
    file_lock = Lock()

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
                        "text": "请提取这张教材图片中的所有文字和数学公式。如果是数学公式请尽量用 LaTeX 格式表示。不要输出任何额外的解释、开场白或结束语，只输出提取到的纯文本。"
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
                response = client.chat.completions.create(
                    model=vl_model, 
                    messages=messages, 
                    max_tokens=2048,
                    temperature=0.1
                )
                page_text = response.choices[0].message.content or ""
                
                formatted_text = f"\n\n--- 第 {i+1} 页 ---\n\n" + page_text + "\n"
                
                # 实时追加写入文件 (加锁防冲突)
                with file_lock:
                    with open(output_txt_path, "a", encoding="utf-8") as f:
                        f.write(formatted_text)
                
                return i, formatted_text
            except Exception as e:
                if attempt < max_retries - 1:
                    time.sleep(2)
                else:
                    print(f"\n[警告] 第 {i+1} 页 OCR 解析失败: {e}")
                    return i, f"\n\n--- 第 {i+1} 页 ---\n\n[解析失败]\n"

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
    return final_text

def chunk_text(text, chunk_size=800, overlap=100):
    print(f"正在对文本进行分块 (Chunk Size: {chunk_size}, Overlap: {overlap}) ...")
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    print(f"共生成 {len(chunks)} 个文本块。")
    return chunks

def get_embeddings(texts):
    # 批量获取 embedding
    response = client.embeddings.create(
        input=texts,
        model=embedding_model
    )
    return [data.embedding for data in response.data]

def ingest_to_db(textbook_name, week_num, chunks):
    print("正在连接数据库并写入数据...")
    try:
        conn = psycopg2.connect(
            dbname="LA-DB",
            user="postgres",
            password="password",
            host="localhost",
            port="5432"
        )
        register_vector(conn)
        cur = conn.cursor()
    except Exception as e:
        print(f"连接数据库失败，请检查 Docker 是否运行: {e}")
        exit(1)

    # 每次处理 50 个 chunk，防止 API 超时或 payload 过大
    batch_size = 50
    total_batches = (len(chunks) - 1) // batch_size + 1
    
    for i in tqdm(range(0, len(chunks), batch_size), total=total_batches, desc="Embedding & 入库"):
        batch_chunks = chunks[i:i+batch_size]
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
