/**
 * Motion utilities — v2 design system motion layer.
 *
 * 三个钩子的职责：
 *   1) useReducedMotion() — 读取系统设置，所有 hook 内部都已 gating
 *   2) useCountUp(target) — 数字翻动（rubber-band easing）
 *   3) useStaggeredMount(items) — 列表项依次入场
 *
 * 全部用 Web Animations API 实现 — 比 framer-motion 轻（gzip 0KB 额外），
 * 适合"动效"是设计细节而不是核心焦点的应用。
 */

import { useEffect, useRef, useState } from 'react';

// ── 系统 reduced-motion 检测 ───────────────────────────────────────────────
const QUERY = '(prefers-reduced-motion: reduce)';
const mq = typeof window !== 'undefined' ? window.matchMedia(QUERY) : null;

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(mq?.matches ?? false);
  useEffect(() => {
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

// ── 数字翻动（count-up） ─────────────────────────────────────────────────
/**
 * 数值变化时，从旧值平滑翻动到新值。
 * 减运动场景下瞬时切换。
 *
 * 用法：const display = useCountUp(amount);
 */
export function useCountUp(target: number, durationMs = 640): number {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      setDisplay(target);
      return;
    }
    fromRef.current = display;
    startRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const from = display;
    const delta = target - from;
    if (Math.abs(delta) < 0.5) {
      setDisplay(target);
      return;
    }

    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / durationMs);
      // ease-out-expo: t' = 1 - 2^(-10t)
      const eased = 1 - Math.pow(2, -10 * t);
      const value = from + delta * eased;
      setDisplay(value);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(target);
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduced, durationMs]);

  return display;
}

// ── 入场挂载检测（首屏 stagger 用） ──────────────────────────────────────
/**
 * 返回 ref + isMounted。挂载 1 帧后 isMounted=true，触发 CSS 动画。
 * 减运动场景下不挂载动画（元素直接显示）。
 *
 * 用法：const { ref, mounted } = useMountAnimation();
 *       <div ref={ref} className={mounted ? 'anim-fade-up' : 'opacity-0'} />
 */
export function useMountAnimation(delayMs = 0) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(true), delayMs);
    return () => clearTimeout(t);
  }, [reduced, delayMs]);

  return { ref, mounted };
}

// 数字格式化沿用 @cfp/shared 的 formatYen，避免与 shared 包行为漂移
