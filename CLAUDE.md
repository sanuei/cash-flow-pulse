# Cash Flow Pulse

pnpm monorepo：`apps/web`（React + Vite）、`apps/api`（Hono + D1）、`packages/shared`（计算逻辑，前后端共用）。
前端和 API 部署为**同一个 Cloudflare Worker** `cash-flow-pulse-api`（Workers Static Assets，配置在 `apps/api/wrangler.toml`），见 `docs/deployment.md`。

## 工作流程（用户要求）

- **每次改完直接合并到 `main` 并推送，不用再问**：在功能分支上开发 → 跑检查 → fast-forward 合并到 `main` → `git push origin main`。
- 合并前必须通过：`pnpm -r typecheck`、`pnpm --filter @cfp/shared test`、`pnpm --filter @cfp/web build`。
  - `calc.test.ts` 里「computeDashboardV2 向后兼容」的 3 个用例在改动前就失败，不是新问题；其余用例必须全过。
- 部署：推送到 `main` 后由 Workers Builds 自动构建并部署前端 + API（一次原子部署），**不需要手动部署**。
  推送后可用 `gh api repos/sanuei/cash-flow-pulse/commits/<sha>/check-runs` 查看 `Workers Builds: cash-flow-pulse-api` 的结果。
  - 应急手动部署：在与 `origin/main` 同步的目录里 `pnpm run deploy`（先构建前端再 `wrangler deploy`）。
  - 不要在 `apps/api` 里跑裸 `wrangler deploy`（不会先构建前端），也不要从落后于 `origin/main` 的目录部署（会回滚线上）。
  - `apps/api/wrangler.toml` 的 `[assets] run_worker_first = ["/api/*"]` 不能删，否则 API 请求会被 SPA 回退成 `index.html`。
- 改了 D1 表结构时，迁移 SQL 放在 `apps/api/src/db/migrate_*.sql`（同步更新 `schema.sql`）。
  会话里有 Cloudflare 连接器时，用它的 `d1_database_query` 对生产库（database_id `222e5633-5a2c-4af7-8efb-dbb0f7d5d6b5`）
  逐条执行；迁移只做加列等向后兼容的改动，并且**先迁移、再合并**。没有连接器时提醒用户执行：
  `wrangler d1 execute cash-flow-pulse-db --remote --file=./src/db/migrate_xxx.sql`
- Cloudflare 连接器不能上传 Worker 代码；代码部署靠推送 `main` 触发 Workers Builds。

## 约定

- 回复用户用中文。
- 金额单位日元（JPY）；发薪周期 = [上次发薪日, 下次发薪日)，`cycle_id` = 起始发薪日所在年月。
- 多期统计（月均生活成本、储蓄率、财务自由等）统一用 `packages/shared/src/planning.ts` 的 `computeCycleHistory` / `aggregateCycles`，前后端同一口径。
