---
name: starry-cli-dashboard-data
description: >-
  使用 big_data dashboard_data 查询或分析 Starry/星云 看板下各报表数据。
  一个看板可能包含多个报表，适用于登录、活跃、DAU、新增用户、留存、充值、
  付费、收入、退款、ARPPU 或 GP 项目运营看板。
---

# Dashboard Data

文中的 `starry-cli ...` 是语义命令，实际执行用 wrapper 并原样传参.

```bash
starry-cli big_data dashboard_data --id <看板id>
```

调用 dashboard_data_cdn_url 获取看板下各报表 CDN 地址，下载到本地并返回各报表的 `chart_id`、`chart_name`、`cdn_url` 与 `file_path`。

看板下每个报表的 CSV 可能很大，存放在 `--output-dir`（默认 `/tmp`）下。**按需分段读取**，不要一次性加载整个文件。

## 查询看板数据流程

1. 在 dashboard-data 技能提示词末尾的「已知数据」中找目标看板的 `id`
2. `starry-cli big_data dashboard_data --id <id>`
3. 从输出逐个取 `file_path`
4. 先 Read 各 CSV 前 50 行了解结构，再根据用户问题选择相关文件分批读取

输出示例：

```text
[1]
chart_id: 485
chart_name: SQL-Query-xxx
chart_type: 6
cdn_url: https://cdn4.../xxx.csv?Expires=...&Signature=...
file_path: /tmp/485_SQL-Query-xxx.csv

[2]
chart_id: 486
chart_name: SQL-Query-yyy
...
common_resp.code: 0
common_resp.msg: success
```

常用 flag：

| flag | 说明 |
|------|------|
| `--id` | 看板 id（必填） |
| `--output-dir` | 下载目录，默认 `/tmp` |
| `--time_zone` | 时区偏移 |
| `--result_type` | 返回结构：0 平铺（默认）1 分层 2 饼图 |
| `--attribute_name` | 公共事件属性，可重复传入 |
| `--small_charts` | 小图信息 JSON 数组 |
| `--dashboard_time` | 看板自定义查询时间 JSON |
| `--cdn_only` | 仅返回 CDN URL，不下载文件 |

# 已知数据

> 已知数据未更新，请先通过 `starry-cli big_data update_skill --ai <type>` 更新，重新加载 skill 后再继续。
