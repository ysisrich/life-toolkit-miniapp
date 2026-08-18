import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import dayjs from 'dayjs';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, Repository } from 'typeorm';
import { UserSetting } from '../user-settings.entity';
import { TaskRecord } from '../task-record.entity';
import { WechatService } from '../wechat/wechat.service';
import {
  calculateOvertimeBalance,
  formatOvertimeText,
  OvertimeEntry,
  parseOvertimeText,
} from './overtime-ledger';

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

        // 检查今天用户是否手动取消了提醒
        if (data.cancelReminderDate === nowObj.format('YYYY-MM-DD')) {
          this.logger.log(`User ${setting.userId} has cancelled reminders for today, skipping.`);
          continue;
        }

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
        isLeave: data.type === 'leave',
        isSupplement: data.type === 'supplement'
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

  async getOvertimeLedger(userId: number, year: number, month: number) {
    const { start, end } = this.getMonthRange(year, month);
    const records = await this.getOvertimeRecords(userId, end);
    const days: Record<string, any> = {};
    const entries: OvertimeEntry[] = [];
    let monthOvertime = 0;
    let monthLeave = 0;

    for (const record of records) {
      const entry = this.toOvertimeEntry(record);
      if (!entry) continue;
      entries.push(entry);

      if (entry.date < start.format('YYYY-MM-DD') || entry.date > end.format('YYYY-MM-DD')) continue;
      if (!days[entry.date]) days[entry.date] = {};
      if (entry.type === 'overtime') {
        monthOvertime += entry.hours;
        days[entry.date].overtime = { id: record.id, ...entry };
      } else if (entry.type === 'leave') {
        monthLeave += entry.hours;
        days[entry.date].leave = { id: record.id, ...entry };
      }
    }

    return {
      year,
      month,
      days,
      monthOvertime: this.roundHours(monthOvertime),
      monthLeave: this.roundHours(monthLeave),
      monthNet: this.roundHours(monthOvertime - monthLeave),
      balance: calculateOvertimeBalance(entries)
    };
  }

  async saveOvertimeRecord(userId: number, body: any) {
    const type = body?.type;
    if (type !== 'overtime' && type !== 'leave') {
      throw new BadRequestException('记录类型必须是加班或请假');
    }

    let previousRecord: TaskRecord | null = null;
    if (body?.id !== undefined && body?.id !== null && body?.id !== '') {
      const previousId = Number(body.id);
      if (!Number.isInteger(previousId) || previousId <= 0) {
        throw new BadRequestException('记录 ID 无效');
      }
      previousRecord = await this.taskRecordRepository.findOne({
        where: { id: previousId, userId, toolKey: 'overtime' }
      });
      const previousEntry = previousRecord && this.toOvertimeEntry(previousRecord);
      if (!previousRecord || !previousEntry || previousEntry.type === 'balance') {
        throw new NotFoundException('加班记录不存在');
      }
    }

    const date = this.parseLedgerDate(body?.date);
    const hours = this.parseLedgerHours(body?.hours);
    const startTime = this.parseLedgerTime(body?.startTime);
    const endTime = this.parseLedgerTime(body?.endTime);
    if (type === 'overtime' && !!startTime !== !!endTime) {
      throw new BadRequestException('开始时间和结束时间必须同时填写');
    }
    const id = await this.saveOvertimeEntry(userId, {
      type,
      date: date.format('YYYY-MM-DD'),
      hours,
      ...(type === 'overtime' && startTime ? { startTime, endTime } : {})
    });

    if (previousRecord && previousRecord.id !== id) {
      await this.taskRecordRepository.remove(previousRecord);
    }

    return { success: true, id, date: date.format('YYYY-MM-DD'), type, hours };
  }

  async deleteOvertimeRecord(userId: number, idValue: string) {
    const id = Number(idValue);
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('记录 ID 无效');

    const record = await this.taskRecordRepository.findOne({
      where: { id, userId, toolKey: 'overtime' }
    });
    if (!record) throw new NotFoundException('加班记录不存在');

    await this.taskRecordRepository.remove(record);
    return { success: true, id };
  }

  async importOvertimeLedger(userId: number, content: string) {
    let entries: OvertimeEntry[];
    try {
      entries = parseOvertimeText(content);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '账本内容无效');
    }

    for (const entry of entries) {
      this.parseLedgerDate(entry.date);
    }

    let imported = 0;
    for (const entry of entries) {
      await this.saveOvertimeEntry(userId, entry);
      imported++;
    }
    return { success: true, imported };
  }

  async exportOvertimeLedger(userId: number, year: number, month: number) {
    const { end } = this.getMonthRange(year, month);
    const records = await this.getOvertimeRecords(userId, end);
    const entries = records
      .map(record => this.toOvertimeEntry(record))
      .filter((entry): entry is OvertimeEntry => !!entry);

    return {
      filename: `加班统计-${year}年${month}月.txt`,
      content: formatOvertimeText(entries, year, month)
    };
  }

  private getMonthRange(year: number, month: number) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('年月参数无效');
    }
    const start = dayjs(new Date(year, month - 1, 1)).startOf('month');
    return { start, end: start.endOf('month') };
  }

  private async getOvertimeRecords(userId: number, end: dayjs.Dayjs) {
    return this.taskRecordRepository.find({
      where: {
        userId,
        toolKey: 'overtime',
        createdAt: LessThanOrEqual(end.toDate())
      },
      order: { createdAt: 'ASC' }
    });
  }

  private toOvertimeEntry(record: TaskRecord): OvertimeEntry | null {
    let data: any;
    try {
      data = record.taskData ? JSON.parse(record.taskData) : {};
    } catch {
      return null;
    }

    if (data.type !== 'overtime' && data.type !== 'leave' && data.type !== 'balance') return null;
    const date = typeof data.date === 'string'
      ? data.date
      : dayjs(record.createdAt).format('YYYY-MM-DD');
    const hours = Number(data.hours);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(hours) || hours <= 0) return null;

    return {
      type: data.type,
      date,
      hours: this.roundHours(hours),
      ...(typeof data.startTime === 'string' ? { startTime: data.startTime } : {}),
      ...(typeof data.endTime === 'string' ? { endTime: data.endTime } : {})
    };
  }

  private async saveOvertimeEntry(userId: number, entry: OvertimeEntry) {
    const date = this.parseLedgerDate(entry.date);
    const records = await this.taskRecordRepository.find({
      where: {
        userId,
        toolKey: 'overtime',
        createdAt: Between(date.startOf('day').toDate(), date.endOf('day').toDate())
      }
    });
    const existing = records.find(record => this.toOvertimeEntry(record)?.type === entry.type);
    const taskData = JSON.stringify(entry);
    const task = existing || this.taskRecordRepository.create({
      userId,
      toolKey: 'overtime',
      createdAt: date.hour(12).minute(0).second(0).millisecond(0).toDate()
    });
    task.taskData = taskData;
    if (existing) task.createdAt = date.hour(12).minute(0).second(0).millisecond(0).toDate();
    const saved = await this.taskRecordRepository.save(task);
    return saved?.id || task.id;
  }

  private parseLedgerDate(value: unknown) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('日期格式必须是 YYYY-MM-DD');
    }
    const date = dayjs(value);
    if (!date.isValid() || date.format('YYYY-MM-DD') !== value || date.isAfter(dayjs(), 'day')) {
      throw new BadRequestException('只能记录今天或过去日期');
    }
    return date;
  }

  private parseLedgerHours(value: unknown) {
    const hours = Number(value);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      throw new BadRequestException('小时数必须在 0 到 24 之间');
    }
    return this.roundHours(hours);
  }

  private parseLedgerTime(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      throw new BadRequestException('时间格式必须是 HH:mm');
    }
    return value;
  }

  private roundHours(hours: number) {
    return Math.round(hours * 100) / 100;
  }

  async supplementDailyReport(userId: number, toolKey: string, date: string) {
    const targetDate = dayjs(date);
    if (
      toolKey !== 'daily-report' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !targetDate.isValid() ||
      targetDate.format('YYYY-MM-DD') !== date ||
      !targetDate.isBefore(dayjs(), 'day')
    ) {
      throw new BadRequestException('只能补签过去的日报缺卡日期');
    }

    if (!(await this.checkIsWorkday(targetDate))) {
      throw new BadRequestException('休息日无需补签');
    }

    const existingRecord = await this.taskRecordRepository.findOne({
      where: {
        userId,
        toolKey,
        createdAt: Between(targetDate.startOf('day').toDate(), targetDate.endOf('day').toDate())
      }
    });
    if (existingRecord) {
      throw new ConflictException('该日期已有打卡记录');
    }

    const task = this.taskRecordRepository.create({
      userId,
      toolKey,
      taskData: JSON.stringify({ type: 'supplement', note: '补签日报' }),
      createdAt: targetDate.hour(12).minute(0).second(0).millisecond(0).toDate()
    });
    await this.taskRecordRepository.save(task);

    return { success: true, id: task.id, date };
  }
}
