# 瑕果智选 AI Agent 设计 v0.1

更新时间：2026-05-28

## 1. Agent 定位

当前 Agent 是苹果瑕疵果分级场景下的任务型 Agent，不是聊天机器人。它负责基于图片和农户字段生成结构化分级建议，并把结果交给农户、消费者和运营流程使用。

## 2. 输入

| 字段 | 说明 |
| --- | --- |
| `image` | 苹果图片，本地图片会转成 base64 data URL |
| `fruit_type` | 当前固定为 `apple` |
| `origin` | 产地 |
| `weight` | 重量 kg |
| `harvest_date` | 采摘时间 |
| `expected_price` | 农户期望售价 |
| `farmer_note` | 农户备注 |
| `mock_label` | Mock 模式或兜底时使用的临时标签 |

## 3. 输出 Schema

AI 输出必须是 JSON object，至少包含以下字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `fruit_type` | string | 必须为 `apple` |
| `defect_type` | enum | `fresh` / `scab_defect` / `bruise_defect` / `rot_defect` / `unknown` |
| `defect_label` | string | 面向人的瑕疵描述 |
| `business_defect` | string | 平台业务瑕疵标签 |
| `grade` | enum | `A` / `B` / `C` / `blocked` |
| `confidence` | number | 0-1 置信度 |
| `edible_safety` | enum | `safe` / `caution` / `risk` |
| `safety_label` | string | 食用边界描述 |
| `price_suggestion` | string | 价格区间建议 |
| `farmer_explanation` | string | 给农户看的解释 |
| `consumer_copy` | string | 给消费者看的透明说明 |
| `review_required` | boolean | 是否需要人工复核 |
| `risk_flags` | string[] | 风险标签 |
| `next_action` | enum | `confirm_listing` / `manual_review` |

## 4. 硬性护栏

- `defect_type = rot_defect` 时，`grade` 必须为 `blocked`。
- `edible_safety = risk` 时，`next_action` 不能是 `confirm_listing`。
- `confidence < 0.7` 时，必须进入人工复核。
- 消费者文案不能包含绝对安全承诺。
- 禁售或高风险商品不能生成可购买式消费者文案。

## 5. 失败处理

| 失败类型 | 处理方式 |
| --- | --- |
| API Key 未配置 | 回退 Mock 结果 |
| 模型调用失败 | 回退高风险安全结果 |
| JSON 解析失败 | 尝试提取 JSON 片段修复 |
| 输出字段缺失 | 按规则归一化并记录契约异常 |
| 高风险不确定 | 强制进入人工复核 |

## 6. 人机协同边界

AI 可以做：

- 初步识别瑕疵。
- 建议等级。
- 生成解释和消费者文案。
- 判断是否进入复核。

AI 不能做：

- 最终食品安全承诺。
- 真实交易履约判断。
- 绕过人工复核上架高风险商品。
- 替代正式检测机构结论。

## 7. 质量评测

当前 Eval 重点检查：

- JSON 可解析率。
- 腐烂样本漏放率。
- 高风险召回率。
- 等级一致率。
- 消费者文案合规率。
- 是否需要人工修正。
