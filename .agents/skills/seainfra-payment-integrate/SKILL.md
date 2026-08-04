---
name: seainfra-payment-integrate
description: 编排 SeaInfra/星河发行收银台支付接入。用户提到支付配置开通、client_id、客户端或服务端 key/pubkey、JWT pubkey、支付渠道权限、创单、回调验签、幂等发货或测试上线时使用。先申请凭证和渠道，再用 key 检查渠道权限，完成后转交 seainfra-payment-check。
---

# SeaInfra 支付接入

先读统一契约、配置、状态和 `references/platform-credentials.md`，再完整使用 `$cashier-integration`。demo-X 的 `project/src/lib/payment` 只作为已验证 Web 实现证据，不是跨端协议规范。

## 接入流程

1. 确认业务类型、运行端、目标市场、渠道、应用/包名、回调公网地址和计划上线日期，运行 onboarding 的 `provision payment --env <环境>`。
2. 联系星河支付平台申请 `client_id`、客户端 key/pubkey、JWT pubkey、服务端 Open API key/pubkey、网关、SDK 地址和目标渠道；按 `$cashier-integration` 完成三方商户与平台应用申请。未开通渠道记录外部阻断。
3. 把平台返回值写入当前环境规范字段。旧项目 `signing_key/public_key` 只作为 `server_key/server_pubkey` 兼容别名。核对 `callback_base_url`、`business_types`、`channels` 后运行 `validate payment --env <环境>`。
4. 根据运行端读取对应官方文档，确认当前版本请求字段、签名、回调签名、状态码和 SDK API。示例值不得升级为协议事实。
5. 定位认证、订单库、权益/发货、前端入口和公网回调部署边界，形成本期流程图：业务订单 → 平台创单 → 拉起收银台 → 异步通知 → 验签 → 订单校验 → 幂等发货 → 查单/恢复。
6. 执行 `begin payment`。服务端生成业务订单和签名；浏览器只获得拉起支付所需公开数据。回调必须使用原始 body 验签，并校验平台订单、业务订单、用户、应用、币种和金额。
7. 把回调事件去重、订单状态推进和发货放在事务或等价原子边界；旧事件、重复事件和成功后的失败事件不得回滚权益。前端展示不能作为支付成功事实源。
8. 订阅还需覆盖首购、续费、取消/恢复和退款等官方定义事件；未选择订阅时不得虚构订阅模型。
9. 添加签名、验签、金额精度、状态机、幂等和错误响应测试，运行迁移、测试、类型检查和构建。
10. 使用当前环境 key 执行渠道权限检查：优先官方只读平台接口；没有接口时创建最小测试订单并用 Payment SDK 读取/拉起实际渠道。保存脱敏 `channel_check`，同时引用星河平台开通回执。不得把凭证存在、创单 `2xx` 或 SDK 初始化成功当作渠道已开通。
11. 运行 `validate payment --env <环境> --phase check`。所有目标 `channels` 都在 `enabled_channels` 后，记录提测范围与上线日期，执行 `check-start payment` 并转交 `$seainfra-payment-check`；不得自行标记完成。

生产真实扣款、退款或商户切换必须再次取得用户明确确认。
