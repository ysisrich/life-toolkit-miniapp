import { request } from '../utils/request';

/**
 * 微信小程序静默登录
 * @param {string} code 微信 login code
 */
export function wxLogin(code) {
  return request.post('/auth/wx-login', { code });
}
