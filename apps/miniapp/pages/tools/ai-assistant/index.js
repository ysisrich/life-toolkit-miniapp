import { getAiModels, transcribeAudio, sendChatStream } from '../../../api/ai';

let recorderManager = null;
let recordStartY = 0; // 记录开始录音时的触摸点Y坐标
let lastScrollTime = 0; // 用于滚动节流

Page({
  data: {
    models: [
      { name: 'DeepSeek-Chat', value: 'deepseek-chat' },
      { name: 'GPT-4o', value: 'gpt-4o' },
      { name: 'Claude 3.5', value: 'claude-3-5-sonnet' }
    ],
    modelIndex: 0,
    chatList: [
      {
        role: 'assistant',
        content: '主人您好！我是您的智能生活助手。您可以向我咨询健康与习惯常识，或者对我说“理发打卡”、“把剪指甲提醒改为每15天一次”等直接修改打卡状态或提醒设置。'
      }
    ],
    inputValue: '',
    thinking: false,
    scrollTop: 0,
    
    // AI 助手功能增强所需状态
    keyboardHeight: 0,
    inputMode: 'keyboard', // keyboard | voice
    recording: false,
    recordingTip: '手指上滑，取消发送',
    isCancelled: false, // 是否取消录音
    navBarHeight: 0,
    restrictMode: true,
    scrollAnimation: true
  },

  async onLoad() {
    const app = getApp();
    const navBarHeight = app.globalData.navBarHeight || 80;
    this.setData({ navBarHeight });

    // 初始化录音管理器
    this.initRecorder();
  },

  onShow() {
    this.loadModels();
  },

  async loadModels() {
    try {
      const models = await getAiModels();
      if (models && models.length > 0) {
        this.setData({ models, modelIndex: 0 });
      }
    } catch (e) {
      console.error('获取AI模型列表失败', e);
    }
  },

  initRecorder() {
    if (!wx.getRecorderManager) {
      console.warn('当前微信版本不支持录音管理器');
      return;
    }
    recorderManager = wx.getRecorderManager();

    recorderManager.onStart(() => {
      console.log('录音开始');
      this.setData({
        recording: true,
        recordingTip: '手指上滑，取消发送',
        isCancelled: false
      });
    });

    recorderManager.onStop((res) => {
      console.log('录音停止', res);
      this.setData({ recording: false });

      if (this.data.isCancelled) {
        console.log('用户取消了录音发送');
        return;
      }

      const { tempFilePath } = res;
      if (tempFilePath) {
        this.uploadAudio(tempFilePath);
      } else {
        wx.showToast({ title: '录音文件为空', icon: 'none' });
      }
    });

    recorderManager.onError((err) => {
      console.error('录音出错', err);
      this.setData({ recording: false });
      wx.showToast({ title: '录音失败: ' + err.errMsg, icon: 'none' });
    });
  },

  // 切换输入模式
  toggleInputMode() {
    const nextMode = this.data.inputMode === 'keyboard' ? 'voice' : 'keyboard';
    this.setData({
      inputMode: nextMode,
      keyboardHeight: 0 // 切换到语音时清空键盘高度
    });
    this.scrollToBottom();
  },

  // 开始录音
  startRecording(e) {
    if (!recorderManager) return;
    
    // 检查录音授权
    wx.getSetting({
      success: (res) => {
        if (!res.authSetting['scope.record']) {
          wx.authorize({
            scope: 'scope.record',
            success: () => {
              this.startRecordingExec(e);
            },
            fail: () => {
              // 引导开启设置
              wx.showModal({
                title: '申请录音权限',
                content: '需要麦克风权限以实现语音录入，请前往设置开启。',
                confirmText: '去设置',
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    wx.openSetting();
                  }
                }
              });
            }
          });
        } else {
          this.startRecordingExec(e);
        }
      }
    });
  },

  startRecordingExec(e) {
    // 震动提示
    wx.vibrateShort({ type: 'light' });
    
    // 记录初始触摸位置
    if (e.touches && e.touches[0]) {
      recordStartY = e.touches[0].clientY;
    }

    recorderManager.start({
      duration: 60000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: 'mp3'
    });
  },

  // 结束录音
  stopRecording() {
    if (!recorderManager) return;
    recorderManager.stop();
  },

  // 取消录音
  cancelRecording() {
    if (!recorderManager) return;
    this.setData({ isCancelled: true });
    recorderManager.stop();
  },

  // 滑动过程中监听取消逻辑
  handleTouchMove(e) {
    if (!this.data.recording || !e.touches || !e.touches[0]) return;
    
    const currentY = e.touches[0].clientY;
    const moveDistance = recordStartY - currentY; // 往上滑是负，差值为正

    if (moveDistance > 80) { // 向上滑动超过80px，判断为取消
      if (!this.data.isCancelled) {
        this.setData({
          isCancelled: true,
          recordingTip: '松开手指，取消发送'
        });
      }
    } else {
      if (this.data.isCancelled) {
        this.setData({
          isCancelled: false,
          recordingTip: '手指上滑，取消发送'
        });
      }
    }
  },

  // 上传音频并转译
  uploadAudio(tempFilePath) {
    wx.showLoading({ title: '正在识别语音...', mask: true });

    transcribeAudio(tempFilePath)
      .then((data) => {
        wx.hideLoading();
        if (data && data.text) {
          const newText = data.text.trim();
          if (newText) {
            this.setData({
              inputValue: (this.data.inputValue + ' ' + newText).trim(),
              inputMode: 'keyboard' // 自动切回键盘方便微调
            });
            wx.showToast({ title: '识别成功', icon: 'success' });
          } else {
            wx.showToast({ title: '未能识别出文字', icon: 'none' });
          }
        } else {
          wx.showToast({ title: '语音识别结果为空', icon: 'none' });
        }
      })
      .catch((err) => {
        wx.hideLoading();
        console.error('语音转译请求失败', err);
        wx.showToast({ title: '语音转译请求失败', icon: 'none' });
      });
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  onModelChange(e) {
    this.setData({ modelIndex: parseInt(e.detail.value) });
  },

  onRestrictModeChange(e) {
    const restrictMode = e.detail.value;
    this.setData({ restrictMode });
    
    const newChatList = [
      {
        role: 'assistant',
        content: restrictMode 
          ? '主人您好！我是您的智能生活助手。您可以向我咨询健康与习惯常识，或者对我说“理发打卡”、“把剪指甲提醒改为每15天一次”等直接修改打卡状态或提醒设置。'
          : '您好！我是您的人工智能助手。现在我们已进入自由对话模式，我可以为您解答各种问题、提供建议或进行各种话题的闲聊。'
      }
    ];
    this.setData({ chatList: newChatList });
  },

  // 键盘聚焦
  onFocus(e) {
    const { height } = e.detail;
    this.setData({ keyboardHeight: height });
    this.scrollToBottom();
  },

  // 键盘失焦
  onBlur() {
    this.setData({ keyboardHeight: 0 });
    this.scrollToBottom();
  },

  async sendMsg() {
    const content = this.data.inputValue.trim();
    if (!content || this.data.thinking) return;

    // 先在列表里推入用户当前输入的内容，显示思考点动画
    const newChatList = [...this.data.chatList, { role: 'user', content }];
    this.setData({
      chatList: newChatList,
      inputValue: '',
      thinking: true,
      scrollAnimation: true
    });
    this.scrollToBottom();

    // 过滤出最近10轮有效的问答对话（排除 system_action）
    const history = this.data.chatList
      .filter(c => c.role === 'user' || c.role === 'assistant')
      .slice(-10);

    const model = this.data.models[this.data.modelIndex].value;
    
    let accumulatedText = '';
    let buffer = '';
    let assistantMsgIndex = -1;

    sendChatStream({
      message: content,
      model,
      history,
      restrictMode: this.data.restrictMode
    }, {
      success: (res) => {
        this.setData({ 
          thinking: false,
          scrollAnimation: true
        });
        this.scrollToBottom();
      },
      fail: (err) => {
        console.error('Stream request failed', err);
        const list = [...this.data.chatList];
        if (assistantMsgIndex === -1) {
          list.push({ role: 'assistant', content: '连接大模型服务发生错误，请确认后端配置或稍后再试。' });
        } else {
          list[assistantMsgIndex].content = accumulatedText + '\n[连接中断，请稍后再试]';
        }
        this.setData({
          chatList: list,
          thinking: false,
          scrollAnimation: true
        });
        this.scrollToBottom();
      },
      onChunk: (chunkRes) => {
        let str = '';
        try {
          if (typeof TextDecoder !== 'undefined') {
            str = new TextDecoder('utf-8').decode(chunkRes.data);
          } else {
            const uint8 = new Uint8Array(chunkRes.data);
            str = String.fromCharCode.apply(null, uint8);
            str = decodeURIComponent(escape(str));
          }
        } catch (err) {
          console.warn('Decode failed, using fallback:', err);
          const uint8 = new Uint8Array(chunkRes.data);
          str = String.fromCharCode.apply(null, uint8);
        }

        buffer += str;
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 不完整的行留存在 buffer 中下包继续拼接

        let textUpdated = false;
        const list = [...this.data.chatList];

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6).trim();
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.type === 'text' && parsed.content) {
                if (this.data.thinking) {
                  this.setData({ thinking: false });
                }
                accumulatedText += parsed.content;
                
                if (assistantMsgIndex === -1) {
                  list.push({ role: 'assistant', content: accumulatedText });
                  assistantMsgIndex = list.length - 1;
                } else {
                  list[assistantMsgIndex].content = accumulatedText;
                }
                textUpdated = true;
              } else if (parsed.type === 'action' && parsed.actionExecuted) {
                if (assistantMsgIndex === -1) {
                  list.push({
                    role: 'system_action',
                    content: '⚙️ 习惯提醒设置或打卡历史已成功由 AI 智能修改保存'
                  });
                } else {
                  list.splice(assistantMsgIndex, 0, {
                    role: 'system_action',
                    content: '⚙️ 习惯提醒设置或打卡历史已成功由 AI 智能修改保存'
                  });
                  assistantMsgIndex += 1;
                }
                textUpdated = true;
              }
            } catch (e) {
              console.warn('Failed to parse SSE line:', trimmed, e);
            }
          }
        }

        if (textUpdated) {
          this.setData({ 
            chatList: list,
            scrollAnimation: false
          });
          this.throttleScroll();
        }
      }
    });
  },

  throttleScroll() {
    const now = Date.now();
    if (now - lastScrollTime > 200) {
      lastScrollTime = now;
      this.scrollToBottom();
    }
  },

  scrollToBottom() {
    this.setData({
      scrollTop: 99999 + Math.random()
    });
  }
});
