#!/usr/bin/env python3
import argparse
import json
import sys
import time
import uuid
from urllib import error, request


BOUNDARY = "----la-ai-check-boundary"


def multipart_body(fields, files=None):
    files = files or []
    chunks = []
    for name, value in fields.items():
        chunks.append(f"--{BOUNDARY}\r\n".encode())
        chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        chunks.append(str(value).encode())
        chunks.append(b"\r\n")
    for item in files:
        name, filename, content_type, data = item
        chunks.append(f"--{BOUNDARY}\r\n".encode())
        chunks.append(
            (
                f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
                f"Content-Type: {content_type}\r\n\r\n"
            ).encode()
        )
        chunks.append(data)
        chunks.append(b"\r\n")
    chunks.append(f"--{BOUNDARY}--\r\n".encode())
    return b"".join(chunks), f"multipart/form-data; boundary={BOUNDARY}"


def http_json(method, url, fields=None, files=None, timeout=180):
    data = None
    headers = {}
    if fields is not None or files is not None:
        data, content_type = multipart_body(fields or {}, files)
        headers["Content-Type"] = content_type
    req = request.Request(url, data=data, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            status = resp.status
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise AssertionError(f"{method} {url} returned HTTP {exc.code}: {body}") from exc
    except error.URLError as exc:
        raise AssertionError(f"{method} {url} failed: {exc}") from exc

    if status < 200 or status >= 300:
        raise AssertionError(f"{method} {url} returned HTTP {status}: {body}")
    try:
        return json.loads(body) if body else {}
    except json.JSONDecodeError:
        return {"_raw": body}


def require_keys(name, payload, keys):
    missing = [key for key in keys if key not in payload]
    if missing:
        raise AssertionError(f"{name} missing keys {missing}; payload={payload}")


def require_any_key(name, payload, keys):
    if not any(payload.get(key) for key in keys):
        raise AssertionError(f"{name} expected one of non-empty keys {keys}; payload={payload}")


def require_generated_title(name, payload):
    title = str(payload.get("title") or "").strip()
    blocked = {"", "新对话", "新会话", "新会话...", "正在生成标题...", "未命名对话"}
    if title in blocked:
        raise AssertionError(f"{name} expected an AI-generated title; payload={payload}")
    if any(marker in title for marker in ["{", "}", '"title"', "'title'", "title:"]):
        raise AssertionError(f"{name} title looks like an unparsed model payload: {title!r}")
    if len(title) > 24:
        raise AssertionError(f"{name} title is too long: {title!r}")


def run_check(label, fn):
    started = time.time()
    print(f"RUN {label}", flush=True)
    result = fn()
    elapsed = time.time() - started
    print(f"OK  {label} ({elapsed:.1f}s)", flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description="Smoke-check Linear Algebra AI service interfaces.")
    parser.add_argument("--ai-base", default="http://127.0.0.1:8000")
    parser.add_argument("--web-base", default="http://127.0.0.1:8080")
    parser.add_argument("--skip-llm", action="store_true", help="Skip checks that call the configured LLM.")
    args = parser.parse_args()

    ai_base = args.ai_base.rstrip("/")
    web_base = args.web_base.rstrip("/")

    failures = []

    def check(label, fn):
        try:
            return run_check(label, fn)
        except Exception as exc:
            failures.append((label, str(exc)))
            print(f"FAIL {label}: {exc}", flush=True)
            return None

    check("go health /api/health/db", lambda: require_keys(
        "go health",
        http_json("GET", f"{web_base}/api/health/db", timeout=10),
        ["status"],
    ))

    check("ai docs /docs", lambda: http_json("GET", f"{ai_base}/openapi.json", timeout=10))

    check("ocr text upload", lambda: require_keys(
        "ocr",
        http_json(
            "POST",
            f"{ai_base}/api/v1/ocr",
            files=[("file", "sample.txt", "text/plain", b"x + y = 1\n")],
            timeout=30,
        ),
        ["text"],
    ))

    check("textbook delete missing", lambda: require_keys(
        "textbook delete",
        http_json(
            "POST",
            f"{ai_base}/api/v1/textbook/delete",
            fields={
                "textbook_id": "0",
                "textbook_name": f"__la_ai_check_missing_{uuid.uuid4().hex}__",
            },
            timeout=30,
        ),
        ["message", "deleted_chunks"],
    ))

    if not args.skip_llm:
        def first_chat_title_check():
            payload = http_json(
                "POST",
                f"{ai_base}/api/v1/chat",
                fields={
                    "prompt": "请解释一下线性相关和线性无关",
                    "history": "[]",
                    "is_first_message": "true",
                    "learned_summaries": "",
                    "current_week": "0",
                },
                timeout=180,
            )
            require_any_key("first chat", payload, ["response", "text_explanation"])
            require_generated_title("first chat", payload)

        check("first chat generated title", first_chat_title_check)

        check("chat with memory", lambda: require_any_key(
            "chat",
            http_json(
                "POST",
                f"{ai_base}/api/v1/chat",
                fields={
                    "prompt": "那它和列空间有什么关系？",
                    "history": json.dumps([
                        {"role": "user", "content": "矩阵的秩是什么意思？"},
                        {
                            "role": "ai",
                            "content": "秩是线性无关列的最大个数，也等于列空间的维数。",
                        },
                    ], ensure_ascii=False),
                    "is_first_message": "false",
                    "learned_summaries": "",
                    "current_week": "0",
                },
                timeout=180,
            ),
            ["response", "text_explanation"],
        ))

        check("grade homework", lambda: require_keys(
            "grade",
            http_json(
                "POST",
                f"{ai_base}/api/v1/grade",
                fields={
                    "problem_text": "求矩阵 [[1,0],[0,1]] 的秩。",
                    "solution_text": "秩为 2，因为两列线性无关。",
                },
                timeout=180,
            ),
            ["correction"],
        ))

        check("grading follow-up chat", lambda: require_any_key(
            "grading chat",
            http_json(
                "POST",
                f"{ai_base}/api/v1/grading/chat",
                fields={
                    "problem_text": "求矩阵 [[1,0],[0,1]] 的秩。",
                    "solution_text": "秩为 2。",
                    "correction_text": "答案正确。",
                    "new_question": "为什么单位矩阵的秩是 2？",
                    "chat_history": "[]",
                },
                timeout=180,
            ),
            ["response", "text_explanation"],
        ))

        check("summarize ppt text upload", lambda: require_keys(
            "summarize ppt",
            http_json(
                "POST",
                f"{ai_base}/api/v1/summarize_ppt",
                files=[("file", "week1.txt", "text/plain", "本周学习矩阵、向量组线性相关与矩阵的秩。".encode())],
                timeout=180,
            ),
            ["summary"],
        ))

    if failures:
        print("\nInterface check failed:")
        for label, message in failures:
            print(f"- {label}: {message}")
        return 1

    print("\nAll interface checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
