export class TtlCache<T = unknown> {
  private store = new Map<string, { value: T; exp: number }>();

  set(key: string, value: T, ttlMs: number) {
    this.store.set(key, { value, exp: Date.now() + ttlMs });
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.exp) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  del(key: string) {
    this.store.delete(key);
  }

  delPrefix(prefix: string) {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }
}

export const apiCache = new TtlCache();
