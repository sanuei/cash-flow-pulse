import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';

// 悬浮快捷入口：点击跳转到「AI 财务诊断」页（/diagnosis）。
// 用 createPortal 挂到 body，避免祖先 transform 让 fixed 失效。
export function AiDiagnosis() {
  return createPortal(
    <Link
      to="/diagnosis"
      aria-label="AI 财务诊断"
      className="
        fixed z-40 right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))]
        sm:right-6 sm:bottom-6
        inline-flex items-center gap-2 pl-3.5 pr-4 py-3 rounded-[var(--radius-pill)]
        bg-[var(--c-accent)] text-[#0a0a0a] shadow-[var(--shadow-lg)]
        hover:brightness-105 active:scale-95
        transition-[transform,filter] duration-[var(--dur-base)] ease-[var(--ease-out-expo)]
      "
    >
      <Icon name="gauge" size={17} strokeWidth={1.9} />
      <span className="text-[13px] font-semibold">AI 诊断</span>
    </Link>,
    document.body,
  );
}
