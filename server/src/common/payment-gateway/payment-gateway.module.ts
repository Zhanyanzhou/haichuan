import { Global, Module } from "@nestjs/common";
import {
  PAYMENT_GATEWAY_ADAPTERS,
  PaymentGatewayService,
} from "./payment-gateway.service";

/**
 * 在线支付网关层（交易解冻筹备）。
 * 支付宝/微信凭据由运维单独接入；支付与退款分别受安全默认关闭的资金门禁控制。
 * 未配置时创建资金操作抛 503，既有交易的查单与验签通知仍按已配置适配器处理。
 * 支付宝继续使用已安装 SDK；微信 APIv3 使用项目内最小客户端；两者均提供
 * 查单、关单、退款与对账入口，主动资金事实必须通过渠道验签或本地强校验。
 */
@Global()
@Module({
  providers: [
    { provide: PAYMENT_GATEWAY_ADAPTERS, useValue: {} },
    PaymentGatewayService,
  ],
  exports: [PAYMENT_GATEWAY_ADAPTERS, PaymentGatewayService],
})
export class PaymentGatewayModule {}
