import { Injectable, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users.entity';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async wxLogin(code: string) {
    const appId = this.configService.get<string>('WX_APP_ID');
    const secret = this.configService.get<string>('WX_APP_SECRET');
    
    if (!appId || !secret) {
      throw new InternalServerErrorException('Missing WeChat configuration');
    }

    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.errcode) {
        throw new UnauthorizedException(`WeChat login failed: ${data.errmsg}`);
      }

      const openId = data.openid;
      
      if (!openId) {
        throw new UnauthorizedException('Invalid code or openId missing');
      }

      // Find or create user
      let user = await this.usersRepository.findOne({ where: { openId } });
      if (!user) {
        user = this.usersRepository.create({ openId });
        await this.usersRepository.save(user);
      }

      // Generate JWT
      const payload = { openId: user.openId, sub: user.id };
      return {
        access_token: this.jwtService.sign(payload),
        user
      };
    } catch (error) {
      throw new UnauthorizedException('Failed to authenticate with WeChat');
    }
  }
}
