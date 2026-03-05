import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../common/prisma.service";

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

  async validate(payload: { sub: string; role: "STUDENT" | "ADMIN" }) {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, role: true }
    });
    if (!user) {
      throw new UnauthorizedException({ code: "USER_NOT_FOUND", message: "User not found" });
    }
    return { userId: user.id, role: user.role };
  }
}
