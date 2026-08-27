import { Global, Module } from "@nestjs/common";
import { RefreshSessionService } from "./refresh-session.service";

@Global()
@Module({
  providers: [RefreshSessionService],
  exports: [RefreshSessionService],
})
export class SessionSecurityModule {}
