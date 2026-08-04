# 搜索推荐 Intake 契约

## 目录

- 模式一：功能说明
- 模式二：信息收集与提交
- 信息状态、证据规则与停止条件
- 三阶段交互流程
- 字段收集与确认表
- 阶段三提交接口、字段契约与请求体模板

本文为 `$seainfra-search-recommend-integrate` 提供两个子流程的详细事实：
1. **功能说明**：展示搜索推荐接入所需字段、用途和填写指南。
2. **信息收集与提交**：分析当前项目的文档、代码和配置，按三阶段流程（收集 → 确认 → 提交）整理最小接入信息。

## 模式一：功能说明

当用户选择“功能说明”时，输出本文定义的关键字段、用途和填写指南，帮助用户理解需要提供什么信息和为什么。

### 功能说明输出内容

#### 1. **基础信息**
- 项目标识 (`project_id`) - 推荐平台为该项目分配的唯一标识
- 场景标识 (`scene`) - 推荐结果展示的具体业务场景，如列表页、详情页、发现页
- 产品描述 - 产品用途、SKU 定义、核心用户行为

#### 2. **SKU（搜索推荐的基本单位）**
- SKU 唯一标识 (`sku_id`) - 稳定关联 SKU 的字段，跨系统统一为 `obj_id`
- SKU 描述字段 (`text_info`) - 用于搜索和理解 SKU 的文字信息，如标题、简介、标签
- SKU 图片字段 (`img_info`) - SKU 的封面、主图或相关图片 URL
- SKU 准入条件 - 决定 SKU 是否可被展示或参与推荐的业务规则，如发布、审核、分类等

#### 3. **用户标识与凭证**
- 用户凭证类型 (`account_no` 或 `device_id`)
  - `account_no` - 用于有登录且需跨设备关联的用户行为分析
  - `device_id` - 用于匿名或需设备级隔离的行为分析
- 用户行为关键字段 - 如时间戳、会话 ID、频道等

#### 4. **用户行为**
- 核心行为定义 - 最能体现用户对 SKU 产生价值的单一行为，如浏览、点击、转化
- 行为事件生产者 - 行为事件存储位置或消息 Topic（可选）
- 行为数据字段 - 包含用户标识、SKU 标识、时间戳等

#### 5. **数据源（大数据支持）**
- 业务库 (`business_table`) - 维护 SKU 核心数据的生产库，通常为 OLTP 数据库
- 大数据表 (`big_data_table`) - 经过 ETL 处理的数仓表，用于支持推荐算法和分析
- 映射关系 - 业务库表和大数据表之间的字段对应关系

#### 6. **核心指标**
- **唯一核心指标** - 单一衡量 SKU 价值的指标，如点击率、转化率、评分等
  - 指标名称 - 必填
  - 指标定义 - 计算逻辑和限定条件（可选，当有明确的数学定义时提供）
  - 统计窗口 - 默认最近 7 天（滚动）
- **辅助指标** - 补充解释和优化核心指标的其他指标
  - 如：访问量、独立用户数、会话数、内容新鲜度、点击次数、转化次数等

#### 7. **接入接口**
- 推荐请求格式 - 搜索推荐服务的统一请求格式，包含字段定义和数据类型
- 推荐响应格式 - 返回的推荐结果集合，每个结果包含 SKU ID (`obj_id`) 和召回路信息 (`pt`)
- `pt` 枚举值 - 表示召回策略，如热门榜单（`hot`）、个性化推荐（`behav`）、广告位（`ad`）等

#### 8. **埋点规范（跟踪）**
- 曝光埋点 - 推荐结果展示时上报，含 SKU ID、pt、实验标签等
- 点击埋点 - 用户交互时上报，含 SKU ID、pt、实验标签等
- 核心行为埋点 - 转化相关事件上报，含 SKU ID、pt、实验标签等
- 时间戳、request_id、实验标签 (`canary`) 的传递和关联规则

### 字段填写指南

| 字段分类 | 字段名 | 必填 | 含义 | 填写指南 |
|---|---|---|---|---|
| 基础 | `project_id` | ✓ | 项目唯一标识 | 推荐平台分配的项目 ID，或业务方使用的标准项目编码 |
| 基础 | `scene` | ✓ | 推荐场景 | 如 `home_discovery`（首页推荐）、`list_recommend`（列表推荐）等，不同页面/位置对应不同场景 |
| 产品 | 产品描述 | ✓ | 产品用途、SKU 定义、核心行为 | 需包含产品名、SKU 类型、用户通过什么行为获得价值 |
| SKU | `obj_id` | ✓ | SKU 唯一标识字段 | 选择稳定、全局唯一的字段，如商品 ID、内容 ID、用户 ID 等 |
| SKU | `text_info` | ✓ | SKU 文字描述 | 如商品标题、描述、标签等，用于搜索和冷启动 |
| SKU | `img_info` | ✓ | SKU 图片 | 如商品主图、封面等，支持的格式（URL、存储 key 等） |
| SKU | 准入条件 | ✓ | SKU 可见性规则 | 如"已发布且未删除"、"分类为活跃"等 |
| 用户 | `account_no` 或 `device_id` | ✓ | 用户标识 | 根据产品是否要求登录和是否需跨设备关联选择 |
| 行为 | 核心行为 | ✓ | 最重要的用户行为 | 如"点击"、"购买"、"收藏"、"转化"等，应有真实事件记录 |
| 行为 | 行为 Topic | ✗ | 行为事件消息 Topic | 可选，仅当使用 PubSub 时记录 |
| 数据 | `business_table` | ✓ | 业务库表 | 如 `appdb.public.products`，维护 SKU 原始数据 |
| 数据 | `big_data_table` | ✓ | 大数据表 | 如 `redshift.ods_products`，用于推荐算法 |
| 指标 | 核心指标 | ✓ | 唯一衡量 SKU 价值的指标 | 如点击率、转化率、评分，名称必填，定义可选 |
| 指标 | 辅助指标 | ✓ | 其他分析指标 | 如访问量、UV、新鲜度等，至少 2-3 个 |

---

## 模式二：信息收集与提交

## 目标

分析当前项目的文档、代码和配置，整理搜索推荐接入所需的最小信息。只收集本 Skill 定义的字段，不扩展成通用项目调研。

核心要求：

1. 不确定的信息不要写成确定事实。
2. 缺失的信息必须明确显示，不能留空或用默认值掩盖。
3. 必须先检查项目根目录下的 `bigdata_config`；缺失或没有有效业务库/大数据表对应关系时，提示用户先接入大数据，并停止后续流程。
4. 大数据引擎固定为 Amazon Redshift。
5. 统计窗口默认使用最近 7 天；只有用户明确指定其他窗口时才修改。
6. 本 Skill 不收集、不生成、不校验 SQL；SQL 需求由独立流程处理。
7. 指标名称是指标收集的最小信息；指标口径只有在明确时才记录，口径不明确时不追问、不阻断流程。
8. 严格分为三个阶段：阶段一收集信息，阶段二批量让用户确认，阶段三生成提交接口和参数。阶段一完成后必须在同一轮自动进入阶段二并输出确认信息；阶段二全部确认后必须在同一轮自动进入阶段三。只有等待用户补充缺失信息或确认字段时才允许停下。
9. 提交接口地址固定为 `POST https://moreshort-recommender-strategy-recall-data-update.gpu-api.seaart.dev/rec-prd-bot/integration-intakes`（`Content-Type: application/json`）；阶段三使用该地址提交，不再标记为“未提供”。请求体中的 `submission_interface` 对象描述的是被接入项目自身的对外接口，若没有项目证据或用户明确提供，其 `url`/`auth` 仍标记为 `missing`。

## 信息状态和证据规则

每个字段都必须有状态：

| 状态 | 使用条件 | 输出规则 |
|---|---|---|
| `confirmed` | 代码、配置、Schema、SQL 或文档直接证明 | 写真实值，并给出直接来源 |
| `candidate` | 只有基于命名、页面或业务流程的合理推断 | 只能放在“候选值”中，不能放进确认结果 |
| `missing` | 项目中没有找到该信息 | 收集结果必须写“未找到”或“项目未提供” |
| `pending_confirmation` | 已有候选或部分证据，但需要业务方确认 | 在完整收集信息中重点标注“需要用户确认” |

必须遵守：

- 没有直接证据时，不得把候选值写入正式“收集结果”；候选值必须标记为 `candidate` 或 `pending_confirmation`。
- 对 `project_id`、`scene`、唯一核心指标和关注指标，如果没有直接证据但可以基于项目结构和推荐接口字段格式形成合理建议，应输出候选值并要求用户确认。
- 不得为了填满字段虚构表名、字段名、事件名、Topic、指标、`project_id` 或 `scene`。
- 所有 `missing` 字段必须同时加入“缺失信息”清单。
- 候选值必须与确认值分栏或分段展示，不能混在确认结果中。
- 提交 JSON 中缺失值使用 `null`，并通过状态字段说明是 `missing` 还是 `pending_confirmation`。
- 指标口径不是指标名称的必填依赖；口径不明确时保留为空，不标记为 `missing`，不加入 `missing_fields`，也不阻断阶段三。
- 示例值、常见命名或模型推断不得直接作为正式提交值。

## 补充信息的选择逻辑

对于所有状态为 `missing`、`candidate` 或 `pending_confirmation` 的字段，必须告诉用户“如何选择”，不能只要求用户补值。说明应包含：

1. 字段含义；
2. 补充或选择该字段的业务逻辑，并在逻辑中说明需要提供的信息。

阶段一对用户输出时，只保留以上两项。不得输出项目扫描过程、当前项目情况、单独的“请补充”清单、验证方式或代码证据。

按以下逻辑指导用户：

| 信息项 | 字段含义 | 补充或选择逻辑 |
|---|---|---|---|
| 用户凭证 | 标识行为所属用户的字段。 | 登录且需跨设备关联时选择 `account_no`；匿名且有稳定设备标识时选择 `device_id`。需提供实际字段及其唯一性说明，不能仅凭登录文案或用户表推断。 |
| SKU 业务表 | 维护 SKU 生命周期的业务表。 | 选择真实业务表，不使用页面 Mock、缓存表或推荐结果表；需提供库名、表名、主键及准入相关字段。 |
| SKU 大数据表 | 存储 SKU 数仓数据并支持行为关联的表。 | 大数据表由业务表按 `bigdata_config/table-mapping.md` 中的映射规则推导（业务表 `X` → 大数据表 `sync_X`），找到业务表后直接得出，无需用户单独提供。若 `bigdata_config` 中映射规则不存在或不完整，按前置检查停止条件处理。 |
| SKU 准入条件 | 决定 SKU 是否可被展示或参与推荐的业务条件。 | 选择发布、审核、删除、可见范围等真实规则；需明确字段、允许值及例外，不把字段非空当作准入条件。 |
| SKU ID | 跨业务表、行为表和推荐接口稳定关联 SKU 的唯一标识。 | 选择稳定唯一的正式字段并映射为 `obj_id`；不使用名称、URL 文本或排序值。 |
| `text_info` | 用于搜索和理解 SKU 的文字描述。 | 选择标题、简介、标签、创作者等稳定字段，并说明字段含义和语言规则。 |
| `img_info` | SKU 的稳定封面或主图信息。 | 选择主图字段，并说明是 URL、对象存储 Key 还是其他格式及主图规则。 |
| 核心用户行为 | 最能体现用户对 SKU 产生有效价值的一个行为。 | 优先选择真实使用或转化行为；需明确触发条件、用户字段、SKU 字段和时间字段，不使用单纯按钮文案。 |
| PubSub Topic | 生产核心行为事件的消息 Topic（可选信息）。 | 项目中找到生产者实际使用的 Topic 就记录；找不到就保持为空，不要求用户补充，不阻断流程。不使用临时 Topic 或推荐结果 Topic。 |
| 唯一核心指标 | 按 SKU 衡量产品核心价值的唯一指标。 | 基于项目的核心行为、SKU 价值和真实可用指标，主动给出一个最重要的候选指标；标记为 `pending_confirmation`，由用户确认。口径只有明确时才记录。统计窗口默认最近 7 天。 |
| 关注指标 | 用于解释核心指标变化或优化排序的辅助指标。 | 基于项目行为和业务目标主动给出辅助指标建议；标记为 `pending_confirmation`，由用户确认。只需确认指标名称，口径不明确时不收集。 |
| `project_id` | 推荐平台登记的正式项目标识。 | 有直接配置时使用确认值；没有时参考推荐接口对 `project_id` 的字段类型和命名格式，结合当前项目标识生成候选值，标记为 `candidate`，由用户确认。接口格式也不明确时保持 `missing`。 |
| `scene` | 推荐结果展示的明确业务场景。 | 有直接配置时使用确认值；没有时参考推荐接口对 `scene` 的字段类型和命名格式，结合当前项目实际页面或接口位置生成候选值，标记为 `candidate`，由用户确认。场景无法从项目理解时保持 `missing`。提交接口只接受单个字符串场景，确认多个场景时按场景分多次提交。 |
| 提交接口地址 | 提交搜索推荐接入信息的调用地址和协议。 | 固定使用 `POST https://moreshort-recommender-strategy-recall-data-update.gpu-api.seaart.dev/rec-prd-bot/integration-intakes`（`Content-Type: application/json`），阶段三直接向该地址提交，无需向用户索取。 |

如果用户没有提供上述最小信息，应继续保持 `missing` 或 `pending_confirmation`，不能自行把业务字段或业务规则写成确认值。唯一核心指标、关注指标、`project_id` 和 `scene` 可以按上述规则先生成候选建议，再进入用户确认流程。指标名称确认即可；指标口径不明确时不作为缺失信息。统计窗口除外：默认使用最近 7 天。

提交接口地址属于阶段三的接口交付信息，不是进入阶段二的业务字段阻断条件；阶段三固定使用 `POST https://moreshort-recommender-strategy-recall-data-update.gpu-api.seaart.dev/rec-prd-bot/integration-intakes` 提交，并给出可直接执行的 `curl` 调用示例。

## 前置检查和停止条件

开始收集产品描述、用户凭证、SKU 字段、行为或指标之前，必须先检查：

1. 统一状态中当前环境的 `data_sync` 是否为 `completed`，且证据来自 `$seainfra-data-sync-check`；
2. 项目根目录是否存在 `bigdata_config` 文件夹；
3. 文件夹中是否存在业务库表与大数据表的对应关系（参见 `table-mapping.md`）；
4. 对应关系是否能明确得到业务库名和业务表名；大数据表名由业务表名按映射规则（`X` → `sync_X`）自动推导，实际存在性引用 data sync Check 证据，不在 intake 阶段重复猜测。

只要 `data_sync` 未完成，或第 2～4 项无法确认，立即停止后续流程，并只输出：

- 阻断状态：`blocked_missing_bigdata_config`；
- 检查结果：`data_sync` 未通过 Check、`bigdata_config` 缺失，或对应关系不完整；
- 用户下一步：先执行 `$seainfra-data-sync-integrate` 完成配置收集、支持交付和映射文档，再执行 `$seainfra-data-sync-check` 验证真实同步；需要跨部门支持时由接入 Skill 引导联系“星云中台”支持人员；
- 配置至少需要包含：业务库表、SKU 关联字段、同步/映射说明；大数据表名由业务表名按映射规则自动推导，无需单独列出；
- 在用户补充并确认前，不继续输出产品确认表、SKU 准入条件、核心行为或指标。

此时不得根据静态 Mock、页面字段、Prisma Schema 或文件命名继续推导后续结果。只有前置检查通过后，才执行下面的收集流程。

## 三阶段交互流程

当前阶段只能执行当前阶段允许的动作。阶段切换条件如下：

1. 阶段一只有在所有必需信息已收集完成、没有 `missing` 字段后，才能进入阶段二；指标口径不明确不算 `missing`。收集完成后在同一轮自动进入阶段二，不得停下来等待下一轮。
2. 阶段二只有在所有 `candidate` 和 `pending_confirmation` 字段都得到用户明确确认后，才能在同一轮自动进入阶段三。
3. 阶段三只能生成并提交 intake 接口参数；提交后 intake 子流程结束，返回主 Skill 继续真实推荐接口实施。
4. 任一阶段发现前置条件不满足，停留在当前阶段；用户修正确认结果后导致必需信息缺失时，退回阶段一补齐信息。

### 阶段一：收集信息

完成项目分析后，收集有直接证据的信息，并判断是否存在以下任一缺失：

- SKU 业务库表、字段或映射（大数据表由业务表按映射规则自动推导，无需单独确认）；
- 用户凭证；
- SKU 准入条件；
- 核心行为或行为字段；
- `project_id` 或 `scene`；

存在缺失时，只输出：

1. 缺失或待确认字段及其含义；
2. 补充或选择该字段的逻辑。

阶段一使用精简条目，不输出当前项目情况、项目扫描过程、单独的补充清单、验证方式或代码证据。阶段一不得输出确认表、提交接口或请求参数。等待用户补充后重新分析，直到所有必需信息收集完成。

对于唯一核心指标、关注指标、`project_id` 和 `scene`，如果可以基于项目形成候选建议，阶段一应额外输出“候选建议值”和一句确认问题；候选值必须标记为 `candidate` 或 `pending_confirmation`，不能当作已确认值。

阶段一完成时，输出“阶段一完成，进入阶段二”，并在同一轮立即执行阶段二，输出全部收集信息和确认标记；不得输出完成提示后停止。

### 阶段二：批量确认信息

阶段一完成后，才进入阶段二。一次性展示全部已收集信息，不只展示待确认字段。每项必须包含：

- 信息项及当前收集结果；
- 状态；
- 是否需要用户确认；
- 当前拟采用的字段或规则；
- 字段含义；
- 直接来源或推断依据；
- 选择该字段的逻辑；
- 批量确认或修改该字段的问题。

状态为 `confirmed` 的字段标记为“已确认，无需再次确认”；状态为 `candidate` 或 `pending_confirmation` 的字段必须加粗标记“【需要用户确认】”。用户可以一次性确认全部字段，也可以只修改其中部分字段。只确认部分字段时，下一轮仍展示全部收集信息，并继续重点标注尚未确认的字段。统计窗口默认显示为“最近 7 天”，不作为缺失项；只有用户要求调整时才重新确认。阶段二不得生成提交接口或最终请求参数。

指标类字段只需确认指标名称。若指标口径已有明确证据或用户明确提供，可以一并记录；若口径不明确，保留为空并继续流程，不再单独询问。

阶段二全部确认后，立即执行阶段三，在同一轮输出确认结果、提交接口和请求参数；不得只输出阶段完成提示后停止。

### 阶段三：提交接口参数

只有阶段二完成、所有候选字段均已明确确认后，才：

1. 使用固定调用地址 `POST https://moreshort-recommender-strategy-recall-data-update.gpu-api.seaart.dev/rec-prd-bot/integration-intakes`；
2. 生成完整请求参数；
3. 标记所有已确认字段来源；
4. 输出可直接执行的 `curl` 调用示例。

- **调用地址**：`https://moreshort-recommender-strategy-recall-data-update.gpu-api.seaart.dev/rec-prd-bot/integration-intakes`，方法 `POST`，`Content-Type: application/json`；
- **请求体中的 `submission_interface`**：描述被接入项目自身的对外接口；没有项目证据或用户明确提供时，`url`/`auth` 保持 `null` 并标记 `missing`。

调用地址本身不代表业务字段已确认，也不能替代用户对业务字段的确认。

如果用户只确认了部分字段，继续停留在阶段二，只询问剩余字段；不得提前生成接口或请求参数。

## 统一术语

分析和输出时优先使用以下术语，同时记录项目中的别名：

| 统一术语 | 接口字段 | 常见别名 |
|---|---|---|
| sku | `obj_id` | item、物料 |
| account_no | `account_no` | userID、用户 ID |
| device_id | `device_id` | deviceID |
| pt | `pt` | 召回路信息、埋点字段 |
| link_data | `link_data` | 广告投放 ID |
| canary | `canary` | 灰度标识 |
| 核心行为 | — | 有效行为、关键行为 |
| project_id | `project_id` | 项目 ID |
| scene | `scene` | 场景 ID |

## 收集流程

### 1. 产品描述

从 README、产品文档、页面、路由、核心实体和业务接口中理解产品，输出一段文字，必须包含：

- 产品是什么；
- sku 是什么；
- 产品如何服务用户；
- 用户在产品中最重要的行为。

重要行为尽量只保留一个。分别判断产品名称、SKU 定义和核心行为的状态。页面文案只能证明页面意图，不能单独证明真实业务行为。

### 2. 用户凭证

判断进入产品或执行核心行为是否必须登录：

- 必须登录且有直接字段证据：使用 `account_no`；
- 不必须登录且有设备 ID 生成或读取证据：使用 `device_id`；
- 两者都没有直接证据：写“用户凭证：未找到”。

检查登录拦截、路由鉴权、用户上下文、Token 解析和设备 ID 生成逻辑。只有登录按钮或登录文案时，不得据此确认 `account_no`。

### 3. SKU 数据来源

按以下顺序查找：

1. 读取项目根目录 `bigdata_config`；
2. 从映射中定位 SKU 业务库和业务表；
3. 大数据表由业务表按 `bigdata_config/table-mapping.md` 中的规则自动推导（业务表 `X` → 大数据表 `sync_X`）；实际存在性使用 data sync Check 证据，不在本阶段重复探测。

重点检查 `bigdata_config` 中的映射文件、字段说明和同步说明，再用 ORM Model、DAO、Mapper、建表文件交叉验证业务表。

分别输出：

- SKU 业务库表（直接证据确认）；
- SKU 大数据表（由业务表按映射规则推导，标记 `confirmed`）；
- 映射依据（来源文件）。

如果 `bigdata_config` 缺失或业务表无法确认，按”前置检查和停止条件”立即停止。静态 Mock、文件名或候选表名不能冒充业务表。

### 4. SKU 准入条件

根据列表接口、详情接口、上下架逻辑和审核逻辑提取可展示 SKU 的过滤条件。

只有真实业务表和字段逻辑完整时，才输出可执行的准入条件，并标记 `pending_confirmation`。如果项目没有直接的发布、审核、上下架证据，必须写“项目未提供准入条件”；可另列候选条件，但不能把字段非空擅自扩展成正式业务规则。

### 5. SKU 刻画字段

只保留能描述 SKU 的字段：

- `sku_id`：SKU 唯一 ID；
- `text_info`：文字描述字段及含义；
- `img_info`：图片字段及含义。

从 SKU Schema、ORM Model、接口 DTO 和页面渲染字段提取。页面字段但无业务表证据时标记 `candidate`，不能写成确认的数据库字段。

### 6. 核心用户行为

通过用户与 SKU 的主要交互流程、行为事件、埋点和转化结果判断最重要行为，例如停留、点击、聊天或付费。

输出：

- 行为名称；
- 触发条件；
- 关联 SKU；
- 直接证据。

该结果必须标记 `pending_confirmation`。如果只有按钮文案、页面标题或静态统计，没有真实事件处理或埋点，必须明确写“未发现行为实现”，行为名称只能作为候选值。

### 7. 核心行为 PubSub Topic（可选）

从配置和消息生产者中查找 Topic。

PubSub Topic 是可选信息：找到真实 Topic 就记录；没有找到时保持为空，不列入缺失信息，不要求用户补充，也不阻断后续阶段。不得推测 Topic 名称。

### 8. 唯一核心指标

先根据产品和代码判断什么指标能唯一衡量 SKU 好坏，尽量只保留一个核心指标。

输出：

- 核心指标名称；
- 指标计算逻辑（仅在口径明确时记录）；
- 统计窗口；
- 指标状态。

如果项目没有直接确认的核心指标，必须基于产品定位、核心行为、SKU 价值和真实可用指标主动给出一个最重要的候选指标，并要求用户在阶段二确认。候选指标不能直接写入正式收集结果。

默认统计窗口为最近 7 天；只有用户明确指定其他窗口时才修改。

### 9. 关注指标

在唯一核心指标之外，基于项目的用户行为、SKU 属性和业务目标主动给出关注指标建议，例如访问、独立用户、转化、收藏、评论、搜索点击和内容新鲜度。每项建议标记为 `pending_confirmation`，由用户确认指标名称后才写入正式结果。辅助指标不得冒充唯一核心指标；口径不明确时只记录指标名称。

### 10. `project_id` 和 `scene`

从项目配置、接口调用、环境变量、业务场景和路由中查找。

有直接证据时写确认值；没有直接证据时，先读取推荐接口中 `project_id` 和 `scene` 的字段类型、命名格式和可接受值形式，再结合当前项目标识、页面和接口位置生成候选值，并标记 `candidate`，交给用户确认。接口格式或业务场景都无法确定时，才写“未找到”。

## 输出确认表

阶段二完成前不生成提交接口。按当前交互阶段输出：

### 阶段一输出格式

只输出“缺失信息”和“补充信息选择说明”。所有必需信息收集完成后，输出“阶段一完成，进入阶段二”，并在同一轮继续输出阶段二内容。

### 阶段二输出格式

输出“全部收集信息及确认标记”，一次性列出所有字段值、含义、来源、选择逻辑、状态和是否需要确认。需要确认的字段必须使用“【需要用户确认】”重点标注；已确认字段标记为“已确认，无需再次确认”。统计窗口显示为默认“最近 7 天”。全部候选字段确认后，立即继续输出阶段三内容。

### 阶段三输出格式

用户确认完成后，才输出确认表、提交接口和请求参数。

阶段三的确认表格式：

| 信息项 | 收集结果 | 候选值 | 来源或推断 | 状态 | 是否需要确认 |
|---|---|---|---|---|---|
| 产品描述 | | | | | |
| 用户凭证 | | | | | |
| SKU 业务库表 | | | | | |
| SKU 大数据表 | | | | | |
| SKU 准入条件 | | | | | 是 |
| SKU 刻画字段 | | | | | |
| 核心用户行为 | | | | | 是 |
| 核心行为 PubSub Topic | | | | | 否（可选） |
| 唯一核心指标 | | | | | 是 |
| 关注指标 | | | | | 是 |
| `project_id` | | | | | 是 |
| `scene` | | | | | 是 |
| 提交接口地址 | | | | | 否 |

如果前置检查失败，不输出以上正常确认表，改为输出阻断状态和需要用户补充的 `bigdata_config` 内容。

表格中不允许出现空的“收集结果”：

- 有证据：填写值，状态为 `confirmed`；
- 只有推断：收集结果写“未确认”，候选值单独填写，状态为 `candidate` 或 `pending_confirmation`；
- 没有信息：写“未找到”，状态为 `missing`。

表格之后必须按顺序输出：

1. **缺失信息**：逐项列出所有 `missing` 字段，以及项目中检查过但未找到的证据类型。
2. **待用户确认项**：集中列出所有候选值、需要确认的业务规则和外部依赖。
3. **补充信息选择说明**：对每个缺失或待确认字段，只说明字段含义和补充/选择逻辑。
4. **已确认信息来源**：只列出状态为 `confirmed` 的字段及其直接来源。

## 阶段三：提交接口设计

只有用户完成阶段二确认后，才生成提交接口和参数。提交接口固定为：

```http
POST https://moreshort-recommender-strategy-recall-data-update.gpu-api.seaart.dev/rec-prd-bot/integration-intakes
Content-Type: application/json
```

阶段三必须以该地址为准输出一条可直接执行的 `curl` 命令，命令体即下方请求体模板按项目证据填充后的结果。请求体中的 `submission_interface` 描述的是被接入项目自身的对外接口，若无证据则保持 `null` 并标记 `missing`。

### 接口约束

- `scene` 只接受单个字符串，不接受数组。传数组会被服务端以 `422` 拒绝（`"Input should be a valid string"`）。
- 项目存在多个推荐场景时，必须按场景拆分为多次提交，每次请求只带一个 `scene`，其余字段保持一致；`product_description` 可按该场景的实际展示位置微调。每次提交返回独立的 `requirement_id`，需全部记录。
- 服务端必填字段为 `project_id`、`scene`、`product_description`；缺失任一项返回 `422`。
- 有效请求会触发服务端 LLM 处理，正常耗时约 20-30 秒；校验错误则秒级返回。调用时 `--max-time` 不应低于 180 秒。
- 该服务存在间歇性连接超时，且失败发生在连接层而非参数校验。提交必须带重试（建议最多 6 次，间隔约 6 秒），并按 HTTP 状态码判断成功，不能凭单次超时判定接口不可用。
- 超时后重试前，应先调用 `GET /rec-prd-bot/admin/requirements` 回读列表，确认上一次请求是否已落库，避免重复提交。提交完成后同样用该接口按 `project_id` 与 `scene` 核对记录。

### 字段契约（强制）

服务端 `IntegrationIntakeRequest` 只约束 `project_id`、`scene`、`product_description` 三个字段（均为 `string`），且 `additionalProperties: true`。这意味着其余字段的字段名拼错、类型写错、层级放错都会返回 `200` 并被原样写入 `source_text`，服务端不会报错。因此结构一致性完全由本 Skill 保证。

生成请求体时必须严格使用下表的 key 名、类型和取值，不得改名、不得增删字段、不得更换嵌套结构。除下表列出的字段外，不允许自行新增任何字段（包括临时说明性字段）。

| 字段路径 | 类型 | 取值与格式 |
|---|---|---|
| `user_id` / `user_name` | `string \| null` | 调用方标识，未提供填 `null`，不得自行编造 |
| `business_line` | `string \| null` | 产品线标识，小写下划线，如 `seachat` |
| `submission_interface.url` | `string \| null` | 被接入项目自身对外推荐接口地址 |
| `submission_interface.method` | `string \| null` | 固定 `"POST"` 或 `null` |
| `submission_interface.auth` | `string \| null` | 鉴权方式描述 |
| `submission_interface.status` | `enum` | `confirmed` \| `missing` |
| `submission_interface.design_status` | `string` | 固定 `"proposed"` |
| `bigdata_engine` | `string` | 固定 `"redshift"` |
| `project_id` | `string` | 小写下划线，如 `seachat`。**必填** |
| `scene` | `string` | 单个场景，小写下划线，如 `home_list`。**必填，不得为数组** |
| `product_description` | `string` | 一段完整中文描述，含产品、SKU、服务方式、核心行为。**必填** |
| `user_credential.type` | `enum` | `account_no` \| `device_id` |
| `user_credential.source` | `string \| null` | `表名.字段名`，如 `chat_message.user_id` |
| `sku_source.business_table` | `string \| null` | 三段式 `库.schema.表`，保留原始大小写，如 `appdb.public.DigitalHuman` |
| `sku_source.big_data_table` | `string \| null` | 同三段式，如 `appdb.public.sync_DigitalHuman` |
| `sku_source.mapping_source` | `string \| null` | `bigdata_config` 内的来源文件名，逗号分隔 |
| `sku_eligibility.condition` | `string \| null` | 可直接用于过滤的 SQL 布尔表达式，如 `status = 3 AND visibility = 1` |
| `sku_fields.sku_id.field` | `string \| null` | `表名.字段名` |
| `sku_fields.sku_id.meaning` | `string \| null` | 字段含义，需说明映射为 `obj_id` |
| `sku_fields.text_info` | `array` | 元素固定为 `{"field": string, "meaning": string}`，不得用纯字符串数组 |
| `sku_fields.img_info` | `array` | 元素固定为 `{"field": string, "meaning": string}` |
| `core_behavior.name` | `string \| null` | 小写下划线英文行为名，如 `chat` |
| `core_behavior.definition` | `string \| null` | 触发条件与落库位置 |
| `pubsub.topic` | `string \| null` | 找不到填 `null` |
| `pubsub.status` | `enum` | `confirmed` \| `optional` |
| `hot_sku.core_metric` | `string \| null` | 单个指标名称 |
| `hot_sku.metric_definition` | `string \| null` | 口径不明确时填 `null` |
| `hot_sku.time_window` | `object` | 固定 `{"type":"rolling_days","days":7,"description":"最近 7 天"}` |
| `metrics` | `array` | 元素固定为 `{"name": string, "source": string \| null, "status": enum}` |
| `terminology` | `object` | 统一术语到项目字段的平铺映射，值为 `string` |
| `missing_fields` | `array<string>` | 字段路径点号形式，如 `submission_interface.url` |
| 各 `*.status` | `enum` | 统一取 `confirmed` \| `pending_confirmation` \| `candidate` \| `missing` \| `optional`；`optional` 仅用于 `pubsub` |
| 各 `*.note` | `string` | 仅当该字段值已确认但存在数据侧待办时填写；无待办时**必须省略该 key**，不得填 `null` 或空串 |

补充约束：

- `status` 与正式字段值必须自洽：填了 `confirmed` 时对应值不得为 `null`；值为 `null` 时 `status` 必须是 `missing` 或 `pending_confirmation`。
- 所有 `status` 为 `missing` 的字段路径必须同时出现在 `missing_fields` 中，二者不得不一致。
- 表名一律使用三段式并保留数据库中的原始大小写，不得改写为全小写或省略 schema 段。
- 指标名称使用中文业务名称；字段名、表名、行为名、`project_id`、`scene` 使用小写下划线英文。
- 生成 `curl` 前必须逐项比对本表，确认无多余 key、无缺失 key、无类型不符。

请求体模板：

```json
{
  "user_id": null,
  "user_name": null,
  "business_line": null,
  "submission_interface": {
    "url": null,
    "method": null,
    "auth": null,
    "status": "missing",
    "design_status": "proposed"
  },
  "bigdata_engine": "redshift",
  "project_id": null,
  "scene": null,
  "product_description": null,
  "user_credential": {
    "type": null,
    "source": null,
    "status": "missing"
  },
  "sku_source": {
    "business_table": null,
    "big_data_table": null,
    "mapping_source": null,
    "status": "missing"
  },
  "sku_eligibility": {
    "condition": null,
    "status": "missing"
  },
  "sku_fields": {
    "sku_id": {
      "field": null,
      "meaning": null,
      "status": "missing"
    },
    "text_info": [
      { "field": null, "meaning": null }
    ],
    "img_info": [
      { "field": null, "meaning": null }
    ],
    "status": "missing"
  },
  "core_behavior": {
    "name": null,
    "definition": null,
    "status": "pending_confirmation"
  },
  "pubsub": {
    "topic": null,
    "status": "optional"
  },
  "hot_sku": {
    "core_metric": null,
    "metric_definition": null,
    "time_window": {
      "type": "rolling_days",
      "days": 7,
      "description": "最近 7 天"
    },
    "status": "missing"
  },
  "metrics": [
    { "name": null, "source": null, "status": "pending_confirmation" }
  ],
  "terminology": {},
  "missing_fields": []
}
```

模板中数组元素为占位结构，说明元素必须遵循的固定形状；实际提交时按项目证据逐条替换，无内容时提交空数组 `[]`，不得保留 `null` 占位元素，也不得改变元素的 key 名。

填写规则：

- 必须严格遵循上方「字段契约（强制）」的 key 名、类型和枚举值。服务端只校验 `project_id`、`scene`、`product_description`，其余字段写错不会报错但会污染入库数据，因此结构正确性由本 Skill 负责。
- `scene` 必须填单个字符串；确认了多个场景时，为每个场景各生成一条请求体和一条 `curl` 命令，不得把多个场景合并成数组或用分隔符拼接成一个字符串。
- 除模板与字段契约列出的字段外，不得新增任何 key；需要记录数据侧待办时，只能使用契约中定义的 `note`，且无待办时省略该 key。

- 直接证据确认的值才可写入正式字段，并标记 `confirmed`。
- 候选值不得写入正式字段；正式字段保持 `null`，另在确认表和待确认项中展示。
- 项目未提供的字段保持 `null`，标记 `missing`，并加入 `missing_fields`。
- `user_id`、`user_name`、`business_line` 为调用方标识字段：`business_line` 填项目/产品线名称（有证据时用确认值）；`user_id`、`user_name` 由调用方提供，无提供时保持 `null`。
- `submission_interface` 描述被接入项目自身的对外接口；`design_status` 固定填 `proposed`，`url`/`auth` 无证据时保持 `null` 并标记 `missing`。
- `bigdata_engine` 固定填写 `redshift`。
- `hot_sku.time_window` 默认填写最近 7 天；只有用户明确要求其他窗口时才修改。
- `hot_sku.metric_definition` 只有在指标口径明确时填写；口径不明确时保持 `null`，不加入 `missing_fields`，不阻断正式提交参数生成。
- `pubsub.topic` 是可选字段：项目中找到就填写；没有找到时保持 `null`，状态填 `optional`，不加入 `missing_fields`，不阻断正式提交参数生成。
- 不得把 `seachat`、`home_discovery`、`account_no`、`chat_message_sent` 等示例或推断值直接写入正式字段，除非项目有直接证据或用户明确确认。
- 阶段一和阶段二不得输出提交接口或请求参数；只有阶段三在用户确认完成后才输出。
- 阶段三输出前必须明确写出“阶段二全部字段已确认”；若仍有任何 `missing`、`candidate` 或 `pending_confirmation`，不得生成正式提交参数。
- 阶段三必须把填充后的请求体包进一条可直接执行的 `curl` 命令，固定使用下述地址与头部：

```bash
curl -sS -X POST 'https://moreshort-recommender-strategy-recall-data-update.gpu-api.seaart.dev/rec-prd-bot/integration-intakes' \
  -H 'Content-Type: application/json' \
  -d '<填充后的请求体 JSON>'
```
