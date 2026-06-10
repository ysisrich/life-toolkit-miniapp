import { getToolSettings, updateToolSettings } from '../../../api/settings';
import dayjs from 'dayjs';
import config from '../../../config';

Page({
  data: {
    daysRemaining: 7,
    isClippingDue: false,
    showModal: false,
    intervals: [1, 2, 3, 5, 7, 10, 14, 21],
    intervalIndex: 4,
    interval: 7
  },

  async onLoad() {
    try {
      // 使用最新的大厂封装 API 接口
      const data = await getToolSettings('nail-clipper');
      let savedInterval = 7;
      let lastDate = null;
      
      if (data) {
        savedInterval = data.interval || 7;
        lastDate = data.lastDate || null;
      }
      
      let intervalIndex = this.data.intervals.indexOf(savedInterval);
      if (intervalIndex === -1) intervalIndex = this.data.intervals.indexOf(7);

      this.setData({
        interval: savedInterval,
        intervalIndex: intervalIndex
      });

      this.calculateDays(lastDate, savedInterval);
      // Store in memory for next save
      this.lastDate = lastDate;
    } catch (e) {
      console.error('Failed to load settings', e);
      this.calculateDays(null, 7);
    }
  },

  calculateDays(lastDate, interval) {
    if (!lastDate) {
      this.setData({ daysRemaining: interval, isClippingDue: false });
      return;
    }
    const now = dayjs();
    const last = dayjs(lastDate);
    const diffDays = Math.floor(now.diff(last, 'day', true));
    let rem = interval - diffDays;
    
    this.setData({
      daysRemaining: rem > 0 ? rem : 0,
      isClippingDue: rem <= 0
    });
  },

  onStatusTap() {
  },

  openSettings() {
    this.setData({ showModal: true });
  },

  onModalClose() {
    this.setData({ showModal: false });
  },

  async onIntervalChange(e) {
    const idx = e.detail.value;
    const newInterval = this.data.intervals[idx];
    this.setData({
      intervalIndex: idx,
      interval: newInterval
    });
    
    // 提醒订阅消息
    wx.requestSubscribeMessage({
      tmplIds: [config.SUBSCRIBE_TEMPLATE_ID],
      complete: async () => {
        try {
          await updateToolSettings('nail-clipper', {
            interval: newInterval,
            lastDate: this.lastDate
          });
          this.calculateDays(this.lastDate, newInterval);
        } catch (err) {
          console.error(err);
          wx.showToast({ title: '保存失败', icon: 'error' });
        }
      }
    });
  },

  async resetTimer() {
    const nowStr = dayjs().format('YYYY-MM-DD HH:mm:ss');
    this.lastDate = nowStr;
    
    wx.requestSubscribeMessage({
      tmplIds: [config.SUBSCRIBE_TEMPLATE_ID],
      complete: async () => {
        try {
          await updateToolSettings('nail-clipper', {
            interval: this.data.interval,
            lastDate: nowStr
          });
          this.calculateDays(nowStr, this.data.interval);
          this.setData({ showModal: false });
          wx.showToast({
            title: '已重置并同步云端',
            icon: 'success'
          });
        } catch (err) {
          console.error(err);
          wx.showToast({ title: '同步失败', icon: 'error' });
        }
      }
    });
  }
});
