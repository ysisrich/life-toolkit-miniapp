import { request } from '../utils/request';

/**
 * 获取工具的配置
 * @param {string} toolKey 工具的唯一标识 (例如 'nail-clipper')
 */
export function getToolSettings(toolKey) {
  return request.get(`/settings/${toolKey}`);
}

/**
 * 更新工具的配置
 * @param {string} toolKey 工具的唯一标识
 * @param {object} data 配置内容
 */
export function updateToolSettings(toolKey, data) {
  return request.put(`/settings/${toolKey}`, data);
}

/**
 * 获取 Bark 配置
 */
export function getBarkConfig() {
  return request.get('/settings/bark-config');
}

/**
 * 保存 Bark 配置
 * @param {object} data Bark配置内容 { server, key }
 */
export function updateBarkConfig(data) {
  return request.put('/settings/bark-config', data);
}
