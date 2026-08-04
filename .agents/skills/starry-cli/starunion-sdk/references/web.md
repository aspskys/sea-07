# Web SDK 接入

本文用于在浏览器页面中接入 `StarTrack` Web SDK。SDK 负责采集事件和用户属性，并在内部批量调用日志上报接口。

数据字段、事件名称和上报条件必须以当前项目的《埋点方案制定》为准。本文中的 `page_view`、`Browse Page` 等只用于演示，不能直接当作项目埋点方案。

## 接入流程

1. 根据云平台和环境选择 SDK 资源地址。
2. 在页面中引入脚本。
3. 获取项目管理中的客户端密钥配置。
4. 页面加载完成后调用 `track.init()`。
5. 等初始化完成后，再调用 `track.event()` 或 `track.user()`。
6. 按《数据上报及验收》验证事件是否成功入库。

## 引入 SDK

`release` 地址只用于测试功能，不要默认用于生产。

星合/AWS：

- 生产资源：`https://webpage.allstarunion.com/track-sdk/track-sdk.global.js`
- release 测试资源：`https://platform-release.allstarunion.com/webpage/track-sdk/track-sdk.global.js`

海艺海外/GCP：

- 生产资源：`https://webpage.sc-api.saconsole.com/track-sdk/track-sdk.global.js`
- release 测试资源：`https://webpage.sc-api-release.saconsole.com/track-sdk/track-sdk.global.js`

海艺国服/Aliyun：

- 生产资源：`https://webpage.sc-api.haiyiapi.com/track-sdk/track-sdk.global.js`
- release 测试资源：`https://webpage.sc-api-release.haiyiapi.com/track-sdk/track-sdk.global.js`

示例：

```html
<script src="https://webpage.allstarunion.com/track-sdk/track-sdk.global.js"></script>
```

脚本加载完成后，从 `window.StarTrack` 获取 SDK 实例。如果页面配置了 CSP，还需要把脚本域名和实际请求域名加入白名单。

## 配置获取

1. 联系星云PM获取
2. 登录到星云平台，在项目详情下载客户端密钥，注意在不同的环境下载的密钥是不能共用的。

## 代码 Demo

```js
const clientConfig = {
  // 使用项目管理下载的客户端配置
};

const track = window.StarTrack;

track.init(
  clientConfig,
  {
    setting: {
      devMode: true,
    },
  },
).then(() => {
  // 必须在初始化完成后上报事件
  track.event({
    st_behavior_id: "Browse Page",
    st_behavior_type: "1",
  });
}).catch((error) => {
  // 记录错误摘要，不要记录 clientConfig
  console.error("StarTrack init failed", error);
});
```


## 初始化配置

初始化方法：

```ts
init(
  config: ApplicationConfig | ClientConfig,
  options?: TrackInitOptions,
): Promise<void>;
```

推荐的 `ClientConfig` 来自下载的 JSON 文件：

```ts
interface ClientConfig {
  stage: string;
  project_key: string;
  project_name: string;
  created_time: string;
  type: string;
  agent_uri: string;
  sign_uri: string;
  sign_key: string;
  sign_pub_key: string;
  aes_id: string;
  aes_key: string;
  aes_secret: string;
}
```

初始化选项：

```ts
interface TrackInitOptions {
  commonData?: Record<string, any>;
  setting?: Partial<CollectorSetting>;
}

interface CollectorSetting {
  devMode: boolean;
  eventLimit: number;
  timeInterval: number;
  retryInterval: number;
  maxRetryTime: number;
}
```

- `commonData`：公共数据。文档没有说明它与系统字段冲突时的覆盖顺序，避免用于覆盖 `st_` 字段。
- `devMode`：是否打印调试日志，生产环境关闭。
- `eventLimit`：累计达到指定事件数后触发批量上报。
- `timeInterval`：批量上报间隔，单位为秒。
- `retryInterval`：首次重试间隔，单位为毫秒；原文说明后续失败会按倍数递增。
- `maxRetryTime`：最大重试次数。

当前资料没有给出这些参数的默认值、最小值和最大值。需要自定义时，应以 SDK 版本实际支持的范围为准。

生产环境应关闭 `devMode`。示例中的行为字段是否对应当前项目字段，需要以埋点方案为准。

## 事件上报

```js
track.event({
  st_event_name: "page_view",
  st_account_id: "account-id",
  st_distinct_id: "device-id",
  st_role_id: "role-id",
  st_event_time: Date.now(),
  properties: {
    page_name: "home",
  },
});
```

事件数据规则：

- `st_account_id`：账号 ID，是否必传由埋点方案决定。
- `st_distinct_id`：访客 ID，原文标记为必传，建议使用设备 ID。
- `st_role_id`：角色 ID，是否必传由埋点方案决定。
- `st_event_name`：事件名，原文标记为必传。
- `st_event_time`：事件发生时间，使用毫秒时间戳；传 `0` 时由 SDK 使用当前时间。
- `properties`：自定义属性对象，可选。

所有 `st_` 开头的系统属性放在最外层；自定义属性全部放在 `properties` 中。

### 附加设备信息

```js
track.event(
  {
    st_event_name: "page_view",
    st_distinct_id: "device-id",
    properties: {},
  },
  { addDeviceInfo: true },
);
```

`addDeviceInfo: true` 时，事件中会增加 `st_device_info` 字段，值为 JSON 字符串。原文列出的内容包括：

- `device_type`：设备类型，例如 `PC`、`Phone`
- `pc_os`：操作系统，例如 `win`、`macos`
- `browser_name`：浏览器名称
- `screen_height`、`screen_width`：屏幕尺寸
- `browser_version`：浏览器版本
- `network_type`：网络类型，例如 `wifi`

启用前需要确认隐私政策、合规要求和项目埋点方案是否允许采集这些信息。

## 用户属性上报

```js
track.user({
  st_account_id: "account-id",
  st_distinct_id: "device-id",
  st_role_id: "role-id",
  properties: [
    { role_name: "example", st_type: "user_set" },
    { play_count: 1, st_type: "user_add" },
    { channel: "ios", st_type: "user_set_once" },
  ],
});
```

`properties` 必须是数组，每个对象都必须包含 `st_type`：

- `user_set`：覆盖更新。
- `user_add`：累加更新。
- `user_set_once`：仅首次更新。

当前 Web 原文将 `st_role_id` 标为必传，而事件部分将其标为可选。这个规则存在冲突，接入前应以项目埋点方案和服务端实际校验为准。

## 批量上报和验收

Web SDK 会在达到 `eventLimit` 或 `timeInterval` 后批量调用 HTTP API。公共 hosts、接口路径、成功码、错误码和通用排查流程统一查看 `common.md`。

验收至少覆盖：

1. 初始化失败、网络失败和接口返回部分失败。
2. 页面刷新、关闭、SPA 路由切换时，队列是否会发送。
3. 浏览器离线后恢复网络时，事件是否会持久化和重试。
4. 初始化未完成时调用上报的行为。
5. 同一页面重复初始化的行为。
6. 多标签页是否共享队列，是否可能重复上报。

当前资料没有说明显式 `flush`、成功/失败回调、队列持久化以及页面关闭时的发送保证。不能仅凭本文保证页面关闭前产生的事件一定不会丢失。

