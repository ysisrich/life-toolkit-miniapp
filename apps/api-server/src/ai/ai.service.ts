import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSetting } from '../user-settings.entity';
import { TaskRecord } from '../task-record.entity';
import { ChatDto } from './dto/chat.dto';
import dayjs from 'dayjs';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @InjectRepository(UserSetting)
    private readonly settingsRepository: Repository<UserSetting>,
    @InjectRepository(TaskRecord)
    private readonly recordsRepository: Repository<TaskRecord>,
  ) {}

  async getAvailableModels() {
    const apiKey = process.env.AI_API_KEY;
    const baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';

    if (apiKey && apiKey !== 'your_proxy_api_key_here') {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒超时防止接口挂起

        const response = await fetch(`${baseUrl}/models`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const result = await response.json();
          if (result && Array.isArray(result.data)) {
            // 过滤掉嵌入、画图、语音、审核等非对话类模型，保持下拉列表整洁
            const filtered = result.data.filter((m: any) => {
              const id = m.id.toLowerCase();
              return !id.includes('embed') && 
                     !id.includes('similarity') && 
                     !id.includes('whisper') && 
                     !id.includes('dall-e') && 
                     !id.includes('tts') && 
                     !id.includes('moderation') && 
                     !id.includes('edit') &&
                     !id.includes('bge');
            });
            // 映射为前端所需的格式 { name, value }
            return filtered.map((m: any) => ({
              name: m.id,
              value: m.id
            }));
          }
        }
      } catch (e) {
        this.logger.warn(`Failed to fetch models list from LLM provider: ${e.message}. Using env fallback.`);
      }
    }

    // 无法获取或出错时的本地兜底逻辑
    const modelsEnv = process.env.AI_MODELS || 'DeepSeek-Chat:deepseek-chat,GPT-4o:gpt-4o,Claude 3.5:claude-3-5-sonnet';
    return modelsEnv.split(',').map(m => {
      const [name, value] = m.split(':');
      return { name: name.trim(), value: value.trim() };
    });
  }

  async handleChatStream(userId: number, chatDto: ChatDto, res: any) {
    const apiKey = process.env.AI_API_KEY;
    const baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
    const defaultModel = process.env.AI_DEFAULT_MODEL || 'gpt-4o';
    const model = chatDto.model || defaultModel;

    if (!apiKey || apiKey === 'your_proxy_api_key_here') {
      res.write(`data: ${JSON.stringify({ type: 'text', content: '⚠️ 后端大模型服务 API Key 尚未正确配置。请在 apps/api-server/.env 文件中配置您的 AI_API_KEY 与 AI_BASE_URL，即可激活功能丰富的 AI 智能习惯助手对话与快捷设置打卡功能。' })}\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n`);
      res.end();
      return;
    }

    // 1. 获取当前用户的状态作为系统上下文
    const settings = await this.settingsRepository.find({ where: { userId } });
    const clipperSetting = settings.find(s => s.toolKey === 'nail-clipper');
    const haircutSetting = settings.find(s => s.toolKey === 'haircut');
    const dailyReportSetting = settings.find(s => s.toolKey === 'daily-report');

    const clipperData = JSON.parse(clipperSetting?.settingData || '{}');
    const haircutData = JSON.parse(haircutSetting?.settingData || '{}');
    const dailyReportData = JSON.parse(dailyReportSetting?.settingData || '{}');

    // 查最近的打卡记录
    const lastClipperRecord = await this.recordsRepository.findOne({
      where: { userId, toolKey: 'nail-clipper' },
      order: { createdAt: 'DESC' }
    });
    const lastHaircutRecord = await this.recordsRepository.findOne({
      where: { userId, toolKey: 'haircut' },
      order: { createdAt: 'DESC' }
    });
    const lastDailyReportRecord = await this.recordsRepository.findOne({
      where: { userId, toolKey: 'daily-report' },
      order: { createdAt: 'DESC' }
    });

    const formatRecordTime = (rec: TaskRecord | null) => {
      return rec ? dayjs(rec.createdAt).format('YYYY-MM-DD HH:mm:ss') : '无记录';
    };

    const systemPrompt = `你是一个贴心的生活习惯智能助理（Life Toolkit Assistant）。
当前日期是：${dayjs().format('YYYY-MM-DD')}，星期是：${['日', '一', '二', '三', '四', '五', '六'][dayjs().day()]}。
当前用户的提醒设置如下：
- 剪指甲提醒：${clipperData.interval ? `当前周期 ${clipperData.interval} 天` : '未开启周期'}, 上次打卡时间: ${formatRecordTime(lastClipperRecord)}。
- 理发提醒：${haircutData.interval ? `当前周期 ${haircutData.interval} 天` : '未开启周期'}, 上次打卡时间: ${formatRecordTime(lastHaircutRecord)}。
- 日报提醒时间：${dailyReportData.time || '未设置'}，开启状态: ${dailyReportData.enabled ? '已开启' : '已关闭'}。上次日报打卡/请假时间: ${formatRecordTime(lastDailyReportRecord)}。

你可以解答各种关于健康、卫生、剪指甲/理发频率等问题，帮助他们保持良好生活习惯。
如果用户要求修改周期、修改打卡提醒时间/状态或进行打卡、请假，请使用你拥有的相关工具（Tools）完成操作。
在工具调用执行完毕并向你反馈结果后，请你根据工具反馈的状态，向用户生成一条通俗易懂的正面确认消息，表明对应设置已成功更改或已成功进行打卡/请假补录。`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...(chatDto.history || []).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: chatDto.message }
    ];

    // 定义大模型工具 (Tools)
    const tools = [
      {
        type: 'function',
        function: {
          name: 'update_tool_setting',
          description: '修改理发、剪指甲的提醒间隔天数，或者修改日报的提醒时间或开关。',
          parameters: {
            type: 'object',
            properties: {
              toolKey: {
                type: 'string',
                enum: ['nail-clipper', 'haircut', 'daily-report'],
                description: '工具标识'
              },
              settingData: {
                type: 'object',
                properties: {
                  interval: { type: 'number', description: '剪指甲或理发的周期天数' },
                  time: { type: 'string', description: '日报打卡提醒时间，格式如 HH:mm' },
                  enabled: { type: 'boolean', description: '日报打卡提醒开关' }
                },
                description: '需要更新的设置字段'
              }
            },
            required: ['toolKey', 'settingData']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'record_task',
          description: '记录一次理发打卡、剪指甲打卡、日报常规打卡或日报请假记录。',
          parameters: {
            type: 'object',
            properties: {
              toolKey: {
                type: 'string',
                enum: ['nail-clipper', 'haircut', 'daily-report'],
                description: '工具标识'
              },
              type: {
                type: 'string',
                enum: ['record', 'leave'],
                description: '打卡类型，record代表常规打卡，leave代表日报请假'
              }
            },
            required: ['toolKey', 'type']
          }
        }
      }
    ];

    try {
      // 1. 发起首轮流式调用
      const { toolCalls } = await this.readStreamAndProcess(
        baseUrl, apiKey, model, messages, tools, res
      );

      // 2. 如果发生了 Tool 调用
      if (toolCalls && toolCalls.length > 0) {
        const toolOutputs: any[] = [];
        let finalActionExecuted = false;

        for (const toolCall of toolCalls) {
          const func = toolCall.function;
          const args = JSON.parse(func.arguments);

          try {
            if (func.name === 'update_tool_setting') {
              await this.executeUpdateSetting(userId, args.toolKey, args.settingData);
              finalActionExecuted = true;
            } else if (func.name === 'record_task') {
              await this.executeRecordTask(userId, args.toolKey, args.type);
              finalActionExecuted = true;
            }
            toolOutputs.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: func.name,
              content: '{"success":true}'
            });
          } catch (e) {
            this.logger.error(`Failed to execute tool ${func.name}: ${e.message}`, e.stack);
            toolOutputs.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: func.name,
              content: `{"success":false,"error":"${e.message}"}`
            });
          }
        }

        // 构造第二轮请求大模型以流式反馈操作成功结果
        const finalMessages = [
          ...messages,
          { role: 'assistant', content: null, tool_calls: toolCalls },
          ...toolOutputs
        ];

        // 触发 actionExecuted 消息给前端以更新 UI 气泡
        if (finalActionExecuted) {
          res.write(`data: ${JSON.stringify({ type: 'action', actionExecuted: true })}\n`);
        }

        await this.readStreamAndProcess(
          baseUrl, apiKey, model, finalMessages, null, res
        );
      }

      res.write(`data: ${JSON.stringify({ type: 'done' })}\n`);
      res.end();

    } catch (e) {
      this.logger.error(`AI Chat Stream failed: ${e.message}`, e.stack);
      res.write(`data: ${JSON.stringify({ type: 'text', content: `\n智能助手请求失败（错误信息: ${e.message}）。` })}\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n`);
      res.end();
    }
  }

  // 内部辅助方法，读取大模型返回的 SSE 流，并实时转换后发给前端 res
  private async readStreamAndProcess(
    baseUrl: string,
    apiKey: string,
    model: string,
    messages: any[],
    tools: any[] | null,
    res: any
  ): Promise<{ toolCalls: any[], text: string }> {
    const body: any = {
      model,
      messages,
      stream: true
    };
    if (tools) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API responded with status ${response.status}: ${errText}`);
    }

    const reader = response.body;
    if (!reader) {
      throw new Error('Response body is null');
    }

    let accumulatedText = '';
    const toolCallsMap = new Map<number, any>();

    // 适配不同的 Node 版本读取流
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    for await (const chunk of reader) {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk as any, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const choice = parsed.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta;
            if (!delta) continue;

            // 1. 处理文本回复
            if (delta.content) {
              accumulatedText += delta.content;
              // 实时推送给前端
              res.write(`data: ${JSON.stringify({ type: 'text', content: delta.content })}\n`);
            }

            // 2. 处理 Tool Calls（如果存在）
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const index = tc.index;
                if (!toolCallsMap.has(index)) {
                  toolCallsMap.set(index, {
                    id: tc.id,
                    type: 'function',
                    function: { name: '', arguments: '' }
                  });
                }
                const existing = toolCallsMap.get(index);
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.function.name += tc.function.name;
                if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
              }
            }
          } catch (err) {
            this.logger.warn(`Failed to parse SSE line from provider: ${trimmed}. Error: ${err.message}`);
          }
        }
      }
    }

    return {
      toolCalls: Array.from(toolCallsMap.values()),
      text: accumulatedText
    };
  }

  private async executeUpdateSetting(userId: number, toolKey: string, settingData: any) {
    let setting = await this.settingsRepository.findOne({ where: { userId, toolKey } });
    if (!setting) {
      setting = this.settingsRepository.create({ userId, toolKey, settingData: '{}' });
    }
    const data = JSON.parse(setting.settingData || '{}');
    const updatedData = { ...data, ...settingData };
    setting.settingData = JSON.stringify(updatedData);
    setting.updatedAt = new Date();
    await this.settingsRepository.save(setting);
  }

  private async executeRecordTask(userId: number, toolKey: string, type: string) {
    // 1. 保存 TaskRecord 打卡记录
    const record = this.recordsRepository.create({
      userId,
      toolKey,
      taskData: JSON.stringify({ type })
    });
    await this.recordsRepository.save(record);

    // 2. 理发 / 剪指甲 额外更新 UserSetting 表中的 lastDate
    if (toolKey === 'nail-clipper' || toolKey === 'haircut') {
      let setting = await this.settingsRepository.findOne({ where: { userId, toolKey } });
      if (!setting) {
        setting = this.settingsRepository.create({ userId, toolKey, settingData: '{}' });
      }
      const data = JSON.parse(setting.settingData || '{}');
      data.lastDate = dayjs().format('YYYY-MM-DD HH:mm:ss');
      setting.settingData = JSON.stringify(data);
      setting.updatedAt = new Date();
      await this.settingsRepository.save(setting);
    }
  }

  async transcribeAudio(file: any) {
    const apiKey = process.env.AI_API_KEY;
    const baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';

    if (!apiKey || apiKey === 'your_proxy_api_key_here') {
      return { text: '' };
    }

    try {
      const formData = new FormData();
      const blob = new Blob([file.buffer], { type: file.mimetype || 'audio/mpeg' });
      formData.append('file', blob, file.originalname || 'audio.mp3');
      formData.append('model', 'whisper-1');

      const response = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        return { text: result.text || '' };
      } else {
        const errText = await response.text();
        this.logger.error(`Whisper API transcription failed: ${response.status} - ${errText}`);
        return { text: '' };
      }
    } catch (e) {
      this.logger.error(`Transcription error: ${e.message}`, e.stack);
      return { text: '' };
    }
  }
}
