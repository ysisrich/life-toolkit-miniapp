/**
 * 缓存管理器 (支持过期时间)
 */
class Storage {
  constructor(namespace = '') {
    this.namespace = namespace;
  }

  _getKey(key) {
    return this.namespace ? `${this.namespace}_${key}` : key;
  }

  /**
   * 设置缓存
   * @param {string} key 键名
   * @param {any} value 键值
   * @param {number} expire 过期时间（秒），如果不传则永不过期
   */
  set(key, value, expire = null) {
    const realKey = this._getKey(key);
    const data = {
      value,
      time: Date.now(),
      expire: expire ? Date.now() + expire * 1000 : null
    };
    try {
      wx.setStorageSync(realKey, data);
    } catch (e) {
      console.error(`Storage set error for key ${realKey}:`, e);
    }
  }

  /**
   * 获取缓存
   * @param {string} key 键名
   * @param {any} def 默认值
   */
  get(key, def = null) {
    const realKey = this._getKey(key);
    try {
      const data = wx.getStorageSync(realKey);
      if (!data) return def;

      // 检查是否过期
      if (data.expire && data.expire < Date.now()) {
        this.remove(key);
        return def;
      }
      return data.value;
    } catch (e) {
      console.error(`Storage get error for key ${realKey}:`, e);
      return def;
    }
  }

  /**
   * 移除缓存
   * @param {string} key 键名
   */
  remove(key) {
    const realKey = this._getKey(key);
    try {
      wx.removeStorageSync(realKey);
    } catch (e) {
      console.error(`Storage remove error for key ${realKey}:`, e);
    }
  }

  /**
   * 清除命名空间下的所有缓存
   * 这里为了简单起见，如果不传 namespace，就清理全部
   */
  clear() {
    try {
      wx.clearStorageSync();
    } catch (e) {
      console.error('Storage clear error:', e);
    }
  }
}

export const storage = new Storage();
