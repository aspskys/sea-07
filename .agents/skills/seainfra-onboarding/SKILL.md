---
name: seainfra-onboarding
description: 编排 Web 或后端应用的 SeaInfra 基础能力接入。用户提到 SeaInfra、基建接入、接入清单、环境配置、选择接入模块、查看接入进度、继续未完成接入，或需要统一组织 LLM、多模态、内容安全、数据同步、埋点、支付、搜索推荐、广告买量时使用。负责前置探测、依赖排序、测试/生产配置、模块状态和下游 Skill 路由，不代替模块实施与验收。
---

# SeaInfra 接入编排

把 `.agents/seainfra/config.json` 作为配置事实源，把 `.agents/seainfra/state.json` 作为进度事实源。先读 `references/contract.md`、`references/preflight.md` 和 `references/provisioning.md`，再执行流程。禁止凭对话记忆推断当前状态。

## 固定入口

从目标项目根目录运行：

```bash
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs init
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs status
```

若 Skill 安装在项目外，使用其真实脚本路径并传 `--root <项目根目录>`。

## 流程

1. 探测项目：读取根目录说明、包/依赖清单、服务入口、环境文件、部署文件和已有 SeaInfra 代码。只记录证据，不猜技术栈。
2. 初始化配置与状态文件；已有文件必须合并，禁止覆盖用户值。
3. 展示 8 个可选模块：`llm`、`multimodal`、`content_safety`、`data_sync`、`tracking`、`payment`、`search_recommend`、`ads_acquisition`。选择 `search_recommend` 时自动选择 `data_sync`。
4. 让用户一次性确认本轮选择；执行 `select <module...>`。未选择模块保持 `not_selected`。
5. 立即运行 `provision --env <环境>`，根据已选模块生成对应平台的配置开通清单和联系模板。等待平台返回配置时保持 `selected`，不进入代码实施。
6. LLM、多模态、内容安全合并申请 AI 网关权限，团队侧只提供 `SEA_BASE_URL` 和 `SEA_API_KEY`。模型、能力、审核方法和业务策略均在拿到凭证后由对应 Integrate Skill 确认，不加入开通单。
7. 选择埋点时联系星合数据平台，申请客户端和服务端项目配置 JSON；选择支付时联系星河支付平台，申请客户端、JWT、服务端 Open API 凭证和目标支付渠道。具体字段只从 `provision` 输出读取。
8. 对选中模块逐项核对测试/生产配置。LLM 收到 `base_url`、`api_key`、`model` 后先执行协议探测，不因 `sources.llm` 或 `protocol` 尚未填写而提前阻断；其他模块照常先核对 `sources`。
9. LLM 先运行 `validate llm --env test --phase probe`，再调用 `$seainfra-llm-integrate` 内置探测脚本。向用户展示已确认支持、仅检测到端点、明确不支持和无法判断的协议，并让用户选择一个已确认支持的协议。选择后登记探测报告与协议官方资料为来源，写入 `protocol`、`protocol_probe`，再运行完整 `validate llm --env test`。其他模块直接运行完整校验。只询问缺失字段，不重复询问已有值。
10. 按依赖顺序逐项调用对应接入 Skill。默认顺序：内容安全在处理用户输入/生成内容的 AI 能力之前设计；数据同步必须在搜索推荐之前完成；埋点在各业务闭环实施时同步；其余模块按用户优先级。
11. 支付接入后、进入 Check 前运行 `validate payment --env <环境> --phase check`；必须用当前环境 key 完成渠道查询或 Payment SDK 检查，并确认所有目标渠道已开通。
12. 接入 Skill 完成后必须调用配对 Check Skill。Check Skill 写出证据 JSON 并调用 `complete` 后，模块才可显示完成。
13. 测试环境全部完成后，单独执行生产环境 `provision`、配置和验收；测试结论不得继承。
14. **最后一公里**：用户问「是否接完 / 能否上线 / 能不能信 agent」时，必须调用 `$seainfra-completion-check`，先跑 `scripts/verify-completion.mjs`。禁止仅凭对话或 integrate 自述宣称完成。`test_closure`（用户测试收口）≠ `env_ready`（环境 formal 完成）≠ `ship_ready`（可上线）。
15. **假 completed**：审计发现 `completed` 但证据无效时，运行 `verify-completion.mjs --fix-false-completed`（或等价 `block`），不得继续当完成汇报。CI 工作流 `seainfra-completion.yml` 在 PR 上自动跑 integrity audit。
16. **深度复查**：上线前或用户要求「真去查」时用 `--mode deep`（可选 `--live`），再按输出的 Check Skill 清单完整重跑各 `seainfra-*-check`。

## 状态命令

```bash
# 选择模块
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs select llm payment

# 生成所选模块的对应平台配置开通清单（不回显配置值）
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs provision --env test

# 开始接入或验收
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs begin llm --env test
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs check-start llm --env test

# 配置或资料不足
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs block llm --env test --reason "缺少权威网关文档"

# 仅配对 Check Skill 可在证据通过后执行
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs complete llm --env test --evidence <证据.json>
```

## 路由表

| 模块 | 接入 Skill | Check Skill |
|---|---|---|
| LLM | `$seainfra-llm-integrate` | `$seainfra-llm-check` |
| 多模态 | `$seainfra-multimodal-integrate` | `$seainfra-multimodal-check` |
| 内容安全 | `$seainfra-content-safety-integrate` | `$seainfra-content-safety-check` |
| 数据同步 | `$seainfra-data-sync-integrate` | `$seainfra-data-sync-check` |
| 数据埋点 | `$seainfra-tracking-integrate` | `$seainfra-tracking-check` |
| 支付 | `$seainfra-payment-integrate` | `$seainfra-payment-check` |
| 搜索推荐 | `$seainfra-search-recommend-integrate` | `$seainfra-search-recommend-check` |
| 广告买量 | `$seainfra-ads-acquisition-integrate` | `$seainfra-ads-acquisition-check` |
| **完成判定（总闸门）** | — | **`$seainfra-completion-check`**（审计全部 selected 模块证据，不实施接入） |

## 门禁

- 不读取模块 Skill 就不得实施该模块。
- LLM 协议不得只根据 Base URL、模型名或用户口述猜测；必须运行内置探测脚本，并由用户在探测结果后选择。
- 埋点配置必须是星合数据平台返回的完整环境 JSON；支付凭证存在不代表渠道已开通，必须另有 key 支撑的渠道检查证据。
- 不存在权威来源时，不根据常见 OpenAI、支付、审核或归因接口自行补齐字段。
- 测试与生产配置分别校验、分别验收、分别记录状态。
- `completed` 只表示证据文件中的静态、连通性和最小闭环均通过；跳过项必须为 `not_applicable` 且写明理由。
- 生产写入、真实扣款、投放、用户数据上报或内容提交前再次取得用户明确确认。
- 每轮结束输出模块、环境、状态、阻断项、下一步唯一动作；不得用总述替代状态文件。
