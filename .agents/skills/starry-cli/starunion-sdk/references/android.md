# Android 原生 SDK

本文只用于 Android 原生工程接入数据上报 SDK。Unity 工程先读 `unity.md`；iOS 工程读 `ios.md`。

## 接入前确认

- 获取与当前环境匹配的 `starrycloud-client-config.json`，放入 Android 工程 `assets` 目录。
- 获取与项目匹配的 `.aar` 文件，并确认 SDK 版本、minSdk、targetSdk、ABI 和 ProGuard/R8 要求。
- 不要把真实配置文件提交到 Git，也不要在日志中打印配置内容。

## 引入依赖

把 `.aar` 放入 `libs`：

```gradle
allprojects {
    repositories {
        flatDir { dirs "libs" }
    }
}

dependencies {
    implementation fileTree(dir: "libs", include: ["*.jar"])
    implementation(name: "<aar-name>", ext: "aar")
    implementation "com.squareup.okhttp3:logging-interceptor:3.12.13"
    implementation "com.google.code.gson:gson:2.9.0"
}
```

具体依赖版本应以 `.aar` 的 POM/发布说明为准；当前资料没有说明是否支持 Maven 坐标、是否需要额外传递依赖。

## 初始化顺序

建议在 `Application.onCreate()` 初始化：

```kotlin
StarDataSdk.getSdkApi()?.isShowLog(false)
StarDataSdk.getSdkApi()?.init(application, distinctId)
```

`distinctId` 是访客/设备 ID，初始化必传。测试时可打开日志，上线时关闭。

初始化后，在账号登录、角色切换和退出时同步账号信息：

```kotlin
StarDataSdk.getSdkApi()?.setAccountInfo(
    accountId = accountId,
    roleId = roleId,
    serverId = serverId,
)
```

退出账号时按原文要求传空字符串。第三方绑定信息可同步：

```kotlin
StarDataSdk.getSdkApi()?.setBindInfo(
    openId = openId,
    openIdType = openIdType,
    email = email,
)
```

## 自定义事件

事件名不能以 `st_` 开头；`eventValue` 是 JSON 字符串，SDK 会把它放入 `properties`：

```kotlin
val eventValue = """{"level":3,"channel":"google_play"}"""
StarDataSdk.getSdkApi()?.reportEventData("login_success", eventValue)
```

SDK 会自动填充系统属性，包括 `st_event_name`、`st_account_id`、`st_role_id`、设备信息和事件时间。需要账号/角色的事件必须在上报前完成 `setAccountInfo`。

## 用户属性

`reportUserEvent` 接收 JSON 数组字符串，每个对象必须有 `st_type`：

```kotlin
val userData = """
[
  {"level":3,"st_type":"user_set"},
  {"coins":100,"st_type":"user_add"}
]
""".trimIndent()
StarDataSdk.getSdkApi()?.reportUserEvent(userData)
```

支持 `user_set`、`user_add`、`user_set_once`。属性名和类型必须符合项目埋点方案。

## Android 生命周期回调

如果业务使用 deep link、通知或外部 Intent：

```kotlin
override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    StarDataSdk.getSdkApi()?.onNewIntent(intent)
}
```

如果需要采集屏幕点击：

```kotlin
override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    StarDataSdk.getSdkApi()?.dispatchTouchEvent(event)
    return super.dispatchTouchEvent(event)
}
```

V4.16.0 起可通过 `getDeviceId(context)` 获取设备 ID。

## 接入盲点

- 未说明 SDK 初始化是否异步、是否有成功/失败回调，以及初始化前调用上报的处理方式。
- 未说明本地队列、离线缓存、重试、批量阈值、进程被杀时的数据保留和 flush。
- `setAccountInfo` 的表格将三个参数都标为必传，但方法签名允许 null；退出时传空字符串还是 null 需要固定。
- 事件示例中的 `st_ip`、设备信息等字段来源和隐私授权要求没有说明。
- AAR 版本、Android API 兼容范围、混淆规则、网络安全配置和依赖冲突处理缺失。
