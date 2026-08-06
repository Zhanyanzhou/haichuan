import { Global, Module } from '@nestjs/common';
import { KimiService } from './kimi.service';

@Global()
@Module({
  providers: [KimiService],
  exports: [KimiService],
})
export class KimiModule {}
