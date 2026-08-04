# 星合埋点配置契约

选择埋点模块后，联系星合数据平台按环境开通客户端和服务端项目配置。平台返回完整 JSON；把 JSON 对象分别写入统一配置的 `tracking.client_config` 与 `tracking.server_config`，不要只摘录单个 key。

## 环境映射

| SeaInfra 环境 | 配置 `stage` |
|---|---|
| `test` | `release` |
| `production` | `production` |

测试与生产必须分别申请、分别校验。两个环境即使项目名称相同，也不得复制验收结论。

## 客户端配置

关键字段至少包括：

```text
project_name, project_key, stage, agent_uri,
aes_id, aes_key, aes_secret,
sign_key, sign_pub_key, sign_uri
```

配置还可能包含 `open_gateway`、`im_gateway`、`socket_urls` 等客户端连接信息。保留平台返回的完整对象，不根据样例补造缺失字段。

## 服务端配置

服务端包含客户端的共同关键字段，并额外要求：

```text
v_sign_key, v_sign_pub_key
```

当同时接入客户端和服务端时，两份配置的 `project_name`、`project_key` 和 `stage` 必须一致。配置存在只证明平台已发放凭证，不证明事件已上报或落库；最终仍由 `$seainfra-tracking-check` 验收。

## 开通申请

```text
【星合数据平台埋点配置开通申请】
项目/应用：<名称与标识>
环境：test(release) / production
接入端：client / server / client+server
需要提供：CLIENT_STARUNION_CONFIG、SERVER_STARUNION_CONFIG
研发联系人：<姓名>
计划联调时间：<时间>
```
