# StarUnion 服务端 HTTP 传输

仅在无官方目标语言 SDK、SDK 版本/API 无法确认、用户明确要求 HTTP，或排查跨语言加密签名时读取。Agent host 必须取自当前项目配置或星云当前官方资料，不在业务代码中硬编码。

## 路由

- 事件：`POST /server/collector/event`
- 用户属性：`POST /server/collector/user`

## 凭证

- `aes_id`：写入 `Xh-Secret-Id`。
- `aes_key`：HMAC-SHA256 密钥。
- `aes_secret`：按 hex 解码后的 AES 密钥材料。

三者必须来自目标环境的星云项目配置。不要在代码、fixture、日志、文档或回答中出现真实值。

## 业务数据

事件对象包含身份字段、`st_type: "track"`、`st_event_name`、毫秒级 `st_event_time`、可选 `st_ip` 和 `properties`。用户属性对象使用相同身份与时间字段，`properties` 为操作数组，每项包含方案定义的 `st_type`，例如 `user_set` 或 `user_set_once`。

事件名、属性名、类型和必填字段只取自当前埋点方案。`st_account_id`、`st_distinct_id`、`st_role_id` 至少一个非空。

## 批量封装

每条业务对象先序列化为 JSON 字符串，再包装为 `{uid, data}`，最后组成数组：

```json
[
  {
    "uid": "stable-unique-id",
    "data": "{\"st_type\":\"track\",\"st_event_name\":\"event_from_scheme\"}"
  }
]
```

`data` 是 JSON 字符串，不是嵌套对象。`uid` 由调用方生成并在该条数据重试/重放时保持稳定，用于定位部分失败和去重。

## 加密与签名顺序

1. 序列化整个批量数组为 UTF-8 JSON 字节。
2. 每个请求生成新的 16 字节随机 IV。
3. 将 `aes_secret` 按 hex 解码，使用 AES-CFB 和该 IV 加密批量 JSON 字节。
4. 对密文做 Base64，所得字符串就是最终请求 body。
5. 使用 `aes_key` 对最终 Base64 body 原文做 HMAC-SHA256，再 Base64，写入 `Xh-Sign`。
6. 对 IV 做 Base64，写入 `Xh-Aes-Iv`。

禁止对明文、Base64 前密文或重新序列化后的内容签名。不同语言的 AES-CFB API 参数可能不同；必须使用官方测试向量或与已验证实现互操作确认，不能猜测 mode/segment/padding 细节。

## 必需 Header

- `Sdk-Name`：服务名。
- `Version`：服务版本。
- `Request-Id`：每个 HTTP 请求唯一。
- `Xh-Aes-Iv`：Base64 IV。
- `Xh-P-Id`：数据上报固定为 `10`。
- `Xh-Secret-Id`：`aes_id`。
- `Xh-Sign`：HMAC-SHA256 后的 Base64 签名。

请求 body 是 Base64 字符串，不是明文 JSON。每次请求重新生成 IV 与 Request ID，并确保签名对应最终 body。

## 响应与重试

- 顶层 `code == 20000` 才表示请求被处理。
- 响应存在 `list.uid` 时表示对应批量条目失败，不能把整批视为成功；仅处理失败项。
- 认证/配置类错误不可盲目重试：`150011` 密钥异常、`150040` 签名错误、`150041` 解密错误、`150042` 缺认证参数、`150043` 未接入、`150044` 配置或认证失败。
- 数据类错误需修正方案或字段：`150046` 数据错误、`150047` 字段错误、`150048` 缺事件名、`150049` 缺参数、`150050` 缺字段。
- 服务/网络类失败可按有限退避策略重试；重试耗尽后写入持久化备份并可重放。

排查签名时只记录各阶段长度、摘要、Request ID 和失败 uid。不要打印密钥、完整明文业务数据或可逆的敏感上下文。
