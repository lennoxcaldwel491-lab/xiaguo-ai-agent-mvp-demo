# 真实 AI 接入说明：Qwen-VL / 阿里百炼

## 1. 准备 API Key

去阿里云百炼 / DashScope 创建 API Key。不要把 API Key 发给别人，也不要写进聊天窗口。

在项目目录新建 `.env.local`：

```text
VISION_PROVIDER=qwen
DASHSCOPE_API_KEY=你的 DashScope API Key
DASHSCOPE_MODEL=qwen-vl-max
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
PORT=8787
```

如果控制台没有 `qwen-vl-max`，就把 `DASHSCOPE_MODEL` 改成你控制台可用的视觉模型，例如 `qwen-vl-plus` 或其他 Qwen-VL 模型。

## 2. 启动本地服务

```powershell
cd "C:\Users\PC\Desktop\全知全能\项目\瑕疵果\瑕果智选_AI_Agent_MVP_苹果版"
node server.js
```

打开：

```text
http://127.0.0.1:8787/
```

顶部选择 `API 模式`，再点击“开始智能分级”。

## 3. 检查是否配置成功

访问：

```text
http://127.0.0.1:8787/api/health
```

如果看到：

```json
{
  "provider": "qwen",
  "api_key_configured": true,
  "mode": "qwen_vl_api"
}
```

说明已经走 Qwen-VL 真实视觉 API。

如果 `api_key_configured` 是 `false`，页面仍可使用，但会回退到 mock 结果。

## 4. 食品安全硬规则

- 疑似腐烂、霉变、破皮渗液必须人工复核。
- 置信度低于 0.7 必须人工复核。
- 真实模型只负责初判，不直接决定食品安全结论。
- 输出必须是固定 JSON，方便前端、复核后台和 Eval 复用。
