---
name: seainfra-multimodal-check
description: 验收基于官方 Sea SDK 的 SeaInfra 多模态异步任务接入。用户要求检查实时模型目录、getModelSkill schema、任务创建、task ID 持久化、轮询超时、预扣费、结果 URL 访问控制或真实业务闭环时使用。逐能力生成统一验收证据。
---

# SeaInfra 多模态验收

读取统一契约、配置、`../seainfra-multimodal-integrate/references/sea-ai-gateway-contract.md` 与实际改动。每个 `capability` 和精确模型 ID 单独给出结论。

## 三层检查

1. **静态**：确认官方 SDK 及版本匹配运行时；`SEA_API_KEY` 仅服务端可读；模型来自实时 modal catalog；每个请求引用对应 `getModelSkill` schema；任务 body 没有 `messages`、`max_tokens` 或 LLM streaming 字段；task ID 持久化、轮询有界、结果受访问控制。运行测试和构建。
2. **连通性**：重新读取 catalog 和 schema，确认已配置模型仍支持目标模态。使用最小合法样本创建任务，核对 task ID、状态变化、终态和脱敏输出 URL；需要费用估算时使用相同 body 验证 `precharge`。
3. **业务闭环**：从真实入口提交样本，确认处理中不会被当作成功，刷新/重启后仍能依据持久化 task ID 恢复，成功结果正确展示/消费；再验证超时、失败或取消，以及结果 URL 未越权公开。

不得自动重提失败的计费任务。任一能力缺 catalog/schema 证据、任务 ID 未持久化或轮询无界时执行 `block multimodal`。全部通过后按统一契约写证据并执行 `complete multimodal`。
