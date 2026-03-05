import "reflect-metadata";
import cookieParser from "cookie-parser";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "crypto";
import { AuditService } from "./audit/audit.service";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/exception.filter";
import { NotificationsService } from "./notifications/notifications.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const auditService = app.get(AuditService);
  const notificationsService = app.get(NotificationsService);
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
    (process.env.CSRF_EXEMPT_PATHS || "/auth/login,/auth/register,/auth/forgot-password,/auth/reset-password")
      .split(",")
      .map((path) => path.trim())
      .filter(Boolean)
  );
  const csrfAllowedOrigins = new Set(
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
    const start = process.hrtime.bigint();

    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      const routeKey = `${req.method} ${req.originalUrl || req.url}`;
      const statusCode = String(res.statusCode);

      metrics.requestsTotal += 1;
      metrics.byMethod.set(req.method, (metrics.byMethod.get(req.method) ?? 0) + 1);
      metrics.byStatusCode.set(statusCode, (metrics.byStatusCode.get(statusCode) ?? 0) + 1);
      metrics.byRoute.set(routeKey, (metrics.byRoute.get(routeKey) ?? 0) + 1);
      if (res.statusCode >= 400) {
        metrics.errorResponsesTotal += 1;
      }
      if (res.statusCode === 429 && routeKey.startsWith("POST /auth/login")) {
        metrics.security.loginRateLimited += 1;
      }

      console.log(
        JSON.stringify({
          event: "http_request",
          requestId: req.requestId,
          method: req.method,
          path: req.originalUrl || req.url,
          statusCode: res.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
          ip: req.ip,
          userAgent: req.headers["user-agent"] || null
        })
      );
    });

    next();
  });

  app.enableCors({
    origin: process.env.WEB_URL || "http://localhost:3000",
    credentials: true
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false
    })
  );

  app.useGlobalFilters(new AllExceptionsFilter());

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
        alerts,
        thresholds: securityAlertThresholds
      }
    });
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

    res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.send(lines.join("\n") + "\n");
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

  const port = Number(process.env.API_PORT || 4000);
  await app.listen(port);
  console.log(`API running at http://localhost:${port}`);
}

bootstrap();
