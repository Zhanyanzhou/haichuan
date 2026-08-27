import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  OperatorContext,
  TradeEntityType,
  TradeEventType,
} from "./trade-events.constants";

/**
 * 交易事件服务：记录不可变事件时间线。
 *
 * 关键约束：
 * - 事件一旦写入不可修改/删除；
 * - 交易写操作必须在同一 Prisma 事务内追加事件（保证状态与事件原子一致）；
 * - 交易事实与审计事件必须同成同败；调用方应传入当前交易事务的 tx。
 * - 只有不伴随业务状态变化的告警型事件才可使用 recordBestEffort。
 */
@Injectable()
export class TradeEventsService {
  private readonly logger = new Logger(TradeEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 记录一条必须成功的交易事件。失败会向上传播，让同一事务回滚。
   *
   * @param tx Prisma 事务客户端或主 PrismaService（事务内传 tx，事务外传 this.prisma）
   * @param params 事件参数
   */
  async record(
    tx: Prisma.TransactionClient | PrismaService,
    params: {
      orderId: number;
      entityType: TradeEntityType;
      entityId: number;
      eventType: TradeEventType;
      fromStatus?: string | null;
      toStatus?: string | null;
      operator: OperatorContext;
      reason?: string | null;
      metadata?: Prisma.InputJsonValue | null;
    },
  ): Promise<void> {
    await tx.tradeEvent.create({
      data: {
        orderId: params.orderId,
        entityType: params.entityType,
        entityId: params.entityId,
        eventType: params.eventType,
        fromStatus: params.fromStatus ?? null,
        toStatus: params.toStatus ?? null,
        operatorType: params.operator.type,
        operatorId: params.operator.id ?? null,
        operatorName: params.operator.name ?? null,
        reason: params.reason ?? null,
        metadata: params.metadata ?? undefined,
      },
    });
  }

  /** 仅用于不改变业务事实的辅助告警；失败只写服务日志。 */
  async recordBestEffort(
    tx: Prisma.TransactionClient | PrismaService,
    params: Parameters<TradeEventsService['record']>[1],
  ): Promise<void> {
    try {
      await this.record(tx, params);
    } catch (error) {
      this.logger.error(
        `交易事件记录失败 orderId=${params.orderId} type=${params.eventType}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
