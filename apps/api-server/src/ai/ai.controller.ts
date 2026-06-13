import { Controller, Post, Get, Body, UseGuards, Request, Res, UseInterceptors, UploadedFile } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { ChatDto } from './dto/chat.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @UseGuards(JwtAuthGuard)
  @Get('models')
  async getModels(@Request() req) {
    return this.aiService.getAvailableModels(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('fetch-models')
  async fetchModels(@Body() body: { baseUrl: string; apiKey: string }) {
    return this.aiService.fetchModelsDirectly(body.baseUrl, body.apiKey);
  }

  @UseGuards(JwtAuthGuard)
  @Post('chat')
  async chat(@Request() req, @Body() chatDto: ChatDto, @Res() res: any) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    await this.aiService.handleChatStream(req.user.userId, chatDto, res);
  }

  @UseGuards(JwtAuthGuard)
  @Post('transcribe')
  @UseInterceptors(FileInterceptor('file'))
  async transcribe(@Request() req, @UploadedFile() file: any) {
    return this.aiService.transcribeAudio(req.user.userId, file);
  }
}
