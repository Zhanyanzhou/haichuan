import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WechatAuthController } from "./wechat-auth.controller";
import { WechatAuthService } from "./wechat-auth.service";

@Module({
  imports: [AuthModule],
  controllers: [WechatAuthController],
  providers: [WechatAuthService],
})
export class WechatAuthModule {}
