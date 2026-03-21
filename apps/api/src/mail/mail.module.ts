import { MailerModule } from "@nestjs-modules/mailer";
import { Module } from "@nestjs/common";
import { MailService } from "./mail.service";

@Module({
  imports: [
    MailerModule.forRoot({
      transport: {
        host: process.env.SMTP_HOST ?? "localhost",
        port: parseInt(process.env.SMTP_PORT ?? "1025"),
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined
      },
      defaults: {
        from: process.env.SMTP_FROM ?? '"地平线教务" <no-reply@horizon.edu>'
      }
    })
  ],
  providers: [MailService],
  exports: [MailService]
})
export class MailModule {}
