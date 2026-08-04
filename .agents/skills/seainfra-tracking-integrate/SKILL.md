---
name: seainfra-tracking-integrate
description: 编排 SeaInfra/StarUnion 数据平台的客户端与服务端埋点接入。用户提到数据埋点、星合数据平台、客户端/服务端项目 key、配置 JSON、Conan、StarUnion、tracking plan、log_*_client 或 log_*_server 时使用。先完成平台配置开通与校验，再按 surface 路由，最终转交 seainfra-tracking-check。
---

# SeaInfra 数据埋点接入

先读统一契约、配置、状态和 `references/platform-config.md`。`tracking.surfaces` 只允许 `client`、`server`；可以选择其一或两者。

## 星合配置门禁

1. 模块选择后立即运行 onboarding 的 `provision --env <环境>`，联系星合数据平台申请完整 `CLIENT_STARUNION_CONFIG` 与 `SERVER_STARUNION_CONFIG` JSON。
2. 把平台返回对象原样写入当前环境 `tracking.client_config/server_config`。不要只摘录 key，也不要把下载文件路径当作配置值。
3. test 环境只接受 `stage=release`，production 只接受 `stage=production`；同时接入两端时项目名称与项目 key 必须一致。
4. 运行 `validate tracking --env <环境>`。缺字段、stage 错误或两端项目不一致时执行 `block tracking`，不得进入 SDK/HTTP 实施。

## 权威路由

- `client`：必须完整使用 `$seainfra-tracking-client-integrate`，包含其探测脚本、需求确认表、确认门禁和实施规则。
- `server`：必须完整使用 `$seainfra-tracking-server-integrate`；需要星云项目资料和落库统计时使用可用的 `$starry-cli`。

本 Skill 不复制事件 API 细节，不把客户端规则套到服务端，也不把服务端传输实现放进浏览器。

## 接入流程

1. 确认目标 surface、应用/服务边界、本期事件范围、身份 ID 语义和测试环境，完成上述配置门禁。
2. 读取埋点方案与开发计划；事件名、字段、类型和必填规则只来自方案、计划或用户确认材料。没有来源的字段标记阻断。
3. 执行 `begin tracking`。对每个 surface 调用对应 Skill 的 Step 0，只补已有接入的缺失部分。
4. 在修改业务代码前输出统一确认表：事件、触发业务事实、字段来源、代码落点、已有覆盖、端和验证方式。用户明确确认后才能实施。
5. 客户端优先 DOM 自动埋点，只对异步结果和业务完成等事实手动上报；服务端成功事件放在真实业务承诺完成或事务提交之后。
6. 多端共享身份与事件时，明确 ID 映射、事件所有者和去重规则，禁止同一业务事实由客户端与服务端重复上报。
7. 运行 Conan/StarUnion 探测脚本和项目测试/构建，回写本期埋点文档的实际位置与验证级别。不得把完整配置或 key 写入普通日志和证据。
8. 执行 `check-start tracking`，转交 `$seainfra-tracking-check`。只完成一个 surface 时不得把选择了两个 surface 的模块标记完成。
