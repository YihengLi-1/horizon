import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  readonly writer: PrismaClient;

  readonly reader: PrismaClient;

  constructor() {
    super({
      datasources: {
        db: { url: process.env.DATABASE_URL }
      }
    });

    this.writer = this;
    this.reader = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_REPLICA_URL || process.env.DATABASE_URL
        }
      }
    });
  }

  async onModuleInit(): Promise<void> {
    await Promise.all([this.writer.$connect(), this.reader.$connect()]);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.reader.$disconnect(), this.writer.$disconnect()]);
  }
}
