import { TtlCache } from "./cache";

describe("TtlCache", () => {
  let cache: TtlCache<string>;

  beforeEach(() => {
    cache = new TtlCache<string>();
  });

  describe("set / get", () => {
    it("returns value within TTL", () => {
      cache.set("key1", "value1", 10_000);
      expect(cache.get("key1")).toBe("value1");
    });

    it("returns undefined for missing key", () => {
      expect(cache.get("missing")).toBeUndefined();
    });

    it("returns undefined after expiry", () => {
      jest.useFakeTimers();
      cache.set("key1", "value1", 1_000);
      jest.advanceTimersByTime(2_000);
      expect(cache.get("key1")).toBeUndefined();
      jest.useRealTimers();
    });
  });

  describe("del", () => {
    it("removes a specific key", () => {
      cache.set("a", "x", 10_000);
      cache.del("a");
      expect(cache.get("a")).toBeUndefined();
    });
  });

  describe("delPrefix", () => {
    it("removes all keys with the prefix", () => {
      cache.set("user:1", "a", 10_000);
      cache.set("user:2", "b", 10_000);
      cache.set("other:1", "c", 10_000);
      cache.delPrefix("user:");
      expect(cache.get("user:1")).toBeUndefined();
      expect(cache.get("user:2")).toBeUndefined();
      expect(cache.get("other:1")).toBe("c");
    });
  });

  describe("getOrSet", () => {
    it("calls fn on cache miss and stores result", async () => {
      const fn = jest.fn().mockResolvedValue("computed");
      const result = await cache.getOrSet("k", 10_000, fn);
      expect(result).toBe("computed");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("returns cached value on cache hit without calling fn", async () => {
      cache.set("k", "cached", 10_000);
      const fn = jest.fn().mockResolvedValue("fresh");
      const result = await cache.getOrSet("k", 10_000, fn);
      expect(result).toBe("cached");
      expect(fn).not.toHaveBeenCalled();
    });
  });
});
