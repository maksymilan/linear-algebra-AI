## 准备数据库
### 本地数据持久化
```bash
# 先为新数据库创建一个本地数据文件夹
mkdir -p ~/docker-volumes/LA-AI_data
```

```bash
# 然后运行容器时挂载本地文件夹
docker run --name LA-AI \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=LA-DB \
  -p 5432:5432 \
  -d \
  -v LA-AI_data:/var/lib/postgresql/data \
  postgres:15
```

### 连接数据库
```bash
# 使用 psql 命令连接到 PostgreSQL 数据库
# 确保你已经安装了 PostgreSQL 客户端工具
psql -h localhost -p 5432 -U postgres -d LA-DB
```


