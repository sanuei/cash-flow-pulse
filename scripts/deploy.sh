#!/bin/bash
# =============================================================================
# Cash Flow Pulse — 一键部署脚本 (v0.9)
# =============================================================================
# 部署顺序（依赖关系）：
#   1. D1 数据库        ← 必须最先（其他依赖）
#   2. Workers API      ← 依赖 D1
#   3. Pages 前端       ← 依赖 Workers API URL（要注入 CORS）
#   4. soniclab-router  ← 依赖 Workers API URL（要转发 /api/*）
#   5. DNS + 验证       ← 最后一步
#
# 使用：
#   1. 先在终端跑： wrangler login
#   2. 然后跑：    ./scripts/deploy.sh
#
# 可选环境变量：
#   SKIP_DNS=1    跳过 DNS 配置步骤（已配过时用）
#   SKIP_ROUTER=1 跳过 soniclab-router 部署（router 已存在）
# =============================================================================

set -e

# 颜色
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

# --- 前置检查 ---
step "0. 前置检查"
command -v wrangler >/dev/null || fail "wrangler 未安装（brew install wrangler 或 pnpm add -g wrangler）"
command -v pnpm >/dev/null || fail "pnpm 未安装"
WRANGLER_VERSION=$(wrangler --version 2>&1 | head -1)
ok "wrangler: $WRANGLER_VERSION"

# 检查登录状态
if ! wrangler whoami >/dev/null 2>&1; then
  fail "未登录 Cloudflare。请先跑： wrangler login"
fi
WHOAMI=$(wrangler whoami 2>&1 | head -3 | tail -1)
ok "已登录: $WHOAMI"

# 检查依赖
[ -d "node_modules" ] || pnpm install
ok "依赖已就绪"

# --- Step 1: D1 数据库 ---
step "1/5. D1 数据库"
cd apps/api

if grep -q 'database_id = "REPLACE_WITH_REAL_ID"' wrangler.toml; then
  warn "检测到 wrangler.toml 中 database_id 还是占位符，需要先创建 D1"
  echo "  正在执行: wrangler d1 create cash-flow-pulse-db"
  
  D1_OUTPUT=$(wrangler d1 create cash-flow-pulse-db 2>&1)
  echo "$D1_OUTPUT"
  
  # 解析 database_id
  D1_ID=$(echo "$D1_OUTPUT" | grep -oE '"database_id":\s*"[a-f0-9-]+"' | head -1 | grep -oE '[a-f0-9-]{36}')
  
  if [ -z "$D1_ID" ]; then
    D1_ID=$(echo "$D1_OUTPUT" | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | head -1)
  fi
  
  [ -z "$D1_ID" ] && fail "无法从 wrangler 输出解析 database_id，请手动填入 wrangler.toml"
  
  ok "创建成功: database_id = $D1_ID"
  
  # 回填 wrangler.toml
  sed -i '' "s/database_id = \"REPLACE_WITH_REAL_ID\"/database_id = \"$D1_ID\"/" wrangler.toml
  ok "已回填 wrangler.toml"
else
  D1_ID=$(grep 'database_id' wrangler.toml | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | head -1)
  ok "D1 database_id 已存在: $D1_ID"
fi

# 初始化 schema
echo "  正在初始化生产 D1 schema..."
wrangler d1 execute cash-flow-pulse-db --file=./src/db/schema.sql --remote
ok "D1 schema 已初始化（8 张表）"

cd "$PROJECT_ROOT"

# --- Step 2: Workers API ---
step "2/5. Workers API"
cd apps/api
echo "  正在部署 Workers..."
DEPLOY_OUTPUT=$(wrangler deploy 2>&1)
echo "$DEPLOY_OUTPUT"

# 解析 workers.dev URL
API_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://[a-z0-9-]+\.workers\.dev' | head -1)
[ -z "$API_URL" ] && fail "无法解析 Workers URL，请检查 deploy 输出"

ok "Workers 已部署: $API_URL"

# 验证 health endpoint
HEALTH=$(curl -s "$API_URL/api/health" 2>&1 || echo "FAILED")
echo "  Health check: $HEALTH"
echo "$HEALTH" | grep -q '"ok"' || warn "Health check 未通过（可能是 CORS 或网络问题，登录后再确认）"

cd "$PROJECT_ROOT"

# --- Step 3: Pages 前端 ---
step "3/5. Pages 前端"
cd apps/web
echo "  正在构建前端..."
pnpm build 2>&1 | tail -20

if [ ! -f "dist/index.html" ]; then
  fail "dist/index.html 未生成，build 失败"
fi
ok "前端已构建: dist/index.html"

# Pages 部署（首次需要先在 Dashboard 创建项目，或者用 wrangler 直接传 dist）
# 这里用 wrangler pages deploy 直传 dist
PAGES_PROJECT="cash-flow-pulse"
echo "  正在部署到 Cloudflare Pages（项目: $PAGES_PROJECT）..."

# 检查项目是否存在，不存在则创建
if ! wrangler pages project list 2>/dev/null | grep -q "$PAGES_PROJECT"; then
  warn "Pages 项目 $PAGES_PROJECT 不存在，正在创建..."
  wrangler pages project create "$PAGES_PROJECT" --production-branch=main --compatibility-date=2024-12-01 || true
fi

wrangler pages deploy dist --project-name="$PAGES_PROJECT" --branch=main --commit-dirty=true 2>&1 | tail -10

PAGES_URL="https://${PAGES_PROJECT}.pages.dev"
ok "Pages 已部署: $PAGES_URL"

cd "$PROJECT_ROOT"

# --- Step 4: soniclab-router ---
step "4/5. soniclab-router（cash.soniclab.cc 代理）"
if [ -n "$SKIP_ROUTER" ]; then
  warn "SKIP_ROUTER=1，跳过 router 部署"
else
  cd ../_infrastructure/soniclab-router
  
  # 把 Workers API URL 注入 router 的 env
  echo "  注入 CFP_API_HOST=$API_URL"
  # 通过 wrangler secret 太重，这里临时写入 wrangler.toml 的 vars
  if ! grep -q "CFP_API_HOST" wrangler.toml; then
    sed -i '' "/\[vars\]/a\\
CFP_API_HOST = \"$API_URL\"" wrangler.toml
  else
    sed -i '' "s|CFP_API_HOST = .*|CFP_API_HOST = \"$API_URL\"|" wrangler.toml
  fi
  
  echo "  正在部署 soniclab-router..."
  wrangler deploy 2>&1 | tail -10
  ok "soniclab-router 已部署"
  
  cd "$PROJECT_ROOT"
fi

# --- Step 5: DNS ---
step "5/5. DNS 验证"
if [ -n "$SKIP_DNS" ]; then
  warn "SKIP_DNS=1，跳过 DNS 检查"
else
  echo "  检查 cash.soniclab.cc 解析..."
  CASH_DNS=$(dig +short cash.soniclab.cc 2>/dev/null | head -3)
  if [ -z "$CASH_DNS" ]; then
    warn "cash.soniclab.cc 还没有 DNS 记录"
    echo "  请在 Cloudflare Dashboard → soniclab.cc → DNS 添加："
    echo "    类型: CNAME"
    echo "    名称: cash"
    echo "    目标: soniclab-router.<your-subdomain>.workers.dev"
    echo "    代理: ✓ (Proxied)"
    echo ""
    echo "  或者 Workers → soniclab-router → Settings → Triggers → Routes 添加："
    echo "    Pattern: cash.soniclab.cc/*"
    echo "    Zone: soniclab.cc"
  else
    ok "cash.soniclab.cc 已解析: $CASH_DNS"
  fi
fi

# --- 收尾 ---
step "🎉 部署完成"
echo ""
echo -e "${GREEN}部署总结：${NC}"
echo "  • Workers API:  $API_URL"
echo "  • Pages:        $PAGES_URL"
echo "  • 自定义域名:   https://cash.soniclab.cc  (DNS 配置后 1-5 分钟生效)"
echo ""
echo "下一步验证（DNS 生效后）："
echo "  curl -s https://cash.soniclab.cc/api/health"
echo "  open https://cash.soniclab.cc"
echo ""
echo "如果 Health 检查失败，先打开：$API_URL/api/health 确认 Workers 本身能通"
echo ""