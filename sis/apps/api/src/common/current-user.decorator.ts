import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export type AuthUser = {
  userId: string;
  role: "STUDENT" | "ADMIN";
};

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest();
  return req.user;
});
