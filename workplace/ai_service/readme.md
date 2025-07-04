# 安装 uvicorn 和它的标准依赖，包括 watchfiles 用于 --reload
pip install "uvicorn[standard]"

# 启动服务
python -m uvicorn main:app --reload --port 8000