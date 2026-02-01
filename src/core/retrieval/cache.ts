export interface Cache {
  get(key: string): number[] | undefined;
  set(key: string, value: number[]): void;
  clear(): void;
}

export class LruCache implements Cache {
  private maxSize: number;
  private map: Map<string, number[]>;

  constructor(maxSize: number) {
    this.maxSize = Math.max(1, maxSize);
    this.map = new Map();
  }

  get(key: string): number[] | undefined {
    const value = this.map.get(key);
    if (!value) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: number[]): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      const first = this.map.keys().next().value as string | undefined;
      if (first) this.map.delete(first);
    }
  }

  clear(): void {
    this.map.clear();
  }
}
