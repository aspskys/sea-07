# 配置与缓存

## 文件位置（`~/.starry-cli/`）

| 文件 | 说明 |
|------|------|
| `config.json` | 主配置：current env / cloud / merchant / project，各 env 的 URL 与 headers |
| `auth.json` | OAuth 凭证：access_token / refresh_token / 过期时间 |
| `big_data.json` | 看板与报表列表缓存，按 env → cloud → merchant → project 分层 |
| `big_data_info.json` | `big_data info` 导出的当前 scope 快照（直接运行 CLI 时） |

## config.json 结构（简化）

```json
{
  "current": {
    "env": "prod",
    "cloud": "aws",
    "merchant": "4",
    "project": "101"
  },
  "envs": {
    "prod": {
      "url": "https://main-base.center-private-production.staruniongame.com",
      "time_zone": 8,
      "current_merchant": "4",
      "merchants": {
        "4": {
          "name": "示例企业",
          "current_project": "101",
          "projects": {
            "101": { "id": "101", "name": "示例项目" }
          }
        }
      }
    }
  }
}
```

## big_data.json 结构（简化）

```json
{
  "envs": {
    "test": {
      "clouds": {
        "aws": {
          "merchants": {
            "4": {
              "projects": {
                "101": {
                  "updated_at": "2026-06-11T06:32:35Z",
                  "time_zone": 8,
                  "dashboards": [{ "id": 252, "name": "核心数据" }],
                  "charts": [{ "id": 485, "name": "SQL 报表", "type": 6 }]
                }
              }
            }
          }
        }
      }
    }
  }
}
```

## 常用命令

文中的 `starry-cli ...` 是语义命令，实际执行用 wrapper 并原样传参.

```bash
starry-cli auth login
starry-cli auth login --env test --cloud aws
starry-cli auth login --env prod --cloud 海艺海外
starry-cli auth status
starry-cli auth switch --merchant 4 --project 101
starry-cli auth list_merchant
starry-cli auth list_project
starry-cli big_data info --debug
```

`--cloud` 支持标准值和业务别名，最终统一保存为 `aws` / `gcp` / `aliyun`。

登录后 CLI 会自动同步 merchant / project 列表到 `config.json`。切换 project 后执行 `big_data update_skill` 刷新该项目的缓存。

## Skill 固定输出

通过 `starry-cli` 调用时，`big_data info` 写入：

```text
skills/starry-cli/output/big_data_info.json
```

Agent 读取此文件获取当前项目的 dashboards / charts 列表，无需解析 stdout。
