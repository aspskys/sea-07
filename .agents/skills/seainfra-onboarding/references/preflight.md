# 空白项目接入前检查清单

先探测项目并填写统一配置，再让研发选择模块。不要一次索取未选择模块的凭证。

## 全局

- [ ] 已确认项目根目录、目标 Web/后端应用和运行技术栈
- [ ] 已确认本轮环境为 `test` 或 `production`
- [ ] 已为每个选中模块登记权威文档或 Skill 的位置、版本和适用范围
- [ ] 已确认配置写入位置以及应用运行时如何读取
- [ ] 已确认测试环境可以执行真实最小请求
- [ ] 已识别生产环境中会产生写入、扣款、投放、上报或内容提交的动作
- [ ] 已根据所选模块运行 `provision` 并把开通清单发送给 SeaInfra 团队
- [ ] 团队返回的测试/生产配置已分别写入统一配置，未在清单或普通日志中回显值

## LLM

- [ ] 已向 SeaInfra 团队申请 `SEA_BASE_URL` 和 `SEA_API_KEY`
- [ ] 凭证齐全后确认 `model` 与 `timeout_ms`；模型和协议不属于团队凭证字段
- [ ] 运行 `$seainfra-llm-integrate` 的内置协议探测脚本，报告中不得包含密钥
- [ ] 用户已从探测确认支持的协议中选择 `openai_chat_completions`、`openai_responses` 或 `anthropic_messages`
- [ ] 已登记探测报告和所选协议官方资料；限流、错误码或网关扩展行为缺资料时保持未实现
- [ ] 一个真实文本业务用例及失败/超时预期

## 多模态

- [ ] 已向 SeaInfra 团队申请 `SEA_BASE_URL` 和 `SEA_API_KEY`
- [ ] 凭证齐全后通过实时目录确认 `capabilities` 与每项能力的模型映射
- [ ] 输入格式、大小/时长限制、上传方式和输出形式
- [ ] 同步/异步任务、轮询/回调、存储与清理规则

## 内容安全

- [ ] 已向 SeaInfra 团队申请 `SEA_BASE_URL` 和 `SEA_API_KEY`
- [ ] 凭证齐全后确认 `content_types`、官方 scan 方法和业务 `policy`
- [ ] 各内容类型的鉴定时机、风险结果定义和业务动作映射
- [ ] 超时/不可用时 fail-open 或 fail-closed，以及人工复审路径

## 数据埋点

- [ ] `surfaces`：`client`、`server` 或两者
- [ ] 已联系星合数据平台，按环境取得完整 `CLIENT_STARUNION_CONFIG` 与 `SERVER_STARUNION_CONFIG` JSON
- [ ] test 配置 `stage=release`，production 配置 `stage=production`
- [ ] 客户端/服务端配置的项目标识一致，关键 AES 与签名字段齐全
- [ ] 客户端 SDK 地址或服务端传输方式已按对应 Integrate Skill 确认
- [ ] 星云 cloud/env/merchant/project、本期埋点方案、身份 ID 语义
- [ ] 接收统计与入库异常查询权限

## 数据同步

- [ ] 数据库类型、数据库名和需要同步的表/集合
- [ ] Firebase 的 GCP 项目，或其他数据库的只读账号、密码和连接地址
- [ ] 公网/内网访问方式、端口和同步服务器白名单
- [ ] `bigdata_config/data-sync-config.md` 与 `table-mapping.md`
- [ ] Redshift 目标 `sync_*` 表、同步时间窗和数据验证权限

## 支付

- [ ] 已联系星河支付平台，取得 `client_id`、客户端 key/pubkey、JWT pubkey、服务端 Open API key/pubkey
- [ ] `gateway_base_url`、Payment SDK 地址和回调公网地址
- [ ] Web/移动端 SDK 地址或版本、业务类型、目标市场和渠道
- [ ] 三方商户、平台应用和目标渠道已申请，测试与正式配置分开
- [ ] 已使用当前环境 key 调用官方只读接口或运行 Payment SDK，`channel_check.enabled_channels` 覆盖全部目标渠道
- [ ] 已保存星河支付平台渠道开通回执，且与运行检查结果一致
- [ ] 订单库、权益/发货边界、计划上线日期

## 搜索推荐

- [ ] 当前环境 `data_sync` 已通过 Check 并处于 `completed`
- [ ] `project_id`、单个或多个 `scenes`、intake 提交地址
- [ ] 产品/SKU 定义、用户凭证、准入条件、核心行为与指标
- [ ] `bigdata_config` 中业务表到数仓表映射
- [ ] intake 后的平台请求/响应、鉴权、关联字段和降级资料

## 广告买量

- [ ] provider、应用/包 `app_id`、平台凭证、目标平台
- [ ] AppsFlyer/媒体 SDK 或 Web 归因资料、测试设备和归因链接
- [ ] 普通/延迟深链域名与路由
- [ ] 转化/收入事件映射、唯一生产者、币种和去重键
- [ ] 平台调试视图或 AppsFlyer BigQuery 数据验证权限

## 阻断规则

配置值存在但没有来源，不算通过；来源存在但不覆盖当前端、能力或版本，也不算通过。只列出当前选中模块的缺失项，并给出下一步唯一动作。
