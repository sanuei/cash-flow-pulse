/**
 * 登录页（v1.4 升级 — 现代化 SaaS landing 风格）
 *
 * 布局:
 *   - 桌面: 左右双栏(50/50)
 *     左: Hero(品牌定位 + Google 登录 + 信任标识)
 *     右: 3 个功能特性预览(每张 mini 截图)
 *   - 移动: 单列堆叠(hero 优先)
 *
 * 风格:
 *   - 全屏 radial-gradient 背景(品牌色光晕)
 *   - 大号 Logo(替换旧的钱包图标)
 *   - sans-serif 标题(科技感,与 neon 主题匹配)
 *   - 信任/特性卡用主题色 accent
 */

import { useStore } from '../lib/store';
import { Icon, type IconName } from '../components/Icon';
import { Logo } from '../components/Logo';

export function Login() {
  const startGoogleLogin = useStore((s) => s.startGoogleLogin);

  return (
    <div className="min-h-screen bg-notion-bg relative overflow-hidden">
      {/* 背景:品牌色光晕(neon 主题下绿色,violet 紫色,等等) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(60% 50% at 0% 0%, var(--c-accent) 0%, transparent 60%),' +
            'radial-gradient(50% 50% at 100% 100%, var(--c-accent) 0%, transparent 60%)',
          opacity: 0.08,
        }}
      />

      <div className="relative z-10 min-h-screen flex flex-col lg:flex-row">
        {/* ===== 左栏: Hero + 登录 ===== */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-12">
          <div className="max-w-md w-full">
            {/* Logo */}
            <div className="mb-8 lg:mb-10">
              <Logo size={28} />
            </div>

            {/* Hero 标题 */}
            <h1 className="text-[32px] sm:text-[40px] lg:text-[44px] font-bold leading-[1.1] tracking-tight-section text-notion-text font-sans mb-5">
              你的钱
              <br />
              <span className="text-[var(--c-accent)]">每个发薪日</span>
              <br />
              都能撑到下个发薪日
            </h1>

            <p className="text-[15px] sm:text-[16px] text-notion-text-secondary leading-relaxed mb-10 max-w-sm">
              个人现金流可视化工具。
              实时日均预算 · 现金走势 · 收入支出分析，
              无需手动记账。
            </p>

            {/* Google 登录按钮 */}
            <button
              onClick={startGoogleLogin}
              className="
                w-full flex items-center justify-center gap-3 px-5 py-3.5
                rounded-[var(--radius-lg)]
                border border-[var(--c-border)] bg-[var(--c-bg-elev)]
                hover:border-[var(--c-border-strong)] hover:shadow-[var(--shadow-md)]
                active:scale-[0.99]
                transition-all duration-[var(--dur-base)] ease-[var(--ease-out-expo)]
                text-[15px] font-semibold text-notion-text
              "
            >
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              使用 Google 账号登录
            </button>

            {/* 信任标识 — 3 个小点 */}
            <ul className="mt-8 space-y-2.5 text-[13px] text-notion-text-secondary">
              <li className="flex items-center gap-2">
                <CheckIcon />
                <span>一键登录，不用记密码</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon />
                <span>数据只存在你的 Cloudflare 账户，加密传输</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon />
                <span>无广告 · 无追踪 · 开源透明</span>
              </li>
            </ul>

            {/* Footer */}
            <p className="mt-10 text-[12px] text-notion-text-muted">
              登录即表示同意
              <a href="/terms" className="text-[var(--c-accent-text)] hover:underline mx-1.5">服务条款</a>
              和
              <a href="/privacy" className="text-[var(--c-accent-text)] hover:underline mx-1.5">隐私政策</a>
            </p>
          </div>
        </div>

        {/* ===== 右栏: 3 个功能特性预览(桌面端才显示) ===== */}
        <div className="hidden lg:flex flex-1 items-center justify-center p-12 bg-[var(--c-bg-alt)]/40 border-l border-[var(--c-border)]">
          <div className="max-w-md w-full space-y-4">
            <FeatureCard
              icon="gauge"
              iconBg="var(--c-accent-soft)"
              iconColor="var(--c-accent-text)"
              title="日均预算"
              desc="实时算出每天能花多少,告别月底超支"
              preview="¥3,888 / 日"
            />
            <FeatureCard
              icon="chart"
              iconBg="var(--c-success-soft, oklch(95% 0.038 152))"
              iconColor="var(--c-success)"
              title="现金走势"
              desc="每日快照,看净可用现金的变化趋势"
              preview="30 天趋势"
            />
            <FeatureCard
              icon="pie"
              iconBg="var(--c-warning-soft, oklch(95% 0.045 38))"
              iconColor="var(--c-warning)"
              title="收支分析"
              desc="信用卡、账单、订阅、投资一目了然"
              preview="4 类别聚合"
            />

            {/* 底部用户证言 */}
            <div className="pt-6 mt-6 border-t border-[var(--c-border)]">
              <p className="text-[12px] text-notion-text-muted italic leading-relaxed">
                "从月光族变成有储蓄习惯,半年攒下了 ¥120,000"
              </p>
              <p className="text-[11px] text-notion-text-muted mt-2">
                — Early Beta 用户
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * FeatureCard — 单个功能特性预览卡
 */
function FeatureCard({
  icon,
  iconBg,
  iconColor,
  title,
  desc,
  preview,
}: {
  icon: IconName;
  iconBg: string;
  iconColor: string;
  title: string;
  desc: string;
  preview: string;
}) {
  return (
    <div className="
      group flex items-center gap-4 p-4
      rounded-[var(--radius-lg)]
      bg-[var(--c-bg-elev)]
      border border-[var(--c-border)]
      hover:border-[var(--c-border-strong)] hover:shadow-[var(--shadow-md)]
      transition-all duration-[var(--dur-base)] ease-[var(--ease-out-expo)]
    ">
      <div
        className="flex-shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-[var(--radius-md)]"
        style={{ background: iconBg }}
      >
        <Icon name={icon} size={20} strokeWidth={1.75} style={{ color: iconColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[14px] font-semibold text-notion-text">{title}</h3>
          <span className="font-numeric tabular-nums text-[13px] font-semibold text-[var(--c-accent-text)] truncate">
            {preview}
          </span>
        </div>
        <p className="text-[12.5px] text-notion-text-secondary mt-0.5 leading-snug">
          {desc}
        </p>
      </div>
    </div>
  );
}

/**
 * CheckIcon — 主题色 checkmark
 */
function CheckIcon() {
  return (
    <span className="flex-shrink-0 w-4 h-4 inline-flex items-center justify-center rounded-full bg-[var(--c-accent-soft)]">
      <Icon name="check" size={11} strokeWidth={2.5} className="text-[var(--c-accent-text)]" />
    </span>
  );
}
