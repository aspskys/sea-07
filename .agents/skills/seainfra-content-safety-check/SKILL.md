---
name: seainfra-content-safety-check
description: 验收 SeaInfra 文本、图片、视频或融合内容安全接入。用户要求检查官方 Sea SDK、方法选择、完成字段、风险结果映射、拦截/复审/放行、不可用策略、敏感日志或真实鉴定请求时使用。执行三层验证并更新统一状态。
---

# SeaInfra 内容安全验收

读取统一契约、配置、`../seainfra-content-safety-integrate/references/sea-sdk-contract.md` 和实际改动。逐一验证配置中的 `content_types` 与所有本期业务入口。

## 三层检查

1. **静态**：确认官方 SDK 及版本匹配运行时；`SEA_API_KEY` 仅服务端可读；每个入口选择正确方法和完成字段；平台结果只在集中决策层解释；输入大小/URI scheme 有界；普通日志不含原始内容、base64、完整响应、用户标识或密钥。运行测试与构建。
2. **连通性**：使用安全、合法、可重复样本调用每个已选方法。核对 `scanText` 的 `status.code == 10000`，或其他方法的 `ok == true`，并保存脱敏请求 ID。HTTP 成功但完成字段未通过必须判为未完成。
3. **业务闭环**：从真实入口验证至少一个 allow 路径和一个受控 review/block policy 路径；模拟 401/403、429/5xx 或超时中的适用路径，确认进入 `unavailable` 并按既定 fail policy 处理。视频还需验证 URI 与 `is_video: true`。

任一内容类型、入口或完成字段未通过时执行 `block content_safety`。全部通过后按统一契约写证据并执行 `complete content_safety`。证据记录方法、SDK 版本、policy 分支、请求 ID 和验证命令，只保留脱敏结果。
