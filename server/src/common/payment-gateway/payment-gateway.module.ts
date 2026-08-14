import { Global, Module } from '@nestjs/common';
import { PaymentGatewayService } from './payment-gateway.service';

/**
 * 在线支付网关层（交易解冻筹备）。
 * 支付宝/微信凭据由运维单独接入：填 .env 的 ALIPAY_*/WECHAT_* 即生效；
 * 未配置时 isAvailable()=false，创建支付抛 503 诚实提示，回调验签一律拒绝。
 * SDK 依赖（alipay-sdk / wechatpay-node-v3）为惰性 require：
 * 依赖未安装时服务可启动（编译不依赖其类型），仅在线支付能力不可用。
 */
@Global()
@Module({
  providers: [PaymentGatewayService],
  exports: [PaymentGatewayService],
})
export class PaymentGatewayModule {}
