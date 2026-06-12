import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { UserSetting } from '../user-settings.entity';
import { TaskRecord } from '../task-record.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserSetting, TaskRecord])
  ],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService]
})
export class AiModule {}
