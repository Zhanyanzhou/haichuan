import {
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import {
  ExternalProviderError,
  type ExternalProviderAdapter,
  type ExternalProviderOperationContext,
  runExternalProviderOperation,
} from '../payment-gateway/external-provider.contract';

export interface TrackingEvent {
  time: string;
  context: string;
  ftime?: string;
}

export interface TrackingResult {
  carrier: string;
  trackingNo: string;
  /** 快递100 状态:0在途 1揽收 2疑难 3签收 4退签 5派件 6退回 10待揽收 */
  state: string;
  events: TrackingEvent[];
  cached?: boolean;
}

export interface LogisticsTrackingProvider extends ExternalProviderAdapter {
  track(
    request: { carrier: string | null; trackingNo: string },
    context: ExternalProviderOperationContext,
  ): Promise<TrackingResult>;
}

export const LOGISTICS_TRACKING_PROVIDER = Symbol(
  'LOGISTICS_TRACKING_PROVIDER',
);

/** 常见承运商中文名 → 快递100 公司编码（运营在订单上填中文名也能查） */
const CARRIER_CODE_MAP: Record<string, string> = {
  顺丰: 'shunfeng',
  顺丰速运: 'shunfeng',
  圆通: 'yuantong',
  圆通速递: 'yuantong',
  中通: 'zhongtong',
  中通快递: 'zhongtong',
  申通: 'shentong',
  申通快递: 'shentong',
  韵达: 'yunda',
  韵达快递: 'yunda',
  京东: 'jd',
  京东物流: 'jd',
  京东快递: 'jd',
  EMS: 'ems',
  ems: 'ems',
  中国邮政: 'ems',
  邮政: 'youzhengguonei',
  德邦: 'debangwuliu',
  德邦物流: 'debangwuliu',
  极兔: 'jtexpress',
  极兔速递: 'jtexpress',
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

/**
 * 快递100 实时轨迹查询（带 10 分钟内存缓存，降低计费查询频次）。
 * 公司编码优先按单号自动识别（autonumber），失败回退承运商名称映射。
 * 未配置凭据 → isAvailable()=false，track() 抛 503 诚实降级。
 */
@Injectable()
export class LogisticsTrackingService implements ExternalProviderAdapter {
  readonly providerId = 'kuaidi100';
  private readonly logger = new Logger(LogisticsTrackingService.name);
  private readonly customer?: string;
  private readonly key?: string;
  private readonly cache = new Map<string, { at: number; data: TrackingResult }>();

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(LOGISTICS_TRACKING_PROVIDER)
    private readonly trackingProvider: LogisticsTrackingProvider | null = null,
  ) {
    if (this.trackingProvider) return;
    this.customer = this.configService.get<string>('KUAIDI100_CUSTOMER');
    this.key = this.configService.get<string>('KUAIDI100_KEY');
    if (!this.customer || !this.key) {
      this.logger.warn('KUAIDI100_CUSTOMER/KUAIDI100_KEY 未配置，物流轨迹查询不可用');
    } else {
      this.logger.log('快递100 物流轨迹查询初始化成功');
    }
  }

  isAvailable(): boolean {
    return this.isConfigured();
  }

  isConfigured(): boolean {
    return (
      this.trackingProvider?.isConfigured() ??
      Boolean(this.customer && this.key)
    );
  }

  /** 按单号自动识别快递公司编码（autonumber 公开接口），多个候选取第一个 */
  private async detectCompanyCode(
    trackingNo: string,
    signal: AbortSignal,
  ): Promise<string | null> {
    try {
      const res = await fetch(
        `https://www.kuaidi100.com/autonumber/auto?num=${encodeURIComponent(trackingNo)}`,
        { signal },
      );
      if (!res.ok) {
        throw new ExternalProviderError(
          'PROVIDER_REJECTED',
          '物流承运商识别渠道拒绝了请求',
          res.status >= 500,
          `HTTP_${res.status}`,
        );
      }
      const list = (await res.json()) as Array<{ comCode?: string }>;
      return list?.[0]?.comCode || null;
    } catch (error) {
      if (error instanceof ExternalProviderError) throw error;
      if (signal.aborted) {
        throw new ExternalProviderError(
          'TIMEOUT',
          '物流承运商识别超时',
          true,
        );
      }
      throw new ExternalProviderError(
        'NETWORK',
        '物流承运商识别网络异常',
        true,
      );
    }
  }

  private async resolveCompanyCode(
    carrier: string | null,
    trackingNo: string,
    signal: AbortSignal,
  ): Promise<string> {
    // 运营填写了可识别的中文承运商名则优先使用（免一次识别请求）
    if (carrier) {
      const mapped = CARRIER_CODE_MAP[carrier.trim()];
      if (mapped) return mapped;
      // 本身就是编码（小写英文）则直接使用
      if (/^[a-z]{2,20}$/.test(carrier.trim().toLowerCase())) return carrier.trim().toLowerCase();
    }
    const detected = await this.detectCompanyCode(trackingNo, signal);
    if (detected) return detected;
    throw new ServiceUnavailableException(
      `无法识别承运商编码（订单承运商：${carrier || '未填写'}），请核对运单号或在订单上填写标准承运商名`,
    );
  }

  async track(
    carrier: string | null,
    trackingNo: string,
    options: { idempotencyKey?: string } = {},
  ): Promise<TrackingResult> {
    if (!trackingNo) throw new ServiceUnavailableException('运单号为空');
    if (!this.isAvailable()) {
      throw new ServiceUnavailableException('物流查询服务未配置，请先设置 KUAIDI100_CUSTOMER/KUAIDI100_KEY');
    }
    const cacheKey = `${carrier || ''}|${trackingNo}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return { ...cached.data, cached: true };
    }

    const identifier = createHash('sha256')
      .update(`${carrier || ''}|${trackingNo}`)
      .digest('hex')
      .slice(0, 24);
    try {
      const result = await runExternalProviderOperation(
        async (context) => {
          if (this.trackingProvider) {
            return this.trackingProvider.track(
              { carrier, trackingNo },
              context,
            );
          }
          const com = await this.resolveCompanyCode(
            carrier,
            trackingNo,
            context.signal,
          );
          // 快递100 实时查询协议：param JSON → MD5 签名 → form 表单 POST
          const param = JSON.stringify({ com, num: trackingNo });
          const sign = createHash('md5')
            .update(`${param}${this.key}${this.customer}`)
            .digest('hex')
            .toUpperCase();

          const body = new URLSearchParams({
            customer: this.customer!,
            sign,
            param,
          });
          const res = await fetch('https://poll.kuaidi100.com/poll/query.do', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            signal: context.signal,
          });
          if (!res.ok) {
            throw new ExternalProviderError(
              'PROVIDER_REJECTED',
              '物流查询渠道拒绝了请求',
              res.status >= 500,
              `HTTP_${res.status}`,
            );
          }
          const data = (await res.json()) as {
            message?: string;
            status?: string;
            state?: string;
            data?: TrackingEvent[];
            condition?: string;
          };
          if (data.status !== '200' || !Array.isArray(data.data)) {
            throw new ExternalProviderError(
              'PROVIDER_REJECTED',
              '物流查询渠道返回未受理状态',
              false,
            );
          }
          return {
            carrier: carrier || com,
            trackingNo,
            state: data.state || '',
            events: data.data
              .map((event) => ({
                ...event,
                context: String(event.context || ''),
              }))
              .sort((a, b) => (a.time < b.time ? 1 : -1)),
          };
        },
        {
          idempotencyKey: options.idempotencyKey ?? `tracking:query:${identifier}`,
          timeoutMs: 8_000,
          maxAttempts: 2,
        },
      );
      if (this.cache.size >= CACHE_MAX_ENTRIES) this.cache.clear();
      this.cache.set(cacheKey, { at: Date.now(), data: result });
      return result;
    } catch (error) {
      const code =
        error instanceof ExternalProviderError ? error.code : 'UNKNOWN_RESULT';
      this.logger.error(`快递100 查询失败（${code}，运单信息已脱敏）`);
      throw new ServiceUnavailableException('物流查询服务暂时不可用，请稍后重试');
    }
  }
}
