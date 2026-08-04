# 星河支付配置与渠道门禁

选择支付模块后，联系星河支付平台按环境申请应用、凭证和渠道。凭证存在不代表支付渠道已开通。

## 平台返回配置

| 作用域 | 统一配置字段 | 用途 |
|---|---|---|
| 客户端 | `client_id` | 发行应用唯一标识、Payment SDK 初始化 |
| 客户端 | `client_key` | 客户端公钥标识 |
| 客户端 | `client_pubkey` | 与 `client_key` 成对的公钥 |
| 服务端登录 | `jwt_pubkey` | 服务端解析发行 accessToken |
| 服务端 Open API | `server_key` | Open API 公钥标识 |
| 服务端 Open API | `server_pubkey` | 与 `server_key` 成对的公钥 |
| 平台端点 | `gateway_base_url` | Open API 网关 |
| 客户端脚本 | `sdk_src` | Payment SDK 地址 |

旧项目的 `signing_key/public_key` 可作为 `server_key/server_pubkey` 的兼容别名，新项目使用规范字段。测试与生产配置分别申请，不根据示例值推导真实凭证。

## 渠道权限检查

把业务要求的渠道写入 `channels`。平台发放凭证后，必须使用当前环境凭证完成一次无扣款的渠道检查：

1. 优先使用权威文档登记的只读应用/渠道查询接口，`method` 记为 `platform_api`。
2. 没有只读接口时，用服务端 Open API 凭证创建最小测试订单，再用 `client_id` 初始化 Payment SDK 并读取/拉起实际渠道，`method` 记为 `payment_sdk`。
3. 同时保留星河支付平台的渠道开通回执。仅有回执或仅有 `client_id` 都不能替代运行检查。
4. 生产环境的真实创单、扣款或渠道探测必须先取得用户明确确认。

把脱敏结果写入 `channel_check`：

```json
{
  "method": "platform_api | payment_sdk",
  "checked_at": "ISO-8601 time",
  "enabled_channels": ["requested channel"],
  "evidence_ref": "脱敏请求、测试订单或运行记录位置",
  "platform_confirmation_ref": "星河支付平台开通回执位置"
}
```

所有 `channels` 都必须出现在 `enabled_channels`。缺少任一渠道时保持 `blocked`，并把缺失渠道提交星河支付平台开通。

## 开通申请

```text
【星河支付平台配置与渠道开通申请】
应用名称/包名：<名称与标识>
环境：test / production
运行端与业务类型：<Web/App；一次性/订阅/签约代扣>
需要开通渠道：<渠道列表>
需要提供：client_id、client_key/client_pubkey、jwt_pubkey、server_key/server_pubkey、网关与 SDK 地址
回调公网地址：<HTTPS 地址>
研发联系人：<姓名>
计划联调时间：<时间>
```
