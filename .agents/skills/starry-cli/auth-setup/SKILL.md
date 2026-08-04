---
name: starry-cli-auth-setup
description: >-
  使用 starry-cli 进行登录认证、OAuth 登录、查看登录状态、退出登录、
  登录 cloud/env、切换 merchant/project、列出商户/平台/项目。
---

# Auth Setup

文中的 `starry-cli ...` 是语义命令，实际执行用 wrapper 并原样传参.

## 登录与凭证

```bash
starry-cli auth login
starry-cli auth login --env test --cloud aws
starry-cli auth status
starry-cli auth logout
```

`auth login` 会打开浏览器完成 OAuth 登录，凭证保存到 `~/.starry-cli/auth.json`。

`--cloud` 支持标准值和业务别名：

- `aws` / `星合` / `星合互娱` -> `aws`
- `gcp` / `海艺` / `海艺海外` / `海艺外服` / `海艺国际` -> `gcp`
- `aliyun` / `海艺国服` / `海艺国内` -> `aliyun`

## 上下文切换

```bash
starry-cli auth switch --merchant <merchant-id>
starry-cli auth switch --project <project-id>
```

切换 cloud / env 时重新运行 `starry-cli auth login --cloud <cloud> --env <env>`。`auth switch` 只用于切换当前 env 下的 merchant / project；指定 merchant 但未指定 project 时自动取第一个可用项。

## 列出可用资源

```bash
starry-cli auth list_merchant
starry-cli auth list_project
```

- `list_merchant` — 列出当前 env 下可用商户，并同步到本地缓存
- `list_platform` — 列出当前 env + merchant 下可用平台
- `list_project` — 列出当前 env + merchant 下可用项目，并同步到本地缓存
