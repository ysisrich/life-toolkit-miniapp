import { Controller, Get, Post, Body, Param, UseGuards, Request, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSetting } from '../user-settings.entity';
import { TaskRecord } from '../task-record.entity';
import { WechatService } from '../wechat/wechat.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  private readonly logger = new Logger(TasksController.name);

  constructor(
    @InjectRepository(UserSetting)
    private settingsRepository: Repository<UserSetting>,
    @InjectRepository(TaskRecord)
    private taskRecordRepository: Repository<TaskRecord>,
    private wechatService: WechatService,
    private tasksService: TasksService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get(':toolKey')
  async getTasks(@Request() req, @Param('toolKey') toolKey: string) {
    return this.taskRecordRepository.find({
      where: { userId: req.user.userId, toolKey },
      order: { createdAt: 'DESC' },
      take: 50
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post(':toolKey/record')
  async recordTask(@Request() req, @Param('toolKey') toolKey: string, @Body() body: any) {
    const task = this.taskRecordRepository.create({
      userId: req.user.userId,
      toolKey,
      taskData: JSON.stringify(body)
    });
    await this.taskRecordRepository.save(task);
    return { success: true, id: task.id };
  }

  @Get()
  async forcePush() {
    this.logger.log('Force pushing subscription message for testing...');
    const settings = await this.settingsRepository.find({ 
      where: { toolKey: 'nail-clipper' },
      relations: ['user'] 
    });

    const now = Date.now();
    let sentCount = 0;

    for (const setting of settings) {
      if (!setting.user || !setting.user.openId) continue;

      const data = JSON.parse(setting.settingData || '{}');
      const nowObj = dayjs();
      // data.lastDate could be a timestamp or a string
      const lastDateObj = data.lastDate ? dayjs(data.lastDate) : nowObj.subtract(1, 'day');
      
      const formatDate = (dateObj: dayjs.Dayjs) => dateObj.format('YYYY-MM-DD HH:mm:ss');

      const templateData = {
        thing1: { value: '测试：剪指甲' }, 
        thing5: { value: '主人' }, 
        time4: { value: formatDate(lastDateObj) }, 
        time6: { value: formatDate(nowObj) }, 
        thing3: { value: '这是一条用来看看卡片长什么样的测试通知！' } 
      };

      try {
        await this.wechatService.sendSubscribeMessage(
          setting.user.openId,
          process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID!,
          templateData,
          'pages/tools/nail-clipper/index'
        );
        sentCount++;
      } catch (e) {
        this.logger.error('Failed to send push', e);
      }
    }

    return `Push test triggered. Sent: ${sentCount}`;
  }
}
