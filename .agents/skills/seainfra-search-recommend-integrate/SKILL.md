---
name: seainfra-search-recommend-integrate
description: 编排 SeaInfra 内容搜索与推荐的完整接入。用户提到搜索推荐功能说明、接入信息收集、推荐场景、SKU/obj_id、热门或个性化推荐、recall、pt、canary、推荐数据源、intake 提交、推荐接口实现或埋点透传时使用。接入模式会先强制完成 data_sync，再执行项目分析、确认、提交和业务实现；最终验收交给 seainfra-search-recommend-check。
---

# SeaInfra 搜索推荐接入

先读 `.agents/skills/seainfra-onboarding/references/contract.md`、统一配置和状态。详细字段、证据、交互阶段与 intake 请求体必须读取 `references/intake-contract.md`，不得自行简化或改写。

## 模式路由

- 用户只询问字段、用途或接入要求：执行“功能说明”模式，只读取 intake reference 的功能说明，不修改配置、状态或代码。
- 用户要求接入、分析项目、提交需求或默认触发：执行下面的完整接入流程。

## 完整接入流程

1. 确认 `search_recommend` 已被用户选择；Harness 会同时选择 `data_sync`。读取同环境状态，只有 `data_sync=completed` 才能继续。
2. `data_sync` 未完成时，先调用 `$seainfra-data-sync-integrate`，再调用 `$seainfra-data-sync-check`；保持搜索推荐为 `selected` 或 `blocked`，不得并行推导 SKU、提交 intake 或实现接口。
3. 数据同步通过后，读取当前环境搜索推荐配置；`project_id` 或 `scenes` 缺失时通过 intake 收集，不提前把配置缺失当成最终阻断。
4. 严格执行 reference 的前置检查，并引用 data sync Check 证据确认 `bigdata_config` 和目标数仓表。证据缺失或映射不一致时执行 `block search_recommend --reason <原因>`。
5. 严格执行三阶段 intake：项目证据收集 → 全量字段批量确认 → 按单个 scene 生成并提交参数。阶段一、二不得提前生成提交请求。
6. 用户确认后，把正式 `project_id` 和全部 `scenes` 回写统一配置；运行 `validate search_recommend --env <环境>`。
7. 每个 scene 单独提交 intake，记录 `requirement_id`。连接超时后先回读需求列表，再决定是否重试，避免重复登记。
8. 明确提示：intake 提交成功只代表需求已登记，不代表项目已接入搜索推荐，也不能进入 `completed`。
9. 从平台返回、项目负责人或后续权威资料取得真实推荐接口的请求、响应、鉴权、限流、超时、`obj_id`、`pt`、`request_id`、`canary` 和降级规则。缺少这些事实时执行 `block search_recommend`，禁止根据 intake 请求体反推业务接口。
10. 定位场景入口、候选数据、用户身份、展示组件和埋点边界，执行 `begin search_recommend --env <环境>`。集中实现客户端/服务端适配，按 scene 隔离配置；Harness 会再次检查 data sync 依赖。
11. 保持平台返回顺序和来源字段；从推荐请求到曝光、点击、核心行为完整透传关联字段。使用 `$seainfra-tracking-integrate` 实施埋点，避免丢失实验与召回信息。
12. 实现空结果、超时、服务错误、无身份和非法 SKU 的明确降级；不得把本地降级结果记录为平台推荐。
13. 添加请求契约、响应校验、顺序、去重、降级和埋点透传测试，运行项目验证命令。
14. 回写各 scene 的 requirement ID、代码位置和未验证项，执行 `check-start search_recommend`，转交 `$seainfra-search-recommend-check`。本 Skill 不得自行标记完成。

## 职责边界

- intake reference 是字段与提交契约的事实源；主 Skill 是完整生命周期编排入口。
- 多个 scene 必须分别收集、提交、实现和验收，不能合并成数组提交。
- `data_sync` 是同环境强制前置依赖，不能用静态映射文件替代完成证据。
- `seainfra-search-recommend-check` 是唯一最终验收入口。
