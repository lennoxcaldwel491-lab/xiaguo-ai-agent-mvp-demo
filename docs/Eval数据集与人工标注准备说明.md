# 瑕果智选 Eval 数据集与人工标注准备说明

更新时间：2026-06-01

## 1. 当前目标

当前 Eval 的目标不是证明模型已经达到生产精度，而是建立一套可持续迭代的质量治理表：

```text
人工标签 -> AI 输出 -> 是否漏放/误判 -> 是否进入坏例 -> 是否进入回归
```

这套表用于验证苹果瑕疵果 AI Agent 的核心安全边界，尤其是疑似腐烂、软烂、破皮渗液等高风险样本不能直接上架。

## 2. 当前数据状态

当前已有：

- 12 张真实苹果样本，可直接参与 Demo Eval。
- 40 条苹果人工标注模板，文件为 `eval/apple_eval_set.json`。
- 每类目标 10 张：
  - `fresh`
  - `scab_defect`
  - `bruise_defect`
  - `rot_defect`
- Web Eval 页已展示：
  - 模板总数
  - 已接入样本
  - 待人工补标
  - 当前 AI 输出
  - 质量判断
  - 回归状态
- 小程序 Eval 页已展示：
  - 坏例池
  - 基础 Eval 指标
  - 人工标注准备统计
  - 本地回归检查

## 3. Eval 样本字段

当前模板字段：

| 字段 | 含义 |
| --- | --- |
| `id` | 样本 ID |
| `image` | 图片路径 |
| `fruit_type` | 当前固定为 `apple` |
| `expected_defect_type` | 人工标注瑕疵类型 |
| `expected_grade` | 人工期望等级 |
| `must_review` | 是否必须进入人工复核 |
| `high_risk` | 是否高风险样本 |
| `human_label_status` | `seeded` 或 `to_label` |

建议后续扩展字段：

| 字段 | 含义 |
| --- | --- |
| `labeler` | 标注人 |
| `label_date` | 标注日期 |
| `defect_area_level` | 瑕疵面积等级 |
| `skin_broken` | 是否破皮 |
| `soft_rot_suspected` | 是否疑似软烂 |
| `mold_suspected` | 是否疑似霉变 |
| `remove_required` | 是否建议剔除 |
| `notes` | 标注备注 |

## 4. Eval 输出字段

每次 AI Eval 应形成以下结果：

| 字段 | 含义 |
| --- | --- |
| `sample_id` | 样本 ID |
| `expected_grade` | 人工期望等级 |
| `actual_grade` | AI 输出等级 |
| `review_required` | AI 是否要求复核 |
| `next_action` | AI 下一步动作 |
| `high_risk_recalled` | 高风险是否召回 |
| `grade_matched` | 等级是否一致 |
| `copy_compliant` | 消费者文案是否合规 |
| `needs_human_fix` | 是否需要人工修正 |
| `failure_type` | 失败类型 |

## 5. 失败类型定义

| 失败类型 | 说明 | 严重程度 |
| --- | --- | --- |
| `high_risk_leak` | 高风险样本被允许上架 | 高 |
| `grade_mismatch` | AI 等级与人工标签不一致 | 中 |
| `review_action_mismatch` | 该复核未复核，或可上架却误拦截 | 中 |
| `copy_non_compliant` | 文案出现绝对安全承诺或边界不清 | 中 |
| `json_contract_error` | AI 输出无法解析或字段缺失 | 高 |

## 6. 坏例和回归规则

进入坏例池的来源：

- 运营禁售。
- 消费者负向反馈。
- AI 直接禁售样本。
- Eval 失败样本。

坏例状态：

| 状态 | 含义 |
| --- | --- |
| 待复盘 | 已记录，但尚未分析根因 |
| 已修复 | 已补充规则、提示词或人工复核策略 |
| 已进入回归 | 已纳入后续 Eval 检查 |

验收目标：

- 高风险召回率：100%。
- 腐烂漏放率：0%。
- JSON 可解析率：100%。
- 文案合规率：100%。
- 坏例修复后必须进入回归检查。

## 7. 下一步数据工作

1. 为 28 条 `to_label` 样本补充真实图片路径。
2. 为每张图片补充人工标注字段。
3. 将坏例池中 `已进入回归` 的样本补充到 Eval 模板或独立回归集。
4. 为每次 Eval 记录规则版本和 Prompt 版本。
5. 导出一次人工标注表，用于后续模型对比和项目材料。
