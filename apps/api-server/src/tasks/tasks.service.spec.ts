import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { UserSetting } from '../user-settings.entity';
import { TaskRecord } from '../task-record.entity';
import { WechatService } from '../wechat/wechat.service';
import dayjs from 'dayjs';

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
});
