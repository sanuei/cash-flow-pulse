/**
 * 财富模拟的后台计算（Web Worker）：随机模拟 1000 次、成功率热力图、方案对比（多个方案各跑一次随机模拟）。
 * 放在 Worker 里，拖动滑块时主线程不卡。
 */
import { monteCarlo, successGrid, type SimInput } from '@cfp/shared';

export type SimJob =
  | { id: number; kind: 'mc'; input: SimInput }
  | { id: number; kind: 'grid'; input: SimInput; axes: { ages: number[]; spends: number[] } }
  | { id: number; kind: 'mcMany'; inputs: SimInput[] };

self.onmessage = (e: MessageEvent<SimJob>) => {
  const job = e.data;
  try {
    const result =
      job.kind === 'mc' ? monteCarlo(job.input)
      : job.kind === 'grid' ? successGrid(job.input, job.axes)
      : job.inputs.map((i) => monteCarlo(i));
    (self as unknown as Worker).postMessage({ id: job.id, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: job.id, error: String(err) });
  }
};
