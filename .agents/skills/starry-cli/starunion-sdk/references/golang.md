# Golang SDK 接入

本文只用于后端 Golang 服务接入 StarUnion SDK。如需查看实现细节请读 `http-api.md`。

## 版本与安装

```bash
go get gitlab.outer.staruniongame.com/share/starunion-sdk-go
go mod tidy
```

代码导入：

```go
import (
    starunionSDK "gitlab.outer.staruniongame.com/share/starunion-sdk-go"
    "gitlab.outer.staruniongame.com/share/starunion-sdk-go/big_data"
    "gitlab.outer.staruniongame.com/share/starunion-sdk-go/common"
)
```

## 配置获取

1. 联系星云PM获取
2. 登录到星云平台，在项目详情下载客户端密钥，注意在不同的环境下载的密钥是不能共用的。

## 使用配置初始化

配置优先从星云项目管理下载 JSON 文件。不要把下载的真实文件提交到仓库；生产环境使用密钥管理或部署注入。

### 使用 JSON 文件初始化

```go
	var ctx        = context.Background()
	var	configPath = "./starrycloud-client-config-local-demo.json"
	conf, err := common.GetConfigByPath(configPath)
	if err != nil {
		return
	}
	client, err := NewClient(OptWithCommonConfig(conf), OptWithTimeOut(time.Second*60))
	if err != nil {
		return
	}
```

### 使用 JSON 字符串初始化

```go
    var jsonCfg = `{"stage":"release","project_key":"091344091f88e5e9...`
	var cnfObj = config.Config{}
	err = json.Unmarshal([]byte(jsonCfg), &cnfObj)
	if err != nil {
		return nil, fmt.Errorf("Failed to parse josn file: %s err %v ", p, err)
	}
	client, err := NewClient(OptWithCommonConfig(conf), OptWithTimeOut(time.Second*60))
	if err != nil {
		return
	}
```

### 使用值传递初始化

```go
    var conf = &common.Config{
		SecretId:   "bUFESFdBTjdhYx",
		Secret:     "b7d1fa8e5d0x",
		EncryptKey: "f328c1ae148e397367e61x",
		Debug:      false,
		LogPath:    "/mnt/data/starunion-sdk-go/backup",
		Host:       `http://agent-server-alpha-v2.center-public-production.staruniongame.com`,
	}
    client, err := NewClient(OptWithCommonConfig(conf), OptWithTimeOut(time.Second*60))
	if err != nil {
		return
	} 
```

## 初始化并注册日志上报组件


```go
func initSDK(configPath, backupDir string) (*starunionSDK.StarUnion, error) {
    var conf = &common.Config{
        ...
    }
    sdk, err := starunionSDK.New(conf)
    if err != nil {
        return nil, fmt.Errorf("init starunion sdk: %w", err)
    }

    consumer, err := big_data.NewSrvConsumer(&big_data.SrvConsumerConfig{
        BatchSize:  100,
        BufferNum:  500,
        Timeout:    15,  // 单位秒
        RetryTimes: 3,
    })
    if err != nil {
        return nil, fmt.Errorf("init log consumer: %w", err)
    }
    if err := sdk.SetLogUpload(consumer); err != nil {
        return nil, fmt.Errorf("set log upload: %w", err)
    }
    return sdk, nil
}
```

`LogPath`/backup log 路径是埋点日志上报场景的必填项，必须位于持久化磁盘，并和运维确认生命周期、权限、容量和备份策略。

SDK 启动了异步上报任务。短生命周期程序不能在发送后立即退出；服务进程需要持续运行，并在优雅退出时按 SDK 能力等待队列处理。

## 上报事件

事件调用必须使用项目埋点计划中的事件名和属性名：

```go
properties := map[string]interface{}{
    "is_first_login": true,
    "channel":         "ios",
    "level":           11,
}

err := sdk.LogUpload.SendEvent(
    accountID,
    distinctID,
    roleID,
    eventName,
    clientIP,
    time.Now().UnixMilli(),
    properties,
)
```

`accountID`、`distinctID`、`roleID` 至少一个不能为空。多端上报时，应约定三种 ID 的来源和稳定性；通常 `distinctID` 使用设备或访客标识。

## 上报用户属性

用户属性的每个对象都必须包含 `st_type`：

```go
properties := []map[string]interface{}{
    {
        "base_level": 3,
        "st_type":    big_data.UserSet,
    },
    {
        "channel": "ios",
        "st_type": big_data.UserSetOnce,
    },
}

err := sdk.LogUpload.SendUser(
    accountID,
    distinctID,
    roleID,
    time.Now().UnixMilli(),
    properties,
)
```

`user_set` 会覆盖已有属性；`user_set_once` 仅在属性不存在时设置。字段类型和计划定义保持一致。

## 字段约束

- 事件名是字符串，必须以字母开头，只能包含字母、数字和 `_`；用户材料记录的默认上限为 1 MB。
- 属性 key 必须以字母开头，只能包含字母、数字和 `_`，最长 50 个字符，系统按小写处理。
- 属性 value 支持字符串、数字、布尔值和时间；不要把任意对象塞进属性，除非当前埋点计划明确允许。
- `st_event_time` 传 `0` 时由 SDK 使用当前毫秒时间戳；服务端统一使用毫秒。

## 排错

测试阶段可打开 `Debug` 输出详细请求和响应；生产环境不要把密钥或完整敏感属性写入 debug 日志。上报成功只代表接收成功，数据落库和管理平台展示可能有延迟。

环境、错误码和通用排查流程统一查看 `common.md`。Golang 额外检查 `LogPath` 是否存在、可写且持久化，进程是否在异步队列发送前退出，以及失败 backup log 是否被保留并可重放。

## 接入前必须确认

- 文档同时出现 `starunion_sdk_go.NewStarUnion(...)` 和 `starunion_sdk_go.New(confObj)` 两种初始化 API，需按实际 SDK 版本确认；不要直接混用。
- `common.Config`、`config.Config`、`LogPath` 与 JSON 配置字段的完整映射没有给出，尤其要确认 `LogPath` 是 SDK 初始化参数还是配置对象字段。
- `SetLogUpload` 启动异步任务，但没有给出 flush、close、优雅退出或队列满时的行为；服务退出流程必须向 SDK 负责人确认。
- `BatchSize`、`BufferNum`、`Timeout`、`RetryTimes` 的单位、默认值、内存占用和队列满策略没有说明，不能只照抄示例。
- backup log 的文件格式、重放工具、重放幂等规则、磁盘满时行为没有说明。
- `SendEvent`/`SendUser` 的返回值更像本地入队结果，不应直接当作服务端落库成功；最终验收仍需结合上报统计和事件库。
- 文档示例中用户属性时间变量出现两种命名，且 `SendUser` 的角色 ID 必填规则未单独说明；需以埋点方案和服务端校验为准。
