import { Global, Module } from '@nestjs/common';
import { LogisticsTrackingService } from './logistics-tracking.service';

/**
 * 物流轨迹查询（快递100）。
 * 外部凭据由运维单独接入：.env 填 KUAIDI100_CUSTOMER / KUAIDI100_KEY 即生效；
 * 未配置时 isAvailable()=false，查询接口诚实返回 503，不伪造轨迹数据。
 */
@Global()
@Module({
  providers: [LogisticsTrackingService],
  exports: [LogisticsTrackingService],
})
export class LogisticsTrackingModule {}
