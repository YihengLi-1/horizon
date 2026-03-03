import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
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

  validate(payload: { sub: string; role: "STUDENT" | "ADMIN" }) {
    return { userId: payload.sub, role: payload.role };
  }
}
