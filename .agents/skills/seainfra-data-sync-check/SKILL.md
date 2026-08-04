---
name: seainfra-data-sync-check
description: 验收 SeaInfra 数据库到数仓的数据同步接入。用户要求检查 bigdata_config、同步配置、业务表到 sync_* 映射、数据库连通、只读账号、数仓落表、数据新鲜度或搜索推荐前置数据是否就绪时使用。执行静态、连通性和最小同步闭环验证，生成证据并更新统一状态。
---

# SeaInfra 数据同步验收

读取统一契约、当前环境 `data_sync` 配置、`bigdata_config/data-sync-config.md` 和 `bigdata_config/table-mapping.md`。配置文档已交付不等于数据已同步。

## 静态审计

先运行只读脚本：

```bash
node <本 Skill 目录>/scripts/check-data-sync.mjs --json
```

复核脚本输出，不把启发式结论当成平台事实：

- 配置文档和映射文档必须存在；不得残留占位符或“另行提供”。
- 每个业务表/集合必须恰好映射到 `sync_<原名>`，不得缺失、重复或映射到同一个目标。
- 统一配置的数据库、对象列表、环境和映射文档必须一致。
- 非 Firebase 使用只读账号，连接协议与数据库类型一致；Firebase 核对 GCP 项目和集合。

## 三层验收

1. **静态**：完成上述审计，并交叉核对 ORM/Schema/建表文件中的真实业务表与主键、增量字段和准入字段。运行项目相关测试或配置检查。
2. **连通性**：从实际同步执行环境使用当前环境配置连接源库，只执行无副作用读取；确认网络、白名单、权限和每个对象可读。再连接目标 Redshift，确认所有 `sync_*` 表存在且 Schema 可读。
3. **业务闭环**：为每个同步对象核对至少一个稳定主键在源表和目标表均存在，字段映射正确；使用权威同步时间或一个受控测试记录验证增量能在约定时限内到达。记录行数/时间窗口差异和可接受原因。

## 结论

- 任一目标表不存在、凭证/网络不可用、映射错误或数据未到达：执行 `block data_sync --reason <具体原因>`。文档交付成功不能降级替代连通性或闭环。
- 全部通过：按统一契约写 `.agents/seainfra/evidence/data_sync-<environment>-<timestamp>.json`，引用源库只读查询摘要、目标表查询摘要、同步时间窗和支持确认，不记录完整凭证或业务敏感行。
- 证据写入后执行 `complete data_sync --env <环境> --evidence <文件>`。只有该状态完成后，才允许 `$seainfra-search-recommend-integrate` 继续。

生产环境的源库读取、目标数仓查询或受控测试记录写入前，按统一 Harness 规则取得用户明确确认。
