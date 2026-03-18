import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = (ctx as any).getRequest?.();
    const requestId = request?.requestId || request?.headers?.["x-request-id"];
    const url = request ? `${request.method} ${request.originalUrl || request.url}` : "(no-req)";
    const err: any = exception as any;
    const errName = err?.name || typeof exception;
    const errMsg = err?.message || String(exception);
    console.error("[EXCEPTION]", requestId ? `[${requestId}]` : "", url, errName, errMsg);
    if (err?.stack) console.error(err.stack);


    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as
        | string
        | { message?: string; code?: string; details?: unknown };

      const message =
        typeof exceptionResponse === "string"
          ? exceptionResponse
          : exceptionResponse?.message ?? exception.message;

      const code = typeof exceptionResponse === "string" ? "HTTP_ERROR" : exceptionResponse?.code ?? "HTTP_ERROR";
      const details = typeof exceptionResponse === "string" ? undefined : exceptionResponse?.details;

      response.status(status).json({
        success: false,
        error: {
          statusCode: status,
          code,
          message,
          details,
          requestId
        }
      });
      return;
    }

    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(status).json({
      success: false,
      error: {
        statusCode: status,
        code: "INTERNAL_ERROR",
        message: "服务器内部错误",
        requestId
      }
    });
  }
}
