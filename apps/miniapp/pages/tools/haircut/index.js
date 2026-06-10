import { getToolSettings, updateToolSettings } from '../../../api/settings';
import dayjs from 'dayjs';
import config from '../../../config';

Page({
  data: {
    daysRemaining: 30,
    isDue: false,
    intervals: Array.from({ length: 361 }, (_, i) => i + 5), // 5 到 365
    intervalIndex: 25, // 默认 30 天的索引 (30 - 5 = 25)
    interval: 30,
    lastDate: '',
    gender: 'boy', // 'boy' | 'girl'
    urgencyClass: 'safe' // 'safe' | 'warning' | 'danger'
  },

  async onLoad() {
    try {
      const data = await getToolSettings('haircut');
      let savedInterval = 30;
      let lastDate = null;
      let gender = 'boy';
      
      if (data && Object.keys(data).length > 0) {
        savedInterval = data.interval || 30;
        lastDate = data.lastDate || null;
        gender = data.gender || 'boy';
      }
      
      let intervalIndex = this.data.intervals.indexOf(savedInterval);
      if (intervalIndex === -1) intervalIndex = this.data.intervals.indexOf(30);

      this.setData({
        interval: savedInterval,
        intervalIndex: intervalIndex,
        lastDate: lastDate || '',
        gender: gender
      });

      this.calculateDays(lastDate, savedInterval);
    } catch (e) {
      console.error('Failed to load settings', e);
      this.calculateDays(null, 30);
    }
  },

  calculateDays(lastDateStr, interval) {
    if (!lastDateStr) {
      this.setData({ daysRemaining: interval, isDue: false, urgencyClass: 'safe' });
      return;
    }
    const now = dayjs();
    const last = dayjs(lastDateStr);
    const diffDays = Math.floor(now.diff(last, 'day', true));
    let rem = interval - diffDays;
    
    let isDue = rem <= 0;
    let urgencyClass = 'safe';
    
    if (isDue) {
      urgencyClass = 'danger';
    } else if (rem <= interval * 0.3) {
      urgencyClass = 'warning';
    }

    this.setData({
      daysRemaining: rem > 0 ? rem : Math.abs(rem), // 逾期显示绝对值
      isDue: isDue,
      urgencyClass: urgencyClass
    });
  },

  async saveSettings(newValues) {
    const payload = {
      interval: this.data.interval,
      lastDate: this.data.lastDate,
      gender: this.data.gender,
      ...newValues
    };

    try {
      await updateToolSettings('haircut', payload);
      this.calculateDays(payload.lastDate, payload.interval);
    } catch (err) {
      console.error(err);
      wx.showToast({ title: '保存失败', icon: 'error' });
    }
  },

  onDateChange(e) {
    const newDate = e.detail.value;
    this.setData({ lastDate: newDate });
    this.saveSettings({ lastDate: newDate });
  },

  async onIntervalChange(e) {
    const idx = e.detail.value;
    const newInterval = this.data.intervals[idx];
    this.setData({
      intervalIndex: idx,
      interval: newInterval
    });
    
    wx.requestSubscribeMessage({
      tmplIds: [config.SUBSCRIBE_TEMPLATE_ID],
      complete: () => {
        this.saveSettings({ interval: newInterval });
      }
    });
  },

  toggleGender() {
    const newGender = this.data.gender === 'boy' ? 'girl' : 'boy';
    this.setData({ gender: newGender });
    this.saveSettings({ gender: newGender });
  },

  async resetTimer() {
    const nowStr = dayjs().format('YYYY-MM-DD');
    this.setData({ lastDate: nowStr });
    
    wx.requestSubscribeMessage({
      tmplIds: [config.SUBSCRIBE_TEMPLATE_ID],
      complete: () => {
        this.saveSettings({ lastDate: nowStr }).then(() => {
          wx.showToast({
            title: '已重置并同步云端',
            icon: 'success'
          });
        });
      }
    });
  }
});
