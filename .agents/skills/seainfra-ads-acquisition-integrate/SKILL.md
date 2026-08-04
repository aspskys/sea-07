---
name: seainfra-ads-acquisition-integrate
description: 接入 SeaInfra 市场广告买量与 AppsFlyer 归因链路。用户提到广告买量、AppsFlyer SDK、安装归因、广告参数、tracking link、deep link、deferred deep link、媒体渠道、转化事件或服务端事件回传时使用。依据已登记平台文档实施，完成后转交 seainfra-ads-acquisition-check。
---

# SeaInfra 广告买量接入

先读统一契约、配置与状态。`ads-data-query` 仅能证明数据进入 BigQuery 后如何查询，不能替代 AppsFlyer/媒体平台接入文档；Conan 广告插件仅覆盖 Web 广告参数与转化事件时，也不能冒充移动端安装归因 SDK。

## 来源门禁

`sources.ads_acquisition` 必须按当前 `platforms` 覆盖 SDK/网页归因、应用标识、归因链接、深链、转化事件、隐私/同意和服务端回传。当前配置只有查询或局部来源时，执行 `block ads_acquisition` 并补齐权威接入资料。

## 接入流程

1. 确认应用/包、平台、市场、媒体渠道、本期转化事件、Web 或移动端、是否需要深链/延迟深链和服务端回传。
2. 核对当前环境 `provider`、`app_id`、`credentials`、`platforms`、`conversion_events`，运行 `validate ads_acquisition`。
3. 从每个平台权威来源记录 SDK/脚本版本、初始化、应用标识、测试设备、链接域名、参数、回调、事件名/收入格式和测试方法。禁止把 iOS、Android、Web 规则互相套用。
4. 建立事件映射表：业务事实 → 唯一事件生产者 → 平台事件名 → 必填字段 → 收入/币种 → 去重键 → 数据验证位置。与 StarUnion 业务埋点区分所有者，避免重复或含义漂移。
5. 执行 `begin ads_acquisition`。在正确生命周期初始化 SDK/脚本，处理隐私同意；实现归因参数持久化、普通/延迟深链路由以及已确认的客户端或服务端转化回传。
6. 订单/订阅等收入事件必须来自服务端确认的业务成功事实；失败重试沿用稳定去重键，不得因页面刷新重复收入。
7. 添加初始化、链接解析、冷/热启动路由、事件映射、收入精度、同意状态和重复回传测试；运行项目验证命令。
8. 记录平台后台尚需配置的域名、应用、测试设备与媒体链接，执行 `check-start ads_acquisition`，转交 `$seainfra-ads-acquisition-check`。

创建真实广告活动、修改预算或正式投放不属于代码接入的隐含授权，必须单独确认。
