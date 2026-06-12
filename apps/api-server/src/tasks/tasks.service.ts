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
  private workdayCache = new Map<string, boolean>();
  private monthlyHolidayCache = new Map<string, any>();

  constructor(
    @InjectRepository(UserSetting)
    private settingsRepository: Repository<UserSetting>,
    @InjectRepository(TaskRecord)
    private taskRecordRepository: Repository<TaskRecord>,
    private wechatService: WechatService,
  ) { }

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
            process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID!,
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

  @Cron('0 10 * * *')
  async handleHaircutReminders() {
    this.logger.log('Start checking haircut reminders...');

    const settings = await this.settingsRepository.find({
      where: { toolKey: 'haircut' },
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
          const genderTitle = data.gender === 'girl' ? '小仙女' : '帅哥';
          const templateData = {
            thing1: { value: '去理发' },
            thing5: { value: genderTitle },
            time4: { value: formatDate(lastDateObj) },
            time6: { value: formatDate(nowObj) },
            thing3: { value: '头发有点长啦，记得抽空去理个发哦~' }
          };

          await this.wechatService.sendSubscribeMessage(
            setting.user.openId,
            process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID!,
            templateData,
            'pages/tools/haircut/index'
          );
          sentCount++;
        }
      } catch (err) {
        this.logger.error(`Error processing haircut reminder for user ${setting.userId}`, err);
      }
    }
    this.logger.log(`Haircut reminders finished. Sent: ${sentCount}`);
  }

  async checkIsWorkday(dateObj: dayjs.Dayjs): Promise<boolean> {
    const dateStr = dateObj.format('YYYY-MM-DD');
    if (this.workdayCache.has(dateStr)) {
      return this.workdayCache.get(dateStr)!;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒超时防止请求被挂起

      const response = await fetch(`https://timor.tech/api/holiday/info/${dateStr}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        if (result.code === 0 && result.type) {
          // 0: 工作日, 1: 休息日, 2: 节假日, 3: 调休工作日
          const isWorkday = result.type.type === 0 || result.type.type === 3;
          this.workdayCache.set(dateStr, isWorkday);
          return isWorkday;
        }
      }
    } catch (e) {
      this.logger.warn(`Failed to fetch holiday API for ${dateStr}, using fallback. Error: ${e.message}`);
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

        // 如果今天还没打卡，检查上一次推送时间。如果是今天推送过的，且距离上次推送不足 10 分钟，则跳过
        if (data.lastPushedTimestamp) {
          const lastPushedObj = dayjs(data.lastPushedTimestamp);
          if (nowObj.isSame(lastPushedObj, 'day')) {
            if (nowObj.diff(lastPushedObj, 'minute') < 10) {
              continue;
            }
          }
        } else if (data.lastPushedDate === nowObj.format('YYYY-MM-DD')) {
          // 兼容老数据：如果是今天用旧逻辑推送过的，给它补上时间戳并跳过，等 10 分钟后下一轮
          data.lastPushedTimestamp = nowObj.valueOf();
          setting.settingData = JSON.stringify(data);
          await this.settingsRepository.save(setting);
          continue;
        }

        // 如果还没打卡，获取最后一次的打卡记录作为“上次打卡时间”
        const lastRecord = await this.taskRecordRepository.findOne({
          where: { userId: setting.userId, toolKey: 'daily-report' },
          order: { createdAt: 'DESC' }
        });

        const formatDate = (dateObj: dayjs.Dayjs) => dateObj.format('YYYY-MM-DD HH:mm:ss');

        // 微信模板要求 time 类型必须是标准时间格式，如果没有记录，默认显示昨天
        const lastPunchTimeStr = lastRecord 
          ? formatDate(dayjs(lastRecord.createdAt)) 
          : formatDate(reminderDateObj.subtract(1, 'day'));

        // Send reminder
        const templateData = {
          thing1: { value: '写日报' },
          thing5: { value: '打工人' },
          time4: { value: lastPunchTimeStr },
          time6: { value: formatDate(nowObj) },
          thing3: { value: '下班啦，别忘了写日报哦！' }
        };

        await this.wechatService.sendSubscribeMessage(
          setting.user.openId,
          process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID!,
          templateData,
          'pages/tools/daily-report/index'
        );

        // 记录这一次的推送时间和日期
        data.lastPushedDate = nowObj.format('YYYY-MM-DD');
        data.lastPushedTimestamp = nowObj.valueOf();
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

  async getMonthStats(userId: number, toolKey: string, year: number, month: number) {
    // 使用 new Date(year, month - 1, 1) 避免 dayjs 产生月份溢出 bug
    const startOfMonth = dayjs(new Date(year, month - 1, 1)).startOf('month').toDate();
    const endOfMonth = dayjs(new Date(year, month - 1, 1)).endOf('month').toDate();

    const records = await this.taskRecordRepository.find({
      where: {
        userId,
        toolKey,
        createdAt: Between(startOfMonth, endOfMonth)
      }
    });

    const recordMap = {};
    for (const record of records) {
      const dateStr = dayjs(record.createdAt).format('YYYY-MM-DD');
      let data: any = {};
      try {
        data = record.taskData ? JSON.parse(record.taskData) : {};
      } catch(e) {}
      
      // 记录当天是否有打卡，以及是否是“请假”
      recordMap[dateStr] = {
        isLeave: data.type === 'leave'
      };
    }

    const monthStr = month.toString().padStart(2, '0');
    const cacheKey = `${year}-${monthStr}`;
    let holidays = {};

    if (this.monthlyHolidayCache.has(cacheKey)) {
      holidays = this.monthlyHolidayCache.get(cacheKey);
    } else {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒超时防止接口挂起

        const response = await fetch(`https://timor.tech/api/holiday/year/${cacheKey}`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const result = await response.json();
          if (result.code === 0 && result.holiday) {
            holidays = result.holiday;
            this.monthlyHolidayCache.set(cacheKey, holidays);
          }
        }
      } catch (e) {
        this.logger.warn(`Failed to fetch holiday API for ${year}-${month}. Error: ${e.message}`);
      }
    }

    return {
      records: recordMap,
      holidays
    };
  }
}
