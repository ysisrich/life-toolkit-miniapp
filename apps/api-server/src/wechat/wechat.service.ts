import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WechatService {
  private readonly logger = new Logger(WechatService.name);
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(private configService: ConfigService) {}

  async getAccessToken(): Promise<string> {
    const now = Date.now();
    // Use cache with 5 minutes buffer
    if (this.accessToken && this.tokenExpiresAt > now + 300000) {
      return this.accessToken;
    }

    const appId = this.configService.get<string>('WX_APP_ID');
    const secret = this.configService.get<string>('WX_APP_SECRET');

    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${secret}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.errcode) {
        throw new Error(data.errmsg);
      }

      this.accessToken = data.access_token;
      // expiresIn is usually 7200 seconds
      this.tokenExpiresAt = now + data.expires_in * 1000;
      
      return this.accessToken as string;
    } catch (err) {
      this.logger.error('Failed to get wechat access token', err);
      throw err;
    }
  }

  async sendSubscribeMessage(openId: string, templateId: string, data: any, page: string = '') {
    const token = await this.getAccessToken();
    const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`;

    const payload = {
      touser: openId,
      template_id: templateId,
      page: page,
      data: data,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      
      if (result.errcode) {
        this.logger.error(`Send subscribe message failed: ${JSON.stringify(result)}`);
      } else {
        this.logger.log(`Message sent successfully to ${openId}`);
      }
      return result;
    } catch (err) {
      this.logger.error('Failed to send wechat subscribe message', err);
      throw err;
    }
  }
}
