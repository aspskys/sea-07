---
name: seainfra-multimodal-integrate
description: 使用官方 Sea SDK 接入 SeaInfra 图片、视频、音频或其他多模态异步任务。用户提到多模态网关、图片/视频生成、媒体输入、模型目录、模型 schema、任务轮询、预扣费或生成结果处理时使用。严格以实时 modal catalog 和 getModelSkill 为事实源，完成后转交 seainfra-multimodal-check。
---

# SeaInfra 多模态接入

先读统一契约、配置、状态和 `references/sea-ai-gateway-contract.md`。本 Skill 只使用 `client.modal`；LLM 继续由 `$seainfra-llm-integrate` 的协议门禁处理。

## 配置与模型门禁

1. 确认模块已选择，并已通过 onboarding 联系 SeaInfra 团队取得 `SEA_BASE_URL`、`SEA_API_KEY`。团队开通阶段不索取模型 ID 或参数 schema。
2. 把网关和密钥写入当前环境 `multimodal.base_url/api_key`。
3. 使用匹配运行时的官方 SDK 调用 modal catalog，按用户要求的输入/输出模态和能力展示少量候选；用户选择精确任务模型 ID 后写入 `models`。
4. 对每个模型调用 `getModelSkill` / `GetModelSkill` / `get_model_skill` 获取实时 schema。未读取 schema 前禁止构造任务、根据 provider 名猜字段或复用 LLM body。
5. 填写 `capabilities` 与模型映射后运行 `validate multimodal`。

## 接入流程

1. 探测项目运行时、服务端入口、环境约定、上传/对象存储、任务持久化和最小验证命令。
2. 按 reference 安装一个官方 Sea SDK；密钥只进入服务端环境。
3. 为每项能力确定真实业务闭环、输入媒体来源、格式/大小/时长、输出形式、访问控制、失败语义和费用展示要求。
4. 执行 `begin multimodal`，按实时 schema 构造 `model`、可选 `moderation` 和 `input` 数组；每个 input item 的 `params` 层级必须与 schema 一致。
5. 创建任务后立即持久化 task ID、业务关联和状态。使用 SDK `task.wait()` / `task.Wait` 或等价有界轮询；设置间隔、总超时、取消和终态，禁止自动重提可能计费的失败任务。
6. 产品需要展示或限制预计费用时，用相同 task body 调用 `precharge`；缺失估算是明确状态，不得当作零费用。
7. 完成后读取任务返回的内容 URL，并按项目访问控制决定存储或暴露方式；不要默认把上游 URL 公开给用户。
8. 用户媒体在接受或发布前需要安全鉴定时，调用 `$seainfra-content-safety-integrate` 的对应 scan 流程，不把安全字段混入生成成功判断。
9. 添加 schema、任务 ID、轮询超时、取消、失败、结果访问和可选预扣费测试，运行最小 build/typecheck/test。
10. 记录 runtime、能力、精确模型 ID、schema 来源、SDK 版本、task ID 和脱敏结果，执行 `check-start multimodal`，转交 `$seainfra-multimodal-check`。

本 Skill 不得写 `completed`。
