---
name: starry-cli-chart-data
description: >-
  使用 big_data chart_data 查询或分析单张 Starry/星云 大数据报表、图表或 CSV 数据，
  包括登录/登出日志、DAU、活跃用户、新增用户、留存、充值、付费、收入、
  退款、ARPPU 或 GP 项目报表数据。
---

# Chart Data

文中的 `starry-cli ...` 是语义命令，实际执行用 wrapper 并原样传参.

```bash
starry-cli big_data chart_data --id <报表id>
```

调用 chart_data_cdn_url 获取报表 CDN 地址，下载到本地并返回 `cdn_url` 与 `file_path`。

下载的 CSV 可能很大，存放在 `--output-dir`（默认 `/tmp`）下。**按需分段读取**，不要一次性加载整个文件。

## 查报表数据流程

1. 在 chart-data 技能提示词末尾的「已知数据」中找目标报表的 `id`
2. `starry-cli big_data chart_data --id <id>`
3. 从输出取 `file_path`
4. 先 Read CSV 前 50 行了解结构，再根据用户问题分批读取后续数据

输出示例：

```text
cdn_url: https://cdn4.../xxx.csv?Expires=...&Signature=...
file_path: /tmp/485_SQL-Query-xxx.csv
common_resp.code: 0
common_resp.msg: success
```

常用 flag：

| flag | 说明 |
|------|------|
| `--id` | 报表 id（必填） |
| `--output-dir` | 下载目录，默认 `/tmp` |
| `--time_zone` | 时区偏移 |
| `--cdn_only` | 仅返回 CDN URL，不下载文件 |

# 已知数据

> 已知数据未更新，请先通过 `starry-cli big_data update_skill --ai <type>` 更新，重新加载 skill 后再继续。
