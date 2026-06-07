import { request } from '../utils/request';

/**
 * 获取某个工具的任务记录
 * @param {string} toolKey 
 */
export function getTasks(toolKey) {
  return request.get(`/tasks/${toolKey}`);
}

/**
 * 记录一次新任务打卡
 * @param {string} toolKey 
 * @param {object} data 任务附加数据
 */
export function recordTask(toolKey, data = {}) {
  return request.post(`/tasks/${toolKey}/record`, data);
}
