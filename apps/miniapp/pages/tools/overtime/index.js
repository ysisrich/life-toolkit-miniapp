import dayjs from 'dayjs';
import {
  deleteOvertimeRecord,
  exportOvertimeLedger,
  getOvertimeLedger,
  importOvertimeLedger,
  saveOvertimeRecord
} from '../../../api/tasks';

const emptyLedger = () => ({
  days: {},
  monthOvertime: 0,
  monthLeave: 0,
  monthNet: 0,
  balance: 0
});

Page({
  data: {
    currentYear: dayjs().year(),
    currentMonth: dayjs().month() + 1,
    todayDate: dayjs().format('YYYY-MM-DD'),
    calendarDays: [],
    ledger: emptyLedger(),
    showTodayBtn: false,
    todayOvertime: false,
    showEditor: false,
    editingDate: '',
    editingType: 'overtime',
    editingId: null,
    editHours: '',
    editStartTime: '',
    editEndTime: ''
  },

  onLoad() {
    this.updateTodayBtnState(this.data.currentYear, this.data.currentMonth);
    this.generateCalendar(this.data.currentYear, this.data.currentMonth);
    this.fetchLedger(this.data.currentYear, this.data.currentMonth);
  },

  onShow() {
    const todayDate = dayjs().format('YYYY-MM-DD');
    if (todayDate !== this.data.todayDate) {
      this.setData({ todayDate });
      this.generateCalendar(this.data.currentYear, this.data.currentMonth);
      this.fetchLedger(this.data.currentYear, this.data.currentMonth);
    }
  },

  async fetchLedger(year, month) {
    const requestKey = `${year}-${month}`;
    this.activeRequestKey = requestKey;
    try {
      const ledger = await getOvertimeLedger(year, month);
      if (this.activeRequestKey !== requestKey) return;
      this.setData({ ledger }, () => this.generateCalendar(year, month));
    } catch (error) {
      if (this.activeRequestKey === requestKey) {
        console.error('获取加班统计失败', error);
      }
    }
  },

  generateCalendar(year, month) {
    const monthStr = month.toString().padStart(2, '0');
    const firstDay = dayjs(`${year}-${monthStr}-01`);
    const calendarDays = [];
    const days = (this.data.ledger && this.data.ledger.days) || {};
    const today = this.data.todayDate;

    for (let i = 0; i < firstDay.day(); i++) calendarDays.push({ empty: true });

    for (let day = 1; day <= firstDay.daysInMonth(); day++) {
      const dateStr = `${year}-${monthStr}-${day.toString().padStart(2, '0')}`;
      const record = days[dateStr] || {};
      const overtime = record.overtime;
      const leave = record.leave;
      calendarDays.push({
        day,
        dateStr,
        isToday: dateStr === today,
        isFuture: dateStr > today,
        overtimeText: overtime ? `+${this.formatHours(overtime.hours)}h` : '',
        leaveText: leave ? `-${this.formatHours(leave.hours)}h` : ''
      });
    }

    this.setData({
      calendarDays,
      todayOvertime: !!days[today]?.overtime
    });
  },

  formatHours(value) {
    return Number(value).toString();
  },

  updateTodayBtnState(year, month) {
    this.setData({
      showTodayBtn: year !== dayjs().year() || month !== dayjs().month() + 1
    });
  },

  changeMonth(delta) {
    const next = dayjs(new Date(this.data.currentYear, this.data.currentMonth - 1, 1)).add(delta, 'month');
    const currentYear = next.year();
    const currentMonth = next.month() + 1;
    this.setData({ currentYear, currentMonth, ledger: emptyLedger() });
    this.updateTodayBtnState(currentYear, currentMonth);
    this.generateCalendar(currentYear, currentMonth);
    this.fetchLedger(currentYear, currentMonth);
  },

  prevMonth() {
    this.changeMonth(-1);
  },

  nextMonth() {
    this.changeMonth(1);
  },

  backToToday() {
    const currentYear = dayjs().year();
    const currentMonth = dayjs().month() + 1;
    this.setData({ currentYear, currentMonth, ledger: emptyLedger() });
    this.updateTodayBtnState(currentYear, currentMonth);
    this.generateCalendar(currentYear, currentMonth);
    this.fetchLedger(currentYear, currentMonth);
  },

  getDayRecord(date, type) {
    const day = ((this.data.ledger || {}).days || {})[date] || {};
    return day[type] || null;
  },

  onDayTap(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    if (date > this.data.todayDate) {
      wx.showToast({ title: '未来日期暂不能记录', icon: 'none' });
      return;
    }
    this.openEditor(date, 'overtime');
  },

  openEditor(date, type) {
    const record = this.getDayRecord(date, type);
    this.setData({
      showEditor: true,
      editingDate: date,
      editingType: type,
      editingId: record ? record.id : null,
      editHours: record ? String(record.hours) : (type === 'leave' ? '8' : '1'),
      editStartTime: record?.startTime || '',
      editEndTime: record?.endTime || ''
    });
  },

  closeEditor() {
    this.setData({ showEditor: false });
  },

  selectType(e) {
    this.openEditor(this.data.editingDate, e.currentTarget.dataset.type);
  },

  onEditDateChange(e) {
    this.openEditor(e.detail.value, this.data.editingType);
  },

  onHoursInput(e) {
    this.setData({ editHours: e.detail.value });
  },

  onStartTimeChange(e) {
    this.setData({ editStartTime: e.detail.value });
  },

  onEndTimeChange(e) {
    this.setData({ editEndTime: e.detail.value });
  },

  async saveEditor() {
    const hours = Number(this.data.editHours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      wx.showToast({ title: '请输入 0 到 24 小时', icon: 'none' });
      return;
    }
    if (this.data.editingType === 'overtime' && !!this.data.editStartTime !== !!this.data.editEndTime) {
      wx.showToast({ title: '请同时设置开始和结束时间', icon: 'none' });
      return;
    }

    const payload = {
      date: this.data.editingDate,
      type: this.data.editingType,
      hours
    };
    if (this.data.editingId) payload.id = this.data.editingId;
    if (this.data.editingType === 'overtime') {
      if (this.data.editStartTime) payload.startTime = this.data.editStartTime;
      if (this.data.editEndTime) payload.endTime = this.data.editEndTime;
    }

    wx.showLoading({ title: '保存中' });
    let succeeded = false;
    try {
      await saveOvertimeRecord(payload);
      const target = dayjs(this.data.editingDate);
      const currentYear = target.year();
      const currentMonth = target.month() + 1;
      if (currentYear !== this.data.currentYear || currentMonth !== this.data.currentMonth) {
        this.setData({ currentYear, currentMonth, ledger: emptyLedger() });
        this.updateTodayBtnState(currentYear, currentMonth);
        this.generateCalendar(currentYear, currentMonth);
      }
      await this.fetchLedger(currentYear, currentMonth);
      succeeded = true;
    } catch (error) {
      console.error('保存加班记录失败', error);
      if (!error || !error.msg) wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      if (succeeded) {
        this.setData({ showEditor: false });
        wx.showToast({ title: '已保存', icon: 'success' });
      }
    }
  },

  async deleteEditing() {
    if (this.data.editingId) {
      wx.showModal({
        title: '删除记录',
        content: '确定删除这条记录吗？',
        success: (result) => {
          if (result.confirm) this.deleteRecord(this.data.editingId, true);
        }
      });
    }
  },

  async deleteRecord(id, closeEditor) {
    wx.showLoading({ title: '删除中' });
    let succeeded = false;
    try {
      await deleteOvertimeRecord(id);
      await this.fetchLedger(this.data.currentYear, this.data.currentMonth);
      succeeded = true;
    } catch (error) {
      console.error('删除加班记录失败', error);
      if (!error || !error.msg) wx.showToast({ title: '删除失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      if (succeeded) {
        if (closeEditor) this.setData({ showEditor: false });
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    }
  },

  onTodayToggle(e) {
    const enabled = !!e.detail.value;
    const todayRecord = this.getDayRecord(this.data.todayDate, 'overtime');
    this.setData({ todayOvertime: false });

    if (enabled) {
      this.openEditor(this.data.todayDate, 'overtime');
      return;
    }
    if (!todayRecord) return;

    wx.showModal({
      title: '取消今日加班',
      content: '确定删除今天的加班记录吗？',
      success: (result) => {
        if (result.confirm) {
          this.deleteRecord(todayRecord.id, false);
        } else {
          this.setData({ todayOvertime: true });
        }
      }
    });
  },

  importLedger() {
    if (!wx.chooseMessageFile) {
      wx.showToast({ title: '当前版本不支持导入文件', icon: 'none' });
      return;
    }
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (result) => {
        const file = result.tempFiles && result.tempFiles[0];
        if (!file) return;
        wx.showLoading({ title: '导入中' });
        wx.getFileSystemManager().readFile({
          filePath: file.path,
          encoding: 'utf8',
          success: async (readResult) => {
            let succeeded = false;
            try {
              const result = await importOvertimeLedger(readResult.data);
              await this.fetchLedger(this.data.currentYear, this.data.currentMonth);
              succeeded = true;
              this.importedCount = result.imported;
            } catch (error) {
              console.error('导入加班账本失败', error);
              if (!error || !error.msg) wx.showToast({ title: '导入失败', icon: 'none' });
            } finally {
              wx.hideLoading();
              if (succeeded) wx.showToast({ title: `已导入 ${this.importedCount} 条`, icon: 'success' });
            }
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '读取文件失败', icon: 'none' });
          }
        });
      }
    });
  },

  async exportLedger() {
    wx.showLoading({ title: '生成中' });
    try {
      const result = await exportOvertimeLedger(this.data.currentYear, this.data.currentMonth);
      const filePath = `${wx.env.USER_DATA_PATH}/${result.filename}`;
      await new Promise((resolve, reject) => {
        wx.getFileSystemManager().writeFile({
          filePath,
          data: result.content,
          encoding: 'utf8',
          success: resolve,
          fail: reject
        });
      });
      wx.hideLoading();
      this.shareExport(filePath, result.filename, result.content);
    } catch (error) {
      wx.hideLoading();
      console.error('导出加班账本失败', error);
      if (!error || !error.msg) wx.showToast({ title: '导出失败', icon: 'none' });
    }
  },

  shareExport(filePath, fileName, content) {
    if (typeof wx.shareFileMessage !== 'function') {
      this.copyExport(content);
      return;
    }
    wx.shareFileMessage({
      filePath,
      fileName,
      fail: () => this.copyExport(content),
      success: () => wx.showToast({ title: '已准备文件', icon: 'success' })
    });
  },

  copyExport(content) {
    wx.setClipboardData({
      data: content,
      success: () => wx.showToast({ title: '已复制文本', icon: 'success' })
    });
  }
});
