import { getToolStats } from '../../../api/tasks';
import dayjs from 'dayjs';

Page({
  data: {
    currentYear: dayjs().year(),
    currentMonth: dayjs().month() + 1,
    calendarDays: [],
    stats: { records: {}, holidays: {} }
  },

  onLoad() {
    this.fetchMonthStats(this.data.currentYear, this.data.currentMonth);
  },

  async fetchMonthStats(year, month) {
    try {
      const stats = await getToolStats('daily-report', year, month);
      this.setData({ stats });
      this.generateCalendar(year, month);
    } catch (e) {
      console.error('获取月度统计失败', e);
    }
  },

  generateCalendar(year, month) {
    const firstDay = dayjs(`${year}-${month}-01`);
    const daysInMonth = firstDay.daysInMonth();
    const startWeekDay = firstDay.day(); // 0 is Sunday

    const calendarDays = [];
    for (let i = 0; i < startWeekDay; i++) {
      calendarDays.push({ empty: true });
    }

    let punchCount = 0;
    let leaveCount = 0;

    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${month.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
      const shortDateStr = `${month.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
      
      const record = this.data.stats.records && this.data.stats.records[dateStr];
      const isRecord = !!record;
      const isLeave = record && record.isLeave;
      const holidayInfo = this.data.stats.holidays && this.data.stats.holidays[shortDateStr];
      
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
    this.setData({ currentYear, currentMonth, calendarDays: [] });
    this.fetchMonthStats(currentYear, currentMonth);
  },

  nextMonth() {
    let { currentYear, currentMonth } = this.data;
    currentMonth += 1;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear += 1;
    }
    this.setData({ currentYear, currentMonth, calendarDays: [] });
    this.fetchMonthStats(currentYear, currentMonth);
  }
});
