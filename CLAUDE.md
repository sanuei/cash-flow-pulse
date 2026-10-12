# Cash Flow Pulse

pnpm monorepo：`apps/web`（React + Vite，Cloudflare Pages）、`apps/api`（Hono，Cloudflare Workers + D1）、`packages/shared`（计算逻辑，前后端共用）。

## 工作流程（用户要求）

- **每次改完直接合并到 `main` 并推送，不用再问**：在功能分支上开发 → 跑检查 → fast-forward 合并到 `main` → `git push origin main`。
- 合并前必须通过：`pnpm -r typecheck`、`pnpm --filter @cfp/shared test`、`pnpm --filter @cfp/web build`。
  - `calc.test.ts` 里「computeDashboardV2 向后兼容」的 3 个用例在改动前就失败，不是新问题；其余用例必须全过。
- 前端：推送到 `main` 后由 Cloudflare Pages 自动部署。
- 后端：需要 `wrangler deploy`（`pnpm deploy:api`），要有 `CLOUDFLARE_API_TOKEN`。环境里没有 token 时，合并后提醒用户在本地运行 `pnpm deploy:api`。
- 改了 D1 表结构时，迁移 SQL 放在 `apps/api/src/db/migrate_*.sql`（同步更新 `schema.sql`）。
  会话里有 Cloudflare 连接器时，用它的 `d1_database_query` 对生产库（database_id `222e5633-5a2c-4af7-8efb-dbb0f7d5d6b5`）
  逐条执行；迁移只做加列等向后兼容的改动，并且**先迁移、再合并**。没有连接器时提醒用户执行：
  `wrangler d1 execute cash-flow-pulse-db --remote --file=./src/db/migrate_xxx.sql`
- Cloudflare 连接器不能上传 Worker 代码，后端仍需 `pnpm deploy:api`。

## 约定

- 回复用户用中文。
- 金额单位日元（JPY）；发薪周期 = [上次发薪日, 下次发薪日)，`cycle_id` = 起始发薪日所在年月。
- 多期统计（月均生活成本、储蓄率、财务自由等）统一用 `packages/shared/src/planning.ts` 的 `computeCycleHistory` / `aggregateCycles`，前后端同一口径。
