const app = getApp();
const notification = require('../../../utils/notification.js');

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0,
    server: '',
    key: '',
    wechatNotify: true,
    barkNotify: false
  },

  async onLoad() {
    const { navBarHeight, systemInfo } = app.globalData;
    
    // 加载已有配置
    const config = await notification.getBarkConfig();
    const wechatNotify = wx.getStorageSync('wechatNotify') !== false; // 默认开启
    const barkNotify = wx.getStorageSync('barkNotify') || !!config.key; // 如果有 key 则默认开启

    this.setData({
      navBarHeight: navBarHeight,
      statusBarHeight: systemInfo.statusBarHeight,
      server: config.server,
      key: config.key,
      wechatNotify,
      barkNotify
    });
  },

  onBack() {
    wx.navigateBack();
  },

  onWechatNotifyChange(e) {
    const value = e.detail.value;
    this.setData({ wechatNotify: value });
    wx.setStorageSync('wechatNotify', value);
    wx.showToast({ title: value ? '已开启订阅通知' : '已关闭订阅通知', icon: 'none' });
  },

  onBarkNotifyChange(e) {
    const value = e.detail.value;
    this.setData({ barkNotify: value });
    wx.setStorageSync('barkNotify', value);
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
