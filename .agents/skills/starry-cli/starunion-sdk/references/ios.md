# iOS 原生 SDK

本文只用于 iOS 原生工程接入 `SUReportDataSDK`。Android 工程读 `android.md`；Unity 工程读 `unity.md`。

> 移动端 SDK 请联系我们获取

## 集成

将以下动态库加入工程：

- `SUReportDataSDK.framework`
- `SUBase.framework`

并设置为 `Embed & Sign`。把与当前环境匹配的 `starrycloud-client-config.json` 放在主工程目录，Unity 工程放在 `StreamingAssets`。

```objc
#import <SUReportDataSDK/SUReportDataSDK.h>
```

不要把真实配置文件提交到 Git。不同环境必须使用对应配置。

## 初始化顺序

开发阶段可开启日志，上线关闭：

```objc
#import <SUBase/SUBaseHeader.h>

// 按 SUBaseHeader.h 中实际声明调用 BaseLogConfig:YES
```

如果配置文件不是默认名称，必须在任何 SDK 初始化前设置：

```objc
SUJsonConfig.configFileName = @"starrycloud-client-config-dev.json";
```

初始化：

```objc
[SUReportDataSDK initWithDistinctId:@"device-id"];
```

建议在应用启动阶段初始化，在登录成功或角色切换后更新角色信息：

```objc
[SUReportDataSDK updateRoleInfoWithAccountId:@"account-id"
                                    playerId:@"player-id"
                                   serverId:@"server-id"];
```

## 事件上报

事件名不能以 `st_` 开头，事件属性字典会写入 `properties`：

```objc
[SUReportDataSDK reportWithEventName:@"login_success"
                           eventData:@{
                               @"channel": @"app_store",
                               @"level": @3
                           }];
```

## 用户属性

每个字典必须带 `st_type`，支持 `user_set`、`user_add`、`user_set_once`：

```objc
[SUReportDataSDK reportUserDataWithEventData:@[
    @{@"level": @3, @"st_type": @"user_set"},
    @{@"coins": @100, @"st_type": @"user_add"},
    @{@"channel": @"ios", @"st_type": @"user_set_once"}
]];
```

## 接入盲点

- 文档未说明初始化、上报是否异步，以及应用进入后台/被系统终止时是否自动 flush。
- 未说明 framework 的架构、最低 iOS 版本、Bitcode/符号表、Swift Module、模拟器支持和签名要求。
- `SUJsonConfig.configFileName` 的类头文件和类方法命名需要用实际 framework 验证；文档示例与常见 Objective-C API 形式不完全一致。
- 角色参数使用 `playerId`，Android 使用 `roleId`，后端使用 `st_role_id`；需要确认它们的映射和退出登录清理方式。
- 没有给出网络失败、重试、本地备份、重复上报和数据验收方法。
