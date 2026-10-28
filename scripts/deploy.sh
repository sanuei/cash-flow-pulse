#!/bin/bash
# =============================================================================
# Cash Flow Pulse — 本地手动部署（应急用）
# =============================================================================
# 正常情况下推送到 main 即由 Workers Builds 自动部署，不需要这个脚本。
# 详见 docs/deployment.md。
#
# 前端 + API 是同一个 Worker（cash-flow-pulse-api），一次 wrangler deploy 上传全部。
# 脚本会先确认本地和 origin/main 一致，避免从落后的目录部署导致线上回滚。
#
# 使用：
#   1. wrangler login（首次）
#   2. ./scripts/deploy.sh
#
# 可选环境变量：
#   ALLOW_DIRTY=1   允许有未提交改动 / 不在 origin/main 上时部署（自己确认风险）
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

step() { echo -e "\n${BLUE}═══ $1 ═══${NC}"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

step "1/4. 检查代码版本"
git fetch -q origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
DIRTY=$(git status --porcelain)
if [ "$LOCAL" != "$REMOTE" ] || [ -n "$DIRTY" ]; then
  if [ -n "$ALLOW_DIRTY" ]; then
    warn "本地与 origin/main 不一致（ALLOW_DIRTY=1，继续）"
  else
    [ "$LOCAL" != "$REMOTE" ] && echo "  HEAD $(git rev-parse --short HEAD) ≠ origin/main $(git rev-parse --short origin/main)"
    [ -n "$DIRTY" ] && echo "  有未提交的改动"
    fail "部署的是本地文件，不一致会把线上改成本地版本。先同步，或设 ALLOW_DIRTY=1"
  fi
else
  ok "与 origin/main 一致：$(git log --oneline -1)"
fi

step "2/4. 安装依赖"
pnpm install --frozen-lockfile
ok "依赖已就绪"

step "3/4. 构建前端 + 部署 Worker"
cd apps/api
pnpm exec wrangler whoami >/dev/null 2>&1 || fail "未登录 Cloudflare，先跑：pnpm --filter @cfp/api exec wrangler login"
pnpm run deploy
cd "$PROJECT_ROOT"

step "4/4. 健康检查"
HEALTH=$(curl -s https://cashflow.soniclab.cc/api/health || echo "FAILED")
echo "  /api/health → $HEALTH"
echo "$HEALTH" | grep -q '"ok"' && ok "API 正常" || warn "健康检查未通过，去 Worker 日志看看"

echo -e "\n${GREEN}🎉 部署完成${NC}  https://cashflow.soniclab.cc"
