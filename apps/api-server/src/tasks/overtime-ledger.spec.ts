import {
  calculateOvertimeBalance,
  formatOvertimeText,
  parseOvertimeText,
} from './overtime-ledger';

describe('overtime ledger text', () => {
  it('parses the manual format and keeps the remaining balance in exports', () => {
    const entries = parseOvertimeText(`
截止4月30号剩余3小时

2026年5月7日 1小时
2026年5月30日 3小时  12:57 - 16:32

请假
2026年5月18日 4小时
`);

    expect(entries).toHaveLength(4);
    expect(entries[0]).toEqual({ type: 'balance', date: '2026-04-30', hours: 3 });
    expect(calculateOvertimeBalance(entries)).toBe(3);
    expect(formatOvertimeText(entries, 2026, 5)).toContain('截止2026年5月31日剩余3小时');
    expect(formatOvertimeText(entries, 2026, 5)).toContain('12:57 - 16:32');
  });

  it('accepts an accumulated opening balance above one day', () => {
    const entries = parseOvertimeText(`
截止2026年7月31号剩余30.5小时
2026年8月1日 1小时
`);

    expect(entries[0]).toEqual({ type: 'balance', date: '2026-07-31', hours: 30.5 });
    expect(calculateOvertimeBalance(entries)).toBe(31.5);
  });
});
