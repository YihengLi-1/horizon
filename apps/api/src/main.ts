import "reflect-metadata";
import cookieParser from "cookie-parser";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { randomUUID } from "crypto";
import { AuditService } from "./audit/audit.service";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const auditService = app.get(AuditService);
  const bootAt = Date.now();
  const metrics = {
    requestsTotal: 0,
    errorResponsesTotal: 0,
    byMethod: new Map<string, number>(),
    byStatusCode: new Map<string, number>(),
    byRoute: new Map<string, number>()
  };

  const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
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
    res.json({
      success: true,
      data: {
        uptimeSeconds: Math.floor((Date.now() - bootAt) / 1000),
        requestsTotal: metrics.requestsTotal,
        errorResponsesTotal: metrics.errorResponsesTotal,
        byMethod: Object.fromEntries(metrics.byMethod.entries()),
        byStatusCode: Object.fromEntries(metrics.byStatusCode.entries()),
        byRoute: Object.fromEntries(metrics.byRoute.entries()),
        auditActionCounts: auditService.getActionCounts()
      }
    });
  });

  const port = Number(process.env.API_PORT || 4000);
  await app.listen(port);
  console.log(`API running at http://localhost:${port}`);
}

bootstrap();
