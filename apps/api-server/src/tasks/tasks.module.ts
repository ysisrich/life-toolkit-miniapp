import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { WechatModule } from '../wechat/wechat.module';
import { UserSetting } from '../user-settings.entity';
import { TaskRecord } from '../task-record.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserSetting, TaskRecord]),
    WechatModule,
  ],
  providers: [TasksService],
  controllers: [TasksController]
})
export class TasksModule {}
