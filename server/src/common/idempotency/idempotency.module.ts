import { Global, Module } from "@nestjs/common";
import { IdempotencyService } from "./idempotency-key";

@Global()
@Module({
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
