import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SettingsService } from './settings.service';
import { UserSetting } from '../user-settings.entity';

describe('SettingsService', () => {
  let service: SettingsService;
  let repoMock: any;

  beforeEach(async () => {
    repoMock = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: getRepositoryToken(UserSetting),
          useValue: repoMock,
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  it('should merge settings when saving', async () => {
    const existingSetting = {
      userId: 1,
      toolKey: 'daily-report',
      settingData: JSON.stringify({ reminderTime: '18:00', lastPushedDate: '2026-06-23' }),
      updatedAt: new Date(),
    };
    repoMock.findOne.mockResolvedValue(existingSetting);

    await service.saveSetting(1, 'daily-report', { cancelReminderDate: '2026-06-24' });

    expect(repoMock.save).toHaveBeenCalled();
    const saved = repoMock.save.mock.calls[0][0];
    expect(JSON.parse(saved.settingData)).toEqual({
      reminderTime: '18:00',
      lastPushedDate: '2026-06-23',
      cancelReminderDate: '2026-06-24',
    });
  });
});
