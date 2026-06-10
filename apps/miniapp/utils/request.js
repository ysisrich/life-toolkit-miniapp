import { tokenManager } from './token';

const envVersion = wx.getAccountInfoSync().miniProgram.envVersion;
const API_BASE_URL = envVersion === 'develop' 
  ? 'http://localhost:3456' 
  : 'https://life-toolkit-api.6ys.tech';

/**
 * 企业级封装的 Request 核心类
 */
class Request {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.timeout = 10000;
    this.isRefreshing = false; // 是否正在静默刷新 token
    this.retryRequests = []; // 因 token 失效而等待重试的请求队列

    // 简易拦截器
    this.interceptors = {
      request: {
        use: (fulfilled, rejected) => {
          this._requestInterceptor = { fulfilled, rejected };
        }
      },
      response: {
        use: (fulfilled, rejected) => {
          this._responseInterceptor = { fulfilled, rejected };
        }
      }
    };

    this.initInterceptors();
  }

  initInterceptors() {
    // 默认请求拦截器
    this.interceptors.request.use((config) => {
      // 自动注入 token
      const token = tokenManager.getToken();
      if (token) {
        config.header['Authorization'] = `Bearer ${token}`;
      }
      return config;
    });

    // 默认响应拦截器
    this.interceptors.response.use((response) => {
      const statusCode = response.statusCode;
      const result = response.data || {};

      if (statusCode >= 200 && statusCode < 300) {
        // 约定 200/201 为业务成功
        if (result.code === 200 || result.code === 201) {
          return result.data;
        } else {
          return Promise.reject(result);
        }
      }
      return Promise.reject(response);
    }, (error) => {
      return Promise.reject(error);
    });
  }

  async request(options) {
    let config = {
      url: this.baseURL + options.url,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Content-Type': 'application/json',
        ...(options.header || {})
      },
      timeout: this.timeout
    };

    // 1. 执行请求拦截器
    if (this._requestInterceptor && this._requestInterceptor.fulfilled) {
      config = await this._requestInterceptor.fulfilled(config);
    }

    return new Promise((resolve, reject) => {
      wx.request({
        ...config,
        success: async (res) => {
          // 2. 统一处理 401 (无感刷新)
          if (res.statusCode === 401 || (res.data && res.data.code === 401)) {
            // 防死循环：如果是登录接口本身报 401，直接放行抛出错误
            if (config.url.includes('/auth/wx-login')) {
              reject(res.data);
              return;
            }
            return this.handle401(config, resolve, reject);
          }

          // 3. 执行响应拦截器
          try {
            if (this._responseInterceptor && this._responseInterceptor.fulfilled) {
              const result = await this._responseInterceptor.fulfilled(res);
              resolve(result);
            } else {
              resolve(res);
            }
          } catch (err) {
            this.showErrorToast(err.message || err.msg || '请求失败');
            reject(err);
          }
        },
        fail: async (err) => {
          try {
            if (this._responseInterceptor && this._responseInterceptor.rejected) {
              await this._responseInterceptor.rejected(err);
            }
          } catch (e) {
            console.error('Request failed:', e);
          }
          reject(err);
        }
      });
    });
  }

  /**
   * 处理 Token 失效和无感重试机制
   */
  handle401(config, resolve, reject) {
    // 如果已经在静默刷新中，则将当前请求挂起，推入队列
    if (this.isRefreshing) {
      this.retryRequests.push(() => {
        // 剥离 baseURL 方便重新调用 request
        const urlWithoutBase = config.url.replace(this.baseURL, '');
        this.request({ ...config, url: urlWithoutBase }).then(resolve).catch(reject);
      });
      return;
    }

    this.isRefreshing = true;

    getApp().login()
      .then(() => {
        // 刷新成功，依次执行挂起的请求队列
        this.retryRequests.forEach(cb => cb());
        this.retryRequests = [];
        // 重试当前被拦截的请求
        const urlWithoutBase = config.url.replace(this.baseURL, '');
        this.request({ ...config, url: urlWithoutBase }).then(resolve).catch(reject);
      })
      .catch((err) => {
        console.error('Token refresh failed', err);
        this.retryRequests = [];
        this.showErrorToast('登录态失效，请重启小程序');
        reject(err);
      })
      .finally(() => {
        this.isRefreshing = false;
      });
  }

  showErrorToast(msg) {
    wx.showToast({
      title: msg || '网络错误',
      icon: 'none',
      duration: 2000
    });
  }

  // ==== 快捷方法 ====
  get(url, data = {}, config = {}) {
    // GET 请求参数放 params 还是 data，这里小程序统一用 data 序列化为 querystring
    return this.request({ method: 'GET', url, data, ...config });
  }

  post(url, data = {}, config = {}) {
    return this.request({ method: 'POST', url, data, ...config });
  }

  put(url, data = {}, config = {}) {
    return this.request({ method: 'PUT', url, data, ...config });
  }

  delete(url, data = {}, config = {}) {
    return this.request({ method: 'DELETE', url, data, ...config });
  }
}

export const request = new Request();
