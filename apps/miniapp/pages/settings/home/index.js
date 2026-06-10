import { tokenManager } from '../../../utils/token';

Page({
  data: {
    cacheSize: '0.0MB'
  },

  onShow() {
    this.calcCache();
  },

  calcCache() {
    try {
      const res = wx.getStorageInfoSync();
      const sizeMB = (res.currentSize / 1024).toFixed(1);
      this.setData({
        cacheSize: `${sizeMB}MB`
      });
    } catch (e) {
      console.error(e);
    }
  },

  navigateTo(e) {
    const url = e.currentTarget.dataset.url;
    if (url) {
      wx.navigateTo({ url });
    }
  },

  clearCache() {
    wx.showModal({
      title: '提示',
      content: '确定要清除所有本地缓存吗？(含登录信息)',
      confirmColor: '#FF3B30',
      success: (res) => {
        if (res.confirm) {
          try {
            wx.clearStorageSync();
            this.calcCache();
            wx.showToast({ title: '清理完成', icon: 'success' });
            
            // 因为清除了 Token，可以触发重新登录或退回首页
            setTimeout(() => {
              getApp().login();
            }, 1000);
          } catch (e) {
            wx.showToast({ title: '清理失败', icon: 'error' });
          }
        }
      }
    });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后将无法使用云端功能，确定退出吗？',
      confirmColor: '#FF3B30',
      success: (res) => {
        if (res.confirm) {
          tokenManager.removeToken();
          wx.showToast({ title: '已退出', icon: 'success' });
          setTimeout(() => {
            wx.navigateBack();
          }, 1000);
        }
      }
    });
  }
});
