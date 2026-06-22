# Cash Flow Pulse — v1.2 产品审查 & 升级方案

> 对标 Money Forward ME（日本市占第一）、YNAB（定制预算标杆）、Copilot（iOS 高端记账）三款成熟同类产品，
> 基于真实代码核验得出。本文档既是审查报告，也是可执行的升级计划。
> 状态：待批准并排期。

---

## 0. 审查方法

- ✅ 所有问题均经过代码核验（grep / 读源码），非空想
- 🔴 = 正确性 / 安全 / 数据风险（最高优先）
- 🟠 = 明显短板，影响信任与体验
- 🟡 = 品质提升
- 🟢 = 成熟度 / 未来功能

---

## A. 正确性 & 安全（🔴 最高优先，金融应用底线）

### A1. 🔴 FOUNDER_EMAIL 仍是占位符
`apps/api/src/lib/auth.ts:85` → `const FOUNDER_EMAIL = 'founder@example.com'`
- **后果**：真实账号 sonic980828@gmail.com 既非 `is_admin` 也非 `pro`，永久 `free`；创始人特权 / 迁移哨兵逻辑形同虚设。
- **修复**：改为 `sonic980828@gmail.com`，并对已存在用户补一次 `UPDATE users SET is_admin=1, tier='pro' WHERE email=?`。
- **工时**：10 分钟。

### A2. 🔴 缺多用户数据隔离测试
现状：整个仓库只有 `packages/shared/src/calc.test.ts`。OAuth 方案曾明确承诺「每个 API endpoint 都写多用户隔离集成测试」——**一个都没写**。
- **风险**：任何一处 query 漏 `WHERE user_id=?` 都会造成跨用户数据泄露，而无测试兜底。
- **修复**：vitest + miniflare D1，对 cash/cards/bills/incomes/investments/subscriptions/snapshots/dashboard 每个端点写「用户 A 的 session 看不到用户 B 数据」测试。
- **工时**：4-6h。**这是上线多用户后最该补的安全网。**

### A3. 🔴 前端无 ErrorBoundary
现状：无任何 `ErrorBoundary`。任一组件渲染抛错 → 整页白屏，用户只能强退。
- **修复**：根部包一个 ErrorBoundary，兜底显示「出错了 + 重新加载」，并上报。
- **工时**：1h。

### A4. 🟠 API 无限流
`auth.ts` 无 rate limit。OAuth 登录由 Google 兜底问题不大，但业务端点（尤其导入 `/api/import`）无任何频率限制。
- **修复**：Cloudflare Workers 可用 KV 或 Durable Objects 做简单滑动窗口限流；或先用 CF 自带的 WAF rate limiting rule。
- **工时**：2-3h。

### A5. 🟡 会话管理不完整
`sessions` 表已建（含 ip / user_agent），但前端只有「退出登录」，无「已登录设备」列表 / 远程吊销。
- **修复**：Settings 加「登录设备」卡片，列出活跃 session，支持单个吊销 + 全部登出。
- **工时**：3h。

---

## B. 核心功能缺口（🔴/🟠 影响留存，对标竞品的硬差距）

### B1. 🔴 没有一次性 / 临时收支记录（最大缺口）
现状：只能录入 recurring 固定项目。无法记「今天吃饭 ¥3000」「临时打车 ¥800」。
- **对标**：Money Forward / YNAB / Copilot 全部以「逐笔交易流水」为核心。
- **修复**：新增 `transactions` 表（date, type=income/expense, amount, category, note, account_id?），独立「记一笔」入口；总览/曲线把临时收支并入计算。
- **工时**：高，8-12h（新表 + 路由 + UI + 并入计算）。**是从「预算估算器」走向「记账应用」的关键一步。**

### B2. 🟠 无支出分类统计
`subscriptions.category` 字段存在但前端未用；账单/卡/订阅都归「消费」却无食费/交通/娱乐等分类。
- **修复**：统一分类枚举，消费类记录可选分类；总览加「分类占比」环形图。
- **工时**：中，4-5h（与 B1 共用分类体系最佳）。

### B3. 🟠 删除用系统 confirm() 且无撤销
现状：删除走 `window.confirm`，丑且误删不可恢复。
- **对标**：成熟应用普遍 Toast + Undo（删除先软删，5 秒内可撤销）。
- **修复**：引入 Toast 组件 + 乐观删除 + Undo。
- **工时**：低-中，3h。**性价比极高，立刻提升质感。**

### B4. 🟡 信用卡模型过简
现状：只存「账单总额」`statement_amount`，等于每月手填。无法记录卡内逐笔消费。
- **修复**：与 B1 交易流水打通——卡作为「账户」，消费挂在账户上自动汇总账单。
- **工时**：中（依赖 B1）。

---

## C. 移动端 & PWA 体验（🟠/🟡）

### C1. 🟠 PWA 无离线能力
现状：有 manifest + icon，但**无 Service Worker**，断网打开白屏，不是真 PWA。
- **修复**：用 `vite-plugin-pwa` 加 SW，缓存 app shell + 最近一次 dashboard 数据，离线可查看。
- **工时**：中，3-4h。

### C2. 🟠 数字输入未优化
所有金额 `<input type="number">` 无 `inputMode="decimal"`；日本用户习惯整数，应禁小数点弹整数键盘。
- **修复**：金额输入统一 `inputMode="numeric"` + 去小数；日期/号数同理。
- **工时**：低，1h（改 6 个 Form 组件）。**一行级改动，移动端体验明显提升。**

### C3. 🟡 「采集点」黑话残留
现状：Settings 已删配置入口，但 Overview 仍显示「今天到了第 N 个采集点」「周期第 N 天」。每日自动采集上线后，这个手动提示已冗余。
- **修复**：移除采集点提示条，或改为对用户有意义的「📸 记录今日快照」普通按钮（不暴露 offset 概念）。
- **工时**：低，1h。

---

## D. UI / UX 品质（🟡）

### D1. 🟡 无深色模式
Tailwind 无 `darkMode` 配置，颜色全硬编码浅色。系统深色模式下刺眼。
- **修复**：Tailwind `darkMode:'media'` 或 `'class'`，颜色 token 加 dark 变体（设计系统已用 CSS 变量，改造成本可控）。
- **工时**：中，4-6h。

### D2. 🟡 新用户空状态无引导
登录后 Overview 全是 ¥0，无 onboarding。
- **修复**：空数据时公式卡/概览显示引导 CTA「先添加一笔收入 →」。
- **工时**：低-中，2-3h。

### D3. 🟡 无搜索 / 过滤
条目超 10 条后难找。各管理页加搜索框。
- **工时**：低，2h。

### D4. 🟡 改发薪日无影响提示
改发薪日会重算所有历史周期，无警告。
- **修复**：保存前提示「将影响历史周期划分」。
- **工时**：低，0.5h。

### D5. 🟢 货币硬编码 ¥
`formatYen` 遍布全代码。目标用户在日本可接受，但属技术债。
- **修复**：抽 `formatMoney(amount, currency)`，配置项默认 JPY。
- **工时**：中（重构面广），3h。低优先。

---

## E. 性能 & 工程质量（🟠/🟡，我上次遗漏的维度）

### E1. 🟠 recharts 未懒加载
现状：`recharts` 383KB（gzip 105KB）打进首屏 bundle，但 Trends 不是落地页。
- **修复**：`React.lazy` + `Suspense` 懒加载 Trends 页，recharts 分包按需加载，首屏体积砍掉一半多。
- **工时**：低，1h。

### E2. 🟠 Stripe 计费是死功能
`stripe_subscriptions` 表 + Settings 的 tier 徽章都在，但**无 billing 路由**，无法升级。
- **修复**：二选一——(a) 实现 Stripe Checkout + webhook 真正打通付费；(b) 暂时隐藏 tier 徽章，避免误导。建议先 (b)，B1/B2 之后再 (a)。
- **工时**：(b) 0.5h / (a) 6-8h。

### E3. 🟡 Dashboard 每次全量拉取
现状：每次切页 / 操作后 `loadDashboard()` 重拉全部 8 类数据。数据量小暂不痛，但无缓存 / 增量。
- **修复**：引入 SWR / React Query 做缓存与乐观更新；或操作后局部更新 store 而非全量重拉。
- **工时**：中，4h。中优先。

### E4. 🟡 无端到端 / 组件测试
仅 calc 单测。关键流程（登录→录入→公式计算）无回归保护。
- **修复**：随 A2 一起补关键路径测试。
- **工时**：并入 A2。

---

## F. 成熟度功能（🟢 未来迭代）

| 编号 | 功能 | 对标 | 工时 |
|---|---|---|---|
| F1 | 净资产（资产−负债）视图 | Copilot / MF | 中 |
| F2 | 储蓄目标 + 进度 | YNAB | 中 |
| F3 | Web Push 提醒（账单到期 / 超支） | MF | 高（Cron 已有基础） |
| F4 | 导出家计簿 Excel / 月度 PDF | 日本本地化 | 中 |
| F5 | 数据「最后更新时间」/ 手动刷新指示 | 通用 | 低 |

---

## 7. 分阶段实施建议

### Phase 1 — 止血 & 高性价比（先做，~1.5 天）
| 项 | 工时 |
|---|---|
| A1 FOUNDER_EMAIL 修复 | 10min |
| A3 ErrorBoundary | 1h |
| C2 数字输入 inputMode | 1h |
| C3 移除采集点黑话 | 1h |
| E1 recharts 懒加载 | 1h |
| E2(b) 暂隐 tier 徽章 | 0.5h |
| B3 删除改 Toast + Undo | 3h |
| D4 改发薪日警告 | 0.5h |

> 全是低风险、高感知改动，一次发布即可肉眼可见地「更成熟」。

### Phase 2 — 安全网 & 核心功能（~3-4 天）
| 项 | 工时 |
|---|---|
| A2 多用户隔离测试 + E4 关键路径测试 | 5-6h |
| B1 一次性交易流水（新表 + 路由 + UI） | 8-12h |
| B2 支出分类统计 | 4-5h |

### Phase 3 — 体验深化（~2-3 天）
| 项 | 工时 |
|---|---|
| C1 PWA 离线（Service Worker） | 3-4h |
| D1 深色模式 | 4-6h |
| D2 空状态引导 | 2-3h |
| D3 搜索过滤 | 2h |
| A5 登录设备管理 | 3h |

### Phase 4 — 成熟度（按需）
F1-F5 + E2(a) Stripe 真打通 + E3 数据层缓存。

---

## 8. 我的建议

**立刻做 Phase 1**——8 个小项、约 1.5 天，零数据风险，但应用质感会有质的跳跃（尤其 A1 修复你自己的 pro 权限、B3 删除撤销、E1 首屏提速）。

**Phase 2 的 A2 测试不能再拖**——多用户已上线，没有隔离测试就是裸奔。B1 交易流水是产品定位的分水岭，决定它是「预算估算器」还是「记账应用」，建议你先想清楚定位再投入。

---

**审查人**：Claude (Opus 4.8)
**待批准**：Phase 1 是否现在开工？
