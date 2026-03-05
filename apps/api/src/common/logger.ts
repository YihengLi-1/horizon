import { LoggerService } from "@nestjs/common";

export class StructuredLogger implements LoggerService {
  private write(level: string, msg: unknown, ctx?: string, extra?: Record<string, unknown>) {
    const entry = {
      level,
      message: String(msg),
      context: ctx,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      ...extra
    };

    if (process.env.NODE_ENV === "production") {
      process.stdout.write(`${JSON.stringify(entry)}\n`);
      return;
    }

    const color =
      level === "error" ? "\x1b[31m" : level === "warn" ? "\x1b[33m" : "\x1b[36m";
    console.log(`${color}[${level.toUpperCase()}]${ctx ? ` [${ctx}]` : ""}\x1b[0m ${msg}`);
  }

  log(message: unknown, context?: string) {
    this.write("log", message, context);
  }

  warn(message: unknown, context?: string) {
    this.write("warn", message, context);
  }

  error(message: unknown, trace?: string, context?: string) {
    this.write("error", message, context, trace ? { trace } : undefined);
  }

  debug(message: unknown, context?: string) {
    this.write("debug", message, context);
  }

  verbose(message: unknown, context?: string) {
    this.write("verbose", message, context);
  }
}
