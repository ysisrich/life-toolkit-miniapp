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

  async getAvailableModels(userId: number) {
    // 1. 尝试获取用户的自定义 AI 配置
    const settings = await this.settingsRepository.findOne({ where: { userId, toolKey: 'ai-settings' } });
    let apiKey = process.env.AI_API_KEY;
    let baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
    let userModelsList: { name: string, value: string }[] | null = null;
    let defaultModel = '';

    if (settings) {
      try {
        const configData = JSON.parse(settings.settingData);
        if (configData && configData.activeConfigId && Array.isArray(configData.configs)) {
          const activeConfig = configData.configs.find((c: any) => c.id === configData.activeConfigId);
          if (activeConfig) {
            defaultModel = activeConfig.defaultModel || '';
            if (activeConfig.apiKey && activeConfig.baseUrl) {
              apiKey = activeConfig.apiKey;
              baseUrl = activeConfig.baseUrl;
              if (activeConfig.models) {
                userModelsList = activeConfig.models.split(',').map((m: string) => {
                  const parts = m.split(':');
                  const name = parts[0]?.trim() || '';
                  const value = parts[1]?.trim() || name;
                  return { name, value };
                }).filter((m: any) => m.name && m.value);
              }
            }
          }
        }
      } catch (err) {
        this.logger.error(`Error parsing user custom AI settings: ${err.message}`);
      }
    }

    // 如果没有自定义的 defaultModel，使用 env 的
    if (!defaultModel) {
      defaultModel = process.env.AI_DEFAULT_MODEL || 'gpt-4o';
    }

    // 处理排序的辅助方法
    const prioritizeDefaultModel = (list: { name: string, value: string }[]) => {
      if (!list || list.length === 0 || !defaultModel) return list;
      const index = list.findIndex(m => m.value === defaultModel);
      if (index > -1) {
        const [item] = list.splice(index, 1);
        list.unshift(item);
      } else {
        list.unshift({ name: defaultModel, value: defaultModel });
      }
      return list;
    };

    // 如果用户配置了自定义模型列表，直接返回排序后的列表
    if (userModelsList && userModelsList.length > 0) {
      return prioritizeDefaultModel(userModelsList);
    }

    // 否则，若有 api key 尝试实时从服务商获取可用模型
    if (apiKey && apiKey !== 'your_proxy_api_key_here') {
      try {
        const fetched = await this.fetchModelsDirectly(baseUrl, apiKey);
        return prioritizeDefaultModel(fetched);
      } catch (e) {
        this.logger.warn(`Failed to fetch models list from LLM provider: ${e.message}. Using env fallback.`);
      }
    }

    // 无法获取时的本地兜底
    const modelsEnv = process.env.AI_MODELS || 'DeepSeek-Chat:deepseek-chat,GPT-4o:gpt-4o,Claude 3.5:claude-3-5-sonnet';
    const fallbackList = modelsEnv.split(',').map(m => {
      const [name, value] = m.split(':');
      return { name: name.trim(), value: value.trim() };
    });
    return prioritizeDefaultModel(fallbackList);
  }

  async fetchModelsDirectly(baseUrl: string, apiKey: string) {
    if (!baseUrl || !apiKey) {
      throw new Error('Base URL and API Key are required');
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时

    try {
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
          return filtered.map((m: any) => ({
            name: m.id,
            value: m.id
          }));
        } else {
          throw new Error('Invalid models response structure');
        }
      } else {
        const errText = await response.text();
        throw new Error(`Status ${response.status}: ${errText}`);
      }
    } catch (e) {
      clearTimeout(timeoutId);
      this.logger.error(`Failed to fetch models from ${baseUrl}: ${e.message}`);
      throw new Error(e.message || '获取模型列表失败');
    }
  }

  async handleChatStream(userId: number, chatDto: ChatDto, res: any) {
    // 1. 获取用户的自定义 AI 配置
    const settings = await this.settingsRepository.findOne({ where: { userId, toolKey: 'ai-settings' } });
    let apiKey = process.env.AI_API_KEY;
    let baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
    let defaultModel = process.env.AI_DEFAULT_MODEL || 'gpt-4o';

    if (settings) {
      try {
        const configData = JSON.parse(settings.settingData);
        if (configData && configData.activeConfigId && Array.isArray(configData.configs)) {
          const activeConfig = configData.configs.find((c: any) => c.id === configData.activeConfigId);
          if (activeConfig && activeConfig.apiKey && activeConfig.baseUrl) {
            apiKey = activeConfig.apiKey;
            baseUrl = activeConfig.baseUrl;
            defaultModel = activeConfig.defaultModel || defaultModel;
          }
        }
      } catch (err) {
        this.logger.error(`Error parsing user custom AI settings for chat: ${err.message}`);
      }
    }

    const model = chatDto.model || defaultModel;

    if (!apiKey || apiKey === 'your_proxy_api_key_here') {
      res.write(`data: ${JSON.stringify({ type: 'text', content: '⚠️ 后端大模型服务 API Key 尚未正确配置。请在小程序通用设置中添加您的 AI 设置，即可激活 AI 智能习惯助手。' })}\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n`);
      res.end();
      return;
    }

    const isRestrict = chatDto.restrictMode !== false; // 默认是 true
    let systemPrompt = '';
    let tools: any[] | null = null;

    if (isRestrict) {
      // 2. 获取当前用户的状态作为系统上下文
      const userSettings = await this.settingsRepository.find({ where: { userId } });
      const clipperSetting = userSettings.find(s => s.toolKey === 'nail-clipper');
      const haircutSetting = userSettings.find(s => s.toolKey === 'haircut');
      const dailyReportSetting = userSettings.find(s => s.toolKey === 'daily-report');

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

      systemPrompt = `你是一个贴心的生活习惯智能助理（Life Toolkit Assistant）。
当前日期是：${dayjs().format('YYYY-MM-DD')}，星期是：${['日', '一', '二', '三', '四', '五', '六'][dayjs().day()]}。
当前用户的提醒设置如下：
- 剪指甲提醒：${clipperData.interval ? `当前周期 ${clipperData.interval} 天` : '未开启周期'}, 上次打卡时间: ${formatRecordTime(lastClipperRecord)}。
- 理发提醒：${haircutData.interval ? `当前周期 ${haircutData.interval} 天` : '未开启周期'}, 上次打卡时间: ${formatRecordTime(lastHaircutRecord)}。
- 日报提醒时间：${dailyReportData.time || '未设置'}，开启状态: ${dailyReportData.enabled ? '已开启' : '已关闭'}。上次日报打卡/请假时间: ${formatRecordTime(lastDailyReportRecord)}。

你可以解答各种关于健康、卫生、剪指甲/理发频率等问题，帮助他们保持良好生活习惯。
如果用户要求修改周期、修改打卡提醒时间/状态或进行打卡、请假，请使用你拥有的相关工具（Tools）完成操作。
在工具调用执行完毕并向你反馈结果后，请你根据工具反馈的状态，向用户生成一条通俗易懂的正面确认消息，表明对应设置已成功更改或已成功进行打卡/请假补录。`;

      tools = [
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
    } else {
      systemPrompt = `你是一个全能的、友好的人工智能助理，可以直接与用户进行自由对话，提供帮助 and 回答问题。`;
      tools = null;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...(chatDto.history || []).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: chatDto.message }
    ];

    try {
      const { toolCalls } = await this.readStreamAndProcess(
        baseUrl, apiKey, model, messages, tools, res
      );

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

        const finalMessages = [
          ...messages,
          { role: 'assistant', content: null, tool_calls: toolCalls },
          ...toolOutputs
        ];

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
      const errMsg = e.cause ? `${e.message} (原因: ${(e.cause as any).message || e.cause})` : e.message;
      res.write(`data: ${JSON.stringify({ type: 'text', content: `\n智能助手请求失败（错误信息: ${errMsg}）。` })}\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n`);
      res.end();
    }
  }

  async transcribeAudio(userId: number, file: any) {
    // 1. 获取用户的自定义 AI 配置
    const settings = await this.settingsRepository.findOne({ where: { userId, toolKey: 'ai-settings' } });
    let apiKey = process.env.AI_API_KEY;
    let baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';

    if (settings) {
      try {
        const configData = JSON.parse(settings.settingData);
        if (configData && configData.activeConfigId && Array.isArray(configData.configs)) {
          const activeConfig = configData.configs.find((c: any) => c.id === configData.activeConfigId);
          if (activeConfig && activeConfig.apiKey && activeConfig.baseUrl) {
            apiKey = activeConfig.apiKey;
            baseUrl = activeConfig.baseUrl;
          }
        }
      } catch (err) {
        this.logger.error(`Error parsing user custom AI settings for transcription: ${err.message}`);
      }
    }

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

            if (delta.content) {
              accumulatedText += delta.content;
              res.write(`data: ${JSON.stringify({ type: 'text', content: delta.content })}\n`);
            }

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
    const record = this.recordsRepository.create({
      userId,
      toolKey,
      taskData: JSON.stringify({ type })
    });
    await this.recordsRepository.save(record);

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
}
