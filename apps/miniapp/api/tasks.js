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

/**
 * 补签指定日期的日报
 */
export function supplementTask(toolKey, date) {
  return request.post(`/tasks/${toolKey}/supplement`, { date });
}

/**
 * 获取月度加班/请假流水
 */
export function getOvertimeLedger(year, month) {
  return request.get(`/tasks/overtime/ledger?year=${year}&month=${month}`);
}

/**
 * 保存某日的加班或请假记录
 */
export function saveOvertimeRecord(data) {
  return request.put('/tasks/overtime/record', data);
}

/**
 * 删除某日的加班或请假记录
 */
export function deleteOvertimeRecord(id) {
  return request.delete(`/tasks/overtime/record/${id}`);
}

/**
 * 导入手工加班账本
 */
export function importOvertimeLedger(content) {
  return request.post('/tasks/overtime/import', { content });
}

/**
 * 导出加班账本
 */
export function exportOvertimeLedger(year, month) {
  return request.get(`/tasks/overtime/export?year=${year}&month=${month}`);
}

/**
 * 获取月度统计数据
 */
export function getToolStats(toolKey, year, month) {
  return request.get(`/tasks/${toolKey}/stats?year=${year}&month=${month}`);
}
