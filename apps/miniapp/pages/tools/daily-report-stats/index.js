import { getToolStats } from '../../../api/tasks';
import dayjs from 'dayjs';

Page({
  data: {
    currentYear: dayjs().year(),
    currentMonth: dayjs().month() + 1,
    calendarDays: [],
    stats: { records: {}, holidays: {} },
    showTodayBtn: false
  },

  onLoad() {
    this.updateTodayBtnState(this.data.currentYear, this.data.currentMonth);
    // 先本地同步生成日历结构，避免渲染延迟或白屏
    this.generateCalendar(this.data.currentYear, this.data.currentMonth);
    this.fetchMonthStats(this.data.currentYear, this.data.currentMonth);
  },

  async fetchMonthStats(year, month) {
    const requestKey = `${year}-${month}`;
    this.activeRequestKey = requestKey;

    try {
      const stats = await getToolStats('daily-report', year, month);
      // 如果在请求返回前，用户已经切换到了其他月份，则丢弃旧请求结果，防止时序混乱导致数据覆盖
      if (this.activeRequestKey !== requestKey) {
        return;
      }
      this.setData({ stats });
      this.generateCalendar(year, month);
    } catch (e) {
      if (this.activeRequestKey === requestKey) {
        console.error('获取月度统计失败', e);
      }
    }
  },

  generateCalendar(year, month) {
    // 避免部分移动端平台（如 iOS）不支持 YYYY-M-D 格式，使用标准双位数补齐
    const monthStr = month.toString().padStart(2, '0');
    const firstDay = dayjs(`${year}-${monthStr}-01`);
    const daysInMonth = firstDay.daysInMonth();
    const startWeekDay = firstDay.day(); // 0 is Sunday

    const calendarDays = [];
    for (let i = 0; i < startWeekDay; i++) {
      calendarDays.push({ empty: true });
    }

    let punchCount = 0;
    let leaveCount = 0;

    const records = (this.data.stats && this.data.stats.records) || {};
    const holidays = (this.data.stats && this.data.stats.holidays) || {};

    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${monthStr}-${i.toString().padStart(2, '0')}`;
      const shortDateStr = `${monthStr}-${i.toString().padStart(2, '0')}`;
      
      const record = records[dateStr];
      const isRecord = !!record;
      const isLeave = record && record.isLeave;
      const holidayInfo = holidays[shortDateStr];
      
      const dayOfWeek = dayjs(dateStr).day();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (isRecord) {
        if (isLeave) {
          leaveCount++;
        } else {
          punchCount++;
        }
      }

      calendarDays.push({
        day: i,
        dateStr,
        isRecord,
        isLeave,
        isWeekend,
        holidayInfo
      });
    }

    this.setData({ calendarDays, punchCount, leaveCount });
  },

  prevMonth() {
    let { currentYear, currentMonth } = this.data;
    currentMonth -= 1;
    if (currentMonth < 1) {
      currentMonth = 12;
      currentYear -= 1;
    }
    // 切换月份时立即重置当前月的 stats 并同步重新生成新月份日历，防止黑屏或残留上个月的数据
    this.setData({ 
      currentYear, 
      currentMonth,
      stats: { records: {}, holidays: {} }
    });
    this.updateTodayBtnState(currentYear, currentMonth);
    this.generateCalendar(currentYear, currentMonth);
    this.fetchMonthStats(currentYear, currentMonth);
  },

  nextMonth() {
    let { currentYear, currentMonth } = this.data;
    currentMonth += 1;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear += 1;
    }
    // 切换月份时立即重置当前月的 stats 并同步重新生成新月份日历，防止黑屏或残留上个月的数据
    this.setData({ 
      currentYear, 
      currentMonth,
      stats: { records: {}, holidays: {} }
    });
    this.updateTodayBtnState(currentYear, currentMonth);
    this.generateCalendar(currentYear, currentMonth);
    this.fetchMonthStats(currentYear, currentMonth);
  },

  updateTodayBtnState(year, month) {
    const realYear = dayjs().year();
    const realMonth = dayjs().month() + 1;
    const showTodayBtn = (year !== realYear || month !== realMonth);
    this.setData({ showTodayBtn });
  },

  backToToday() {
    const currentYear = dayjs().year();
    const currentMonth = dayjs().month() + 1;
    this.setData({
      currentYear,
      currentMonth,
      stats: { records: {}, holidays: {} }
    });
    this.updateTodayBtnState(currentYear, currentMonth);
    this.generateCalendar(currentYear, currentMonth);
    this.fetchMonthStats(currentYear, currentMonth);
  }
});
