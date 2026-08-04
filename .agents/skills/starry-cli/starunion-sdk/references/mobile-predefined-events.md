# Android/iOS 预置事件

本文只在用户要接入或验收移动端自动采集事件时阅读。自定义事件仍按 `android.md` 或 `ios.md`。

## 总规则

预置事件不是默认全部上报。平台需要先配置事件开关、采集上限等限制；没有配置的事件默认不收集。

移动端常见预置事件：

- `st_app_install`：首次安装启动；覆盖安装后的首次启动也可能触发。
- `st_app_start`：每次开启 App，包括从后台回到前台。
- `st_app_end`：App 结束或离开时记录访问时长。
- `st_app_crash`：异常崩溃。
- `st_app_screen_touch`：屏幕点击行为。
- `st_app_device_msg`：初始化或第三方绑定信息变化时的设备信息。

资料中同时出现 `st_app_crash` 与 `st_app_cras`，应以实际埋点方案和平台事件名为准。

## 公共属性

移动端预置事件可能包含：

`st_ip`、`st_country`、`st_country_code`、`st_province`、`st_city`、`st_os_version`、`st_os`、`st_device_id`、`st_screen_height`、`st_screen_width`、`st_device_model`、`st_device_type`、`st_app_version`、`st_bundle_id`、`st_lib_version`、`st_install_time`、`st_simulator`、`st_ram`、`st_disk`、`st_system_language`。

这些字段涉及设备、网络、地理位置和硬件信息。接入前确认隐私政策、系统权限和地区合规要求。

## 事件特有属性

- `st_app_start`：`st_resume_from_background`、`st_start_reason`、`st_background_duration`
- `st_app_end`：`st_duration`
- `st_app_crash`：`st_crashed_info`
- `st_app_device_msg`：第三方绑定、设备和网络扩展字段
- `st_app_screen_touch`：坐标、触点、压力、设备和采集周期字段；资料记录默认每 10 秒上报一次

屏幕触摸数据可能属于高敏感行为数据。不要在没有产品、隐私和埋点方案确认的情况下开启。

## Web 预置事件边界

旧版客户端合并文档还记录 Web 预置事件：

- `st_app_install`
- `st_app_start`
- `st_web_login`
- `st_web_visit`

它与当前 `web.md` 的 `StarTrack` SDK (`track-sdk.global.js`) 不是同一套 API。不要把旧版 `window.sdkCollector` 接口和新版 Web SDK 混用。

## 验收清单

1. 平台事件开关已打开。
2. Android 和 iOS 事件名、属性名、类型一致。
3. 冷启动、后台回前台、退出、崩溃、登录/登出各场景均有测试记录。
4. 明确事件是否允许在模拟器、未登录和未授权状态下上报。
5. 在事件库和上报统计中分别验证接收与落库。

## 文档盲点

- 没有给出预置事件的默认开关、采集上限配置入口和生效延迟。
- 没有明确 Android 与 iOS 哪些字段可用，部分字段可能在不同系统为空。
- 没有说明崩溃事件是在下次启动补报还是实时上报。
- 没有说明 `st_app_end` 在强杀、崩溃、后台挂起时的可靠性。
- 没有给出预置事件去重、采样、隐私授权和用户拒绝后的行为。
