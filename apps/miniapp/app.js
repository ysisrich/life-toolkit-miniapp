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

    // 检查小程序更新
    this.checkUpdate();
  },

  checkUpdate() {
    if (wx.canIUse('getUpdateManager')) {
      const updateManager = wx.getUpdateManager();
      
      updateManager.onCheckForUpdate((res) => {
        if (res.hasUpdate) {
          updateManager.onUpdateReady(() => {
            wx.showModal({
              title: '更新提示',
              content: '新版本已经准备好，是否重启应用？',
              success(res) {
                if (res.confirm) {
                  updateManager.applyUpdate();
                }
              }
            });
          });

          updateManager.onUpdateFailed(() => {
            wx.showModal({
              title: '已经有新版本啦',
              content: '新版本已经上线，请您删除当前小程序，重新搜索打开～'
            });
          });
        }
      });
    }
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
