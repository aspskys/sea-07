---
name: seainfra-tracking-server-integrate
description: 接入 SeaInfra/StarUnion 服务端埋点的跨语言工作流。当用户提到后端埋点、服务端打点、server-side tracking、服务端 StarUnion SDK、HTTP 日志上报、log_*_server、/server/collector/event、/server/collector/user，或提供服务端埋点需求表格、文档、截图时使用。只处理服务端探测、接入和事件实施；最终统一验收由 seainfra-tracking-check 负责。
---

# SeaInfra 服务端埋点接入（StarUnion）

本 Skill 不假设编程语言、框架、目录或部署方式。先从仓库证据识别服务边界和已有封装，再在官方 SDK 与跨语言 HTTP API 之间选择；不要把某一种语言的示例迁移成通用规范。

被 `$seainfra-tracking-integrate` 调用时，先从统一配置读取当前环境 `tracking.server_config`；缺失时返回父 Skill 联系星合数据平台开通，不绕过统一配置另存一份。

## Step 0：只读探测

每次触发先运行：

```bash
node <本 skill 目录>/scripts/check-starunion-server.mjs --json
```

脚本只提供候选证据。先读取每个 `services[]` 的 `code`、`config`、`transport` 与 `missing`，再参考仓库汇总字段和 `evidence`、`warnings`；之后必须复核实际代码：

- 多个服务候选、`language: "unknown"` 或低置信度警告：先让用户确认目标服务。
- `code: none`：走“接入分支”。
- `code: partial`：只补缺失部分，先读已有封装和调用方，不覆盖。
- `code: full`：走“事件实施分支”；`full` 仅代表发现传输与调用证据，不代表上报已验收。
- `config != ready`：配置可能由部署平台注入。先确认，不凭仓库缺少密钥断言未接入。
- 脚本失败或 Node 不可用：手工检查全部服务清单、依赖清单、初始化/生命周期、事件调用、HTTP collector 路由、运行配置、持久化备份和优雅退出。

## 接入分支

先读 `references/integration.md`。选择 HTTP API 时再读 `references/http-transport.md`。

在任何依赖安装或业务代码修改前通过两道门禁：

1. **项目与方案门禁**：使用可用的 `$starry-cli` Skill 和它提供的 wrapper 运行 `auth status`，确认 cloud/env/merchant/project；未登录则登录或切换。运行 `big_data track_scheme` 和 `big_data dev_plan_event` 获取当前项目资料。只读取命令本次返回的 `file_path`，不得猜测 `/tmp` 文件。
2. **配置与传输门禁**：确认目标环境、官方 SDK 是否支持目标语言、配置注入位置、Agent host、凭证来源和持久化备份位置。优先读取统一配置中的 `tracking.server_config`；独立使用且缺失时转交 `$seainfra-onboarding` 联系星合数据平台开通。配置必须包含服务端 `v_sign_key/v_sign_pub_key`，禁止编造、写入示例或输出到日志；测试与生产分开确认。

优先复用项目已有的服务端埋点适配层。存在经过确认的官方目标语言 SDK 时优先使用；没有官方 SDK、版本不明确或用户明确要求无 SDK 时，使用 HTTP API。不得仅因找到第三方同名包就认定为官方 SDK。

## 事件实施分支

1. **收集范围**：取得本期事件或用户属性、触发时机、字段、必填规则和验收环境。用户只给全量方案时先拆分本期范围，不默认全量实施。
2. **定位代码**：逐条定位后端业务成功/失败边界、数据来源、事务边界、异步任务和既有埋点。搜索同名及同义事件，避免重复上报。定位不到的内容标 `❓`，不得猜测。
3. **形成确认表**：读取 `references/event-table.md`，输出本期确认表。事件名、属性名、类型与必填规则只能来自 `track_scheme`、`dev_plan_event`、用户确认材料或现有已验证代码。
4. **确认门禁**：用户明确确认表格前，禁止修改业务代码、安装依赖或写入配置。用户修改需求后更新表格并重新确认。
5. **文档先行**：确认后保存为 `<目标服务>/docs/tracking/plan-YYYYMMDD.md`。若用户已有本期文档，更新原文档，不另建一套。
6. **幂等实施**：逐条复核是否已覆盖，仅实现确认范围。集中复用适配层，不让加密、重试、身份映射散落在业务逻辑中。
7. **验证与回写**：按“验证分级”执行，并把实际位置、完成状态、未完成项、风险与验证证据回写文档。

## 验证分级

- **静态验证**：格式化、类型检查、单元测试或构建通过；只可声明“静态验证”。
- **运行验证**：在非生产环境触发真实业务路径，确认初始化、入队/请求、批量部分失败、重试、备份和退出 flush；只可声明“运行验证”。
- **已验证上报**：在运行验证基础上，使用 `$starry-cli` 查询 `big_data report_stat`，并用 `big_data report_storage_issue` 检查入库异常；需要时读取明细命令本次返回的文件。只有接收量、失败量和本期事件一致时才可声明完成。

无法访问凭证、环境或统计时，明确写出未验证项，不能把本地入队成功、HTTP `2xx` 或 SDK 无报错当成落库成功。

## 硬规则

- `_client`、浏览器页面、DOM 点击/曝光和移动端事件转交客户端 Skill；本 Skill 不实施。
- 服务端事件通常以 `_server` 结尾，但最终名称必须以当前埋点方案为准，不能自行改名或创造字段。
- 业务成功事件放在真正完成业务承诺的位置；不要在收到请求、进入 handler 或事务提交前提前上报成功。
- 上报失败不得改变核心业务结果；同时必须可观测、可重试并有持久化备份，不能静默丢弃。
- `st_account_id`、`st_distinct_id`、`st_role_id` 至少一个非空；跨服务、跨端的 ID 来源和语义必须一致。
- 时间统一使用毫秒时间戳；属性类型与方案一致，自定义业务字段放入 `properties`。
- 用户属性操作必须采用方案定义的语义，例如 `user_set` 与 `user_set_once`，不得互换。
- 异步 SDK/队列必须处理进程退出、队列满、网络失败、重试耗尽、备份持久化和重放；短生命周期任务不得发送后立即退出。
- HTTP 批量中的 `list.uid` 表示部分失败；顶层成功不等于整批成功。重试或重放沿用稳定唯一 `uid`，避免重复。
- 真实密钥、完整配置和敏感属性不得进入仓库、测试 fixture、普通日志、文档或回答。

## 职责边界

本 Skill 的验证分级只用于形成接入证据，不得把统一状态写成 `completed`。服务端实施完成后返回 `$seainfra-tracking-integrate`；全部已选 surface 接入完成后，由 `$seainfra-tracking-check` 统一执行最终验收。
