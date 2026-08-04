# 数据库同步配置文档

## 基本信息

| 配置项 | 值 |
|---|---|
| 数据库类型 | postgresql |
| 环境 | test |
| 数据库 | demox |
| 表名 | DigitalHuman、DigitalHumanTranslation、User、chat_message、payment_event、payment_fulfillment、payment_order |
| 账号 | demox_user |
| 密码 | （见 .agents/seainfra/config.json，不在此明文展开） |
| 链接 | postgresql://demox_user:***@10.185.48.12:5432/demox |
| 是否只读 | 是（同步只读；schema 已由 demox_user 初始化完成） |
| 网络访问 | public（10.185.48.12:5432） |

## 来源

- 用户/运维提供的 demox PostgreSQL
- schema：demo-x origin/main Prisma（db push 已成功）

## 网络访问要求

数据库必须能够通过公网或内网访问。同步服务器出口 IP 需在白名单内。

## 交付

请将本配置文档反馈给“星云中台”支持人员，创建数仓 sync_* 表并配置同步任务。
