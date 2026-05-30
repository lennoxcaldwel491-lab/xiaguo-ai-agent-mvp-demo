# 瑕果智选小程序体验版骨架

定位：苹果瑕疵果 AI 辅助分级、人工复核、可信商品说明和购买意向收集体验版。

当前边界：

- 不接真实支付。
- 不承诺真实发货。
- 不提供正式售后履约。
- AI 只做初判，高风险和低置信度样本必须人工复核。

页面清单：

- 首页/角色入口：`pages/home/home`
- 农户上传：`pages/farmer-upload/farmer-upload`
- AI 分级结果：`pages/ai-result/ai-result`
- 商品列表：`pages/product-list/product-list`
- 商品详情：`pages/product-detail/product-detail`
- 购买意向/反馈：`pages/feedback/feedback`
- 运营复核：`pages/ops-review/ops-review`
- 坏例与 Eval：`pages/eval/eval`

下一步：

1. 用微信开发者工具打开 `miniprogram` 目录。
2. 替换 `project.config.json` 里的 `appid`。
3. 将当前 Web API 地址替换为 HTTPS 云端域名。
4. 逐页接入上传、分级、复核和反馈接口。
