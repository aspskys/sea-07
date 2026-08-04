---
name: seainfra-tracking-check
description: 验收 SeaInfra/StarUnion 客户端与服务端埋点接入。用户要求检查星合配置 JSON、环境 stage、Conan、StarUnion、事件触发、身份、真实上报、接收统计或入库异常时使用。按已选 surface 执行配置、运行和落库检查并更新统一状态。
---

# SeaInfra 数据埋点验收

读取本期埋点确认文档、统一配置、`../seainfra-tracking-integrate/references/platform-config.md`，以及已选 surface 对应的 `$seainfra-tracking-client-integrate` / `$seainfra-tracking-server-integrate`。以事件逐行验收，不用配置存在或 SDK 初始化成功替代事件验收。

## 检查

1. **静态**：确认已选 surface 配置是完整 JSON，关键 AES/签名字段齐全，stage 与当前环境匹配，两端项目标识一致；客户端运行 `check-conan.mjs --json`，服务端运行 `check-starunion-server.mjs --json`。逐事件核对名称、触发事实、字段、身份、重复覆盖与失败策略，运行构建/测试。
2. **连通性**：在测试环境触发真实上报。客户端核对 DevMode console 与 `agent_uri` 请求；服务端核对 SDK/HTTP 请求、批量部分失败、重试、备份和退出 flush。请求成功不等于已落库。
3. **业务闭环**：逐行走真实业务路径，确认成功、失败或取消分支的事件次数和字段；使用 `$starry-cli` 的 `report_stat` 与 `report_storage_issue` 核对接收量和入库异常。只读取命令本次返回的文件。

证据应包含配置字段检查结果、stage、脱敏项目标识、本期事件清单、代码位置、验证环境/时间窗、接收与异常统计；不得包含 AES、签名 key 或完整配置。无法查询落库时模块保持 `blocked` 或明确该层 `not_applicable` 的外部原因，不能写“已验证上报”。

所有已选 surface 和本期事件通过后写 `tracking-<environment>-<timestamp>.json`，执行 `complete tracking`；否则执行 `block tracking` 并回写埋点文档。
