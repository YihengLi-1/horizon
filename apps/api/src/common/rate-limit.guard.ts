import { Injectable } from "@nestjs/common";
import { ThrottlerGuard, type ThrottlerRequest } from "@nestjs/throttler";

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, limit, throttler, blockDuration, getTracker, generateKey, ttl } = requestProps;
    const { req, res } = this.getRequestResponse(context);
    const throttlerName = throttler.name ?? "default";
    const ignoreUserAgents = throttler.ignoreUserAgents ?? this.commonOptions.ignoreUserAgents;

    if (Array.isArray(ignoreUserAgents)) {
      for (const pattern of ignoreUserAgents) {
        if (pattern.test(req.headers["user-agent"])) {
          return true;
        }
      }
    }

    const tracker = await getTracker(req, context);
    const key = generateKey(context, tracker, throttlerName);
    const { totalHits, timeToExpire, isBlocked, timeToBlockExpire } = await this.storageService.increment(
      key,
      ttl,
      limit,
      blockDuration,
      throttlerName
    );
    const getThrottlerSuffix = (name: string) => (name === "default" ? "" : `-${name}`);
    const setHeaders = throttler.setHeaders ?? this.commonOptions.setHeaders ?? true;

    if (setHeaders) {
      const suffix = getThrottlerSuffix(throttlerName);
      const remaining = Math.max(0, limit - totalHits);
      const resetInSeconds = isBlocked ? timeToBlockExpire : timeToExpire;
      const resetAt = Math.floor(Date.now() / 1000) + Math.max(0, resetInSeconds);

      res.header(`${this.headerPrefix}-Limit${suffix}`, limit);
      res.header(`${this.headerPrefix}-Remaining${suffix}`, isBlocked ? 0 : remaining);
      res.header(`${this.headerPrefix}-Reset${suffix}`, resetAt);

      if (isBlocked) {
        res.header(`Retry-After${suffix}`, Math.max(0, timeToBlockExpire));
      }
    }

    if (isBlocked) {
      await this.throwThrottlingException(context, {
        limit,
        ttl,
        key,
        tracker,
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire
      });
    }

    return true;
  }
}
