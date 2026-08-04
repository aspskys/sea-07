---
name: starry-cli-starunion-sdk
description: >-
  当用户要接入 StarUnion SDK(埋点、用户事件、行为分析SDK) 后端、Web、客户端接入，自定义客户端 HTTP 日志上报。
  实现埋点计划或开发计划事件上报时使用。
metadata:
  short-description: StarUnion SDK 接入与日志上报
---

# StarUnion SDK

这是 Starry/星云项目的接入知识入口。遵循渐进暴露：先判断传输方式和运行端，再只读取对应 reference，不要一次性加载全部文档。

当任务是“按埋点方案改业务代码”而不是单纯查文档时，必须先走 `references/implementation-workflow.md` 的文档先行流程；不要拿到埋点方案后直接批量改代码。

## 先确认

1. 用户要接入的是后端、Web 还是客户端。
2. 是否使用官方 SDK；如果不使用 SDK，走 HTTP API。
3. 项目环境和密钥配置是否已从星云项目管理下载。
4. 上报的是事件（event）还是用户属性（user）。
5. 当前项目的埋点计划、开发计划事件是否需要先通过 CLI 获取，以避免猜测事件名和字段。

## 文档路由

- 埋点接入研发工作流：`references/implementation-workflow.md`
- Golang SDK：`references/golang.md`
- 不依赖 SDK 的 HTTP API：`references/http-api.md`
- 跨语言请求体、批量封装、加密签名：`references/request-payload.md`
- Web SDK：`references/web.md`
- Android 原生 SDK：`references/android.md`
- iOS 原生 SDK：`references/ios.md`
- Unity 中台 SDK：`references/unity.md`
- Android/iOS 预置事件：`references/mobile-predefined-events.md`
- 公共 hosts、错误码和排查：`references/common.md`

## 推荐流程

1. 先调用 `starry-cli auth status` 确认项目上下文；未登录则先登录并切换到目标项目。
2. 查询埋点计划时使用 `starry-cli big_data track_scheme`；查询开发计划事件时使用 `starry-cli big_data dev_plan_event`。
3. 如果任务包含代码接入、改造、联调或验收，先阅读 `references/implementation-workflow.md`，先产出“本期埋点接入文档”，再开始写代码。
4. 只从计划中选择事件名、属性名和必填字段；不要自行发明计划外字段。
5. 按目标端的专门文档实现；不要加载无关平台文档。
6. 按 `references/common.md` 验证公共响应码，再切换生产环境。
7. 验证失败备份、重试、进程退出时的异步 flush，以及日志目录的持久化。
8. 遇到环境、响应码或上报异常时，统一阅读 `references/common.md`，不要在端侧文档中重复维护错误码。

## 文档先行规则

- 只要需求涉及“埋点接入开发代码”，默认先输出一份当前迭代的 Markdown 文档，再实施代码改动。
- 文档必须限定“这一期做什么、不做什么、如何验证”，避免一次性把几十个事件一起迁入代码。
- 如果用户只提供总埋点方案，没有指定本期范围，先帮助拆分迭代，再确认当前批次；不要默认全量接入。
- 每次实现完成后，要同步更新文档中的实际落地结果、未完成项、风险项和验证结果。
- 如果改动较大或涉及多端、多模块，优先让另一个 AI 基于“本期文档 + 代码 diff”做独立复核。

## 安全与可靠性规则

- 配置文件和 `aes_id`、`aes_key`、`aes_secret` 等密钥只能从星云项目管理下载；不得提交到 Git、写入示例、回答中或普通日志。
- 埋点 SDK 必须配置持久化的 backup log / `LogPath`；网络异常或进程异常重启时依赖它避免数据丢失。
- 每条上报尽量同时提供 `st_account_id`、`st_distinct_id`、`st_role_id`，至少一个不能为空；多端上报时必须统一 ID 语义。
- HTTP API 的明文业务 JSON 先封装成批量数组，再加密 body 和签名；不要把单条明文 JSON 直接作为请求 body。
- 文档中的域名、SDK 版本和环境以项目当前配置及 PM 提供的信息为准；不要把示例值当成凭证或最终生产配置。
