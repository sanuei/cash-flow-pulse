# Cash Flow Pulse — Google OAuth 集成方案 (v1.0)

> 范围：把单用户应用改成「个人付费 SaaS 雏形」。  
> 工期：~15-18 小时（2-3 个工作日）。  
> 状态：方案待批准。

---

## 0. 目标 & 非目标

### 目标（M1 必做）
- ✅ 用户用 Google 一键登录
- ✅ 每个人的数据完全隔离（看不到别人）
- ✅ 现有真实数据迁移到你的 Google 账号
- ✅ Free / Pro 两档订阅 + Stripe Checkout 付费
- ✅ 服务条款 + 隐私政策页面

### 非目标（M1 不做）
- ❌ 密码注册（Q3 决定只 Google OAuth）
- ❌ Magic Link / 多登录方式
- ❌ 客户支持邮箱（Sentry + 你的 Telegram 临时顶上）
- ❌ 数据导出 / 账号注销（M2 再做）
- ❌ 邮件营销 / 邀请奖励（M3）

---

## 1. 数据架构变更（核心）

### 1.1 新增 3 张表

```sql
-- 用户表（OAuth 注册后写入）
CREATE TABLE users (
  id            TEXT PRIMARY KEY,         -- UUID
  email         TEXT NOT NULL UNIQUE,     -- Google 邮箱
  name          TEXT,                     -- Google display name
  picture       TEXT,                     -- 头像 URL
  provider      TEXT NOT NULL DEFAULT 'google',
  provider_sub  TEXT NOT NULL,            -- Google sub (OAuth unique user ID)
  tier          TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'pro'
  stripe_customer_id TEXT,                 -- Stripe 客户 ID（付费后回填）
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  last_login_at INTEGER,
  UNIQUE(provider, provider_sub)          -- 同一 provider 内唯一
);

-- 会话表（替代 cookie 的服务端 session）
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,         -- session UUID，存 HttpOnly cookie
  user_id       TEXT NOT NULL REFERENCES users(id),
  expires_at    INTEGER NOT NULL,         -- unix ms
  created_at    INTEGER NOT NULL,
  ip            TEXT,
  user_agent    TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- 订阅历史（Stripe webhook 写）
CREATE TABLE subscriptions (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id),
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  tier                 TEXT NOT NULL,    -- 'pro'
  status               TEXT NOT NULL,    -- 'active' | 'canceled' | 'past_due'
  current_period_start INTEGER,
  current_period_end   INTEGER,
  cancel_at_period_end INTEGER DEFAULT 0,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);
```

### 1.2 现有 8 张表 — **零结构改动**

`user_id` 列已存在（现在都是 `'default'`），改为存真实 user UUID 即可。  
所有 query 改 `WHERE user_id = ?`（bind session 拿到的 user_id）。

### 1.3 数据迁移

```
首次你登录 → 检测 'default' 数据是否存在
            → 存在 → UPDATE 8 张表 SET user_id = <你的新 UUID> WHERE user_id = 'default'
            → 创建 user 记录（tier='pro'，因为你是创始用户）
            → 删除 'default' session 标记（如果存在）
```

写一个 migration hook，在 Google OAuth callback 里检查执行。

---

## 2. 认证流程（Google OAuth 2.0）

```
用户访问 cashflow.soniclab.cc/
  ↓
前端检测：未登录（无 session cookie）
  ↓
跳转到 /api/auth/google （Workers 路由）
  ↓
Workers 302 → Google OAuth consent screen
  ↓
用户授权 → Google 302 回 /api/auth/callback/google?code=xxx
  ↓
Workers 收到 code：
  1. POST https://oauth2.googleapis.com/token { code, client_id, client_secret, redirect_uri }
  2. 拿到 access_token + id_token
  3. JWT verify id_token（验签 Google 证书）
  4. 拿到 { sub, email, name, picture }
  5. UPSERT users 表（首次 = 插入，返回 user.id）
  6. 执行迁移 hook（首次登录 + 'default' 数据存在）
  7. 创建 sessions 行（30 天过期）
  8. Set-Cookie: cfp_session=<session_id>; HttpOnly; Secure; SameSite=Lax
  9. 302 → cashflow.soniclab.cc/
  ↓
前端加载：fetch /api/dashboard 带 cookie（自动）
  ↓
后端中间件：verifySession() → 查 sessions 表 → 把 user 挂到 c.set('user', ...)
  ↓
所有 query 用 c.get('user').id 过滤
```

### 2.1 关键安全决策

| 项 | 决策 | 理由 |
|---|---|---|
| **Session 存哪** | **服务端 DB**（不是 JWT） | 可强制注销 / 可看活跃设备 |
| **Cookie 标志** | `HttpOnly + Secure + SameSite=Lax` | 防 XSS 偷 cookie + 防 CSRF |
| **Session 过期** | 30 天 | 平衡安全 + UX（用户不想天天登录） |
| **Refresh token** | **不要**（Google OAuth 不存 refresh_token） | 单次登录够用，过期重新点 Google |
| **State 参数** | **必须**（防 CSRF） | OAuth 标准 |
| **PKCE** | 不需要（server-side flow） | 我们有 client_secret |

---

## 3. 文件改动清单

| 文件 | 改动 | 行数估计 |
|---|---|---|
| `apps/api/src/db/schema.sql` | 新增 3 张表 | +50 行 |
| `apps/api/src/lib/auth.ts` | **新建** — OAuth flow + session CRUD | +200 行 |
| `apps/api/src/lib/middleware.ts` | **新建** — requireAuth middleware | +30 行 |
| `apps/api/src/migrate.ts` | **新建** — 数据迁移脚本 | +60 行 |
| `apps/api/src/index.ts` | 加 `/api/auth/*` 路由 | +5 行 |
| `apps/api/src/routes/cash.ts` | 改 query 用 session user_id | ~10 处 × 1 行 |
| `apps/api/src/routes/cards.ts` | 同上 | ~10 处 |
| `apps/api/src/routes/snapshots.ts` | 同上 | ~15 处 |
| `apps/api/src/routes/investments.ts` | 同上 | ~10 处 |
| `apps/api/src/routes/bills.ts` | 同上 | ~10 处 |
| `apps/api/src/routes/incomes.ts` | 同上 | ~10 处 |
| `apps/api/src/routes/subscriptions.ts` | 同上 | ~10 处 |
| `apps/api/src/routes/dashboard.ts` | 同上 | ~8 处 |
| `apps/api/src/routes/export-import.ts` | 同上 | ~10 处 |
| `apps/api/src/routes/config.ts` | 同上 | ~5 处 |
| `apps/api/src/lib/utils.ts` | 删 `USER_ID = 'default'` 常量 | -1 行 |
| `apps/web/src/lib/api.ts` | fetch 加 `credentials: 'include'` | +5 行 |
| `apps/web/src/lib/store.ts` | 加 `currentUser` + `login/logout` action | +60 行 |
| `apps/web/src/pages/Login.tsx` | **新建** — 「Sign in with Google」按钮 | +80 行 |
| `apps/web/src/pages/Terms.tsx` | **新建** — 服务条款（用模板） | +150 行 |
| `apps/web/src/pages/Privacy.tsx` | **新建** — 隐私政策（用模板） | +150 行 |
| `apps/web/src/App.tsx` | 加 /login /terms /privacy 路由 | +10 行 |
| `apps/web/src/pages/Settings.tsx` | 加 logout + 订阅状态 UI | +80 行 |

**总计**：~1000 行新增 + ~150 行修改。10 个文件改 + 5 个新文件。

---

## 4. Stripe 集成（M1 第二阶段）

### 4.1 配置

1. **注册 Stripe 账号**（个人身份 OK）
2. **创建 2 个产品**（Pro ¥300/月）
3. **设置 webhook endpoint** `https://cash-flow-pulse-api.sonic980828.workers.dev/api/stripe/webhook`
4. **CF Workers secrets**：
   ```bash
   wrangler secret put STRIPE_SECRET_KEY
   wrangler secret put STRIPE_WEBHOOK_SECRET
   wrangler secret put GOOGLE_CLIENT_SECRET  # 已知
   wrangler secret put GOOGLE_CLIENT_ID      # 已知（虽然不机密但统一管理）
   ```

### 4.2 用户流程

```
用户点「升级 Pro」
  ↓
POST /api/billing/checkout { price_id: 'pro_monthly' }
  ↓
Workers 调 Stripe API 创建 Checkout Session
  ↓
返回 session.url → 前端跳转
  ↓
用户在 Stripe 页面填卡支付
  ↓
Stripe webhook → /api/stripe/webhook (checkout.session.completed)
  ↓
Workers 更新 users.tier='pro' + 写 subscriptions 行
  ↓
前端刷新 → 看到 Pro 状态
```

### 4.3 代码

新增 1 个路由文件 `routes/billing.ts`（~120 行），新增 webhook 签名验证。

---

## 5. CF Access 移除

之前部署的 CF Access policy **全部删除**。Google OAuth 是唯一入口。

需要在 CF Dashboard 操作（我反爬过不去）：
1. Zero Trust → Access → Applications → 删除 cashflow.soniclab.cc 应用
2. Zero Trust → Access → Policies → 删除相关 policy
3. Workers API 路由清理（如果有）

---

## 6. 测试策略

### 6.1 自动化测试（M1 必须）

| 测试 | 工具 | 覆盖 |
|---|---|---|
| OAuth flow 单元测试 | vitest + mock fetch | token 交换 / JWT 验证 |
| Session CRUD 测试 | vitest + miniflare D1 | 创建 / 查询 / 过期 |
| **多用户隔离测试** | vitest + miniflare D1 | **关键**：用 user A session 调 endpoint，验证看不到 user B 数据。**每个 API endpoint 都测** |
| 迁移 hook 测试 | vitest + miniflare D1 | 'default' 数据迁移到新 user_id |

### 6.2 手动验证清单

- [ ] 注销 CF Access 后，未登录访问 cashflow.soniclab.cc → 跳登录页
- [ ] 点 Google 登录 → 跳 Google consent → 授权 → 回主页
- [ ] Dashboard 加载 → 看到自己的 3 cash + 3 cards
- [ ] 注销按钮工作 → cookie 清掉 → 跳登录页
- [ ] 用隐身模式开新会话，登录另一个 Google 账号 → 看到空 dashboard（隔离生效）
- [ ] Stripe 测试卡 `4242 4242 4242 4242` 付 Pro → webhook 收到 → tier='pro'
- [ ] 服务条款 / 隐私政策页可访问

---

## 7. 风险清单

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 多用户隔离漏写 WHERE | **高** | **致命**（数据泄露） | 每个 endpoint 写集成测试 + code review 强制 list |
| Google OAuth 配置错（redirect_uri 不匹配） | 中 | 中 | Google Console 严格配 + 本地测试 |
| Stripe webhook 重放攻击 | 低 | 高 | 验签 + idempotency key |
| Session 表数据增长（不清理过期） | 中 | 低 | 加 cron：每天删 expires_at < now 的行 |
| 迁移 hook 失败导致数据丢失 | 低 | **致命** | **迁移前自动备份到 KV** + 加 manual recovery |
| 用户点「注销」删账号 | 待 M2 | — | M2 处理 |
| 服务条款法律风险 | 低 | 中 | 用 iubenda 模板（¥1000/年） |

---

## 8. 时间估算

| 阶段 | 任务 | 工时 |
|---|---|---|
| **Phase A** | DB schema + auth lib + OAuth flow + 前端登录页 | **6-8 小时** |
| **Phase B** | 迁移 hook + 全 API 加 requireAuth 中间件 + 多用户隔离 | **4-5 小时** |
| **Phase C** | Stripe 集成 + 服务条款/隐私页 | **3-4 小时** |
| **Phase D** | 测试 + 部署 + 验证 | **2-3 小时** |
| **总计** | | **15-20 小时**（2-3 个工作日） |

---

## 9. 立即可做（下一步）

如果你批准这个方案，按这个顺序执行：

1. **🚨 你立刻**：去 Google Cloud Console **轮换 Client Secret**（之前你贴到对话里了）
2. **我立刻**：写 schema.sql 新增 3 张表 + auth.ts OAuth 核心
3. **你轮换完给我新 secret** → 我部署后端 → 跑迁移
4. **我加 Stripe** → 你注册 Stripe + 给我 API key
5. **我部署 + 测多用户隔离** → 上线

---

## 10. 不在 M1 范围（未来）

- M2：Magic Link 备选 + 数据导出 + 账号注销 + Sentry
- M3：邮件营销 + SEO + 邀请奖励 + 国际化
- v2.0：iOS/Android App（PWA + Capacitor 包装）

---

**方案作者**：Hermes Agent  
**待批准**：是 / 否 / 修改