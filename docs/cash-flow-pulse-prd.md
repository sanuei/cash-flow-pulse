# Cash Flow Pulse — 产品需求文档 (PRD)

> **版本**：v0.1 (草案)
> **更新日期**：2026-06-21
> **作者**：SonicLab
> **状态**：需求已收敛，待技术评审后进入开发

---

## 1. 项目概述

### 1.1 一句话定义
**Cash Flow Pulse** 是一个个人现金流可视化工具，帮助用户在一个发薪周期内实时了解「日均可用预算」，并通过月度快照曲线观察自己的现金流健康度。

### 1.2 解决什么问题
- 工资到手后，多张信用卡 / 多个支付账户（PayPay、钱包现金、银行）混在一起，**难以快速判断「今天起每天能花多少才能撑到下个发薪日」**。
- 没有消费记账的负担，但需要一个**低频、可视化的现金流健康度趋势**，辅助长期消费习惯复盘。

### 1.3 目标用户
- **主用户**：在日本生活的工薪族，多卡多账户（PayPay + 钱包 + 银行 + 信用卡）。
- **典型场景**：每月发薪日盘点一次，月中偶尔看一下还能花多少，月底做一次回顾。
- **使用设备**：移动端为主（iPhone Safari / Android Chrome），桌面端作为深度回顾。

### 1.4 非目标（明确不做）
- ❌ 不做消费记账/账单导入。
- ❌ 不做银行 / PayPay API 自动同步（隐私 + 免费额度限制）。
- ❌ 不做多用户系统 / 账号体系（V1 单用户单设备，如需多设备走数据导出/导入）。
- ❌ 不做预算分类（餐饮/交通/娱乐等）。
- ❌ 不做货币转换（V1 仅支持日元单一货币，单位 ¥）。

---

## 2. 核心概念

### 2.1 术语表

| 术语 | 定义 |
|------|------|
| **现金来源 (CashSource)** | 用户持有的可支配资金账户，如 PayPay、钱包现金、银行活期 |
| **锁定金额 (Locked Amount)** | 现金来源中「名义在你账上、但实际是过路钱」的部分（如用于还信用卡的充值） |
| **净现金 (Net Cash)** | 单个来源的 `余额 - 锁定金额` |
| **总净现金 (Total Net Cash)** | 所有现金来源的 `净现金` 之和 |
| **信用卡 (CreditCard)** | 待还款的信用卡账单，每张卡有独立的扣款日 |
| **活跃信用卡 (Active Card)** | 「下一个扣款日」在当前发薪周期内的卡（即本期需要还的） |
| **本期应还 (Period Due)** | 所有活跃信用卡的账单金额之和 |
| **净可用现金 (Net Available)** | `总净现金 - 本期应还`（这就是用户真正能花的） |
| **日均预算 (Daily Budget)** | `净可用现金 ÷ 距下个发薪日的天数` |
| **发薪周期 (Pay Cycle)** | 两次发薪日之间的时间段 |
| **采集点 (Snapshot Point)** | 每个发薪周期内的固定采样时刻（默认 4 个） |

### 2.2 关键公式

```
净可用现金 = Σ(现金来源.余额 - 现金来源.锁定金额) - Σ(活跃信用卡.账单金额)
日均预算   = 净可用现金 ÷ 距下个发薪日的天数
```

---

## 3. 核心功能

### 3.1 配置管理

#### 3.1.1 发薪日配置
- 字段：`payDay`（1-31 的整数）
- 默认值：10
- 校验：1-31，超出范围报错
- 业务规则：
  - 若当月没有这一天（如 2 月没有 30 号），按当月最后一天处理
  - 「下一个发薪日」= `如果今天 <= 本月payDay → 本月payDay，否则 → 下月payDay`

#### 3.1.2 采集点配置
- 字段：`snapshotOffsets`（相对于发薪日的天数偏移数组）
- 默认值：`[0, 7, 14, 21]`
- 校验：升序、范围 0-30、不超过发薪周期长度
- UI：用户可增删改，自动校验合理性

#### 3.1.3 现金来源管理
- 字段：
  - `id` (UUID)
  - `name` (string, 必填, 唯一)
  - `balance` (number, 必填, ≥ 0)
  - `lockedAmount` (number, 必填, ≥ 0, ≤ balance)
  - `createdAt` (timestamp)
  - `updatedAt` (timestamp)
- 操作：新增 / 编辑 / 删除 / 列表
- 预置示例：「钱包现金」「PayPay」「银行活期」（首次进入可一键导入，非强制）

#### 3.1.4 信用卡管理
- 字段：
  - `id` (UUID)
  - `name` (string, 必填)
  - `statementAmount` (number, 必填, ≥ 0)
  - `dueDay` (number, 必填, 1-31)
  - `createdAt` (timestamp)
  - `updatedAt` (timestamp)
- 操作：新增 / 编辑 / 删除 / 列表
- 「是否活跃」由 `dueDay` 与当前发薪周期的关系动态计算，不持久化

### 3.2 主页 — 实时仪表盘

#### 3.2.1 Hero 区（大字号）
- **日均预算**（最大字号）：如 `¥4,500 / 日`
- 副标题：距离下个发薪日还剩 **N 天**
- 视觉：数字动态滚动效果，进入页面时数字递增动画

#### 3.2.2 摘要卡片
- 现金来源总数：¥XX,XXX（点击展开明细）
- 锁定金额：¥X,XXX（灰色显示）
- 活跃信用卡应还：¥XX,XXX（橙色预警）
- 净可用现金：¥XX,XXX（大字号高亮）

#### 3.2.3 现金来源明细（可折叠列表）
- 每行：来源名 / 余额 / 锁定金额 / 净现金 / 编辑入口
- 支持快速调整余额（数字 + 增减按钮）

#### 3.2.4 信用卡明细（可折叠列表）
- 每行：卡名 / 账单金额 / 扣款日 / 「距扣款 N 天」标签
- 未还的卡：橙色高亮
- 已还的卡：灰色 + 「已扣款 ✓」标记

#### 3.2.5 当前采集点提示
- 当今天落在某个采集点 ±1 天内时，顶部出现提示条：
  > 「今天到了第 X 个采集点（第 N/4 周），要录入快照吗？」
- 点击直达「快照录入」弹窗
- 用户可忽略，下次进入仍提示

### 3.3 快照录入

#### 3.3.1 触发方式
- 主页提示条点击
- 「历史曲线」页手动录入按钮

#### 3.3.2 录入方式
- **方式 A（默认）**：从当前现金来源和信用卡实时数据生成快照，用户确认即可
- **方式 B**：手动调整后保存（允许覆盖）
- 录入内容：
  - 自动生成：日期、净可用现金、日均预算（基于录入时刻的现金和信用卡状态）
  - 可选：备注（如「发薪日当天」「月中盘点」）

#### 3.3.3 强制落点逻辑（用户明确要求）
> 「不管数据有没有更新，到点了也要加一个点。」

- 即便用户连续两次录入的数据完全相同，也生成两条独立记录（`createdAt` 不同）
- 曲线图上显示所有点，允许「数据未变」的点用灰色标记，区别于「有变动」的彩色点

### 3.4 历史曲线页

#### 3.4.1 双 Y 轴图表
- **X 轴**：时间（按采集点顺序排列）
- **左 Y 轴**：净可用现金（¥，柱状图 + 折线）
- **右 Y 轴**：日均预算（¥/日，折线）
- **颜色编码**：
  - 净可用现金：主色调（如深蓝）
  - 日均预算：辅色调（如暖橙）
  - 「数据未变」点：浅灰

#### 3.4.2 时间筛选
- 默认显示最近 6 个发薪周期
- 可切换：最近 3 个 / 6 个 / 12 个 / 全部

#### 3.4.3 周期对比
- 选择两个周期并排对比
- 显示差额和百分比变化

#### 3.4.4 快照列表
- 表格视图：日期 / 净可用现金 / 日均预算 / 备注 / 操作
- 支持编辑备注、删除快照

### 3.5 设置页

#### 5.5.1 基本设置
- 发薪日调整
- 采集点偏移调整
- 货币符号（V1 固定 ¥）

#### 3.5.2 数据管理
- **导出**：
  - 导出 JSON（完整数据，可重新导入）
  - 导出 CSV（快照表格，方便 Excel 处理）
- **导入**：
  - 导入 JSON（覆盖或合并，二选一）
- **清空**：
  - 一键清空所有数据（双重确认）

#### 3.5.3 关于
- 版本号
- 隐私声明（强调：所有数据仅存储在你的 Cloudflare D1 中，不上传任何第三方）
- 开源协议

---

## 4. 数据模型

### 4.1 D1 Schema (SQL)

```sql
-- 用户配置表（单用户，V1 固定 user_id = 'default'）
CREATE TABLE user_config (
  user_id        TEXT PRIMARY KEY DEFAULT 'default',
  pay_day        INTEGER NOT NULL DEFAULT 10
                   CHECK (pay_day >= 1 AND pay_day <= 31),
  snapshot_offsets TEXT NOT NULL DEFAULT '[0,7,14,21]',  -- JSON 数组
  created_at     INTEGER NOT NULL,  -- Unix ms
  updated_at     INTEGER NOT NULL
);

-- 现金来源表
CREATE TABLE cash_sources (
  id            TEXT PRIMARY KEY,           -- UUID
  user_id       TEXT NOT NULL DEFAULT 'default',
  name          TEXT NOT NULL,
  balance       REAL NOT NULL DEFAULT 0
                  CHECK (balance >= 0),
  locked_amount REAL NOT NULL DEFAULT 0
                  CHECK (locked_amount >= 0 AND locked_amount <= balance),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE(user_id, name)
);

-- 信用卡表
CREATE TABLE credit_cards (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL DEFAULT 'default',
  name             TEXT NOT NULL,
  statement_amount REAL NOT NULL DEFAULT 0
                     CHECK (statement_amount >= 0),
  due_day          INTEGER NOT NULL
                     CHECK (due_day >= 1 AND due_day <= 31),
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

-- 快照表（核心：曲线数据源）
CREATE TABLE snapshots (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL DEFAULT 'default',
  cycle_id        TEXT NOT NULL,           -- 格式: 'YYYY-MM'，如 '2026-06'
  offset_index    INTEGER NOT NULL,        -- 0-3，对应 4 个采集点
  snapshot_date   TEXT NOT NULL,           -- YYYY-MM-DD
  total_balance   REAL NOT NULL,           -- 录入时的总余额
  total_locked    REAL NOT NULL,
  total_due       REAL NOT NULL,           -- 活跃信用卡应还
  net_available   REAL NOT NULL,           -- total_balance - total_locked - total_due
  daily_budget    REAL NOT NULL,           -- net_available / daysToNextPay
  days_to_payday  INTEGER NOT NULL,
  note            TEXT,
  data_unchanged  INTEGER NOT NULL DEFAULT 0,  -- 与上一采集点对比，1=无变化
  created_at      INTEGER NOT NULL,
  UNIQUE(user_id, cycle_id, offset_index)  -- 同周期同点位只保留一条
);

-- 索引
CREATE INDEX idx_snapshots_cycle ON snapshots(user_id, cycle_id);
CREATE INDEX idx_snapshots_date ON snapshots(user_id, snapshot_date);
CREATE INDEX idx_cash_user ON cash_sources(user_id);
CREATE INDEX idx_cards_user ON credit_cards(user_id);
```

### 4.2 周期计算逻辑

```javascript
// 获取下一个发薪日
function getNextPayday(today, payDay) {
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), payDay);
  // 边界：当月没有这一天则取月末
  if (thisMonth.getMonth() !== today.getMonth()) {
    thisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  }
  return today <= thisMonth ? thisMonth : addMonths(thisMonth, 1);
}

// 距离下个发薪日天数
function daysToNextPayday(today, payDay) {
  const next = getNextPayday(today, payDay);
  return Math.ceil((next - today) / 86400000);
}

// 卡片是否活跃（本期需还）
function isCardActive(card, today, payDay) {
  const nextPayday = getNextPayday(today, payDay);
  const prevPayday = subtractMonths(nextPayday, 1);
  const dueDateThisCycle = new Date(prevPayday.getFullYear(), prevPayday.getMonth(), card.dueDay);
  // 简化逻辑：扣款日落在 [prevPayday, nextPayday) 区间内 → 活跃
  return dueDateThisCycle >= prevPayday && dueDateThisCycle < nextPayday;
}
```

---

## 5. 界面设计

### 5.1 设计原则
- **移动优先**：核心交互在小屏（375px 宽）完成
- **大数字、清晰层级**：日均预算是绝对主角
- **少即是多**：避免复杂控件，必要时用「长按」「滑动」手势
- **响应式断点**：
  - 移动端：`max-width: 640px`（单列）
  - 平板：`641px - 1024px`（两列）
  - 桌面：`> 1024px`（三列 + 侧边栏）

### 5.2 视觉风格
- **配色**：
  - 主色：`#1E40AF`（深蓝，象征稳定）
  - 辅色：`#F59E0B`（暖橙，用于预算）
  - 警示：`#DC2626`（信用卡应还）
  - 中性：`#6B7280`、`#E5E7EB`
- **字体**：
  - 数字：`Inter` 或 `SF Pro Display`（等宽数字，避免抖动）
  - 中文：`PingFang SC` / `Microsoft YaHei`
- **风格参考**：Linear、Notion、Monzo 银行 App

### 5.3 页面结构

```
┌─────────────────────────────┐
│  ☰  Cash Flow Pulse     ⚙  │  ← 顶栏
├─────────────────────────────┤
│                             │
│   ¥4,500 / 日              │  ← Hero（最大字号）
│   距下个发薪日还有 19 天    │
│                             │
├─────────────────────────────┤
│  💰 现金来源     ¥52,000   │
│  🔒 锁定金额     -¥8,000   │
│  💳 活跃信用卡   -¥28,000  │
│  ✨ 净可用       ¥16,000   │  ← 摘要卡片
├─────────────────────────────┤
│  ⚠️ 今天到了第 2 个采集点  │  ← 采集点提示（条件显示）
├─────────────────────────────┤
│  [现金明细]                 │  ← 可折叠列表
│  [信用卡明细]               │
├─────────────────────────────┤
│  [主页] [曲线] [设置]      │  ← 底部 Tab 栏
└─────────────────────────────┘
```

### 5.4 关键页面清单

| 页面 | 路由 | 说明 |
|------|------|------|
| 主页 | `/` | 实时仪表盘 |
| 曲线页 | `/trends` | 双 Y 轴图表 + 周期对比 |
| 设置页 | `/settings` | 配置 + 数据管理 |
| 新增/编辑现金 | `/cash/new`、`/cash/:id` | 表单 |
| 新增/编辑信用卡 | `/card/new`、`/card/:id` | 表单 |
| 快照录入弹窗 | 模态层 | 主页和曲线页共用 |

---

## 6. 技术架构

### 6.1 技术栈

| 层 | 技术 | 理由 |
|----|------|------|
| 前端 | React 18 + Vite + TypeScript | 生态成熟，类型安全 |
| UI 库 | TailwindCSS + shadcn/ui | 快速搭建，符合现代审美 |
| 状态管理 | Zustand | 轻量，适合中小项目 |
| 图表 | Recharts | 声明式 API，支持双 Y 轴 |
| 路由 | React Router v6 | 标准方案 |
| 部署 | Cloudflare Pages | 免费额度充足，全球 CDN |
| 后端 | Cloudflare Workers + D1 | 同上，TypeScript 全栈 |
| 数据校验 | Zod | 前后端共享 schema |

### 6.2 Cloudflare 免费额度（V1 容量评估）

| 资源 | 免费额度 | 预期使用 | 余量 |
|------|---------|---------|------|
| Workers 请求 | 10 万次/日 | < 100 次/日 | 充足 |
| D1 读取 | 500 万次/日 | < 100 次/日 | 充足 |
| D1 写入 | 10 万次/日 | < 10 次/日 | 充足 |
| D1 存储 | 5 GB | < 1 MB/年 | 充足 |
| Pages 构建 | 500 次/月 | < 10 次/月 | 充足 |
| Pages 带宽 | 无限 | — | 充足 |

**结论**：单用户场景下，免费额度绰绰有余。

### 6.3 项目结构

```
cash-flow-pulse/
├── apps/
│   ├── web/                    # 前端 (React + Vite)
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── stores/         # Zustand stores
│   │   │   ├── lib/            # 工具函数
│   │   │   └── types/
│   │   ├── public/
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── api/                    # 后端 (Workers + D1)
│       ├── src/
│       │   ├── routes/
│       │   ├── db/
│       │   ├── schema.sql
│       │   └── index.ts
│       ├── wrangler.toml
│       └── package.json
├── packages/
│   └── shared/                 # 前后端共享类型 + Zod schema
│       ├── src/
│       │   ├── types.ts
│       │   ├── schema.ts       # Zod
│       │   └── calc.ts         # 核心计算逻辑
│       └── package.json
├── docs/
│   ├── cash-flow-pulse-prd.md  # 本文档
│   └── development-log.md
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

> 选用 pnpm workspace 的 monorepo 结构，前后端共享 types 和计算逻辑，避免重复实现。

### 6.4 API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/config` | 获取用户配置 |
| PUT | `/api/config` | 更新配置 |
| GET | `/api/cash` | 现金来源列表 |
| POST | `/api/cash` | 新增 |
| PUT | `/api/cash/:id` | 更新 |
| DELETE | `/api/cash/:id` | 删除 |
| GET | `/api/cards` | 信用卡列表 |
| POST | `/api/cards` | 新增 |
| PUT | `/api/cards/:id` | 更新 |
| DELETE | `/api/cards/:id` | 删除 |
| GET | `/api/snapshots` | 快照列表（支持 ?cycles=N 过滤） |
| POST | `/api/snapshots` | 录入快照 |
| PUT | `/api/snapshots/:id` | 更新备注 |
| DELETE | `/api/snapshots/:id` | 删除 |
| GET | `/api/dashboard` | 一站式接口：返回所有数据 + 计算结果 |
| GET | `/api/export` | 导出 JSON |
| POST | `/api/import` | 导入 JSON |

### 6.5 部署流程

1. 在 Cloudflare Dashboard 创建 D1 数据库：`cash-flow-pulse-db`
2. 执行 `schema.sql` 初始化表结构
3. 部署 Workers API：`pnpm --filter api deploy`
4. 部署前端：`pnpm --filter web build` → Pages 自动部署
5. 配置自定义域名（可选）：`cash.soniclab.cc`

---

## 7. 提醒机制

### 7.1 「佛系」提醒策略（用户已确认）

- **不做主动推送**（无 FCM/APNs，无邮件）
- **应用内提示**：当用户打开 App 时，若今天落在某个采集点 ±1 天内，顶部出现提示条
- 用户可手动忽略，下次访问仍提示

### 7.2 提示触发逻辑

```javascript
function shouldShowSnapshotPrompt(today, payDay, snapshotOffsets, existingSnapshots) {
  const cycleId = getCurrentCycleId(today, payDay);
  const dayInCycle = daysSinceCycleStart(today, payDay);
  // 检查今天是否在某个采集点 ±1 天内
  const nearOffset = snapshotOffsets.find(offset =>
    Math.abs(dayInCycle - offset) <= 1
  );
  if (!nearOffset) return null;
  // 检查该采集点是否已录入
  const offsetIndex = snapshotOffsets.indexOf(nearOffset);
  const exists = existingSnapshots.some(s =>
    s.cycle_id === cycleId && s.offset_index === offsetIndex
  );
  return { cycleId, offsetIndex, exists };
}
```

---

## 8. 曲线统计逻辑

### 8.1 周期划分

- 每个自然月的发薪日作为周期起点
- 周期 ID 格式：`YYYY-MM`（基于周期起点的年月）

### 8.2 采集点强制落点

- 即使数据未变，也写入快照记录
- `data_unchanged = 1` 标记，曲线用浅灰显示
- 数据库唯一约束 `UNIQUE(user_id, cycle_id, offset_index)` 保证同周期同点位只有一条记录

### 8.3 趋势分析（V1 简单实现）

- 计算最近 N 个周期的：
  - 平均净可用现金
  - 平均日均预算
  - 增减趋势（环比）
- 显示简单文字提示：「最近 3 个月净可用现金下降 12%」

---

## 9. 开发计划

### Phase 1：MVP（核心计算 + 单设备）
- 数据模型 + Workers API
- 主页仪表盘
- 现金来源 + 信用卡 CRUD
- 设置页（基础配置）

### Phase 2：快照 + 曲线
- 快照录入
- 采集点提示
- 历史曲线页（双 Y 轴）
- 周期对比

### Phase 3：完善
- 数据导出/导入
- 移动端适配打磨
- 性能优化

### Phase 4（可选）：扩展
- 多用户系统
- 预算分类
- 银行账单导入
- 月度报告导出 PDF

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| D1 写入限制 | 极低概率 | 单用户每日写入 < 50 次，远低于 10 万限制 |
| 隐私顾虑 | 用户担心数据泄露 | 强调「数据仅存在你的 Cloudflare 账户」，提供导出 |
| 单设备限制 | 换设备数据丢失 | JSON 导出/导入 + 文档说明 |
| 信用卡扣款日跨月 | 计算错误 | 单元测试覆盖所有边界（2 月、月末等） |
| 移动端 Safari 兼容性 | UI 显示异常 | 使用 Tailwind 默认值 + 实机测试 |

---

## 11. 验收标准（V1）

- [ ] 用户能在 30 秒内完成首次配置（发薪日 + 至少 1 个现金来源 + 至少 1 张信用卡）
- [ ] 主页能正确显示日均预算、距离下个发薪日天数
- [ ] 现金来源和信用卡的增删改查全部可用
- [ ] 每月 4 个采集点到点提示出现，录入后曲线图显示新点
- [ ] 即使数据无变化，重复录入仍生成新记录（data_unchanged=1）
- [ ] 双 Y 轴曲线图正确显示净可用现金 + 日均预算
- [ ] JSON 导出/导入功能完整可用
- [ ] 移动端（iPhone Safari）显示正常，所有交互可用
- [ ] 桌面端（Chrome）显示正常

---

## 附录 A：术语速查

- **D1**：Cloudflare 的 SQLite 兼容数据库服务
- **Workers**：Cloudflare 的边缘计算平台
- **Pages**：Cloudflare 的静态站点托管 + Jamstack 部署平台
- **wrangler**：Cloudflare 官方 CLI 工具
- **pnpm workspace**：monorepo 管理工具
- **Zustand**：轻量级 React 状态管理库
- **Recharts**：基于 React 的图表库
- **shadcn/ui**：基于 TailwindCSS 的可复制组件库

## 附录 B：参考产品

- Monzo（银行 App，预算可视化）
- YNAB（预算管理）
- PocketGuard（现金流追踪）
- 网易有钱（已停服，但设计可参考）

---

**变更记录**

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v0.1 | 2026-06-21 | 初始草案，需求已收敛 |