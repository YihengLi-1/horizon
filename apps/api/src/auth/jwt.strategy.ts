import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Role } from "@prisma/client";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../common/prisma.service";
import { isSessionActive } from "./auth.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {
    const secret = config.get<string>("JWT_SECRET") || "dev-secret-change-me";

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: any) => req?.cookies?.access_token
      ]),
      ignoreExpiration: false,
      secretOrKey: secret
    });
  }

  async validate(payload: { sub: string; role: Role; sid?: string }) {
    if (payload.sid && !isSessionActive(payload.sid)) {
      throw new UnauthorizedException({ code: "SESSION_REVOKED", message: "会话已失效，请重新登录" });
    }
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, role: true }
    });
    if (!user) {
      throw new UnauthorizedException({ code: "USER_NOT_FOUND", message: "用户不存在" });
    }
    return { userId: user.id, role: user.role, sid: payload.sid };
  }
}
