import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

type OutboxCreateData = {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  deduplicationKey: string | null;
  occurredAt?: Date;
  availableAt?: Date;
};

/** 结构化事务端口避免要求开发中的常驻进程立即释放 Prisma 引擎文件。 */
export type OutboxWriter = {
  outboxEvent: {
    create(args: { data: OutboxCreateData }): Promise<unknown>;
  };
};

export type EnqueueOutboxEvent = {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  deduplicationKey?: string;
  occurredAt?: Date;
  availableAt?: Date;
};

@Injectable()
export class OutboxService {
  /** 必须传入当前业务事务 tx，保证领域写入与事件写入原子提交。 */
  enqueue(tx: OutboxWriter, event: EnqueueOutboxEvent) {
    const aggregateType = this.assertText(event.aggregateType, 80, "聚合类型");
    const aggregateId = this.assertText(event.aggregateId, 100, "聚合标识");
    const eventType = this.assertText(event.eventType, 120, "事件类型");
    const deduplicationKey = event.deduplicationKey?.trim();
    if (deduplicationKey && deduplicationKey.length > 128) {
      throw new BadRequestException("Outbox 去重键过长");
    }
    return tx.outboxEvent.create({
      data: {
        aggregateType,
        aggregateId,
        eventType,
        payload: event.payload,
        deduplicationKey: deduplicationKey || null,
        occurredAt: event.occurredAt,
        availableAt: event.availableAt,
      },
    });
  }

  private assertText(value: string, max: number, label: string): string {
    const normalized = value?.trim();
    if (!normalized || normalized.length > max) {
      throw new BadRequestException(`${label}格式无效`);
    }
    return normalized;
  }
}
