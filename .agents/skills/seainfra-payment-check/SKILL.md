---
name: seainfra-payment-check
description: 验收 SeaInfra/星河发行收银台支付接入。用户要求检查客户端/服务端凭证、JWT pubkey、支付渠道是否开通、Payment SDK、创单签名、回调验签、幂等发货、沙箱支付或上线门禁时使用。执行渠道权限与最小支付闭环验收。
---

# SeaInfra 支付验收

读取 `$cashier-integration`、对应端官方文档、统一配置、`../seainfra-payment-integrate/references/platform-credentials.md` 和真实支付实现。只按本期业务类型与渠道验收。

## 检查

1. **静态**：客户端、JWT、服务端 Open API 凭证齐全且环境匹配；签名输入顺序、算法和版本来自官方资料；回调按原始 body 验签；金额精确；订单关键字段被校验；事件去重与发货幂等。运行迁移、单测、类型检查和构建。
2. **渠道与连通性**：运行 `validate payment --phase check`；核对星河平台开通回执，并用当前环境 key 重跑官方只读渠道查询或 Payment SDK 测试。逐个确认目标渠道出现在实际可用渠道中，再验证创单、SDK 拉起目标订单和 HTTPS 回调。仅凭证存在、页面打开、SDK 初始化或创单 `2xx` 均不算通过。
3. **业务闭环**：完成一笔沙箱/测试支付，确认签名回调推动订单成功并只发货一次；重复发送同一事件验证不重复发货；核对查单/页面恢复。再验证失败、取消或超时中的一个路径。订阅场景按接入范围验证首购、续费、取消与退款。

证据记录渠道检查方法、平台回执引用、全部已开通渠道、脱敏业务单号/平台单号、回调事件 ID、数据库最终状态、发货记录和重复回调结果；不得记录 key/pubkey 原文。生产真实支付没有明确确认时禁止执行。

全部通过后写 `payment-<environment>-<timestamp>.json` 并执行 `complete payment`；任何渠道未开通或闭环未完成时执行 `block payment`，不得以单元测试代替平台验收。
