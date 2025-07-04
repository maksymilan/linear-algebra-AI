# ai_service/main.py
from fastapi import FastAPI
import time

app = FastAPI()

@app.get("/api/v1/greet")
def get_greeting():
    """
    一个简单的接口，返回一条问候消息和当前时间戳。
    """
    return {
        "message": "Hello from Python AI Service!",
        "timestamp": int(time.time())
    }