# Cash Flow Pulse — 部署指南

> Cloudflare 全家桶部署：Workers (API) + D1 (数据库) + Pages (前端)，全部免费额度内。

## 架构总览

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  Cloudflare     │         │  Cloudflare     │         │  Cloudflare     │
│  Pages          │ ──────► │  Workers        │ ──────► │  D1 (SQLite)    │
│  (React 前端)    │  /api/* │  (Hono API)     │         │  (数据库)        │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

- **Pages**：托管 Vite 打包后的静态文件（HTML/JS/CSS）
- **Workers**：运行 Hono 路由 + 调用 D1
- **D1**：SQLite 兼容数据库，5GB 免费存储

---

## 前置准备

1. **Cloudflare 账号**：https://dash.cloudflare.com/sign-up
2. **wrangler CLI**：已通过 `pnpm` 装好
3. **登录**：`wrangler login`（会打开浏览器授权）

---

## 1️⃣ 部署 Workers API

### 1.1 创建 D1 数据库

```bash
cd apps/api
wrangler d1 create cash-flow-pulse-db
```

输出会包含 `database_id`，复制下来。

### 1.2 修改 wrangler.toml

编辑 `apps/api/wrangler.toml`，把 `database_id` 填进去：

```toml
[[d1_databases]]
binding = "DB"
database_name = "cash-flow-pulse-db"
database_id = "填入上一步的 ID"
```

### 1.3 初始化数据库 schema

**远程（生产）**：
```bash
wrangler d1 execute cash-flow-pulse-db --file=./src/db/schema.sql --remote
```

**本地（开发）**：
```bash
wrangler d1 execute cash-flow-pulse-db --file=./src/db/schema.sql --local
```

### 1.4 部署 Workers

```bash
pnpm deploy:api
# 或：
cd apps/api && wrangler deploy
```

部署成功后输出形如：
```
Published cash-flow-pulse-api (X.XX sec)
  https://cash-flow-pulse-api.<your-subdomain>.workers.dev
```

记下这个 URL，前端需要用到。

### 1.5 配置 CORS

编辑 `apps/api/wrangler.toml`，把生产前端域名加到 ALLOWED_ORIGIN（逗号分隔）：

```toml
[vars]
ALLOWED_ORIGIN = "https://cash.soniclab.cc,https://cash-flow-pulse.pages.dev"
```

---

## 2️⃣ 部署前端（Cloudflare Pages）

### 2.1 方式 A：通过 Dashboard（推荐）

1. 打开 https://dash.cloudflare.com → Pages
2. **Create a project** → **Connect to Git**
3. 选择你的 GitHub 仓库
4. 配置：
   - **Project name**: `cash-flow-pulse`（或自定义）
   - **Production branch**: `main`
   - **Framework preset**: Vite
   - **Build command**: `cd ../.. && pnpm install && pnpm --filter @cfp/web build`
     - 或更简单：`pnpm build && pnpm --filter @cfp/web build`（如果 monorepo 已在根目录装了 deps）
   - **Build output directory**: `apps/web/dist`
   - **Root directory**: `apps/web`（如果 Pages 不支持 monorepo，则需要在仓库根设置）
5. **Environment variables**：
   - （V1 不需要，前端走相对路径 `/api`）
6. 点击 **Save and Deploy**

### 2.2 方式 B：通过 wrangler CLI（适合纯前端项目）

不推荐，因为 monorepo 项目需要复杂配置。

### 2.3 配置 API 反向代理

前端代码默认假设 `/api/*` 同源。生产部署需要在 Pages 配置一个 **Function** 或 **Worker** 来转发。

**推荐做法**：把 Pages 项目绑定到自定义域名（如 `cash.soniclab.cc`），然后通过现有的 `soniclab-router` Worker 把 `/api/*` 路径代理到 Workers API。

或者直接在 Pages 的 `_redirects` / `_routes.json` 里配置。

### 2.4 验证部署

访问 `https://cash-flow-pulse.pages.dev`（或你的自定义域名），应看到主页。

---

## 3️⃣ 自定义域名（可选）

### 3.1 添加域名到 Cloudflare

如果你的域名 `soniclab.cc` 已在 Cloudflare：

1. **Workers** → `cash-flow-pulse-api` → Settings → Triggers → Routes
2. 添加：`api.cash.soniclab.cc/*` → Zone: `soniclab.cc`

### 3.2 添加 Pages 自定义域名

1. **Pages** → `cash-flow-pulse` → Custom domains
2. 添加：`cash.soniclab.cc`

---

## 4️⃣ 本地开发

### 4.1 启动后端

```bash
# 终端 1
cd apps/api
pnpm dev
# 启动在 http://localhost:8787
```

### 4.2 启动前端

```bash
# 终端 2
cd apps/web
pnpm dev
# 启动在 http://localhost:5173
```

前端通过 Vite proxy 自动把 `/api/*` 转发到 8787。

### 4.3 同时启动

```bash
cd ..  # 项目根目录
pnpm dev
# 并行启动 api + web
```

---

## 5️⃣ 常见问题

### Q: 部署后主页空白？
A: 检查浏览器控制台。常见原因：
- D1 数据库未初始化（先跑 schema.sql）
- CORS 配置不对（确认 ALLOWED_ORIGIN 包含前端域名）

### Q: API 报 500？
A: 在 Cloudflare Dashboard → Workers → Logs 查看错误堆栈。常见：
- `database_id` 没填对
- D1 表未创建（忘了跑 schema.sql）

### Q: 如何重置生产数据库？
A: 
```bash
wrangler d1 execute cash-flow-pulse-db --file=./src/db/schema.sql --remote
# ⚠️ 这会清空所有数据！
```

### Q: 如何备份数据？
A: 通过前端「设置 → 导出 JSON」即可。或手动：
```bash
wrangler d1 export cash-flow-pulse-db --output=backup.sql
```

---

## 6️⃣ 监控

- **Workers Logs**: Dashboard → Workers & Pages → `cash-flow-pulse-api` → Logs
- **D1 Analytics**: Dashboard → D1 → `cash-flow-pulse-db` → Metrics
- **Pages Analytics**: Dashboard → Pages → `cash-flow-pulse` → Analytics

---

## 7️⃣ 成本估算

**Cloudflare 免费额度**：
| 服务 | 免费额度 | V1 预期用量 |
|------|---------|-----------|
| Workers Requests | 100,000 / 天 | < 100 / 天 |
| Workers CPU Time | 10ms / 请求 | ~2ms / 请求 |
| D1 Reads | 5,000,000 / 天 | < 100 / 天 |
| D1 Writes | 100,000 / 天 | < 10 / 天 |
| D1 Storage | 5 GB | < 1 MB |
| Pages Builds | 500 / 月 | < 10 / 月 |
| Pages Bandwidth | 无限 | — |

**结论**：单用户场景下，**完全免费**，无任何付费风险。

---

## 8️⃣ 回滚

```bash
# 列出最近 10 次部署
wrangler deployments list

# 回滚到指定版本
wrangler rollback [version-id]
```

---

## 9️⃣ 更新日志维护

每次部署后，更新 `docs/development-log.md` 中的版本号和变更记录。

---

**部署完成后**，记得到 `docs/development-log.md` 里追加一行：
```
## v0.X — 生产部署（YYYY-MM-DD）
- Workers API 部署到：cash-flow-pulse-api.<subdomain>.workers.dev
- Pages 前端部署到：https://cash-flow-pulse.pages.dev
- 自定义域名：https://cash.soniclab.cc（可选）
```