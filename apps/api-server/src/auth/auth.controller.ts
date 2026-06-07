import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('wx-login')
  async wxLogin(@Body('code') code: string) {
    return this.authService.wxLogin(code);
  }
}
