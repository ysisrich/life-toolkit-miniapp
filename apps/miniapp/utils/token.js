import { storage } from './storage';

const TOKEN_KEY = 'auth_token';

/**
 * Token 管理器
 */
class TokenManager {
  getToken() {
    return storage.get(TOKEN_KEY, '');
  }

  setToken(token) {
    // 设置 token，可根据实际后端失效机制设置过期时间，这里我们默认永不过期或交由请求层的 401 自动刷新处理
    storage.set(TOKEN_KEY, token);
  }

  clearToken() {
    storage.remove(TOKEN_KEY);
  }
}

export const tokenManager = new TokenManager();
