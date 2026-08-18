import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { UserSetting } from '../user-settings.entity';
import { TaskRecord } from '../task-record.entity';
import { WechatService } from '../wechat/wechat.service';
import dayjs from 'dayjs';
import { ConflictException } from '@nestjs/common';

describe('TasksService - Daily Report Filter', () => {
  let service: TasksService;
  let settingsRepoMock: any;
  let taskRecordRepoMock: any;
  let wechatServiceMock: any;

  beforeEach(async () => {
    settingsRepoMock = {
      find: jest.fn(),
      save: jest.fn(),
    };
    taskRecordRepoMock = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((data) => ({ id: 7, ...data })),
      save: jest.fn(),
      remove: jest.fn(),
    };
    wechatServiceMock = {
      sendSubscribeMessage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getRepositoryToken(UserSetting), useValue: settingsRepoMock },
        { provide: getRepositoryToken(TaskRecord), useValue: taskRecordRepoMock },
        { provide: WechatService, useValue: wechatServiceMock },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    // Mock checkIsWorkday
    jest.spyOn(service, 'checkIsWorkday').mockResolvedValue(true);
  });

  it('should skip daily report reminder if cancelReminderDate is today', async () => {
    const todayStr = dayjs().format('YYYY-MM-DD');
    const mockSettings = [
      {
        userId: 1,
        toolKey: 'daily-report',
        settingData: JSON.stringify({
          reminderTime: '00:00', // 设置为 00:00 确保当前时间一定已超过提醒时间
          cancelReminderDate: todayStr,
        }),
        user: { openId: 'mock-openid' },
      },
    ];

    settingsRepoMock.find.mockResolvedValue(mockSettings);
    taskRecordRepoMock.findOne.mockResolvedValue(null); // 今天未打卡

    await service.handleDailyReportReminders();

    expect(wechatServiceMock.sendSubscribeMessage).not.toHaveBeenCalled();
  });

  it('should create a daily report record on the supplemented date', async () => {
    const date = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    taskRecordRepoMock.findOne.mockResolvedValue(null);

    await expect(service.supplementDailyReport(1, 'daily-report', date)).resolves.toEqual({
      success: true,
      id: 7,
      date,
    });

    expect(dayjs(taskRecordRepoMock.create.mock.calls[0][0].createdAt).format('YYYY-MM-DD')).toBe(date);
    expect(taskRecordRepoMock.save).toHaveBeenCalledTimes(1);
  });

  it('should reject supplementing an existing record', async () => {
    const date = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    taskRecordRepoMock.findOne.mockResolvedValue({ id: 1 });

    await expect(service.supplementDailyReport(1, 'daily-report', date)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(taskRecordRepoMock.save).not.toHaveBeenCalled();
  });

  it('should remove the old record when an overtime date is moved', async () => {
    const oldDate = dayjs().subtract(2, 'day').format('YYYY-MM-DD');
    const newDate = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    const oldRecord = {
      id: 7,
      userId: 1,
      toolKey: 'overtime',
      taskData: JSON.stringify({ type: 'overtime', date: oldDate, hours: 1 })
    };

    taskRecordRepoMock.findOne.mockResolvedValueOnce(oldRecord);
    taskRecordRepoMock.find.mockResolvedValue([]);
    taskRecordRepoMock.create.mockReturnValueOnce({ id: 8, userId: 1, toolKey: 'overtime' });
    taskRecordRepoMock.save.mockResolvedValueOnce({ id: 8 });

    await service.saveOvertimeRecord(1, {
      id: 7,
      type: 'overtime',
      date: newDate,
      hours: 2
    });

    expect(taskRecordRepoMock.remove).toHaveBeenCalledWith(oldRecord);
  });
});
