import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSetting } from '../user-settings.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(UserSetting)
    private settingsRepository: Repository<UserSetting>,
  ) {}

  async getSetting(userId: number, toolKey: string) {
    const setting = await this.settingsRepository.findOne({ where: { userId, toolKey } });
    if (!setting) return null;
    try {
      return JSON.parse(setting.settingData);
    } catch {
      return null;
    }
  }

  async saveSetting(userId: number, toolKey: string, data: any) {
    let setting = await this.settingsRepository.findOne({ where: { userId, toolKey } });
    const settingData = JSON.stringify(data);
    
    if (setting) {
      setting.settingData = settingData;
      setting.updatedAt = new Date();
    } else {
      setting = this.settingsRepository.create({ userId, toolKey, settingData });
    }
    
    await this.settingsRepository.save(setting);
    return { success: true };
  }
}
