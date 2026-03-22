import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "@node-saml/passport-saml";
import { AuthService } from "./auth.service";

@Injectable()
export class SamlStrategy extends PassportStrategy(Strategy, "saml") {
  constructor(private readonly authService: AuthService) {
    const idpCert = process.env.SAML_IDP_CERT?.trim();

    super({
      entryPoint: process.env.SAML_ENTRY_POINT?.trim() || "http://localhost/__saml-disabled__",
      issuer: process.env.SAML_ISSUER ?? "sis-app",
      callbackUrl: `${process.env.WEB_URL ?? "http://localhost:3000"}/api/auth/saml/callback`,
      idpCert:
        idpCert && idpCert.length > 0
          ? idpCert
          : "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----"
    });
  }

  async validate(profile: Record<string, unknown>) {
    const email = (profile.email ??
      profile.nameID ??
      profile["urn:oid:1.3.6.1.4.1.5923.1.1.1.7"]) as string | undefined;

    if (!email) {
      throw new Error("SAML profile missing email");
    }

    return this.authService.findOrCreateSsoUser(email, profile);
  }
}
