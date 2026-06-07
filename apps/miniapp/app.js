import { wxLogin } from './api/auth';
import { tokenManager } from './utils/token';

App({
  onLaunch() {
    // 获取系统信息，用于自定义导航栏和安全区适配
    const systemInfo = wx.getSystemInfoSync();
    this.globalData.systemInfo = systemInfo;
    
    // 计算导航栏高度
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
    this.globalData.navBarHeight = (menuButtonInfo.top - systemInfo.statusBarHeight) * 2 + menuButtonInfo.height + systemInfo.statusBarHeight;
    this.globalData.menuButtonInfo = menuButtonInfo;

    // 初次启动自动登录
    this.login();
  },

  login() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (res.code) {
            wxLogin(res.code)
              .then(data => {
                const token = data.access_token;
                tokenManager.setToken(token);
                resolve(token);
              })
              .catch(reject);
          } else {
            reject(new Error('Login failed'));
          }
        },
        fail: reject
      });
    });
  },

  globalData: {
    systemInfo: null,
    navBarHeight: 0,
    menuButtonInfo: null
  }
})
