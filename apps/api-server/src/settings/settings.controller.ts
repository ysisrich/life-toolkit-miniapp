import { Controller, Get, Put, Body, Param, UseGuards, Request } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get(':toolKey')
  async getSetting(@Request() req, @Param('toolKey') toolKey: string) {
    const userId = req.user.userId;
    return this.settingsService.getSetting(userId, toolKey);
  }

  @Put(':toolKey')
  async saveSetting(
    @Request() req, 
    @Param('toolKey') toolKey: string,
    @Body() body: any
  ) {
    const userId = req.user.userId;
    await this.settingsService.saveSetting(userId, toolKey, body);
    return null;
  }
}
