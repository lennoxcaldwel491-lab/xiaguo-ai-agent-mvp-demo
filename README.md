# 瑕果智选 AI Agent MVP 苹果版

这是一个苹果单品类的静态 MVP Demo，用于验证“农户上传瑕疵果图片 -> AI Agent 分级 -> 人工复核 -> 消费者信任说明 -> 反馈/坏例回流”的最小闭环。

## 运行方式

Web Demo 可直接打开 `index.html`，也可以运行 `npm start` 或 `node server.js` 使用本地 API 和状态文件。

小程序体验版可用微信开发者工具打开 `miniprogram/`。运行、真机调试和审核边界见 `docs/小程序体验版运行与审核边界说明.md`。

## 公网部署

当前仓库已支持 Render 这类 Node Web Service 平台：

1. 在 Render 新建 Web Service，连接 GitHub 仓库。
2. Build Command 使用 `npm install`。
3. Start Command 使用 `npm start`。
4. 环境变量可选配置：
   - `DASHSCOPE_API_KEY`：启用真实 Qwen-VL API。
   - `DASHSCOPE_MODEL`：默认 `qwen-vl-max`。
   - `VISION_PROVIDER`：默认 `qwen`。
5. 部署完成后访问 Render 提供的 HTTPS 地址即可同时使用静态页面和 `/api/*` 后端接口。

`config.js` 中的 `window.XIAGUO_API_BASE` 默认为空，表示使用同源 API。若 Web 页面继续部署在 GitHub Pages，而后端部署在 Render，则把它改成 Render 的 HTTPS 地址，例如：

```js
window.XIAGUO_API_BASE = "https://your-render-service.onrender.com";
```

## 当前实现

- 从公开 Healthy-Defective-Fruits 数据集中抽取 12 张真实苹果样本。
- 覆盖 `fresh`、`bruise_defect`、`scab_defect`、`rot_defect` 4 类。
- 使用目录标签模拟视觉识别结果，输出结构化 Agent JSON。
- 农户端支持上传入口、已上传商品状态列表、上传后填写产地/重量/采摘时间/期望售价、单果状态详情。
- Agent 报告包含瑕疵类型、等级、置信度、价格建议、农户解释、消费者文案、复核判断。
- 消费者端展示低风险商品详情，并支持模拟下单和反馈。
- 运营后台展示复核队列、商品管理、坏例池和规则表。
- `miniprogram/` 已按小程序页面拆出农户上传首页、基础信息页和商品状态详情页。
- 小程序消费者反馈、运营禁售和 AI 直接禁售会沉淀到坏例池，Eval 页可读取本地状态、标记坏例状态并运行回归检查。
- 小程序数据访问已增加统一 store，优先同步本地 API `/api/state`，失败时回退本地 `wxStorage`。

## 为什么先做 mock Agent

第一版目标是验证业务闭环，不是训练模型。当前把图片所在文件夹作为“已知标注”，模拟 AI 识别输出。后续可以把 `runMockAgent` 替换为真实多模态模型调用。

## 数据映射

| 数据集标签 | 业务含义 | MVP 等级 | 处理方式 |
| --- | --- | --- | --- |
| `fresh` | 无明显瑕疵 | A | 可上架 |
| `scab_defect` | 果锈/疮痂斑 | B | 可上架 |
| `bruise_defect` | 轻微碰伤 | C | 建议复核 |
| `rot_defect` | 疑似腐烂 | 禁售 | 强制复核 |

## 下一步

1. 用微信开发者工具跑通小程序主路径。
2. 将小程序 `apiBase` 替换为局域网 IP 或 HTTPS 测试域名，完成真机调试。
3. 按 `docs/Eval数据集与人工标注准备说明.md` 增加真实农户上传样本和人工标注记录。
4. 准备小程序隐私协议、审核截图和非交易服务说明。
5. 将坏例复盘内容扩展为真实修复记录和规则版本记录。
