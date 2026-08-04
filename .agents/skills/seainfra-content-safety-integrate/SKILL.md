---
name: seainfra-content-safety-integrate
description: 接入 SeaInfra 服务端文本、图片、视频或图片加结构化文案的内容安全鉴定。用户提到敏感词、文本风险分类、图片/视频审核、融合审核、风险等级、拦截、人工复审或审核失败策略时使用。严格使用官方 Sea SDK 和对应完成字段，完成后转交 seainfra-content-safety-check。
---

# SeaInfra 内容安全接入

先读统一契约、配置、状态和 `references/sea-sdk-contract.md`。安全服务“请求成功”、扫描“已完成”和产品“允许通过”是三个不同事实。

## 配置门禁

1. 确认模块已选择，并已通过 onboarding 联系 SeaInfra 团队取得 `SEA_BASE_URL`、`SEA_API_KEY`。团队开通阶段不索取审核方法或 policy。
2. 把网关和密钥写入当前环境 `content_safety.base_url/api_key`；确认 `content_types` 和明确 `policy` 后运行 `validate content_safety`。
3. API Key 只进入服务端环境。不得进入浏览器、提交 fixture、普通日志或验收证据。

## 方法选择门禁

- 基础敏感词和组合规则：`scanText`，完成条件 `status.code == 10000`。
- 短文本类别与风险等级：`scanTextContent`，完成条件 `ok == true`。
- 图片或视频：`scanImage`，完成条件 `ok == true`；视频使用 URI 和 `is_video: true`。
- 图片加结构化文案：`scanVisualStructuredTextFusion`，完成条件 `ok == true`。

输入类型或产品 policy 不明确时先询问，禁止按名称猜方法或硬编码通用分数阈值。

## 接入流程

1. 探测服务端运行时、输入校验、鉴权、包管理器、策略代码和最小验证命令。
2. 按 reference 安装一个与现有运行时匹配的官方 SDK，不混用其他语言或版本示例。
3. 定位内容进入、生成、保存和发布边界；在受保护动作之前调用安全服务，同时保留既有鉴权、大小、媒体格式和滥用限制。
4. 执行 `begin content_safety`，集中封装 SDK 结果，并归一化为 `allow`、`review`、`block`、`unavailable`，附请求 ID 与非敏感原因码。
5. 只有方法专属完成字段通过后才能解释风险字段；再按产品 `policy` 决定放行、复审或拦截。失败不得静默转成允许。
6. 明确 fail-open、fail-closed 或 manual-review；401/403 检查授权，429/5xx 进入 unavailable，400 先修正输入，只有明确可重试的传输失败才有限重试。
7. 日志仅记录方法、归一化决策、耗时、状态和请求 ID；不记录原文、base64、完整响应、用户标识或密钥。
8. 添加安全正向样本和一个受控 policy 分支测试，运行最小 build/typecheck/test。
9. 记录方法、policy 分支、完成字段、SDK 版本和脱敏结果，执行 `check-start content_safety`，转交 `$seainfra-content-safety-check`。

本 Skill 不得写 `completed`。
