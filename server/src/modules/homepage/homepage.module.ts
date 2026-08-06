import { Module } from '@nestjs/common';
import { HomepageService } from './homepage.service';
import { HomepageController } from './homepage.controller';

@Module({ controllers: [HomepageController], providers: [HomepageService], exports: [HomepageService] })
export class HomepageModule {}
