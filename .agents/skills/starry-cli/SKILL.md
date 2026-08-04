---
name: starry-cli
description: >-
  通过 starry-cli 星云 完成登录认证、查询大数据报表、看板、图表、用户事件、
  埋点方案、开发计划事件、上报统计、上报存储问题、用户定位与用户属性；适用于 DAU、活跃用户、
  新增用户、留存、充值、付费、收入、退款、ARPPU 等 Starry/星云项目数据分析；
  StarUnion SDK(埋点、用户事件、行为分析SDK) ， 后端、Web、客户端接入，自定义客户端 HTTP 日志上报。
  game operation 易创动态能力。发行端收银台对接、支付接入、client_id、订阅支付等任务，
  路由到 `publish/SKILL.md`。
---

# Starry CLI

## CLI 调用入口

通过本 skill 目录下的 wrapper 脚本调用 CLI。wrapper 会处理 starry-cli 查找、下载、安装和执行。
如需强制拉取最新二进制，执行 wrapper 自带的 `upgrade`。
如果 CDN 上的制品文件名固定不带版本号，发布或测试升级时可把 `STARRY_CLI_CACHE_BUSTER` 设成构建时的 `VERSION`；
wrapper 会优先拼 `?v=...`，没传时才退回秒级时间戳强刷。

macOS/Linux:
```bash
"<本 skill 目录>/scripts/starry-cli.sh" <command> [flags]
```

Windows:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "<本 skill 目录>\scripts\starry-cli.ps1" <command> [flags]
```

下文中的 `starry-cli ...` 都表示“把同样参数传给上述 wrapper”。

## auth 命令

- `auth login` — 登录 Starry/星云账号，建立 cloud/env 上下文。
- `auth status` — 查看当前登录状态、token 过期时间和当前商户/项目。
- `auth logout` — 退出登录并删除本地凭证。
- `auth refresh` — 强制刷新登录状态并同步本地业务上下文。
- `auth switch` — 切换当前组织、商户或项目。
- `auth list_merchant` — 列出当前环境下可用的商户/组织。
- `auth list_platform` — 列出当前商户项目下可用的平台。
- `auth list_project` — 列出当前商户下可用的项目。

## big_data 命令

- `big_data update` — 拉取看板和报表列表并写入本地缓存。
- `big_data update_skill` — 拉取看板和报表列表，并写入已安装 skill 的「已知数据」区块。
- `big_data info` — 查看当前上下文的看板与报表缓存。
- `big_data chart_data` — 按报表 id 下载单张报表数据。
- `big_data dashboard_data` — 按看板 id 下载看板下各报表数据。
- `big_data track_scheme` — 下载当前项目的完整埋点方案。
- `big_data dev_plan_event` — 下载当前项目的开发计划事件。
- `big_data report_stat` — 获取上报量、成功量、失败量、错误量等统计信息。
- `big_data report_storage_issue` — 获取错误入库/入库失败的事件统计。
- `big_data report_storage_issue_detail` — 获取错误入库/入库失败的明细数据。
- `big_data user_list` — 按 st_role_id、st_user_id 或 st_distinct_id 定位用户。
- `big_data user_prop_list` — 按 st_user_id 查询用户属性。

## game_operation 命令

- `game_operation api_list` — 展示当前项目可用的易创 Game Operation 能力。
- `game_operation update_skill` — 拉取易创能力列表，并写入已安装 skill 的「已知能力」区块。
- `game_operation call_func` — 按能力 code 调用易创 Game Operation 自定义函数。

## path 命令

- `path install` — 安装当前 `starry-cli` 到用户 PATH。
- `path uninstall` — 从 PATH 配置和安装目录移除 `starry-cli`。

## skill 命令

- `skill install` — 安装 starry-cli skill 到 AI coding assistant。
- `skill uninstall` — 卸载 starry-cli skill。
- `skill list` — 查看各 AI coding assistant 的 skill 安装状态。

## 其他命令

- `upgrade` — wrapper 内置命令，强制重新下载并替换本机 `starry-cli` 二进制。
- `version` — 打印当前版本、构建时间和 Git revision。
- `help` — 查看命令帮助。

## 使用规则

- 入口文档只用于选择命令；具体 option、alias 和参数要求见 `references/cli.md`。
- 如果新增了看板、报表或易创能力，先运行 `big_data update_skill` 或 `game_operation update_skill` 刷新 skill 索引，再继续任务。
- 登录、切换商户或项目时参考 `auth-setup/SKILL.md`。
- 查报表优先使用 `chart-data/SKILL.md` 或 `dashboard-data/SKILL.md`。
- 查询上报接收、入库失败或异常明细时，优先使用 `big_data report_stat`、`big_data report_storage_issue` 和 `big_data report_storage_issue_detail`。
- 查询用户时先用 `user-list/SKILL.md` 定位用户，再按需使用 `user-prop-list/SKILL.md`。
- 查询易创 Game Operation 业务能力时先使用 `game_operation update_skill` 刷新能力索引，再按 `game_operation/SKILL.md` 调用。
- 进行 StarUnion SDK 接入、埋点/开发计划上报或 HTTP API 实现时，先阅读 `starunion-sdk/SKILL.md`，再按语言和传输方式加载其 reference 文档。
- 只要任务是“埋点接入开发代码”，默认先按 `starunion-sdk/references/implementation-workflow.md` 产出当前迭代的 Markdown 文档，再开始改代码；不要直接把完整埋点方案一次性迁入仓库。
- 发行端收银台对接、支付接入、渠道选型、`client_id`、Adyen、PayPal、Google Play、App Store 或订阅支付等任务，先阅读 `publish/SKILL.md`。
- 只读取本次任务中命令输出的 `file_path` 对应文件，不要猜测、拼接、glob 或复用 `/tmp` 下的相邻 CSV 文件。
- 如果未登录，运行 `starry-cli auth login`，等待用户完成 OAuth。
- 用户要求分析数据时，最终回答必须说明数据覆盖的时间范围。

## 子技能

- `auth-setup/SKILL.md` — 登录认证与上下文管理
- `chart-data/SKILL.md` — 查询单张报表数据
- `dashboard-data/SKILL.md` — 查询看板下各报表数据
- `user-list/SKILL.md` — 按字段定位用户
- `user-prop-list/SKILL.md` — 查询用户属性
- `game_operation/SKILL.md` — 查询易创 Game Operation 业务能力
- `starunion-sdk/SKILL.md` — StarUnion SDK(埋点、用户事件、行为分析SDK) 接入文档导航
- `publish/SKILL.md` — 发行端收银台对接、支付接入与验收路由
