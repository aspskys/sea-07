# 公共接入信息

本文适用于 Golang、HTTP API、Web、Android、iOS 和 Unity 中所有会调用 StarUnion Agent 的数据上报场景。

## Agent hosts

接口路径统一为：

- 事件上报：`POST /server/collector/event`
- 用户属性上报：`POST /server/collector/user`

### 星合\星合互娱\星云环境

- dev：`https://agent-server-alpha.centersys-develop.k8s.outer.starinscribe.com`
- release：`https://platform-center-agent-release.staruniongame.com`
- production：`https://agent-server.center-public-production.allstarunion.com`
- release v2：`https://agent-server-alpha-test.center-public-release.staruniongame.com`
- production v2：`http://agent-server-alpha-v2.center-public-production.staruniongame.com`

### 海艺 GCP 环境

- release：`https://agent-server.sc-api-release.saconsole.com`
- production：`https://agent-server.sc-api.saconsole.com`
- release v2：`https://agent-server-v2.sc-api.saconsole.com`
- production v2：`https://agent-server-v2.sc-api-release.saconsole.com`

### 海艺 Aliyun 环境

- release：`https://agent-server.sc-api-release.haiyiapi.com`
- production：`https://agent-server.sc-api.haiyiapi.com`

说明：

- v2 是新数据架构，是否对接v2数据接口请先咨询清楚。
- v1，v2的密钥是共用的。但 dev, release, production 密钥不共用。
- Web SDK 的脚本资源地址是 CDN 地址，和上述 Agent host 不是一回事；脚本地址继续查看 `web.md`。

## 公共响应判断

数据上报接口顶层 `code == 20000` 才表示请求处理成功。

如果响应同时包含 `list.uid`，表示批量请求中有指定数据失败，不能当作全部成功：

```json
{
  "code": 20000,
  "msg": "Success",
  "list": {
    "code": 150042,
    "uid": "failed-uid"
  }
}
```

> 调用失败时：后端sdk会重试，失败后写日志记录，客户端sdk会自动重试，web端sdk会自动重试

## 公共错误码

### 请求、认证和配置

- `150001`：参数错误
- `150002`：缺少必要参数
- `150003`：内部服务器错误
- `150004`：Agent 配置查询失败
- `150005`：客户端版本已废弃
- `150011`：密钥异常
- `150040`：认证签名错误
- `150041`：认证解密错误
- `150042`：缺少认证参数
- `150043`：应用未接入，拒绝接入
- `150044`：应用配置获取失败或认证失败

### 日志数据

- `150045`：日志推送失败
- `150046`：日志数据错误
- `150047`：日志数据字段错误
- `150048`：日志数据缺少事件名
- `150049`：日志数据缺少参数
- `150050`：日志数据缺少字段
- `50000`：后端服务错误

`20000` 是成功码，不要把它和业务模块的成功回调名称混淆。Unity 登录、支付、广告等模块可能还有自己的业务错误码，只有在该模块文档中出现时才使用。

## 通用排查流程

1. 确认当前项目、云平台、环境和配置文件属于同一套环境。
2. 确认 Agent host、collector 路由和配置文件中的地址没有混用。
3. 确认事件名、用户属性名和必填字段来自当前埋点方案。`st_` 开头的事件字段有明确限制。
4. 业务事件自定义字段放在 `properties`，不要把计划属性放到错误层级。
5. sdk初始化阶段的报错信息需要注意，上报时走的异步接口，不会立即返回错误

## 常见问题

### 请求成功但事件库看不到

1. 确认查看的环境和上报的环境一致
2. 确认是否超过落库延迟，再检查事件是否在埋点方案内、事件字段是否通过校验。使用 `big_data report_stat` 和 `big_data report_storage_issue` 辅助判断。

### 数据重复

受限于网络原因，client端有可能收不到确认成功的信息，而再次上报。如果重复上报，会按照unqiue id 去重复。

### 数据丢失

数据上报流程： 客户端 -> 日志网关 -> 消息队列 -> 数仓。
由于埋点数据流量很大，这里任意网络抖动都会导致失败。 失败会重试，重试多次失败会写备份。
备份日志文件再上报需要时间，如果几天后数据依然不全，那请联系我们.
