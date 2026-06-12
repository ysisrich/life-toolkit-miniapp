import { request } from '../utils/request';
import { tokenManager } from '../utils/token';

/**
 * 获取可用AI模型列表
 */
export function getAiModels() {
  return request.get('/ai/models');
}

/**
 * 上传音频文件并转译为文本
 * @param {string} tempFilePath 音频临时文件路径
 */
export function transcribeAudio(tempFilePath) {
  const token = tokenManager.getToken();
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${request.baseURL}/ai/transcribe`,
      filePath: tempFilePath,
      name: 'file',
      header: {
        'Authorization': `Bearer ${token}`
      },
      success: (res) => {
        try {
          const data = JSON.parse(res.data);
          resolve(data);
        } catch (e) {
          reject(e);
        }
      },
      fail: reject
    });
  });
}

/**
 * 发送流式聊天请求
 * @param {object} params 请求参数 { message, model, history }
 * @param {object} callbacks 回调函数 { onChunk, success, fail }
 */
export function sendChatStream({ message, model, history }, { onChunk, success, fail }) {
  const token = tokenManager.getToken();
  const requestTask = wx.request({
    url: `${request.baseURL}/ai/chat`,
    method: 'POST',
    data: {
      message,
      model,
      history
    },
    header: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    enableChunked: true,
    success,
    fail
  });

  if (requestTask && requestTask.onChunkReceived) {
    requestTask.onChunkReceived(onChunk);
  }

  return requestTask;
}
