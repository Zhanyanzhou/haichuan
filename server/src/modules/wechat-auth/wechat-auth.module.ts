import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CustomersModule } from "../customers/customers.module";
import { WechatAuthController } from "./wechat-auth.controller";
import { WechatAuthService } from "./wechat-auth.service";
import { WechatOAuthClient } from "./wechat-oauth.client";
import { WechatOAuthStateStore } from "./wechat-oauth-state.store";

@Module({
  imports: [AuthModule, CustomersModule],
  controllers: [WechatAuthController],
  providers: [WechatAuthService, WechatOAuthClient, WechatOAuthStateStore],
})
export class WechatAuthModule {}
