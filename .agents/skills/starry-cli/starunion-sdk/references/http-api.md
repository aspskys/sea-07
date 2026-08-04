# HTTP API 接入

本文用于不依赖官方 SDK、需要自己发送日志的后端服务或工具。请求体和认证算法的完整细节见 `request-payload.md`。

## 路由

Agent host 和环境地址统一查看 `common.md`。接口：

- 事件上报：`POST /server/collector/event`
- 用户属性上报：`POST /server/collector/user`

## 构造请求

请求顺序：

1. 根据埋点计划构造单条业务 JSON。
2. 将每条业务 JSON 序列化为字符串，包装为 `{uid, data}`。
3. 将多个包装对象组成数组。
4. 对数组 JSON 做 AES-CFB 加密并 Base64。
5. 对加密后的 Base64 body 做 HMAC-SHA256 并 Base64。
6. 设置必需 headers，发送到对应路由。

字段、算法和 header 详见 `request-payload.md`。请求 body 是加密后的 Base64 字符串，不是 JSON 文本。

## curl 形态

以下只展示结构，`<...>` 都必须由程序动态生成或从安全配置读取：

```bash
curl --request POST \
  --url 'https://<agent-host>/server/collector/event' \
  --header 'Request-Id: <request-uuid>' \
  --header 'Sdk-Name: <service-name>' \
  --header 'Version: <service-version>' \
  --header 'Xh-Aes-Iv: <base64-iv>' \
  --header 'Xh-P-Id: 10' \
  --header 'Xh-Secret-Id: <aes-id>' \
  --header 'Xh-Sign: <base64-hmac>' \
  --data '<base64-encrypted-batch-body>'
```

不要手写固定 IV、Request-Id、签名或密文；每个请求都应重新生成并保证签名对应最终 body。

## 响应

响应结构和公共响应码统一查看 `common.md`。如果存在 `list.uid`，不能当作全部成功。失败条目应落入持久化备份并根据公共错误码对应的原因重试或修正后重放。

错误码和通用排查流程统一查看 `common.md`。签名问题先固定同一份原始批量 JSON、IV、加密 body 和 header，逐步打印长度与摘要；不要打印密钥或完整明文业务数据。
