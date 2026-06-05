# 云主机部署脚本使用说明

在云主机上执行：

```bash
cd /opt/linear-algebra-AI
sudo bash scripts/deploy_cloud_host.sh
```

如果代码还不在服务器上，可以先创建目录并上传代码，或者在脚本里填写 Git 仓库地址，让脚本自动 clone。

脚本会交互式询问：

- 应用部署目录
- 访问域名，例如 `ai.hudou.xyz`
- Git 仓库地址和分支，可留空
- `AI_API_KEY`
- 阿里云 SMTP 发信配置
- PostgreSQL 密码，可自动生成
- `JWT_SECRET`，可自动生成
- 是否初始化数据库
- 是否申请 HTTPS 证书

脚本会自动完成：

- 安装基础依赖、Docker、Nginx、Node.js 20、Go 1.22
- 启动 `pgvector/pgvector:pg15`
- 生成 `web_service/.env` 和 `ai_service/.env`
- 构建前端、Go 服务和 Python 虚拟环境
- 创建 `la-ai` 和 `la-web` systemd 服务
- 配置 Nginx 反代和前端静态资源
- 可选申请 HTTPS 证书

部署后常用命令：

```bash
systemctl status la-ai --no-pager
systemctl status la-web --no-pager
journalctl -u la-ai -f
journalctl -u la-web -f
nginx -t
```

注意：

- 全新数据库首次部署时，选择初始化数据库。
- 已有生产数据时，不要选择初始化数据库。
- 域名需要先解析到云主机公网 IP，HTTPS 申请才会成功。
- 云安全组公网只开放 `80`、`443`、SSH。
- `8000`、`8080`、`5432` 不要开放公网。
