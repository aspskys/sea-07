# CLI 参数路由

本文只做命令选择。具体业务参数以 `starry-cli <command> --help` 和对应子技能为准。

## 认证与上下文

```bash
starry-cli auth login
starry-cli auth status
starry-cli auth switch --merchant <merchant-id> --project <project-id>
```

需要登录、切换环境、商户或项目时阅读 `auth-setup/SKILL.md`。

## 数据查询

```bash
starry-cli big_data chart_data --id <chart-id>
starry-cli big_data dashboard_data --id <dashboard-id>
starry-cli big_data track_scheme
starry-cli big_data dev_plan_event
starry-cli big_data report_stat
starry-cli big_data user_list --field-value <value>
starry-cli big_data user_prop_list --st-user-id <st-user-id>
```

数据查询分别阅读 `chart-data/SKILL.md`、`dashboard-data/SKILL.md`、`user-list/SKILL.md` 或 `user-prop-list/SKILL.md`。

## 动态业务能力

```bash
starry-cli game_operation api_list
starry-cli game_operation call_func --code <code> --params '<json-object>'
```

调用前阅读 `game_operation/SKILL.md`，不要猜测能力 code 或参数。
