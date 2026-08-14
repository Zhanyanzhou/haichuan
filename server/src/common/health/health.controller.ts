import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** 进程存活探针：不依赖外部服务，供容器快速判断进程是否可响应。 */
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /** 就绪探针：数据库不可用时不应继续接收业务流量。 */
  @Public()
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'ok', timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException('数据库暂不可用');
    }
  }
}
