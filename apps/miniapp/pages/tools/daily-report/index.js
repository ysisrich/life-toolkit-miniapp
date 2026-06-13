import { getToolSettings, updateToolSettings } from '../../../api/settings';
import { getTasks, recordTask } from '../../../api/tasks';
import dayjs from 'dayjs';
import config from '../../../config';

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0,
    isWritten: false,
    showModal: false,
    reminderTime: '18:00',
    isRestDay: false
  },

  async onLoad() {
    const app = getApp();
    this.setData({
      navBarHeight: app.globalData.navBarHeight || 80,
      statusBarHeight: app.globalData.systemInfo ? app.globalData.systemInfo.statusBarHeight : 44
    });
    this.loadData();
  },

  async loadData() {
    try {
      // 1. 加载用户设置
      const settings = await getToolSettings('daily-report');
      if (settings && settings.reminderTime) {
        this.setData({ reminderTime: settings.reminderTime });
      }

      // 2. 判断是否是周末（休息日）
      const today = dayjs();
      const dayOfWeek = today.day();
      const isRestDay = dayOfWeek === 0 || dayOfWeek === 6;
      this.setData({ isRestDay });

      // 3. 加载打卡记录
      const tasks = await getTasks('daily-report');
      if (tasks && tasks.length > 0) {
        // 判断最后一次打卡是不是今天
        const lastTaskDate = dayjs(tasks[0].createdAt);
        if (lastTaskDate.isSame(today, 'day')) {
          this.setData({ isWritten: true });
        } else {
          this.setData({ isWritten: false });
        }
      } else {
        this.setData({ isWritten: false });
      }
    } catch (e) {
      console.error('加载日报配置失败', e);
    }
  },

  openStats() {
    wx.navigateTo({
      url: '/pages/tools/daily-report-stats/index'
    });
  },

  async recordReport() {
    if (this.data.isRestDay) {
      wx.showToast({ title: '今天休息，不需要打卡哦～', icon: 'none' });
      return;
    }
    if (this.data.isWritten) {
      wx.showToast({ title: '今天已经写过啦', icon: 'none' });
      return;
    }

    wx.requestSubscribeMessage({
      tmplIds: [config.SUBSCRIBE_TEMPLATE_ID],
      complete: async () => {
        try {
          await recordTask('daily-report', { note: '完成写日报打卡' });
          this.setData({ isWritten: true });
          wx.showToast({ title: '打卡成功！', icon: 'success' });
        } catch (e) {
          wx.showToast({ title: '打卡失败', icon: 'error' });
        }
      }
    });
  },

  async recordLeave() {
    if (this.data.isWritten) return;
    
    wx.showModal({
      title: '请假确认',
      content: '今天确定请假不上班了吗？系统将不再推送日报提醒。',
      confirmColor: '#0A84FF',
      success: async (res) => {
        if (res.confirm) {
          try {
            await recordTask('daily-report', { type: 'leave', note: '休假免打扰' });
            wx.showToast({ title: '已开启免打扰', icon: 'success' });
            this.setData({ isWritten: true });
          } catch (e) {
            console.error(e);
            wx.showToast({ title: '记录失败', icon: 'error' });
          }
        }
      }
    });
  },

  openSettings() {
    this.setData({ showModal: true });
  },

  onModalClose() {
    this.setData({ showModal: false });
  },

  async onTimeChange(e) {
    const time = e.detail.value;
    this.setData({ reminderTime: time });
    
    wx.requestSubscribeMessage({
      tmplIds: [config.SUBSCRIBE_TEMPLATE_ID],
      complete: async () => {
        try {
          await updateToolSettings('daily-report', {
            reminderTime: time
          });
          wx.showToast({ title: '设置成功', icon: 'success' });
        } catch (err) {
          wx.showToast({ title: '保存失败', icon: 'error' });
        }
      }
    });
  },

  goBack() {
    wx.navigateBack();
  }
});
