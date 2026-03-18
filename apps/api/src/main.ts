import "reflect-metadata";
import compression from "compression";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "crypto";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AuditService } from "./audit/audit.service";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/global-exception.filter";
import { StructuredLogger } from "./common/logger";
import { PrismaService } from "./common/prisma.service";
import { NotificationsService } from "./notifications/notifications.service";

async function bootstrap() {
  const expandLoopbackOrigins = (origins: Iterable<string>): Set<string> => {
    const expanded = new Set<string>();
    for (const origin of origins) {
      const trimmed = origin.trim().replace(/\/+$/, "");
      if (!trimmed) continue;
      expanded.add(trimmed);
      try {
        const parsed = new URL(trimmed);
        if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
          const alt = new URL(trimmed);
          alt.hostname = parsed.hostname === "localhost" ? "127.0.0.1" : "localhost";
          expanded.add(alt.toString().replace(/\/+$/, ""));
        }
      } catch {
        // Keep the original origin only.
      }
    }
    return expanded;
  };

  const logger = new StructuredLogger();
  const app = await NestFactory.create(AppModule, { logger });
  const auditService = app.get(AuditService);
  const notificationsService = app.get(NotificationsService);
  const prisma = app.get(PrismaService);
  app.use(compression({ threshold: 1024 }));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          reportUri: ["/ops/csp-report"]
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: { maxAge: 31536000, includeSubDomains: true },
    })
  );

  const bootAt = Date.now();
  const metrics = {
    requestsTotal: 0,
    errorResponsesTotal: 0,
    byMethod: new Map<string, number>(),
    byStatusCode: new Map<string, number>(),
    byRoute: new Map<string, number>(),
    security: {
      csrfOriginBlocked: 0,
      csrfTokenInvalid: 0,
      loginRateLimited: 0
    }
  };
  const durationHistogramBounds = [0.1, 0.3, 0.5, 1, 2, 5];
  const durationHistogramCounts = new Map<string, number>(
    [...durationHistogramBounds.map((bound) => [bound.toString(), 0] as const), ["+Inf", 0]]
  );
  let durationSumSeconds = 0;
  let durationCount = 0;
  const metricsHistory: Array<{
    ts: number;
    requestsTotal: number;
    errorResponsesTotal: number;
    rss: number;
  }> = [];
  const metricsHistoryTimer = setInterval(() => {
    metricsHistory.push({
      ts: Date.now(),
      requestsTotal: metrics.requestsTotal,
      errorResponsesTotal: metrics.errorResponsesTotal,
      rss: process.memoryUsage().rss
    });
    if (metricsHistory.length > 10) {
      metricsHistory.shift();
    }
  }, 5 * 60 * 1000);
  metricsHistoryTimer.unref?.();
  const parseNumberEnv = (name: string, fallback: number): number => {
    const raw = Number(process.env[name]);
    return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
  };
  const securityAlertThresholds = {
    csrfOriginBlocked: parseNumberEnv("ALERT_CSRF_ORIGIN_BLOCKED_THRESHOLD", 5),
    csrfTokenInvalid: parseNumberEnv("ALERT_CSRF_TOKEN_INVALID_THRESHOLD", 20),
    loginRateLimited: parseNumberEnv("ALERT_LOGIN_RATE_LIMITED_THRESHOLD", 10),
    errorRatePercent: parseNumberEnv("ALERT_HTTP_ERROR_RATE_PERCENT", 5),
    mailDeliveryFailed: parseNumberEnv("ALERT_MAIL_DELIVERY_FAILED_THRESHOLD", 3),
    mailFailureRatePercent: parseNumberEnv("ALERT_MAIL_FAILURE_RATE_PERCENT", 30),
    mailSuccessStaleMinutes: parseNumberEnv("ALERT_MAIL_SUCCESS_STALE_MINUTES", 60)
  };

  const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
  const tokenNamePattern = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
  const resolveTokenName = (
    envKey: string,
    fallback: string,
    kind: "cookie" | "header"
  ): string => {
    const raw = (process.env[envKey] || "").trim();
    if (!raw) return fallback;
    const normalized = kind === "header" ? raw.toLowerCase() : raw;
    if (!tokenNamePattern.test(normalized)) {
      console.warn(
        JSON.stringify({
          event: "config_warning",
          code: "INVALID_TOKEN_NAME",
          envKey,
          value: raw,
          fallback
        })
      );
      return fallback;
    }
    return normalized;
  };
  const csrfCookieName = resolveTokenName("CSRF_COOKIE_NAME", "sis-csrf", "cookie");
  const csrfHeaderName = resolveTokenName("CSRF_HEADER_NAME", "x-csrf-token", "header");
  const csrfExemptPaths = new Set(
    (process.env.CSRF_EXEMPT_PATHS || "/auth/login,/auth/register,/auth/forgot-password,/auth/reset-password,/auth/resend-verification")
      .split(",")
      .map((path) => path.trim())
      .filter(Boolean)
  );
  const csrfAllowedOrigins = expandLoopbackOrigins(
    (process.env.CSRF_ALLOWED_ORIGINS || process.env.WEB_URL || "http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );

  app.use(cookieParser());
  app.use((req: any, res: any, next: () => void) => {
    const incomingRequestId = req.headers["x-request-id"];
    const requestId =
      typeof incomingRequestId === "string" && incomingRequestId.trim().length > 0
        ? incomingRequestId
        : randomUUID();
    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    next();
  });
  app.use((req: any, res: any, next: () => void) => {
    if (safeMethods.has(req.method)) {
      next();
      return;
    }

    const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
    if (origin && !csrfAllowedOrigins.has(origin)) {
      metrics.security.csrfOriginBlocked += 1;
      res.status(403).json({
        success: false,
        error: {
          statusCode: 403,
          code: "CSRF_ORIGIN_BLOCKED",
          message: "Request origin is not allowed",
          requestId: req.requestId
        }
      });
      return;
    }

    const requestPath = String(req.originalUrl || req.url || "").split("?")[0];
    if (csrfExemptPaths.has(requestPath)) {
      next();
      return;
    }

    const cookieToken = req.cookies?.[csrfCookieName];
    const headerValue = req.headers[csrfHeaderName];
    const headerToken = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (
      typeof cookieToken !== "string" ||
      cookieToken.length === 0 ||
      typeof headerToken !== "string" ||
      headerToken.length === 0 ||
      cookieToken !== headerToken
    ) {
      metrics.security.csrfTokenInvalid += 1;
      res.status(403).json({
        success: false,
        error: {
          statusCode: 403,
          code: "CSRF_TOKEN_INVALID",
          message: "Missing or invalid CSRF token",
          requestId: req.requestId
        }
      });
      return;
    }

    next();
  });
  app.use((req: any, res: any, next: () => void) => {
    const startTime = Date.now();

    res.on("finish", () => {
      const durationMs = Date.now() - startTime;
      const durationSeconds = durationMs / 1000;
      const routeKey = `${req.method} ${req.originalUrl || req.url}`;
      const statusCode = String(res.statusCode);

      metrics.requestsTotal += 1;
      durationCount += 1;
      durationSumSeconds += durationSeconds;
      metrics.byMethod.set(req.method, (metrics.byMethod.get(req.method) ?? 0) + 1);
      metrics.byStatusCode.set(statusCode, (metrics.byStatusCode.get(statusCode) ?? 0) + 1);
      metrics.byRoute.set(routeKey, (metrics.byRoute.get(routeKey) ?? 0) + 1);
      for (const bound of durationHistogramBounds) {
        if (durationSeconds <= bound) {
          const key = bound.toString();
          durationHistogramCounts.set(key, (durationHistogramCounts.get(key) ?? 0) + 1);
        }
      }
      durationHistogramCounts.set("+Inf", (durationHistogramCounts.get("+Inf") ?? 0) + 1);
      if (res.statusCode >= 400) {
        metrics.errorResponsesTotal += 1;
      }
      if (res.statusCode === 429 && routeKey.startsWith("POST /auth/login")) {
        metrics.security.loginRateLimited += 1;
      }

      const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || null;
      const ua = String(req.headers["user-agent"] || "").slice(0, 50);
      const logLine = {
        event: "http_request",
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        ms: durationMs,
        ip,
        ua
      };

      if (process.env.NODE_ENV === "production") {
        process.stdout.write(`${JSON.stringify(logLine)}\n`);
      } else {
        const color = res.statusCode >= 500 ? "\x1b[31m" : res.statusCode >= 400 ? "\x1b[33m" : "\x1b[32m";
        console.log(`${color}${req.method} ${req.path} ${res.statusCode}\x1b[0m ${durationMs}ms`);
      }
    });

    next();
  });

  const corsAllowedOrigins = expandLoopbackOrigins([
    ...(process.env.CSRF_ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    process.env.WEB_URL || "http://localhost:3000"
  ]);

  app.enableCors({
    origin(origin, callback) {
      if (!origin || corsAllowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin not allowed by CORS: ${origin}`), false);
    },
    credentials: true
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: false
    })
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  process.on("unhandledRejection", (reason) => {
    logger.error(
      `unhandledRejection: ${
        reason instanceof Error ? reason.stack ?? reason.message : JSON.stringify(reason)
      }`
    );
  });
  process.on("uncaughtException", (err) => {
    logger.error(`uncaughtException: ${err instanceof Error ? err.stack ?? err.message : JSON.stringify(err)}`);
    process.exit(1);
  });

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get("/ops/metrics", (_req: any, res: any) => {
    const auditActionCounts = auditService.getActionCounts();
    const mail = notificationsService.getHealthSnapshot();
    const loginFailed = auditActionCounts.login_failed ?? 0;
    const errorRatePercent =
      metrics.requestsTotal > 0 ? Math.round((metrics.errorResponsesTotal / metrics.requestsTotal) * 10_000) / 100 : 0;
    const deliveryAttempts = mail.sent + mail.failed;
    const mailFailureRatePercent =
      deliveryAttempts > 0 ? Math.round((mail.failed / deliveryAttempts) * 10_000) / 100 : 0;
    const nowMs = Date.now();
    const toTimestamp = (iso: string | null): number | null => {
      if (!iso) return null;
      const timestamp = Date.parse(iso);
      return Number.isNaN(timestamp) ? null : timestamp;
    };
    const lastSuccessAtMs = toTimestamp(mail.lastSuccessAt);
    const lastFailureAtMs = toTimestamp(mail.lastFailureAt);
    const minutesSinceLastSuccess = lastSuccessAtMs ? Math.floor((nowMs - lastSuccessAtMs) / 60_000) : null;
    const alerts: Array<{ level: "warning" | "critical"; code: string; message: string; value: number; threshold: number }> = [];

    if (metrics.security.csrfOriginBlocked >= securityAlertThresholds.csrfOriginBlocked) {
      alerts.push({
        level: "critical",
        code: "CSRF_ORIGIN_BLOCK_SPIKE",
        message: "CSRF blocked origins exceeded threshold",
        value: metrics.security.csrfOriginBlocked,
        threshold: securityAlertThresholds.csrfOriginBlocked
      });
    }
    if (metrics.security.csrfTokenInvalid >= securityAlertThresholds.csrfTokenInvalid) {
      alerts.push({
        level: "warning",
        code: "CSRF_TOKEN_INVALID_SPIKE",
        message: "Invalid CSRF token responses exceeded threshold",
        value: metrics.security.csrfTokenInvalid,
        threshold: securityAlertThresholds.csrfTokenInvalid
      });
    }
    if (metrics.security.loginRateLimited >= securityAlertThresholds.loginRateLimited) {
      alerts.push({
        level: "warning",
        code: "LOGIN_RATE_LIMIT_SPIKE",
        message: "Login rate-limit events exceeded threshold",
        value: metrics.security.loginRateLimited,
        threshold: securityAlertThresholds.loginRateLimited
      });
    }
    if (metrics.requestsTotal >= 50 && errorRatePercent >= securityAlertThresholds.errorRatePercent) {
      alerts.push({
        level: "warning",
        code: "HTTP_ERROR_RATE_HIGH",
        message: "HTTP error rate exceeded threshold",
        value: errorRatePercent,
        threshold: securityAlertThresholds.errorRatePercent
      });
    }
    if (mail.enabled && !mail.configured) {
      alerts.push({
        level: "critical",
        code: "MAIL_TRANSPORT_MISCONFIGURED",
        message: "MAIL_ENABLED=true but SMTP credentials are incomplete",
        value: 1,
        threshold: 1
      });
    }
    if (mail.failed >= securityAlertThresholds.mailDeliveryFailed) {
      alerts.push({
        level: "warning",
        code: "MAIL_DELIVERY_FAILURE_SPIKE",
        message: "Email delivery failures exceeded threshold",
        value: mail.failed,
        threshold: securityAlertThresholds.mailDeliveryFailed
      });
    }
    if (deliveryAttempts >= 5 && mailFailureRatePercent >= securityAlertThresholds.mailFailureRatePercent) {
      alerts.push({
        level: "critical",
        code: "MAIL_DELIVERY_FAILURE_RATE_HIGH",
        message: "Email delivery failure rate exceeded threshold",
        value: mailFailureRatePercent,
        threshold: securityAlertThresholds.mailFailureRatePercent
      });
    }
    if (
      mail.deliveryActive &&
      mail.failed > 0 &&
      minutesSinceLastSuccess !== null &&
      minutesSinceLastSuccess >= securityAlertThresholds.mailSuccessStaleMinutes &&
      (!lastFailureAtMs || !lastSuccessAtMs || lastFailureAtMs >= lastSuccessAtMs)
    ) {
      alerts.push({
        level: "critical",
        code: "MAIL_DELIVERY_STALE_SUCCESS",
        message: "No successful email delivery observed within allowed window",
        value: minutesSinceLastSuccess,
        threshold: securityAlertThresholds.mailSuccessStaleMinutes
      });
    }

    res.json({
      success: true,
      data: {
        uptimeSeconds: Math.floor((Date.now() - bootAt) / 1000),
        requestsTotal: metrics.requestsTotal,
        errorResponsesTotal: metrics.errorResponsesTotal,
        byMethod: Object.fromEntries(metrics.byMethod.entries()),
        byStatusCode: Object.fromEntries(metrics.byStatusCode.entries()),
        byRoute: Object.fromEntries(metrics.byRoute.entries()),
        auditActionCounts,
        mail,
        mailIndicators: {
          deliveryAttempts,
          failureRatePercent: mailFailureRatePercent,
          minutesSinceLastSuccess
        },
        security: {
          csrfOriginBlocked: metrics.security.csrfOriginBlocked,
          csrfTokenInvalid: metrics.security.csrfTokenInvalid,
          loginRateLimited: metrics.security.loginRateLimited,
          loginFailed
        },
        history: metricsHistory,
        alerts,
        thresholds: securityAlertThresholds
      }
    });
  });

  expressApp.get("/ops/metrics/snapshot", (_req: any, res: any) => {
    res.json(
      metricsHistory.slice(-5).map((entry) => ({
        ts: entry.ts,
        requests: entry.requestsTotal,
        memory: entry.rss
      }))
    );
  });

  expressApp.get("/ops/metrics/prometheus", (_req: any, res: any) => {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    const lines: string[] = [
      "# HELP sis_requests_total Total HTTP requests",
      "# TYPE sis_requests_total counter",
      `sis_requests_total ${metrics.requestsTotal}`,
      "",
      "# HELP sis_errors_total Total HTTP error responses (4xx+5xx)",
      "# TYPE sis_errors_total counter",
      `sis_errors_total ${metrics.errorResponsesTotal}`,
      "",
      "# HELP sis_process_uptime_seconds Process uptime in seconds",
      "# TYPE sis_process_uptime_seconds gauge",
      `sis_process_uptime_seconds ${Math.floor(uptime)}`,
      "",
      "# HELP sis_memory_rss_bytes Resident Set Size in bytes",
      "# TYPE sis_memory_rss_bytes gauge",
      `sis_memory_rss_bytes ${memUsage.rss}`,
      "",
      "# HELP sis_memory_heap_used_bytes Heap used in bytes",
      "# TYPE sis_memory_heap_used_bytes gauge",
      `sis_memory_heap_used_bytes ${memUsage.heapUsed}`,
      "",
      "# HELP sis_csrf_origin_blocked_total CSRF origin blocked count",
      "# TYPE sis_csrf_origin_blocked_total counter",
      `sis_csrf_origin_blocked_total ${metrics.security.csrfOriginBlocked}`,
      "",
      "# HELP sis_csrf_token_invalid_total CSRF token invalid count",
      "# TYPE sis_csrf_token_invalid_total counter",
      `sis_csrf_token_invalid_total ${metrics.security.csrfTokenInvalid}`,
      "",
      "# HELP sis_login_rate_limited_total Login rate limited count",
      "# TYPE sis_login_rate_limited_total counter",
      `sis_login_rate_limited_total ${metrics.security.loginRateLimited}`,
    ];

    lines.push("", "# HELP sis_route_requests_total Requests per route", "# TYPE sis_route_requests_total counter");
    for (const [route, count] of metrics.byRoute.entries()) {
      const safeRoute = route.replace(/"/g, '\\"');
      lines.push(`sis_route_requests_total{route="${safeRoute}"} ${count}`);
    }

    lines.push("", "# HELP sis_status_code_total Responses per HTTP status code", "# TYPE sis_status_code_total counter");
    for (const [code, count] of metrics.byStatusCode.entries()) {
      lines.push(`sis_status_code_total{code="${code}"} ${count}`);
    }

    lines.push("", "# HELP http_requests_total Conventional HTTP requests by status", "# TYPE http_requests_total counter");
    for (const [code, count] of metrics.byStatusCode.entries()) {
      lines.push(`http_requests_total{status="${code}"} ${count}`);
    }

    lines.push(
      "",
      "# HELP http_request_duration_seconds Request duration histogram",
      "# TYPE http_request_duration_seconds histogram"
    );
    for (const [bucket, count] of durationHistogramCounts.entries()) {
      lines.push(`http_request_duration_seconds_bucket{le="${bucket}"} ${count}`);
    }
    lines.push(`http_request_duration_seconds_sum ${durationSumSeconds}`);
    lines.push(`http_request_duration_seconds_count ${durationCount}`);

    res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.send(lines.join("\n") + "\n");
  });

  expressApp.get("/ops/version", (_req: any, res: any) => {
    res.json({
      version: process.env.npm_package_version ?? "0.0.0",
      nodeEnv: process.env.NODE_ENV ?? "development",
      uptime: Math.floor(process.uptime()),
      pid: process.pid,
      buildTime: process.env.BUILD_TIME ?? "dev"
    });
  });

  expressApp.post("/ops/csp-report", (req: any, res: any) => {
    logger.warn(`csp-report ${JSON.stringify(req.body ?? {})}`);
    res.status(204).end();
  });

  expressApp.get("/ops/db-check", async (_req: any, res: any) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ db: "ok" });
    } catch (error) {
      res.status(503).json({
        db: "error",
        msg: error instanceof Error ? error.message : "DB query failed"
      });
    }
  });

  expressApp.get("/api/health", (_req: any, res: any) => {
    res.json({ status: "ok", ts: new Date().toISOString() });
  });

  expressApp.get("/ops/ready", async (_req: any, res: any) => {
    try {
      const ready = process.uptime() > 5;
      if (ready) {
        res.json({ status: "ready", uptime: Math.floor(process.uptime()) });
        return;
      }
      res.status(503).json({ status: "starting", uptime: Math.floor(process.uptime()) });
    } catch {
      res.status(503).json({ status: "not_ready", error: "dependency check failed" });
    }
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("地平线 SIS API")
    .setDescription("University SIS REST API — 地平线")
    .setVersion("1.0.0")
    .addCookieAuth("access_token")
    .addTag("auth")
    .addTag("admin")
    .addTag("registration")
    .addTag("students")
    .addTag("health")
    .build();
  SwaggerModule.setup(
    "api/docs",
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
    { swaggerOptions: { persistAuthorization: true, filter: true } }
  );

  const port = Number(process.env.PORT || process.env.API_PORT || 4000);
  await app.listen(port);
  console.log(`API running at http://localhost:${port}`);
}

bootstrap().catch((error) => {
  const logger = new StructuredLogger();
  logger.error(
    `bootstrap_failed: ${error instanceof Error ? error.stack ?? error.message : JSON.stringify(error)}`
  );
  process.exit(1);
});
