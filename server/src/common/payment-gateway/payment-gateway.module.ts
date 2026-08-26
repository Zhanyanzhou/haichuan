import { Global, Module } from "@nestjs/common";
import { PaymentGatewayService } from "./payment-gateway.service";

/**
 * 在线支付网关层（交易解冻筹备）。
 * 支付宝/微信凭据由运维单独接入；支付与退款分别受安全默认关闭的资金门禁控制。
 * 未配置时创建资金操作抛 503，既有交易的查单与验签通知仍按已配置适配器处理。
 * 支付宝继续使用已安装 SDK；微信 APIv3 使用项目内最小客户端并验证应答签名。
 */
@Global()
@Module({
  providers: [PaymentGatewayService],
  exports: [PaymentGatewayService],
})
export class PaymentGatewayModule {}
