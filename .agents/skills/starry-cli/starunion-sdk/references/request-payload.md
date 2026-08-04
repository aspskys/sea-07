# HTTP 请求体与认证

本文是跨语言的底层实现说明。只有在用户选择 HTTP API、需要自己实现 SDK，或排查签名/解密问题时阅读。

## 凭证

从星云平台的项目管理页面下载项目配置文件。请求会使用：

- `aes_id`：放入 `Xh-Secret-Id`，标识密钥。
- `aes_key`：作为 HMAC-SHA256 的密钥。
- `aes_secret`：作为 AES 密钥材料，先按 hex 解码。

不要在代码、测试 fixture、提交记录或日志中写入真实值。以下均为占位符。

## 单条业务数据

事件数据的业务 JSON 类似：

```json
{
  "st_account_id": "account-id",
  "st_distinct_id": "device-id",
  "st_role_id": "role-id",
  "st_type": "track",
  "st_event_name": "test_event",
  "st_event_time": 1696732069043,
  "st_ip": "127.0.0.1",
  "properties": {
    "channel": "ios",
    "level": 11
  }
}
```

用户属性使用同样的身份字段和时间字段，`properties` 通常是数组，每个属性对象必须包含 `st_type`，例如 `user_set` 或 `user_set_once`：

```json
{
  "st_account_id": "account-id",
  "st_distinct_id": "device-id",
  "st_role_id": "role-id",
  "st_event_time": 1696732069043,
  "properties": [
    {"st_type": "user_set", "base_level": 3},
    {"st_type": "user_set_once", "channel": "ios"}
  ]
}
```

## 批量封装

不要直接发送单条明文 JSON。每条数据先序列化为 JSON 字符串，并和唯一 `uid` 包装在同一层，再组成数组：

```json
[
  {
    "uid": "uuid-1",
    "data": "{\"st_account_id\":\"account-id\",\"st_role_id\":\"role-id\",\"st_type\":\"track\",\"st_event_name\":\"test_event\",\"properties\":{\"level\":11}}"
  },
  {
    "uid": "uuid-2",
    "data": "{\"st_account_id\":\"account-id-2\",\"st_role_id\":\"role-id-2\",\"st_type\":\"track\",\"st_event_name\":\"test_event\",\"properties\":{\"level\":12}}"
  }
]
```

`data` 必须是 JSON 字符串，不是嵌套对象。`uid` 用 UUID 或其他调用方生成的稳定唯一值；批量部分失败时，服务会通过 `list.uid` 指出失败条目。

## AES-CFB 加密

1. 生成 16 字节随机 IV。
2. 将 `aes_secret` 按 hex 解码为字节数组，并创建 AES block。
3. 使用 AES block 和 IV 创建 CFB 加密流。
4. 对批量数组的 JSON 字节执行 XOR 加密。
5. 对密文做 Base64，得到请求 body。
6. 将 Base64 编码后的密文原文用于签名，不要对其他形式的内容签名。

IV 需要通过 `Xh-Aes-Iv` 传递。按项目现有实现对 IV 做 Base64；不要把原始二进制直接塞进 HTTP header。

## HMAC-SHA256 签名

使用 `aes_key` 创建 HMAC-SHA256，将加密后的 Base64 body 原文写入哈希对象，计算摘要后 Base64，结果放入 `Xh-Sign`。

常见错误是：对明文签名、对 Base64 前密文签名、签名时重新序列化 body，或 body 有变更但没有重新计算签名。

## 必需 Header

- `Sdk-Name`：调用工具名，例如 `my-service`。
- `Version`：调用方版本。
- `Request-Id`：每次 HTTP 请求唯一，例如 UUID。
- `Xh-Aes-Iv`：本次请求的 Base64 IV。
- `Xh-P-Id`：数据上报固定为 `10`。
- `Xh-Secret-Id`：配置文件中的 `aes_id`。
- `Xh-Sign`：HMAC-SHA256 + Base64 的签名。

## 响应与排错

公共成功码、错误码和排查流程统一查看 `common.md`。失败日志应包含请求 ID、HTTP 状态、顶层 code、`list.uid` 和错误原因，但不能包含密钥、完整配置文件或明文敏感属性。
