import { useEffect, useRef, useState } from 'react';
import type { SimInput } from '@cfp/shared';
import type { SimJob } from './simWorker';

// 对联合类型逐个去掉 id（普通 Omit 会把联合压扁）
type JobInput = SimJob extends infer J ? (J extends unknown ? Omit<J, 'id'> : never) : never;

/**
 * 把一个计算丢给专属 Worker：参数变化后停顿 delay 毫秒再算，只保留最新一次的结果。
 * 计算中返回上一份结果（stale = true），图表不会闪成空白。
 * key 用 JSON 序列化后的参数，避免对象引用变化引起的重复计算。
 */
function useWorkerJob<T>(job: JobInput | null, delay: number): { data: T | null; pending: boolean } {
  const workerRef = useRef<Worker | null>(null);
  const seq = useRef(0);
  const [data, setData] = useState<T | null>(null);
  const [pending, setPending] = useState(false);
  const key = job ? JSON.stringify(job) : '';

  // 卸载时结束 Worker，并清掉引用（StrictMode / 热更新会重跑副作用，之后要能重新创建）
  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => {
    if (!job) return;
    setPending(true);
    const timer = setTimeout(() => {
      if (!workerRef.current) {
        workerRef.current = new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' });
      }
      const w = workerRef.current;
      const id = ++seq.current;
      w.onmessage = (e: MessageEvent<{ id: number; result?: T; error?: string }>) => {
        if (e.data.id !== seq.current) return; // 过时的结果丢掉
        if (e.data.result) setData(e.data.result);
        setPending(false);
      };
      w.postMessage({ ...job, id } as SimJob);
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delay]);

  return { data, pending };
}

export function useMonteCarlo(input: SimInput | null) {
  return useWorkerJob<import('@cfp/shared').MonteCarloResult>(input ? { kind: 'mc', input } : null, 150);
}

export function useSuccessGrid(input: SimInput | null, axes: { ages: number[]; spends: number[] } | null) {
  return useWorkerJob<import('@cfp/shared').SuccessGrid>(input && axes ? { kind: 'grid', input, axes } : null, 450);
}

/** 方案对比：每个方案各跑一次随机模拟（结果顺序与 inputs 一致） */
export function useMonteCarloMany(inputs: SimInput[] | null) {
  return useWorkerJob<import('@cfp/shared').MonteCarloResult[]>(inputs && inputs.length ? { kind: 'mcMany', inputs } : null, 300);
}
