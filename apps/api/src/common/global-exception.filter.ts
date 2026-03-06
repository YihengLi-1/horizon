import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const requestId = request?.requestId || request?.headers?.['x-request-id'];

    if (process.env.NODE_ENV !== 'production') {
      const err = exception as Error | undefined;
      console.error('[EXCEPTION]', requestId ? `[${requestId}]` : '', request?.method, request?.url, err?.message || exception);
      if (err?.stack) console.error(err.stack);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse() as string | { message?: string | string[]; error?: string; details?: unknown; code?: string };
      const message = typeof raw === 'string' ? raw : raw?.message ?? exception.message;
      response.status(status).json({
        success: false,
        error: {
          statusCode: status,
          code: typeof raw === 'string' ? 'HTTP_ERROR' : raw?.code ?? (status === 400 ? 'BAD_REQUEST' : 'HTTP_ERROR'),
          message,
          details: typeof raw === 'string' ? undefined : raw?.details,
          requestId
        }
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId
      }
    });
  }
}
