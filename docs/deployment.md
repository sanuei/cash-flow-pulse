# Cash Flow Pulse — 部署指南

> 一个 Cloudflare Worker 同时托管前端 SPA 和 API，推送到 `main` 自动部署。

## 架构

```
                    cashflow.soniclab.cc
                            │
                            ▼
          ┌───────────────────────────────────┐
          │  Worker: cash-flow-pulse-api      │
          │                                   │
          │  /api/*  ──► Hono（apps/api）     │──► D1: cash-flow-pulse-db
          │  其他    ──► 静态资源（apps/web/dist）│
          │             未命中 → index.html    │
          │                                   │
          │  cron 0 15 * * * ──► 每日快照      │
          └───────────────────────────────────┘
```

全部配置在 [`apps/api/wrangler.toml`](../apps/api/wrangler.toml)：

| 配置 | 作用 |
|------|------|
| `[assets] directory = "../web/dist"` | Vite 产物作为静态资源一起上传 |
| `not_found_handling = "single-page-application"` | `/settings`、`/incomes` 等前端路由回退到 `index.html` |
| `run_worker_first = ["/api/*"]` | `/api/*` 一律交给 Hono。**不能删**，否则 API 请求也会被回退成 `index.html` |
| `[[d1_databases]]` / `[triggers]` | D1 绑定、每日快照 cron |

前端与 API 同源，所以 session cookie 用 `SameSite=Lax`，前端请求不需要 CORS。

---

## 日常部署

**推送到 `main` 即可。** Workers Builds 会自动执行：

1. `pnpm install --frozen-lockfile`
2. `pnpm run deploy` → 先 `pnpm --filter @cfp/web build`，再 `wrangler deploy`（前端 + API 一次原子上传）

PR / 其他分支会生成 preview URL，不影响生产。

### 本地手动部署（应急用）

```bash
pnpm run deploy
```

> ⚠️ 只能在**和 `origin/main` 同步**的 checkout 里执行。部署的是本地文件，落后的目录会把线上回滚。
> 不要直接在 `apps/api` 里跑裸 `wrangler deploy`：它不会先构建前端，会把旧的 `dist` 一起推上去。

### 回滚

```bash
cd apps/api
pnpm exec wrangler deployments list
pnpm exec wrangler rollback <version-id>
```

前端和 API 是同一个版本，一起回滚。D1 数据不受影响。

---

## 一次性迁移：Pages → 统一 Worker

原架构是 Pages 托管前端 + Worker Route 接管 `cashflow.soniclab.cc/api/*`。按下面顺序迁移，**只有阶段 B 有短暂不可用**。

### 阶段 A — 在 workers.dev 上验证（生产零影响）

此时 `wrangler.toml` 的路由仍是 `cashflow.soniclab.cc/api/*`，前端仍由 Pages 提供。

1. 部署一次：`pnpm run deploy`（或在阶段 C 连好 Git 后推送触发）
2. 打开 `https://cash-flow-pulse-api.<subdomain>.workers.dev`，确认：
   - `/` 显示登录页，左上角 logo 正常
   - `/settings` 直接刷新不 404
   - `/api/health` 返回 JSON
   - （workers.dev 上无法完成 Google 登录 —— 回调地址只登记了正式域名，这是预期的）

### 阶段 B — 切换域名（约几十秒不可用）

Worker 的 Custom Domain 不能建在已有 CNAME 的主机名上，所以必须先删再加：

1. **Workers & Pages → `cash-flow-pulse`（Pages 项目）→ 自定义域** → 删除 `cashflow.soniclab.cc`
2. **soniclab.cc → DNS → 记录** → 如果还有 `cashflow` 的 CNAME 记录，删除它
3. 把 `apps/api/wrangler.toml` 的路由改成：
   ```toml
   [[routes]]
   pattern = "cashflow.soniclab.cc"
   custom_domain = true
   ```
   然后 `pnpm run deploy`（wrangler 会自动创建 DNS 记录和证书）
4. 验证：
   ```bash
   curl -sI https://cashflow.soniclab.cc/ | head -1           # 200
   curl -s  https://cashflow.soniclab.cc/api/health           # {"status":"ok",...}
   ```
   浏览器里完整走一次 Google 登录。
5. **Worker → 设置 → 域和路由**：确认旧的 `cashflow.soniclab.cc/api/*` Route 已经不在（wrangler 会按配置同步；还在就手动删除）

> 浏览器里旧的 Service Worker 仍会先用缓存的前端，下一次加载时会自动更新，不影响使用。

### 阶段 C — 连接 Git（推送即部署）

**Workers & Pages → `cash-flow-pulse-api` → 设置 → 构建 → 连接**：

| 项 | 值 |
|----|----|
| Git 仓库 | `sanuei/cash-flow-pulse` |
| 生产分支 | `main` |
| 根目录 | `apps/api` |
| 构建命令 | `pnpm install --frozen-lockfile` |
| 部署命令 | `pnpm run deploy` |
| 构建变量 | `SKIP_DEPENDENCY_INSTALL` = `1` |

- `SKIP_DEPENDENCY_INSTALL=1`：根目录是 `apps/api`，而 lockfile 在仓库根。关掉自动安装、由构建命令自己跑 `pnpm install`，避免构建环境误用 npm（npm 不认识 `workspace:*`）。
- pnpm 版本取自仓库根 `package.json` 的 `"packageManager": "pnpm@11.7.0"`。
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 是 Worker 的运行时 Secret，部署不会覆盖，无需在构建里配置。

### 阶段 D — 清理

线上稳定运行几天后：

1. **Pages 项目 `cash-flow-pulse` → 设置 → 构建** → 断开 Git（否则每次推送它还会白跑一次构建）
2. 确认不再需要回退后，删除 Pages 项目：`pnpm --filter @cfp/api exec wrangler pages project delete cash-flow-pulse`
3. 可选：`ALLOWED_ORIGIN` 里的 `cash-flow-pulse.pages.dev`、`cash.soniclab.cc` 可以删掉

---

## D1 数据库

```bash
cd apps/api

# 表结构变更：迁移 SQL 放在 src/db/migrate_*.sql，先迁移、再合并代码
pnpm exec wrangler d1 execute cash-flow-pulse-db --remote --file=./src/db/migrate_xxx.sql

# 备份
pnpm exec wrangler d1 export cash-flow-pulse-db --remote --output=backup.sql
```

---

## 故障排除

| 现象 | 原因 / 处理 |
|------|------------|
| 构建成功但全站 404 / 空白 | `apps/web/dist` 没构建出来。检查部署命令是不是 `pnpm run deploy`（不是裸 `wrangler deploy`） |
| `/api/*` 返回 HTML | `run_worker_first` 被删了或 wrangler < 4.20 |
| `/settings` 刷新 404 | `not_found_handling` 不是 `single-page-application` |
| 登录后又回到 `/login` | 检查 `vite.config.ts` 的 `navigateFallbackDenylist` 是否包含 `/^\/api\//`（Service Worker 不能拦截 `/api/auth/*` 导航） |
| 部署报 `assets.directory ... does not exist` | 没先构建前端，用 `pnpm run deploy` |
| 阶段 B 报 custom domain 冲突 | DNS 里还有 `cashflow` 的 CNAME，删掉后重试 |

## 成本

单用户场景下全部在免费额度内。静态资源请求不计入 Workers 请求数；`/api/*` 才计数（免费 10 万次/天）。
