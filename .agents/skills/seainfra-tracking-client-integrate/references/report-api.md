# 埋点实施手册（《星云最佳实践》可执行摘要）

> **版本戳**：摘自官方文档《星云最佳实践》（线上：https://aiart-conan-web.dev.seaart.dev/starunion-best ）。
> conan 包版本基线：core 1.2.7 / plugin-ad 1.0.10 / plugin-app 1.1.7 / plugin-map 1.2.7 / plugin-page 1.1.7 / plugin-starunion 1.0.0 / plugin-user 1.1.8。
> 摘要快照日期：2026-07。官方文档更新后本文可能滞后；实施中发现与 SDK 实际行为不符时，以官方文档为准并刷新本文。

## 1. 场景速查表

| 场景 | 推荐方式 | 关键点 |
| --- | --- | --- |
| 普通按钮、链接点击 | `data-conan` + `data-conan-module` | 自动上报 `log_click_client` |
| `div`、卡片、入口点击 | 显式添加 `data-conan` | 非默认全埋点元素必须明确标识 |
| tab、分类、筛选 | `data-conan-tab` | 区分事件所在 tab / 筛选上下文 |
| 输入框聚焦、失焦 | `data-conan` + allowEvent 开启 focus/blur | 默认不上报这两类 |
| checkbox、switch 点击 | `data-conan-event="click"` | `input` 默认只响应 focus/blur |
| 悬停、滚动、停留 | `data-conan-event` + allowEvent | 高频事件，确有分析价值才开 |
| 元素曝光 | `data-conan-event="exposure"` | 自动上报 `log_element_expose_client` |
| 列表曝光合并 | `data-conan-content` + `data-conan-exposure-key` | 同类曝光合并 element_content 数组 |
| 页面进入、离开 | ConanPluginPage 自动 | **不要**给页面根节点配曝光事件 |
| 页面挂起、恢复 | ConanPluginPage + allowEvent | 恢复事件带 `properties.page_suspend`（ms） |
| 少量稳定自定义字段 | `data-conan-custom` | JSON 字符串，平铺到 properties |
| 一段周期内的公共参数 | `tracker.registerReportContext` | 离开页面/弹层/流程时调用取消函数 |
| 流程、异步结果、失败原因 | `tracker.report` + extendEvent | 手动事件名用星云事件名 |
| 广告点击、曝光、转化归因 | ConanPluginAd + 广告属性 / `pluginAd.getAdData()` | 广告参数提取由广告插件负责 |

## 2. data-\* 属性总览（12 个）

| 属性 | 所属插件 | 说明 |
| --- | --- | --- |
| `data-conan` | map | 全埋点标识符，值作为元素名（element_name） |
| `data-conan-event` | map | 元素响应的事件类型，多个逗号分隔（如 `click,focus,blur`） |
| `data-conan-module` | map | 模块标识，可加在自身与父级容器 |
| `data-conan-exposure-key` | map | 曝光唯一标识，虚拟列表防重复曝光必备 |
| `data-t-key` | starunion | 多语言键，作元素名缺省值 |
| `data-conan-custom` | starunion | 自定义字段，JSON 字符串，平铺到 properties |
| `data-conan-type` | starunion | 元素类型（button / card / tab / input…） |
| `data-conan-tab` | starunion | 元素所在 tab / 分类 / 筛选上下文 |
| `data-conan-content` | starunion | 内容数据，JSON 字符串，输出到 element_content |
| `data-conan-ad` | ad | 广告名称标识 |
| `data-conan-ad-event` | ad | 触发广告上报的事件，多个逗号分隔 |
| `data-conan-ad-custom` | ad | 广告自定义数据，JSON 字符串 |

⚠️ `data-conan-content` / `data-conan-custom` 必须是合法 JSON 字符串（用 `JSON.stringify(...)` 生成）；解析失败该字段被跳过并打印错误。

## 3. 默认事件与 allowEvent

星云插件默认只上报 `page_view`、`page_leave`、`click`、`exposure`。需要更多内置事件时在 `starunionPluginConfig.allowEvent` 显式开启：

```ts
starunionPluginConfig: {
  allowEvent: ['page_view', 'page_leave', 'page_suspend', 'page_resume',
               'click', 'focus', 'blur', 'hover', 'scroll', 'exposure', 'stay'],
}
```

- 确认表出现非默认事件时，实施必须**同步修改 allowEvent**，否则埋了也不上报
- `mouseenter` / `mouseleave` 还需同时配置 Map 插件的 `events`（`ConanEventName.MouseEnter` 等）

## 4. 自动事件名映射（归一化对照）

| 交互 | 上报事件名 | 备注 |
| --- | --- | --- |
| 点击 | `log_click_client` | |
| 元素曝光 | `log_element_expose_client` | 同页面同元素只曝光一次 |
| 元素停留 | `log_element_stay_client` | `stay_duration`（ms） |
| 页面进入 | `log_page_expose_client` | ConanPluginPage 自动 |
| 页面离开 | `log_page_leave_client` | ConanPluginPage 自动，含 page_view（ms） |
| 页面挂起 / 恢复 | `log_page_suspend_client` / `log_page_resume_client` | 恢复带 page_suspend（ms） |
| 聚焦 / 失焦 | `log_focus_client` / `log_blur_client` | 需 allowEvent |
| 悬停 / 滚动 | `log_hover_client` / `log_scroll_client` | 需 allowEvent |

## 5. 关键规则

- **element_module 拼接**：从事件元素及所有父级的 `data-conan-module` 提取，用 `_` 连接（`home` > `content-list` 下的按钮 → `home_content-list`）。模块名保持稳定，不塞临时状态或频变文案
- **曝光合并 key**：`current_page_name | element_module | element_name | element_type | element_tab`。短时间同 key 曝光合并为一条，element_content 合并成数组
- **虚拟列表**：DOM 会复用，`data-conan-exposure-key` 必须能标识真实内容；公共组件由页面传入 `exposurePrefix` 防跨页 key 冲突
- **allowMapWithoutName=false（默认）**：无 `data-conan` 元素名的 click/focus/blur 会被**丢弃**，重点元素必须显式设置
- **page_name 稳定**：不把具体 id 拼进 page_name；id 放事件参数或上下文

## 6. 手动埋点三步

```ts
// ① ReportName 加常量（事件名格式 log_{business_action}_client）
export const ReportName = {
  FormSubmitResult: 'log_form_submit_result_client',
} as const;

// ② ReportCustomParams 加类型（数值参数声明为 number）
export type ReportCustomParams = {
  [ReportName.FormSubmitResult]: {
    form_name: string;
    is_success: boolean;
    fail_reason?: string;
    duration: number; // ms
  };
};

// ③ 业务代码调用（extendEvent 已在 init 中通过 Object.values(ReportName) 自动带上）
starunionTracker.report(ReportName.FormSubmitResult, {
  form_name: 'contact',
  is_success: true,
  duration: Date.now() - submitStartTime,
});
```

- `tracker.report` 是**同步 API**，init 完成前即可调用——接入工具会缓存原始参数，Conan 创建后补发。但 init 前 DOM 全埋点与曝光**不会**被捕获
- 若 init 中 `extendEvent` 不是 `Object.values(ReportName)` 而是手写数组，新增事件时必须同步维护

## 7. 上下文共享字段（registerReportContext）

一个页面 / 弹层 / 连续流程内多个事件共享同一组字段时使用，避免逐个传参：

```tsx
useEffect(() => {
  const cancelContext = starunionTracker.registerReportContext({
    content_id: detail.id,
    source_name: sourceName,
  });
  return () => cancelContext(); // 离开页面/关弹层/流程结束必须取消
}, [detail.id, sourceName]);
```

- 生效期间点击、曝光、手动上报都会带上共享字段
- init 前手动 report 会合并**当时**的上下文；同名字段以 report 参数为准

## 8. 典型场景手册

### 表单 / 生成任务 / 异步流程（提交 + 成功 + 失败三点）

```ts
const startedAt = Date.now();
starunionTracker.report(ReportName.GenerateSubmit, { source_name, model_id });
try {
  const result = await submit();
  starunionTracker.report(ReportName.GenerateComplete, {
    task_id: result.task_id, is_success: true, duration: Date.now() - startedAt,
  });
} catch (error) {
  starunionTracker.report(ReportName.GenerateComplete, {
    is_success: false, fail_reason: getErrorMessage(error), duration: Date.now() - startedAt,
  });
}
```

### 支付 / 订阅

不要只埋按钮点击；区分下单（CheckoutStart）、支付成功（PaymentSuccess）、支付失败（PaymentFailed）。建议字段：`product_id`、`product_type`、`currency`、`amount`、`order_id`、`payment_method`、`fail_reason`。

### 搜索

提交用手动埋点（需要最终 query、筛选条件、结果数）：`{ keyword, filter_type, result_count }`。

### 广告转化点

注册成功、下单成功、支付成功、首次生成成功等关键转化点，用 `pluginAd.getAdData()` 取当前广告数据放进手动事件参数（`ad_data`）；URL 广告参数的提取与持久化由广告插件自动处理。

### 内容曝光 / 离开计时（自定义 work 类事件的实战模式）

```tsx
// 进入：report expose 并记时间戳
const startRef = useRef(0);
useEffect(() => {
  startRef.current = Date.now();
  starunionTracker.report(ReportName.WorkExpose, { work_id, source_name });
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      starunionTracker.report(ReportName.WorkLeave, {
        work_id, work_view: Date.now() - startRef.current, leave_type: 'background',
      });
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    // 路由离开 / 组件卸载
    starunionTracker.report(ReportName.WorkLeave, {
      work_id, work_view: Date.now() - startRef.current, leave_type: 'exit',
    });
  };
}, [work_id]);
```

`leave_type` 区分离开方式（如 `background` = 切到后台、`exit` = 正常离开、`switch` = 切换内容），毫秒数值上报 number。

## 9. 实施检查清单

- [ ] 实施前已查重：无同名/同义 ReportName、目标元素无既有 `data-conan` 覆盖、字段未被 registerReportContext 重复注入
- [ ] 自动埋点有清晰的 `data-conan-module` 与 `data-conan`
- [ ] 曝光埋点有稳定的 `data-conan-exposure-key`
- [ ] 手动事件名是 `log_*_client` 且已加入 extendEvent
- [ ] `ReportCustomParams` 与 `report()` 实参类型一致；数值参数为 number
- [ ] 复杂流程覆盖提交、成功、失败（或取消）
- [ ] 页面级共享字段用 `registerReportContext` 且离开时取消
- [ ] 非默认事件已同步开启 allowEvent
- [ ] JSON 属性由 `JSON.stringify(...)` 生成
- [ ] 项目 build 通过
- [ ] 上报验收（能运行项目时）：DevMode 下逐事件触发，console 与 `agent_uri` 请求中事件名/字段正确

## 10. 实施结果表（完成后输出给用户）

在确认表基础上追加落地信息：

```
| # | 事件名 | 埋点方式 | 落地位置（文件:行） | 状态 | 验证 |
```

- **状态**：✅ 已实施 / ♻️ 复用既有实现（写明位置）/ ⏭️ 跳过（附原因）
- **验证**（分级，不得虚报）：
  - `已验证上报`——DevMode 实测触发，console 与 `agent_uri` 请求中事件名、字段核对无误
  - `仅构建验证`——build 通过 + 静态核对，未做运行时验证；必须原样标注此字样，并列出用户待办的触发路径与预期事件
- 表后附全局变更汇总：allowEvent / extendEvent / getPageName 的实际改动
