# Cash Flow Pulse 💰

> 个人现金流可视化工具 — 帮你算出「到下次发工资前，平均每天能花多少钱」

## 核心功能

- 📊 **实时日均预算** — 扣除信用卡欠款后，剩余现金 ÷ 距下个发薪日天数
- 💵 **多现金来源** — PayPay / 钱包现金 / 银行活期 / 自定义
- 💳 **多信用卡管理** — 每张卡独立扣款日
- 📈 **月度趋势曲线** — 双 Y 轴展示「净可用现金 + 日均预算」
- 📍 **佛系采集点** — 每月固定 4 个时间点自动提示，无需每日记账
- 🎨 **Notion 设计系统** — 简洁克制的视觉语言

## 技术栈

- **前端**：React 18 + Vite + TypeScript + TailwindCSS + Zustand + Recharts
- **后端**：Cloudflare Workers + Hono + D1（SQLite）
- **设计**：完全照搬 Notion 设计系统 token

## 项目结构

```
cash-flow-pulse/
├── docs/                            # 文档
│   ├── cash-flow-pulse-prd.md       # 产品需求文档（含设计 token）
│   ├── development-log.md           # 开发日志
│   └── deployment.md                # 部署指南
├── packages/shared/                 # 核心算法 + 类型（前后端共用）
├── apps/api/                        # Workers API 后端
└── apps/web/                        # React 前端
```

## 本地开发

```bash
# 1. 安装依赖
pnpm install

# 2. 初始化本地 D1（首次）
cd apps/api
wrangler d1 execute cash-flow-pulse-db --file=./src/db/schema.sql --local

# 3. 启动 dev（并行启动 api + web）
cd ../..
pnpm dev
```

访问：
- 前端：http://localhost:5173
- API：http://localhost:8787/api/health

## 测试

```bash
# 共享包单元测试（38 个）
cd packages/shared && npx vitest run

# 前端 + 后端类型检查
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit

# 前端构建
cd apps/web && npx vite build
```

## 部署

详见 [`docs/deployment.md`](./docs/deployment.md)。

简而言之：
1. `wrangler d1 create cash-flow-pulse-db` → 填入 `database_id`
2. `wrangler d1 execute cash-flow-pulse-db --file=./src/db/schema.sql --remote`
3. `pnpm deploy:api` → 部署 Workers
4. Cloudflare Pages 连接 GitHub 仓库，配置 build 输出 `apps/web/dist`

## 许可证

MIT（个人项目）

---

**状态**：v0.6 端到端验证通过 ✅  
**最新 commit**：`7067d64 feat(web): 完整前端实现`