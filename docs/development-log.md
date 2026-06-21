# Cash Flow Pulse — 开发日志

> 记录开发过程中的决策、踩坑、迭代。

---

## v0.1 — 需求收敛（2026-06-21）

三轮需求沟通，明确核心场景。已确认决策：

1. 单用户架构，V1 不做账号系统
2. 数据存储：Cloudflare D1（免费额度充足）
3. 部署：Cloudflare Pages + Workers 全栈 TypeScript
4. 强制落点：同周期同采集点只能一条记录（`UNIQUE(user_id, cycle_id, offset_index)`）
5. 现金来源支持「锁定金额」（如 PayPay 中已充值的还款）
6. 每月固定 4 个采集点（默认 [0, 7, 14, 21] 相对发薪日偏移）
7. 信用卡扣款日判断：跨月时取月末（如 2 月没有 30 号 → 2/28）
8. 「佛系」提醒：只在应用内提示，不主动推送

**PRD 文件**：`docs/cash-flow-pulse-prd.md`

---

## v0.2 — 视觉系统升级（2026-06-21）

- 决定使用 Notion 设计系统作为视觉规范
- 发现本地 `popular-web-designs` skill 已有完整 Notion 设计 token 资料
- 完成 PRD 附录 C：完整颜色 / 字体 / 间距 / 圆角 / 阴影 / 组件样式 token
- 提供可直接复制的 CSS Variables + Tailwind Config 示例

---

## v0.3 — 核心算法 + 单测（2026-06-21）

**Commit**: `199ab1a feat(shared): 核心计算逻辑 + Zod schema + 38 个单元测试全部通过`

**产出**：
- `packages/shared/src/calc.ts` — 核心算法（250+ 行）
  - 日期工具（formatDate / parseDate / addDays / addMonths）
  - 发薪日 / 周期计算（getNextPayday / getPrevPayday / getCurrentCycle）
  - 卡片活跃判断（isCardActiveInCycle，处理跨月）
  - 仪表盘计算（computeDashboard）
  - 采集点提示（computeSnapshotPrompt）
  - 周期对比（compareCycles）
- `packages/shared/src/schema.ts` — Zod 校验（CashSource / CreditCard / Config / Snapshot / Import）
- `packages/shared/src/types.ts` — TypeScript 类型
- `packages/shared/src/calc.test.ts` — **38 个单元测试，全部通过**

**TDD 暴露的 4 个真实 bug**（写测试后才被发现）：

1. **`addMonths` 月末溢出处理错误**
   - `1/31 + 1月` 用 `setMonth(1)` 会变成 `3/3`（2 月没有 31 号，Date 自动滚动）
   - 原代码用 `setDate(0)` 取「上个月最后一天」→ 取错了月
   - **修复**：先 `setDate(1)` 锁月初，再 `setMonth`，最后 `setDate(min(targetDay, lastDay))`

2. **`getPaydayInMonth` 月份归零陷阱**
   - 跨年调用 `getPaydayInMonth(2026, 12, 10)` 时，`new Date(2026, 12, 10)` → `2027/01/10`
   - 原代码用 `getMonth() !== 12` 判断溢出 → 但实际月份变成 0（1 月）而非 12
   - **修复**：增加 `normalizeYearMonth` 辅助函数正确处理 month > 11 跨年

3. **`isCardActiveInCycle` 边界判断**
   - 卡 `due_day=5`，周期 [6/10, 7/10)：6/5 在周期起点前，**7/5 才是本周期扣款**
   - 原代码只在「周期起点月」找扣款日，漏掉了「跨月到下个扣款日」的情况
   - **修复**：分别在周期起点月和终点月各查一次扣款日

4. **`computeSnapshotPrompt` 触发窗口**
   - 原设计「±1 天」窗口 → 6/11（offset 1）会误触发 offset 0 提示
   - **修复**：改为「采集点当天 + 补录窗口 +1 天」（不往前提示，避免发薪日前几天打扰）

---

## v0.4 — Workers API 后端（2026-06-21）

**Commit**: `a0342ea feat(api): Workers + D1 后端`

**产出**：
- `apps/api/src/db/schema.sql` — D1 表结构（user_config / cash_sources / credit_cards / snapshots）
- 6 个路由模块，15 个 API 端点：
  - `/api/config` GET/PUT
  - `/api/cash` CRUD（带 UNIQUE 冲突返回 409）
  - `/api/cards` CRUD
  - `/api/snapshots` 列表（支持周期过滤）+ 录入（detectUnchanged 逻辑）+ 更新备注 + 删除
  - `/api/dashboard` 一站式接口（并行查询 + 实时计算）
  - `/api/export` JSON + CSV（快照）
  - `/api/import` JSON（merge/overwrite 模式）

**关键技术决策**：
- 用 Hono 作为路由框架（轻量 + TS 类型友好）
- D1 + Zod 双重校验
- `generateId()` 用 `crypto.randomUUID()`（Workers 原生）
- dashboard 端点用 `Promise.all` 并行查询

---

## v0.5 — 完整前端实现（2026-06-21）

**Commit**: `7067d64 feat(web): 完整前端实现`

**产出**：
- `apps/web/` Vite + React 18 + TypeScript + Tailwind + Notion 设计 token
- 5 个核心组件：Money / Card / Modal / States / CashForm / CardForm
- 3 个页面：Home（仪表盘） / Trends（趋势曲线） / Settings（设置 + 导入导出）
- Zustand 全局状态管理
- Vite proxy 把 `/api` 转发到 `http://localhost:8787`

**关键设计选择**：
- 移动优先布局（手机 ≥ 桌面体验）
- 数字统一用等宽数字（`font-feature-settings: 'tnum', 'lnum'`）避免抖动
- 暖中性色 + 耳语边框（按 Notion 设计 token）
- 响应式：桌面用顶部导航，移动端用底部 Tab

---

## v0.8 — 4 类定期事件卡片（v0.3 完整实现）（2026-06-21）

**Commits**:
- `f6b39db feat(shared): v0.3 Phase 1 完成 - 4 类定期事件类型 + Zod schema + computeDashboardV2 + 20 个新测试（共 58 个全部通过）`
- `23ce7f5 feat(api): v0.3 Phase 2 完成 - 4 张新表 schema + 16 个 CRUD 端点 + dashboard V2 + export/import v2`
- `321ec44 feat(web): v0.3 Phase 3 核心完成 - 4 表单 + Store + Home 主页大改`

**目标**：把 PRD v0.3 的 4 类新卡片（投资/账单/收入/订阅）+ V2 算法落地。

**4 类新资源**：
| 卡片 | 字段 | 算法 |
|------|------|------|
| 固定投资 | name, amount, frequency(daily/weekly/monthly/yearly), start_date, end_date | 按频率算本期内发生次数 |
| 固定账单 | name, amount, due_day | 与信用卡同算法（isDayActiveInCycle） |
| 固定收入 | name, amount, frequency(monthly/weekly), pay_day / day_of_week | 遍历周期内所有到账日 |
| 订阅 | name, amount, billing_day, billing_cycle(monthly/yearly) | 与账单同算法 |

**V2 算法（向后兼容）**：
- 新公式：`净可用 = 总净现金 + (总收入 - 总支出)`
- 总支出 = 信用卡 + 账单 + 订阅 + 投资本期内累计
- 总收入 = 所有收入项本期内到账日金额
- 无新数据时退化为 V1 公式
- TDD 抓到 2 个 bug：addMonths 月末溢出、getPaydayInMonth 月份归零陷阱

**4 张新表**：
```sql
recurring_investments  -- frequency: daily/weekly/monthly/yearly
recurring_bills        -- due_day 1-31
recurring_incomes      -- frequency + pay_day OR day_of_week（CHECK 约束）
subscriptions         -- billing_day + billing_cycle
```

**16 个新 API 端点**：
- `/api/{investments,bills,incomes,subscriptions}` × CRUD
- Dashboard 升级：并行查询 8 张表 + V2 算法
- Export/Import v2：version 升级到 2，ImportPayloadSchema 兼容 v1/v2

**前端大改造**：
- Store：加 4 类资源 actions + V2 dashboard 类型
- 4 个表单组件：InvestmentForm (4 频率单选) / BillForm / IncomeForm (月/周切换) / SubscriptionForm (月/年 + 分类)
- Icon 扩展 8 个：investment/bill/income/subscription/chevron-down/right/calendar/trending-up
- Home 主页完全重写：
  - 摘要卡新增"本期支出（含订阅）/ 本期收入"两行（可点击展开）
  - "本期支出明细 / 本期收入明细"两张可折叠汇总卡（按 4 类分组）
  - 4 张新资源卡：固定投资 / 固定账单 / 固定收入 / 订阅
  - 每个卡支持新增/编辑/删除模态
- 设置页导出/导入自动适配 v2

**端到端验证**：
- ✅ 58/58 单元测试通过
- ✅ API/Web TS 编译 0 错误
- ✅ 真实数据测试：现金 ¥60,000 + 信用卡 ¥30,000 + 房租 ¥80,000 + Netflix/Spotify + 每日投资 ¥100 + 工资/副业 ¥320,000
- ✅ 计算正确：净可用 ¥238,100 → 日均 ¥12,531/日（vs V1 公式的 ¥105/日，差距 100 倍）
- ✅ 浏览器视觉验证：8 张卡都渲染，hero 大字醒目，折叠卡片工作正常，模态表单可用

---

## v0.7 — 全面去除 emoji（2026-06-21）

**Commit**: `040d98c feat(web): 全面替换 emoji 为 Lucide icon`

**目标**：项目里 19 个 emoji（💰 📈 ⚙️ 💵 💳 📊 ⚠️ ✨ 🔒 📍 ✎ 📤 📥 等）替换成 Lucide icon，更克制更专业。

**为什么选 Lucide**（对比 5 个候选库）：
- ✅ Notion 风适配度 ★★★★★（2px stroke + 圆角端点 = Notion 设计哲学的视觉延伸）
- ✅ bundle 最友好（每个 icon 独立 ESM，20 个 icon 共 ~14KB）
- ✅ React 集成最干净（`lucide-react`，TypeScript 类型完整）
- ✅ 覆盖度 100%（19/19 所需 icon 全有）
- ❌ 淘汰 Heroicons（数量少），Phosphor（多 weight 但本项目用不上），Tabler（工业感太强），Iconify（运行时拉取）

**实施**：
- 新增 `apps/web/src/components/Icon.tsx` 统一 Icon 组件
  - `IconName` union type 限定 19 个图标名称，typo 编译期就拦
  - `forwardRef` 兼容未来 Headless UI 集成
  - 默认 `strokeWidth={1.75}`（比 Lucide 默认 2 略细，配合 Notion 1px 边框）
- 改造的文件：
  - `App.tsx` — 顶栏 logo / 移动端 Tab / 错误页
  - `pages/Home.tsx` — 摘要卡片标题、采集点提示条（带圆形背景）、现金/信用卡列表（编辑/删除 icon 按钮）
  - `pages/Trends.tsx` — 标题 chart icon / 录入快照 plus icon / 空状态 icon
  - `pages/Settings.tsx` — 设置齿轮 / 导出/导入按钮 / 清空警告 icon / 已保存 check icon
  - `components/States.tsx` — EmptyState 加 16x16 圆形浅背景（Notion 风格）
  - `components/Card.tsx` — title 类型从 `string` 扩展到 `ReactNode`

**关键设计决策**：
- 颜色继承靠 `currentColor`：icon 永远不传 `color`/`fill`，颜色完全由父元素 `text-*` Tailwind 类控制
- 空状态大图标套 `bg-notion-bg-alt` 圆形背景（Notion 标志性手法）
- 移动端 Tab active 态用 `strokeWidth={2}` 视觉加重，inactive 用 1.75

**验证**：
- TypeScript 编译 0 错误
- Vite 构建成功（2609 modules，bundle 667KB / gzip 188KB，+14KB 来自 Lucide）
- 38 个单元测试仍然全过（核心算法没动）
- 浏览器端到端验证：主页 / 趋势 / 设置三页 icon 都正确渲染

**视觉对比**：
- 之前：emoji 大小不可控、颜色不可控、跨平台不一致
- 现在：strokeWidth / size / color 完全可控，统一 1.75 stroke 与 Notion 1px 边框形成视觉节奏

---

## v0.6 — 端到端验证（2026-06-21）

**测试场景**：

1. ✅ Workers dev server 启动（port 8787）
2. ✅ D1 本地 schema 初始化成功
3. ✅ `/api/health` 返回 ok
4. ✅ `/api/dashboard` 正确返回（无数据时返回空数组 + 周期元数据）
5. ✅ POST `/api/cash` 添加 PayPay ¥50,000 / 钱包 ¥10,000
6. ✅ POST `/api/cards` 添加 乐天卡 6/25 扣款 ¥28,000
7. ✅ dashboard 重新计算：
   - total_balance = 60,000
   - total_locked = 30,000
   - total_net_cash = 30,000
   - 活跃卡应还 = 28,000
   - **net_available = 2,000**
   - **daily_budget = 2,000 ÷ 19 = ¥105 / 日** ✓
8. ✅ POST `/api/snapshots` 录入快照
9. ✅ 强制落点：同周期同 offset 第二次 POST 返回 `updated:true`，DB 仍只有 1 条记录
10. ✅ Vite 前端启动（port 5173），proxy 工作正常
11. ✅ 浏览器渲染：Hero ¥105/日 + 摘要卡片 + 现金来源列表 + 信用卡列表
12. ✅ 模态框表单可交互（添加银行活期 ¥100,000 → 日均预算 ¥105 → ¥5,368）✓
13. ✅ 双 Y 轴趋势图渲染（蓝柱 + 橙线）

**零 JS 错误**，仅 React Router v7 警告（不影响功能）。

---

## 后续待办（不在 V0 范围内）

- [ ] 代码分割（当前 bundle 653KB，可降至 ~300KB）
- [ ] PWA 支持（添加到主屏）
- [ ] 多用户系统（迁移成本评估）
- [ ] 月度报告导出 PDF
- [ ] 银行账单 CSV 导入

---

## 项目结构

```
cash-flow-pulse/
├── docs/
│   ├── cash-flow-pulse-prd.md        # 839 行 PRD + Notion 设计系统
│   └── development-log.md             # 本文件
├── packages/shared/                    # 核心算法 + 类型
│   └── src/{calc,types,schema,calc.test}.ts
├── apps/api/                           # Workers + D1 后端
│   ├── src/{index.ts, lib/, db/schema.sql, routes/*}
│   └── wrangler.toml
├── apps/web/                           # React + Vite 前端
│   ├── src/{main.tsx, App.tsx, index.css, lib/, components/, pages/*}
│   └── {package.json, vite.config.ts, tailwind.config.js, postcss.config.js, index.html}
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

## 性能 & 容量评估（Cloudflare 免费额度）

| 资源 | 免费额度 | 预期使用 | 余量 |
|------|---------|---------|------|
| Workers 请求 | 10 万次/日 | < 100 次/日 | 充足 |
| D1 读取 | 500 万次/日 | < 100 次/日 | 充足 |
| D1 写入 | 10 万次/日 | < 10 次/日 | 充足 |
| D1 存储 | 5 GB | < 1 MB/年 | 充足 |
| Pages 构建 | 500 次/月 | < 10 次/月 | 充足 |

**结论**：单用户场景下，免费额度绰绰有余。

## Git 提交历史

```
7067d64 feat(web): 完整前端实现 - 主页仪表盘/趋势曲线/设置 + Notion 设计系统
a0342ea feat(api): Workers + D1 后端 - 完整 CRUD + dashboard 一站式接口 + 导入导出
199ab1a feat(shared): 核心计算逻辑 + Zod schema + 38 个单元测试全部通过
a064f0f docs: PRD v0.2 - 升级到 Notion 设计系统，新增附录 C
fa5c046 docs: 初始化 PRD v0.1 + 开发日志
```