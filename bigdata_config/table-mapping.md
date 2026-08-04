# 业务数据库与数仓数据表映射关系

## 数据库信息

| 配置项 | 值 |
|---|---|
| 数据库类型 | postgresql |
| 环境 | test |
| 数据库 | demox |
| 主机 | 10.185.48.12:5432 |

## 数据表映射

| 业务数据表或集合 | 数仓数据表 |
|---|---|
| User | sync_User |
| DigitalHuman | sync_DigitalHuman |
| DigitalHumanTranslation | sync_DigitalHumanTranslation |
| chat_message | sync_chat_message |
| payment_order | sync_payment_order |
| payment_event | sync_payment_event |
| payment_fulfillment | sync_payment_fulfillment |

## 平台侧目标命名（星云 CDC，仅说明）

- Schema: `starry_datatest_data`
- 模式: 全量 + CDC
- 仓库内表名小写: `sync_user`, `sync_digitalhuman`, `sync_digitalhumantranslation`, `sync_chat_message`, `sync_payment_order`, `sync_payment_event`, `sync_payment_fulfillment`
- 与上表一一对应（大小写折叠），截图确认时间 2026-08-03。
