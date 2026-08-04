---
name: seainfra-search-recommend-check
description: 验收 SeaInfra 内容搜索推荐接入。用户要求检查数据同步前置证据、推荐 intake、数据源、场景接口、SKU、返回顺序、pt/request_id/canary 透传、曝光点击埋点、空结果降级或真实推荐闭环时使用。逐场景执行三层验证并更新统一状态。
---

# SeaInfra 搜索推荐验收

每个 `scene` 单独验收并记录 requirement ID；一个场景通过不能代表其他场景。

## 检查

1. **静态**：同环境 `data_sync=completed` 且证据可读；intake 已确认并能回读；业务表/数仓表映射与 data sync 证据一致；SKU 准入、用户身份和字段来源与确认结果一致；请求响应按权威契约校验；返回顺序、去重、非法 SKU、超时和空结果处理明确；关联字段从请求透传到曝光、点击和核心行为。运行测试与构建。
2. **连通性**：使用测试环境真实调用每个 scene，核对鉴权、响应结构、有效 SKU、顺序和平台关联字段。记录脱敏请求 ID；仅 intake 提交 `200` 不算推荐接口可用。
3. **业务闭环**：从真实页面/API 触发推荐，确认结果可展示/消费；触发曝光、点击和核心行为并核对埋点中的 `obj_id`、`pt`、`request_id`、`canary` 等权威要求字段；再验证空结果或服务失败的降级。

证据按 scene 列出数据源、requirement ID、调用摘要、展示结果、埋点和降级结果。任何 scene 缺失正式接口资料或未走通闭环时执行 `block search_recommend`。

全部场景通过后写 `search_recommend-<environment>-<timestamp>.json`，执行 `complete search_recommend`。
