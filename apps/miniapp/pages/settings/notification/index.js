const app = getApp();
const notification = require('../../../utils/notification.js');

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0,
    server: '',
    key: ''
  },

  async onLoad() {
    const { navBarHeight, systemInfo } = app.globalData;
    
    // 加载已有配置
    const config = await notification.getBarkConfig();

    this.setData({
      navBarHeight: navBarHeight,
      statusBarHeight: systemInfo.statusBarHeight,
      server: config.server,
      key: config.key
    });
  },

  onBack() {
    wx.navigateBack();
  },

  onServerInput(e) {
    this.setData({ server: e.detail.value });
  },

  onKeyInput(e) {
    this.setData({ key: e.detail.value });
  },

  async onSaveConfig() {
    const { server, key } = this.data;
    const finalServer = server.trim() || 'https://api.day.app';
    const finalKey = key.trim();

    wx.showLoading({ title: '保存中...' });
    try {
      await notification.saveBarkConfig(finalServer, finalKey);
      wx.hideLoading();
      wx.showToast({
        title: '配置已云端保存',
        icon: 'success'
      });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'error' });
    }
  },

  onTestPush() {
    // 确保使用最新输入的内容
    const { server, key } = this.data;
    const finalServer = server.trim() || 'https://api.day.app';
    const finalKey = key.trim();

    if (!finalKey) {
      wx.showToast({
        title: '请先填写 Bark Key',
        icon: 'none'
      });
      return;
    }

    // 临时保存以便测试
    notification.saveBarkConfig(finalServer, finalKey).then(() => {
      wx.showLoading({ title: '发送中...' });

      notification.sendBarkNotification(
        '测试通知 🥳',
        '太棒了！你的生活工具箱已经成功连接到 Bark！'
      ).then(() => {
        wx.hideLoading();
        wx.showToast({
          title: '发送成功',
          icon: 'success'
        });
      }).catch(err => {
        wx.hideLoading();
        wx.showToast({
          title: err.message || '发送失败，请检查配置',
          icon: 'none',
          duration: 2000
        });
      });
    });
  }
});
