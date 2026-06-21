# Cash Flow Pulse — v1.1 升级方案：页面拆分 + 周期切换 + 曲线增强

> 三块一次性升级。**模块 A 是纯前端零风险；B、C 涉及后端 / 数据库 / 定时任务。**
> 建议按 A → B → C 顺序开发，可一次性发布。

---

## 0. 三块目标

| 模块 | 内容 | 性质 |
|---|---|---|
| **A. 页面拆分** | Home 拆成 总览 / 收入 / 投资 / 消费 四页 | 纯前端 UI 重组 |
| **B. 周期切换** | 总览页能翻 上一期 / 本期 / 下一期 | 后端加参数 + 算法泛化 + 前端切换器 |
| **C. 曲线增强** | 真正的趋势曲线 + 自动每日采集 + 更多维度 | DB 扩字段 + Cron + 图表重做 |

---

## 1. 数据现实约束（先讲清楚）

- 快照表目前每条只存 5 个聚合值：现金总额、锁定、**信用卡应还总额**、净可用、日均预算。
- **「净可用 / 日均预算」有历史 → 曲线立即可画。**
- **「收入 / 投资 / 消费」对比 → 当前没存，必须先扩字段，且过去补不回来，只能从升级上线后一天天攒。**
- 「上/下期」的净可用依赖**当前实时余额**：上期读历史快照（真实），下期只能基于当前余额做**预测**（会明确标注）。

---

## 2. 模块 A：页面拆分（纯前端）

| 页面 | 路由 | 包含区块 | 数据（不变） |
|---|---|---|---|
| **总览** | `/` | 日均预算 Hero、摘要卡、本期支出/收入汇总、大公式、**周期切换器(模块B)**、**现金来源(增删改)** | calc + cashSources |
| **收入** | `/incomes` | 固定收入(增删改) | incomes |
| **投资** | `/investments` | 固定投资(增删改) | investments |
| **消费** | `/expenses` | 固定账单 + 订阅 + **信用卡**(增删改) | bills + subs + cards |
| 曲线 | `/trends` | 模块 C 重做 | snapshots |
| 设置 | `/settings` | 不变 | — |

- 把 Home 里每类「列表 + 增删改 Modal」整体搬到对应页；共用小组件（`Section`/`Row`/表单/Modal）抽到 `components/`。
- `store.ts` / `api.ts` / 后端 / shared：模块 A 不动。
- 导航变 6 项：移动端底栏放主要 4 个（总览/收入/投资/消费），曲线、设置收进总览入口或「更多」。

---

## 3. 模块 B：周期切换

### 语义
| 周期 | 净可用 / 日均预算 | 固定收支安排（卡/账单/订阅/投资/收入） |
|---|---|---|
| **本期** | 实时计算（现状） | 规则计算 |
| **上一期 / 更早** | 读历史快照（无快照则留空 + 提示） | 规则按该周期重算 |
| **下一期 / 未来** | 基于当前余额**预测**（UI 标「预测」徽章） | 规则按该周期重算 |

### 技术
- `packages/shared/src/calc.ts`：把 `computeDashboardV2` 的周期窗口**参数化**——现在硬编码 `[今天, 下个发薪日)`，改为接受任意 `[periodStart, periodEnd)`。用 `addMonths(refDate, offset)` + `getCurrentCycle` 得到目标周期。
- `routes/dashboard.ts`：接收 `?cycle_offset=N`（0 本期 / 负数过去 / 正数未来）。过去周期优先查 `snapshots`，命中则覆盖净可用/日均；否则标记 `predicted`。
- 前端：总览页加 `← 本期 →` 切换器，`store` 存 `cycleOffset`，切换时带参数重新拉 `/dashboard`。

---

## 4. 模块 C：曲线增强

### 4.1 扩展快照字段（为「收入/投资/消费」曲线攒数据）
```sql
-- D1 支持 ADD COLUMN
ALTER TABLE snapshots ADD COLUMN total_income     REAL NOT NULL DEFAULT 0;
ALTER TABLE snapshots ADD COLUMN total_investment REAL NOT NULL DEFAULT 0;
ALTER TABLE snapshots ADD COLUMN total_expense    REAL NOT NULL DEFAULT 0;
```
录入逻辑（手动 + 自动）改用 `computeDashboardV2`，把 `total_income / total_investments / total_expense` 一并存入。

### 4.2 自动每日采集（Cron）
- `wrangler.toml`：加 `[triggers] crontab = ["0 15 * * *"]`（每天一次，按你时区调）。
- `index.ts`：加 `scheduled` handler — 遍历所有 `users`，给每人算当天快照并 upsert。
- **快照唯一键调整**：现状 `UNIQUE(user_id, cycle_id, offset_index)`（一周期 4 点）→ 每日采集需改为 `UNIQUE(user_id, snapshot_date)`（一天一条，同日重复则更新）。SQLite 改约束需重建表 → 写一次性迁移（迁移前导出备份；现有数据按 date 去重）。
- `offset_index` 保留为「是否发薪日采集点」的标记，不再参与唯一键。

### 4.3 图表重做（Trends 页）
- 现有「净可用 vs 日均预算」混合图 → 保留并优化视觉（数据变密后自然平滑）。
- 新增「**收入 / 投资 / 消费**」三线对比图（recharts LineChart，与总览大公式呼应）。
- 精简顶部统计块（StatCard），把重心放到曲线本身。
- X 轴从「周期+offset」改为按 `snapshot_date` 连续时间轴（配合每日采集）。

---

## 5. 改动汇总

### 数据库
- `snapshots`：+3 列（income/investment/expense）；唯一键改 `(user_id, snapshot_date)`（重建表 + 迁移）。

### 后端
| 文件 | 改动 |
|---|---|
| `wrangler.toml` | +cron triggers |
| `index.ts` | +`scheduled` handler（每日采集所有用户） |
| `routes/dashboard.ts` | +`cycle_offset` 参数；过去读快照 / 未来标预测 |
| `routes/snapshots.ts` | 录入存 3 个新字段；唯一键改 date |
| `db/schema.sql` | 同步表结构 + 迁移脚本 |
| `packages/shared/calc.ts` | 周期窗口参数化；快照生成存新字段 |
| `packages/shared/types.ts` | Snapshot +3 字段；calc 返回 +predicted 标记 |

### 前端
| 文件 | 改动 |
|---|---|
| `pages/Overview.tsx` 等 4 页 | 模块 A 新建 |
| `pages/Overview.tsx` | +周期切换器 + 预测徽章（模块 B） |
| `pages/Trends.tsx` | 模块 C 重做（连续时间轴 + 三线对比图） |
| `App.tsx` / 导航 | 路由 + Tab |
| `store.ts` | +cycleOffset 状态 + expenses/cards CRUD 归位 |

---

## 6. 分期实施

| 阶段 | 任务 | 工时 | 风险 |
|---|---|---|---|
| **A** | 页面拆分（前端） | 5-6h | 低 |
| **B** | 周期切换（calc 泛化 + dashboard 参数 + 切换器） | 4-5h | 中 |
| **C1** | 扩快照字段 + 唯一键迁移（带备份） | 2-3h | **中-高（迁移）** |
| **C2** | Cron 每日采集 handler | 1-2h | 中 |
| **C3** | Trends 图表重做 | 3-4h | 低 |
| — | 测试 + 部署（Workers + Pages + D1 迁移） | 2-3h | 中 |
| **总计** | | **17-23h** | |

> 建议先合并发布 A（用户立刻受益），B、C 紧随。C1 的表迁移是唯一高风险点，迁移前**自动导出 JSON 备份**。

---

## 7. 风险

| 风险 | 缓解 |
|---|---|
| 快照表重建/迁移丢数据 | 迁移前导出备份；脚本幂等；先在副本验证；按 date 去重前先 dump 冲突行 |
| Cron 多用户遍历超时/计费 | 用户量小无虞；分批；失败重试；监控日志 |
| 「下一期」预测被误读为真实 | UI 明确「预测」徽章 + 文案说明 |
| 收入/投资/消费曲线初期没数据 | 文案提示「从今天起累积，N 天后成形」 |
| 时区导致 cron 采集日期偏差 | 统一用用户时区（日本）算 snapshot_date |

---

## 8. 验收

- [ ] 四页拆分：各页增删改正常，总览公式 + 现金、消费页含信用卡
- [ ] 周期切换：本期实时 / 上期读快照 / 下期显预测徽章；固定收支按周期正确
- [ ] 扩字段：手动 + 自动快照都存了 income/investment/expense
- [ ] Cron：次日自动生成快照（看 D1 多一条当天记录）
- [ ] Trends：连续时间轴 + 净可用/日均图 + 收入/投资/消费三线图
- [ ] 迁移：现有快照无丢失，唯一键改 date 后无冲突
- [ ] 部署：Pages + Workers + D1 迁移上线验证

---

**待批准**：是 / 否 / 调整分期
