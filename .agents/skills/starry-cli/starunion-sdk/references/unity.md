# Unity 中台 SDK

本文用于 Unity 工程接入 `StarUnionSDK`。Unity 工程需要先完成 Android/iOS 原生 SDK 配置，再通过 Unity bridge 调用中台 API。

> 移动端 SDK 请联系我们获取

## 接入边界

Unity 文档包含登录、账号绑定、角色、支付、客服、广告、DMA、推送和数据上报多个模块。只接入业务需要的模块；不要因为引入主 SDK 就默认开启全部第三方功能。

所有 API 都必须在 SDK 初始化成功后调用，否则资料明确提示可能出现功能异常或崩溃。

## 初始化与监听

设置统一监听器：

```csharp
StarUnionSDK.GetInstance().SetListener("StarUnionSDKListener");
```

初始化：

```csharp
StarUnionSDK.GetInstance().InitSDK(
    gameId,
    1,
    deviceLanguage,
    appVersion,
    true
);
```

参数：

- `gameId`：中台游戏 ID。
- `channel`：无特殊要求传 `1`。
- `device_language`：设备语言。
- `res_version`：游戏包版本。
- `openV2`：无特殊要求传 `true`。

通过监听器等待初始化成功回调；公共响应码和失败处理统一查看 `common.md`：

```json
{"code":"<success-code>","message":"ok","event_name":"onInitSuccess"}
```

只有收到 `onInitSuccess` 后，才能调用登录、支付、客服和数据模块。

多环境动态切换：

```csharp
StarUnionSDK.GetInstance().InitStarUnionConfig("starrycloud-client-config-release.json");
```

配置文件名和资源目录必须按原生接入文档确认。不要把测试配置和生产配置混用。

## 登录与账号角色

登录是必接流程：

```csharp
StarUnionSDK.GetInstance().Login(language, thirdChannel, type);
```

通过监听器处理 `onStarLoginSuccess` / `onStarLoginFailed`。登录成功返回的 `sign_body`、`sign_params` 如果需要交给业务服务端，必须原样传递，不要重新 JSON 序列化或修改。

角色创建/信息同步：

```csharp
StarUnionSDK.GetInstance().CreateRole(language);

StarUnionSDK.GetInstance().UpdateRoleInfo(
    languageCode,
    sdkAccountId,
    cpAccountId,
    playerId,
    serverId,
    nickName,
    headBase64
);
```

`UpdateRoleInfo` 是必接接口，影响客服、支付和数据功能。`sdkAccountId` 使用登录返回的 `account_id`；`cpAccountId` 是游戏侧账号 ID。

账号绑定、解绑、切换：

```csharp
StarUnionSDK.GetInstance().ThirdBusness(type, thirdChannel);
StarUnionSDK.GetInstance().OpenAccountModule();
```

## 支付

原生内购：

```csharp
StarUnionSDK.GetInstance().Pay(goodId, cpOrderId, serverId, roleId);
```

收银台支付前必须先完成 `UpdateRoleInfo`：

```csharp
StarUnionSDK.GetInstance().LaunchStarPay(payParamsJson);
```

支付回调必须区分：

- 成功：支付和订单验证均成功。
- 完成：支付成功但服务端订单校验尚未完成。
- 失败：流程异常。
- 取消：玩家主动取消。

不能仅凭客户端“支付成功”回调发放最终权益；发货应以服务端订单校验为准。

## 数据上报模块

初始化：

```csharp
StarUnionSDK.GetInstance().InitDataSDK(distinctId);
```

事件：

```csharp
StarUnionSDK.GetInstance().StarTrackEvent(
    "login_success",
    "{\"channel\":\"google_play\"}"
);
```

用户属性：

```csharp
StarUnionSDK.GetInstance().StarTrackUserEvent(
    "[{\"level\":3,\"st_type\":\"user_set\"}]"
);
```

事件名、属性名和 `st_type` 必须来自项目埋点方案。数据模块初始化成功后再上报。

## 按需模块

- Firebase：`GetFireBaseToken`、`FireBaseEvent`。
- 广告：先添加 AppLovin 及渠道 adapter，再 `InitAdSDK`；展示前用 `IsReady`，通过 `onRewardPlayStateChanged` 处理播放状态。
- Unity Ads：`InitUnityAds` 的 `userConsent` 应在 DMA 结果后设置。
- DMA：全球发行项目应先确认隐私和地区策略，再调用 `OpenDMA`。
- 客服：初始化后调用 `JumpToMoudle`、`QueryUnreadMessageNumber`。
- 其他：设备 ID、广告 ID、深度链接、Appsflyer ID、权限、反作弊和商品查询均属于独立模块。

## 监听器规则

所有异步结果通过统一 `StarUnionSDKListener` 回调，业务必须按 `event_name` 分发，并按 `common.md` 判断公共响应码。回调 JSON 可能包含 `data`、`message`、`request_id` 等字段，解析时允许字段缺失。

## 接入盲点

- 文档没有给出 Unity package/plugin 版本、C# bridge 文件、Android/iOS 原生映射和导出设置。
- `SetListener` 的监听器名称、GameObject 要求、回调线程和生命周期没有说明。
- 没有明确 `InitSDK`、`InitDataSDK`、广告 SDK、客服 SDK 的初始化依赖顺序。
- 登录返回的签名数据包含敏感认证材料；文档没有说明应由哪个服务端验证、有效期和重放保护。
- 支付、广告奖励、客服和账号模块缺少超时、重复回调、断网、切后台和进程恢复策略。
- 错误码表覆盖不完整，不同模块的失败码和 `event_name` 映射需要单独维护。
- 文档把数据 SDK、账号中台 SDK 和第三方广告/支付 SDK 放在同一篇，版本与发布边界不清晰。
