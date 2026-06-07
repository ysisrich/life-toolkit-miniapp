import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { UserSetting } from '../user-settings.entity';
import { TaskRecord } from '../task-record.entity';
import { WechatService } from '../wechat/wechat.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(UserSetting)
    private settingsRepository: Repository<UserSetting>,
    @InjectRepository(TaskRecord)
    private taskRecordRepository: Repository<TaskRecord>,
    private wechatService: WechatService,
  ) {}

  @Cron('0 9 * * *')
  async handleNailClipperReminders() {
    this.logger.log('Start checking nail clipper reminders...');
    
    const settings = await this.settingsRepository.find({ 
      where: { toolKey: 'nail-clipper' },
      relations: ['user'] 
    });

    let sentCount = 0;

    for (const setting of settings) {
      if (!setting.user || !setting.user.openId) continue;
      try {
        const data = JSON.parse(setting.settingData || '{}');
        if (!data.lastDate || !data.interval) continue;

        const lastDateObj = dayjs(data.lastDate);
        const nowObj = dayjs();
        const diffDays = nowObj.diff(lastDateObj, 'day', true);
        
        if (diffDays >= data.interval) {
          const formatDate = (dateObj: dayjs.Dayjs) => dateObj.format('YYYY-MM-DD HH:mm:ss');
          const templateData = {
            thing1: { value: '剪指甲' },
            thing5: { value: '主人' },
            time4: { value: formatDate(lastDateObj) },
            time6: { value: formatDate(nowObj) },
            thing3: { value: '指甲有点长啦，记得及时修剪哦~' }
          };

          await this.wechatService.sendSubscribeMessage(
            setting.user.openId,
            '6WenYg7uUYcdPWSbDhrmJxObtAK5NQ3ATmATA_F1k3U',
            templateData,
            'pages/tools/nail-clipper/index'
          );
          sentCount++;
        }
      } catch (err) {
        this.logger.error(`Error processing nail clipper reminder for user ${setting.userId}`, err);
      }
    }
    this.logger.log(`Nail clipper reminders finished. Sent: ${sentCount}`);
  }

  async checkIsWorkday(dateObj: dayjs.Dayjs): Promise<boolean> {
    try {
      const dateStr = dateObj.format('YYYY-MM-DD');
      const response = await fetch(`https://timor.tech/api/holiday/info/${dateStr}`);
      if (response.ok) {
        const result = await response.json();
        if (result.code === 0) {
          // 0: 工作日, 1: 休息日, 2: 节假日, 3: 调休工作日
          return result.type.type === 0 || result.type.type === 3;
        }
      }
    } catch (e) {
      this.logger.warn(`Failed to fetch holiday API, using fallback. Error: ${e.message}`);
    }
    
    // Fallback: Monday to Friday
    const day = dateObj.day();
    return day >= 1 && day <= 5;
  }

  // Check every minute
  @Cron('* * * * *')
  async handleDailyReportReminders() {
    this.logger.log('Start checking daily report reminders...');
    
    const settings = await this.settingsRepository.find({ 
      where: { toolKey: 'daily-report' },
      relations: ['user'] 
    });

    const nowObj = dayjs();
    
    // First, check if today is a workday. If not, skip completely.
    const isWorkday = await this.checkIsWorkday(nowObj);
    if (!isWorkday) {
      this.logger.log('Today is not a workday, skipping all daily report reminders.');
      return;
    }

    let sentCount = 0;

    for (const setting of settings) {
      if (!setting.user || !setting.user.openId) continue;
      try {
        const data = JSON.parse(setting.settingData || '{}');
        if (!data.reminderTime) continue; // "18:00"

        // Check if current time has passed reminder time today
        const [hour, minute] = data.reminderTime.split(':').map(Number);
        const reminderDateObj = nowObj.hour(hour).minute(minute).second(0);

        // If it's not time yet, skip
        if (nowObj.isBefore(reminderDateObj)) continue;

        // Check if we already pushed today. We can store this in settingData or check TaskRecord
        // But better: check if they already WROTE the report today
        const startOfDay = nowObj.startOf('day').toDate();
        const endOfDay = nowObj.endOf('day').toDate();

        const todayRecord = await this.taskRecordRepository.findOne({
          where: {
            userId: setting.userId,
            toolKey: 'daily-report',
            createdAt: Between(startOfDay, endOfDay)
          }
        });

        if (todayRecord) continue; // Already wrote today

        // If not wrote, check if we already PUSHED a reminder today to avoid spamming every 5 min
        if (data.lastPushedDate === nowObj.format('YYYY-MM-DD')) continue;

        // Send reminder
        const formatDate = (dateObj: dayjs.Dayjs) => dateObj.format('YYYY-MM-DD HH:mm:ss');
        const templateData = {
          thing1: { value: '写日报' },
          thing5: { value: '打工人' },
          time4: { value: '尚未打卡' },
          time6: { value: formatDate(nowObj) },
          thing3: { value: '快下班啦，别忘了写日报哦！' }
        };

        await this.wechatService.sendSubscribeMessage(
          setting.user.openId,
          '6WenYg7uUYcdPWSbDhrmJxObtAK5NQ3ATmATA_F1k3U',
          templateData,
          'pages/tools/daily-report/index'
        );

        // Update lastPushedDate
        data.lastPushedDate = nowObj.format('YYYY-MM-DD');
        setting.settingData = JSON.stringify(data);
        await this.settingsRepository.save(setting);
        
        sentCount++;
      } catch (err) {
        this.logger.error(`Error processing daily report reminder for user ${setting.userId}`, err);
      }
    }
    
    if (sentCount > 0) {
      this.logger.log(`Daily report reminders finished. Sent: ${sentCount}`);
    }
  }
}
