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
- `f82e8c7 fix(calc): 账单/订阅明细改用「下一次扣款日」视角`

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

### v0.8.1 — 账单/订阅明细"下一次扣款日"修复

**Commit**: `f82e8c7 fix(calc): 账单/订阅明细改用「下一次扣款日」视角`

**问题**：用户报告"我添加了健身房 (due_day=14)，为什么在本期支出明细中没有显示"。

**根因**：
- 今天 6/21，本期 = [6/21, 7/10)
- 健身房 due_day=14
- 旧算法 `isDayActiveInCycle`：6/14 < 6/21 不通过，7/14 > 7/10 不通过 → 判定"不活跃"
- 结果：健身房永远不在明细里展示（虽然 7/14 是真实的"下一次扣款日"）

**修复方案**（用户选择方案 B：保持当前 net_flow 算法，只改明细展示）：
- 新增 `nextOccurrence(today, day)` 函数：找指定日期之后的下一次 day-of-month 扣款日
- computeDashboardV2 账单/订阅明细：不再严格匹配本期内，显示所有距今 ≤ 60 天的扣款
- 区分两种状态：
  - **`in_current_cycle: true`** → 计入 net_flow / total_bills / total_subscriptions
  - **`in_current_cycle: false`** → 不计入公式，但**仍展示**在明细里
- 前端 ExpenseRow：不在期内的项目用**灰色**显示 + 末尾标注**「下期扣款」**

**TDD 抓到隐藏 bug**：
- 旧代码订阅循环里 `totalSubs += sub.amount` 写了两次（inCycle 分支一次，push 时又一次）
- 测试 "有订阅时影响日均预算" 失败：期望 ¥31,490，实际 ¥32,980（多算了 1 个 ¥1,490 的 Netflix）
- 修复：删除 push 时的重复累加

**新增测试**（v0.8.1）：
- `'账单 due_day=14 在本周期区间外也能显示（健身房场景）'` —— 验证健身房能出现在明细且 in_current_cycle=false

**最终测试结果**：
- ✅ 59/59 单元测试通过（含 1 个新增健身房场景）
- ✅ API/Web TS 编译 0 错误

**实测**（用户数据）：
```
📄 固定账单  ¥60,000
   房租         2026-06-27 · 6 天后  ¥   60,000
   健身房        2026-07-14 · 23 天后  ¥    7,370  [下期扣款]

日均预算: ¥3,104 / 日
```
- 健身房 ✅ 显示
- 健身房 ✅ 不计入 total_bills（¥60,000 不含健身房）
- 健身房 ✅ 不影响日均预算（¥3,104/日 不变）
- 视觉 ✅ 灰色 + "下期扣款" 标记

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

## v0.9 — 生产部署（2026-06-21）

**Commit**: 见 git log（本节操作在 v0.8.1 基础上追加）

**最终生产 URL**：
- 前端：**https://cash-flow-pulse.pages.dev**
- API：**https://cash-flow-pulse-api.sonic980828.workers.dev**
- D1：`cash-flow-pulse-db`（region APAC，colo KIX）

**部署架构（B 方案临时版）**：
```
浏览器 → cash-flow-pulse.pages.dev (Vite build + manualChunks 拆分)
       → VITE_API_BASE env 注入完整 URL
       → cash-flow-pulse-api.sonic980828.workers.dev/api/*
       → Hono + D1
```

**部署过程踩坑**：
1. ❌ `scripts/deploy.sh` 卡在 D1 id 解析（ANSI 颜色码 + 多行格式让 regex 没匹配上）
   - 修复：手动提取 `222e5633-5a2c-4af7-8efb-dbb0f7d5d6b5` 写到 wrangler.toml
2. ❌ Pages 首次 deploy 报错「Project not found」
   - 修复：先 `wrangler pages project create cash-flow-pulse`
3. ❌ soniclab-router 部署失败：`cash.soniclab.cc/*` 路由已被 soniclab-homepage 占用
   - **绕过方案**：暂用 pages.dev + workers.dev 默认域名，不绑 soniclab.cc
   - 关键改动：前端 `src/lib/api.ts` 改读 `import.meta.env.VITE_API_BASE`（fallback `/api`）
   - 新增 `apps/web/.env.production` 写入 API URL
   - 新增 `apps/web/.env.development` 显式声明 dev 用 `/api`
4. ✅ Pages re-deploy（手动触发）→ 增量上传 → 新 chunk hash → URL 注入验证通过

**端到端验证**：
- ✅ Pages 主域 200
- ✅ 前端 JS bundle 含 `cash-flow-pulse-api.sonic980828.workers.dev/api` 字符串
- ✅ API `/api/health` 返回 ok
- ✅ API `/api/config` 读 D1 成功（pay_day=10, snapshot_offsets=[0,7,14,21]）
- ✅ API POST `/api/cash` 写入 D1 成功（テスト銀行 ¥50,000）
- ✅ CORS 验证：请求 origin `cash-flow-pulse.pages.dev` → API 返回 `Access-Control-Allow-Origin` 头（生产域名在 ALLOWED_ORIGIN 白名单内）

**生产 bundle 体积**（manualChunks 拆分后）：
| chunk | raw | gzip |
|------|------|------|
| `index.js` (app) | 116KB | 27KB |
| `react.js` (vendor) | 164KB | 53KB |
| `recharts.js` (vendor) | 406KB | 110KB |
| `icons.js` | 14KB | 3KB |
| `index.css` | 18KB | 4KB |
| 主页首屏（含 react + icons + app + css） | — | **~84KB gzip** |
| Trends 页再加 recharts | — | ~194KB gzip（懒加载） |

**待办**（v1.0+）：
- [ ] soniclab.cc 路由冲突解决（Dashboard 手动删旧路由后再绑 cash.soniclab.cc）
- [ ] `scripts/deploy.sh` 修 D1 id 解析（用 ANSI-stripped grep 或 sed）
- [ ] CI 自动化（GitHub Actions：push main → 跑 test + 部署 Pages/Workers）
- [ ] D1 自动备份（cron 触发 `wrangler d1 export`）

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
f82e8c7 fix(calc): 账单/订阅明细改用「下一次扣款日」视角
2e42fb6 docs: 开发日志 v0.8 - 记录 v0.3 完整实现（Phase 1+2+3）
321ec44 feat(web): v0.3 Phase 3 核心完成 - 4 表单 + Store + Home 主页大改
23ce7f5 feat(api): v0.3 Phase 2 完成 - 4 张新表 schema + 16 个 CRUD 端点 + dashboard V2 + export/import v2
f6b39db feat(shared): v0.3 Phase 1 完成 - 4 类定期事件类型 + Zod schema + computeDashboardV2 + 20 个新测试（共 58 个全部通过）
8104318 docs: 拆分设计系统 - PRD 1238→990 行 + design-system-notion.md 独立成文
2112573 docs: 开发日志 v0.7 记录 icon 改造
040d98c feat(web): 全面替换 emoji 为 Lucide icon - 19 个图标统一管理 + strokeWidth 1.75 + currentColor 颜色继承
0314b51 fix: pnpm-workspace.yaml 配置 onlyBuiltDependencies（修复 dev 启动报错）
46b3f8d docs: 更新开发日志(v0.6 端到端验证) + 部署指南 + README
7067d64 feat(web): 完整前端实现 - 主页仪表盘/趋势曲线/设置 + Notion 设计系统
a0342ea feat(api): Workers + D1 后端 - 完整 CRUD + dashboard 一站式接口 + 导入导出
199ab1a feat(shared): 核心计算逻辑 + Zod schema + 38 个单元测试全部通过
a064f0f docs: PRD v0.2 - 升级到 Notion 设计系统，新增附录 C
fa5c046 docs: 初始化 PRD v0.1 + 开发日志
```

---

## 项目当前状态速查（2026-06-21）

**版本**：v0.8.1 — 4 类定期事件卡片完整实现 + 健身房 bugfix

**位置**：`~/Desktop/网页项目/apps/cash-flow-pulse/`

**技术栈**：
- 前端：React 18 + Vite + TypeScript + TailwindCSS + Zustand + Recharts + Lucide icon
- 后端：Cloudflare Workers + Hono + D1 (SQLite)
- 设计：完全照搬 Notion 设计系统（详见 `docs/design-system-notion.md`）
- 部署：Cloudflare Pages（前端）+ Workers（API）+ D1（数据库），全部免费额度内

**Monorepo 结构**：
- `packages/shared/` — 核心算法 + Zod schema（前后端共用）
  - `src/calc.ts` — 周期计算、V1/V2 dashboard、4 类定期事件算法
  - `src/schema.ts` — Zod 校验（10 个 schema）
  - `src/calc.test.ts` — **59 个单元测试，全部通过**
- `apps/api/` — Workers + D1 后端
  - `src/db/schema.sql` — 8 张表
  - `src/routes/` — 19 个 API 端点（config/cash/cards/snapshots/investments/bills/incomes/subscriptions + dashboard/export-import）
- `apps/web/` — React 前端
  - `src/components/Icon.tsx` — 28 个 Lucide icon 包装（v0.7 加入）
  - `src/components/{Money,Card,Modal,States,CashForm,CardForm,InvestmentForm,BillForm,IncomeForm,SubscriptionForm}.tsx`
  - `src/pages/{Home,Trends,Settings}.tsx`

**V2 算法（向后兼容）**：
```
本期总支出 = Σ信用卡应还 + Σ订阅(本期) + Σ账单(本期) + Σ投资本期内累计
本期总收入 = Σ所有收入本期内到账日
净流入 = 总收入 - 总支出
净可用 = 总净现金 + 净流入
日均预算 = max(0, 净可用 ÷ 距下个发薪日天数)
```

**v0.8.1 关键决策**（新会话必读）：
- 账单/订阅**明细展示**：用 `nextOccurrence()` 找下一次扣款日，距今 ≤ 60 天都显示
- 账单/订阅**net_flow 计算**：仍用 `[今天, 下次发薪日)` 严格匹配
- 不在期内的项目：`in_current_cycle: false`，前端灰色 + "下期扣款" 标记
- 净现金 = Σ余额 - Σ锁定
- 投资的"本期内次数"用 ceil(totalDays / intervalDays)（区间 [start, end) 不含 end）

**启动 dev**：
```bash
cd ~/Desktop/网页项目/apps/cash-flow-pulse
pnpm dev  # 并行启动 api(8787) + web(5173)
```
（或分别 `pnpm dev:api` / `pnpm dev:web`）

**部署**：详见 `docs/deployment.md`，3 步：
1. `wrangler d1 create cash-flow-pulse-db` → 填入 `database_id`
2. `wrangler d1 execute ... --file=./src/db/schema.sql --remote`
3. `pnpm deploy:api` + Pages 配置 build output 为 `apps/web/dist`

**数据库**：本地 D1 存储在 `apps/api/.wrangler/state/v3/d1/`，部署到 Cloudflare 才会用真实 D1。

**用户当前真实数据**（截至 v0.8.1）：
- 3 个现金来源：PayPay (¥5,854 余额) + 钱包 (¥80,000) + 三菱銀行 (¥209,217)
- 3 张信用卡：乐天信用卡 ¥30,000 + paypay信用卡 ¥112,831 + paidy ¥3,467
- 1 个固定投资：美股指数 ¥1,568/天
- 2 个固定账单：房租 (¥60,000/月 27 号) + 健身房 (¥7,370/月 14 号 — 下期扣款)
- 2 个固定收入：工资 ¥300,000/月 10 号 + 副业 ¥10,000/月 10 号
- 0 个订阅
- 当前日均预算：¥3,104/日