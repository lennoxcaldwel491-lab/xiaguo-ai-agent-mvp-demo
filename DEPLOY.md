# 瑕果智选上线说明

这个项目现在适合用 Render 做一次性上线：一个 Docker Web Service + 一个 Postgres 数据库。

## 需要准备

- 一个 GitHub 仓库
- 一个 Render 账号
- 一个可用的 `QWEN` API Key（如果你想让真实视觉能力跑起来）

## 部署步骤

1. 把当前仓库推到 GitHub。
2. 在 Render 里选择 `New +` → `Blueprint`，导入仓库根目录的 `render.yaml`。
3. Render 会自动创建：
   - Web Service：`xiaguo-ai-agent-mvp`
   - Database：`xiaguo-db`
4. 在 Web Service 的环境变量里补上真实模型密钥：
   - `DASHSCOPE_API_KEY`
   - 如需改模型，可设置 `DASHSCOPE_MODEL`
5. 等待部署完成后，打开 Render 给你的公网地址。

## 可选项

- 绑定自定义域名
- 开启自动部署
- 如果你暂时没有模型 Key，站点仍能跑 mock 版，但是真实识别会回退到演示模式

## 本地联调

```bash
npm start
```

本地会启动：

- 前端代理：`http://127.0.0.1:3000`
- 后端 API：`http://127.0.0.1:8787`
