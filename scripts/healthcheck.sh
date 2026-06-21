#!/bin/bash
# Cash Flow Pulse — 健康检查
# 快速验证 4 个组件都还活着

set -e

PAGES_URL="https://cash-flow-pulse.pages.dev"
API_URL="https://cash-flow-pulse-api.sonic980828.workers.dev"

echo "=== 1. Pages 前端 ==="
curl -sI "$PAGES_URL" | head -1 || echo "❌ Pages 不可达"

echo ""
echo "=== 2. Workers API health ==="
HEALTH=$(curl -s "$API_URL/api/health")
echo "$HEALTH"
echo "$HEALTH" | grep -q '"ok"' && echo "✅ API 健康" || echo "❌ API 异常"

echo ""
echo "=== 3. D1 config 读取 ==="
curl -s "$API_URL/api/config"

echo ""
echo "=== 4. Cash 列表 ==="
curl -s "$API_URL/api/cash" | python3 -m json.tool 2>/dev/null || curl -s "$API_URL/api/cash"

echo ""
echo "=== 5. Dashboard 一站式接口 ==="
curl -s "$API_URL/api/dashboard" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"  净可用: ¥{d.get('net_available', 0):,}\"); print(f\"  日均预算: ¥{d.get('daily_budget', 0):,} / 日\")" 2>/dev/null || curl -s "$API_URL/api/dashboard"