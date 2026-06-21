# Cash Flow Pulse — 部署指南

> Cloudflare 全家桶部署：Workers (API) + D1 (数据库) + Pages (前端)，全部免费额度内。

## 架构总览

```
                                cash.soniclab.cc
                                       │
                                       ▼
                          ┌──────────────────────────┐
                          │  soniclab-router Worker  │
                          │  (Cash Flow Pulse 代理)   │
                          └──────────┬───────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │ /api/*                          │ 其他/*
                    ▼                                  ▼
        ┌──────────────────┐               ┌──────────────────┐
        │  Workers API     │               │  Pages           │
        │  (Hono + D1)     │               │  (React 静态)     │
        └────────┬─────────┘               └──────────────────┘
                 │
                 ▼
        ┌──────────────────┐
        │  D1 (SQLite)     │
        │  cash-flow-pulse-db │
        └──────────────────┘
```

- **Pages**：托管 Vite 打包后的静态文件（HTML/JS/CSS）
- **Workers API**：运行 Hono 路由 + 调用 D1
- **D1**：SQLite 兼容数据库，5GB 免费存储
- **soniclab-router**：在 `cash.soniclab.cc` 提供 `/api/*` → API 反代，其他 → Pages 静态资源

---

## 🚀 一键部署（推荐）

### 前置条件
1. Cloudflare 账号
2. wrangler CLI（`brew install wrangler` 或 `pnpm add -g wrangler`）
3. **登录**：`wrangler login`（会打开浏览器授权）

### 一条命令搞定

```bash
cd ~/Desktop/网页项目/apps/cash-flow-pulse
./scripts/deploy.sh
```

脚本会自动完成：
1. ✅ 检查登录状态 + 安装依赖
2. ✅ 创建 D1 数据库（首次）并初始化 8 张表 schema
3. ✅ 部署 Workers API，验证 health endpoint
4. ✅ 构建前端 + 部署到 Pages（创建项目如不存在）
5. ✅ 部署 soniclab-router（注入 CFP_API_HOST env）
6. ✅ DNS 检查（首次会提示配置）

**环境变量**：
- `SKIP_DNS=1` — 跳过 DNS 检查（已配过时用）
- `SKIP_ROUTER=1` — 跳过 router 部署（router 已存在时用）

---

## 📋 手动部署（逐步）

如果脚本卡在某步想手动跑，下面是分步流程。

### 1️⃣ D1 数据库

```bash
cd apps/api
wrangler d1 create cash-flow-pulse-db
```

把输出的 `database_id` 填到 `apps/api/wrangler.toml`：
```toml
[[d1_databases]]
binding = "DB"
database_name = "cash-flow-pulse-db"
database_id = "填入 ID"
```

初始化 schema：
```bash
wrangler d1 execute cash-flow-pulse-db --file=./src/db/schema.sql --remote
```

### 2️⃣ Workers API

```bash
cd apps/api
wrangler deploy
# 输出: https://cash-flow-pulse-api.<subdomain>.workers.dev
```

**记下这个 URL**，前端的 CORS 白名单已经包含 `https://cash.soniclab.cc` 和 `https://cash-flow-pulse.pages.dev`。

验证：
```bash
curl https://cash-flow-pulse-api.<subdomain>.workers.dev/api/health
# → {"status":"ok","timestamp":...}
```

### 3️⃣ Pages 前端

```bash
cd apps/web
pnpm build
wrangler pages deploy dist --project-name=cash-flow-pulse --branch=main --commit-dirty=true
```

**首次部署**：`wrangler pages project create cash-flow-pulse --production-branch=main`

部署后访问：`https://cash-flow-pulse.pages.dev`

### 4️⃣ soniclab-router（cash.soniclab.cc 代理）

修改 `_infrastructure/soniclab-router/wrangler.toml`：
```toml
routes = [
  { pattern = "www.soniclab.cc/*", zone_name = "soniclab.cc" },
  { pattern = "soniclab.cc/*", zone_name = "soniclab.cc" },
  { pattern = "cash.soniclab.cc/*", zone_name = "soniclab.cc" }  # 新增
]
```

修改 `_infrastructure/soniclab-router/src/index.ts` 已包含 cash.soniclab.cc 分支（v0.8.1+ 已加）。

部署：
```bash
cd ../_infrastructure/soniclab-router
# 注入 CFP_API_HOST env（关键！）
# 方式 A: 写到 wrangler.toml
# 方式 B: wrangler secret put CFP_API_HOST
wrangler deploy
```

### 5️⃣ DNS 配置（首次）

1. **Cloudflare Dashboard** → **Workers & Pages** → **soniclab-router** → **Settings** → **Triggers**
2. 添加 Route：
   - Pattern: `cash.soniclab.cc/*`
   - Zone: `soniclab.cc`
3. **或者**（DNS 方式）：Dashboard → **soniclab.cc** → **DNS** → 添加：
   - Type: `CNAME`
   - Name: `cash`
   - Target: `soniclab-router.<subdomain>.workers.dev`
   - Proxied: ✓

DNS 生效时间：1-5 分钟。

---

## 🔍 端到端验证

DNS 生效后：

```bash
# 1. 健康检查（通过 soniclab-router 代理）
curl https://cash.soniclab.cc/api/health
# → {"status":"ok","timestamp":...}

# 2. 浏览器访问
open https://cash.soniclab.cc
```

应该看到：
- ✅ 主页加载，无 JS 错误
- ✅ 仪表盘渲染（首次无数据：净现金 ¥0，活跃卡应还 ¥0）
- ✅ 录入一张快照 → API 调用成功 → 列表显示

---

## 🛠 故障排除

### Q: 主页空白？
A: 浏览器 DevTools → Network 检查：
1. `cash.soniclab.cc/` 200 但 JS 404？ → Pages 部署失败，重新跑 step 3
2. `/api/*` 502？ → Workers 没起来，去 Workers Dashboard 看 Logs
3. `/api/*` CORS 错？ → 检查 `ALLOWED_ORIGIN` 是否包含 `https://cash.soniclab.cc`

### Q: API 500？
A: Workers → `cash-flow-pulse-api` → Logs：
- `database_id 没填对` → 重新填 wrangler.toml 再 deploy
- `no such table` → schema.sql 没跑，重新跑 step 1

### Q: soniclab-router 404？
A: 检查：
1. 路由规则是否包含 `cash.soniclab.cc/*`
2. `CFP_API_HOST` env 是否正确（用 `wrangler secret list` 验证）
3. Workers API 自身 URL 是否能直接访问

### Q: 如何回滚？
```bash
wrangler rollback [version-id]
wrangler deployments list
```

### Q: 数据备份？
```bash
# 前端：设置 → 导出 JSON
# 命令行：
wrangler d1 export cash-flow-pulse-db --output=backup.sql
```

---

## 💰 成本（Cloudflare 免费额度）

| 服务 | 免费额度 | 预期用量 |
|------|---------|---------|
| Workers Requests | 100,000 / 天 | < 100 / 天 |
| D1 Reads | 5,000,000 / 天 | < 100 / 天 |
| D1 Writes | 100,000 / 天 | < 10 / 天 |
| D1 Storage | 5 GB | < 1 MB |
| Pages Builds | 500 / 月 | < 10 / 月 |
| soniclab-router | 100k req/day | < 100/day |

**结论**：单用户场景下，**完全免费**。

---

## 🔄 更新日志

### v0.9 — 一键部署脚本（2026-06-21）
- 新增 `scripts/deploy.sh`：D1 + Workers + Pages + Router 一条命令搞定
- 新增 soniclab-router 的 `cash.soniclab.cc` 路由支持
- 拆分代码 chunk（react/recharts/icons 单独），bundle 减小 ~30%
- CORS 白名单扩展到 4 个源（dev × 2 + prod × 2）

### v0.8.1 — 部署指南初版
- 3 步手动部署（D1 → Workers → Pages）
- 故障排除 FAQ