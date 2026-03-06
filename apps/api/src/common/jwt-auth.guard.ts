import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { IS_PUBLIC_KEY } from "./public.decorator";

const PUBLIC_PATHS = new Set([
  "/auth/csrf-token"
]);

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{ originalUrl?: string; url?: string }>();
    const requestPath = String(req?.originalUrl || req?.url || "").split("?")[0];
    if (PUBLIC_PATHS.has(requestPath)) {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
