import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OperatorContext, TradeEntityType, TradeEventType } from './trade-events.constants';

/**
 * 交易事件服务：记录不可变事件时间线。
 *
 * 关键约束：
 * - 事件一旦写入不可修改/删除；
 * - 交易写操作必须在同一 Prisma 事务内追加事件（保证状态与事件原子一致）；
 * - 本服务不抛阻断异常——若事件记录失败仅记录日志，不回滚业务事务（事件丢失可容忍，
 *   业务数据正确性优先）。调用方仍可检查返回值。
 */
@Injectable()
export class TradeEventsService {
  private readonly logger = new Logger(TradeEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 在事务内或事务外记录一条交易事件。
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
    try {
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
    } catch (error) {
      // 事件记录失败不阻断业务事务：记录日志，由后续对账补偿。
      this.logger.error(
        `交易事件记录失败 orderId=${params.orderId} type=${params.eventType}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
