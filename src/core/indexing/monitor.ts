import os from 'os';
import { ErrorHandlingConfig } from './config';

export interface MemorySnapshot {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  budgetMb: number;
  usageRatio: number;
  warning: boolean;
  critical: boolean;
}

export class MemoryMonitor {
  private budgetMb: number;
  private warnThreshold: number;
  private criticalThreshold: number;
  private lastSnapshot: MemorySnapshot | null;

  constructor(config: { budgetMb: number; warningThreshold: number; criticalThreshold: number }) {
    this.budgetMb = Math.max(1, config.budgetMb);
    this.warnThreshold = clamp(config.warningThreshold, 0, 1);
    this.criticalThreshold = clamp(config.criticalThreshold, 0, 1);
    this.lastSnapshot = null;
  }

  static fromErrorConfig(config: ErrorHandlingConfig, budgetMb: number): MemoryMonitor {
    return new MemoryMonitor({
      budgetMb,
      warningThreshold: config.memoryWarningThreshold,
      criticalThreshold: config.memoryCriticalThreshold,
    });
  }

  sample(): MemorySnapshot {
    const mem = process.memoryUsage();
    const rssMb = bytesToMb(mem.rss);
    const heapUsedMb = bytesToMb(mem.heapUsed);
    const heapTotalMb = bytesToMb(mem.heapTotal);
    const externalMb = bytesToMb(mem.external ?? 0);
    const usageRatio = this.budgetMb > 0 ? rssMb / this.budgetMb : 0;
    const warning = usageRatio >= this.warnThreshold;
    const critical = usageRatio >= this.criticalThreshold;
    const snapshot: MemorySnapshot = {
      rssMb,
      heapUsedMb,
      heapTotalMb,
      externalMb,
      budgetMb: this.budgetMb,
      usageRatio,
      warning,
      critical,
    };
    this.lastSnapshot = snapshot;
    return snapshot;
  }

  getLastSnapshot(): MemorySnapshot | null {
    return this.lastSnapshot;
  }

  shouldThrottle(): boolean {
    return Boolean(this.lastSnapshot?.critical);
  }

  async throttleIfNeeded(): Promise<void> {
    if (!this.shouldThrottle()) return;
    const delayMs = Math.min(250, Math.max(25, Math.round((this.lastSnapshot?.usageRatio ?? 1) * 50)));
    await sleep(delayMs);
  }

  adaptWorkerCount(current: number): number {
    if (!this.lastSnapshot) return current;
    if (this.lastSnapshot.critical) return Math.max(1, Math.floor(current / 2));
    if (this.lastSnapshot.warning) return Math.max(1, current - 1);
    return current;
  }
}

export function getSystemMemoryBudgetMb(): number {
  const total = bytesToMb(os.totalmem());
  return Math.max(256, Math.floor(total * 0.5));
}

function bytesToMb(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
