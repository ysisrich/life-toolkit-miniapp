import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { UserSetting } from '../user-settings.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserSetting])],
  providers: [SettingsService],
  controllers: [SettingsController],
})
export class SettingsModule {}
