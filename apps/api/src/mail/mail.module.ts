import { MailerModule } from "@nestjs-modules/mailer";
import { Module } from "@nestjs/common";
import { MailService } from "./mail.service";

const sendGridApiKey =
  process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY !== "YOUR_SENDGRID_API_KEY_HERE"
    ? process.env.SENDGRID_API_KEY
    : "";

@Module({
  imports: [
    MailerModule.forRoot({
      transport: sendGridApiKey
        ? {
            host: "smtp.sendgrid.net",
            port: 587,
            secure: false,
            auth: {
              user: "apikey",
              pass: sendGridApiKey
            }
          }
        : {
            // 本地开发 fallback：Mailpit/Mailhog
            host: process.env.SMTP_HOST ?? "localhost",
            port: parseInt(process.env.SMTP_PORT ?? "1025"),
            secure: false
          },
      defaults: {
        from: process.env.SMTP_FROM ?? '"地平线教务" <no-reply@yourdomain.com>'
      }
    })
  ],
  providers: [MailService],
  exports: [MailService]
})
export class MailModule {}
