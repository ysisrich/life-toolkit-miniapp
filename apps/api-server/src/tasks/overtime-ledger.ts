import dayjs from 'dayjs';

export type OvertimeEntryType = 'overtime' | 'leave' | 'balance';

export interface OvertimeEntry {
  type: OvertimeEntryType;
  date: string;
  hours: number;
  startTime?: string;
  endTime?: string;
}

const DATE_PATTERN = /^(\d{4})年(\d{1,2})月(\d{1,2})日\s+([\d.]+)小时(?:\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2}))?$/;
const BALANCE_PATTERN = /^截止(?:(\d{4})年)?(\d{1,2})月(\d{1,2})(?:日|号)剩余([\d.]+)小时$/;

function makeDate(year: number, month: number, day: number) {
  const date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  const parsed = dayjs(date);
  if (!parsed.isValid() || parsed.format('YYYY-MM-DD') !== date) {
    throw new Error(`日期无效: ${date}`);
  }
  return date;
}

function parseHours(value: string, max = 24) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0 || hours > max) {
    throw new Error(`小时数无效: ${value}`);
  }
  return Math.round(hours * 100) / 100;
}

export function parseOvertimeText(content: string): OvertimeEntry[] {
  if (typeof content !== 'string' || content.length > 200000) {
    throw new Error('账本内容无效');
  }

  const entries: OvertimeEntry[] = [];
  let section: 'overtime' | 'leave' = 'overtime';
  let openingBalance: { year?: number; month: number; day: number; hours: number } | null = null;
  let inferredYear: number | undefined;
  let hasDatedEntry = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const balanceMatch = line.match(BALANCE_PATTERN);
    if (balanceMatch && !openingBalance && !hasDatedEntry) {
      openingBalance = {
        year: balanceMatch[1] ? Number(balanceMatch[1]) : undefined,
        month: Number(balanceMatch[2]),
        day: Number(balanceMatch[3]),
        hours: parseHours(balanceMatch[4], 10000)
      };
      if (openingBalance.year) inferredYear = openingBalance.year;
      continue;
    }

    if (line === '请假') {
      section = 'leave';
      continue;
    }

    const entryMatch = line.match(DATE_PATTERN);
    if (!entryMatch) continue;

    const year = Number(entryMatch[1]);
    const date = makeDate(year, Number(entryMatch[2]), Number(entryMatch[3]));
    inferredYear = inferredYear || year;
    hasDatedEntry = true;
    entries.push({
      type: section,
      date,
      hours: parseHours(entryMatch[4]),
      ...(entryMatch[5] ? { startTime: entryMatch[5], endTime: entryMatch[6] } : {})
    });
  }

  if (openingBalance) {
    const year = openingBalance.year || inferredYear || dayjs().year();
    entries.unshift({
      type: 'balance',
      date: makeDate(year, openingBalance.month, openingBalance.day),
      hours: openingBalance.hours
    });
  }

  if (entries.length === 0) throw new Error('没有识别到有效账本记录');
  return entries;
}

export function calculateOvertimeBalance(entries: OvertimeEntry[]) {
  return Math.round(entries.reduce((balance, entry) => {
    if (entry.type === 'overtime' || entry.type === 'balance') return balance + entry.hours;
    return balance - entry.hours;
  }, 0) * 100) / 100;
}

export function formatOvertimeHours(hours: number) {
  return String(Math.round(hours * 100) / 100);
}

function formatEntry(entry: OvertimeEntry) {
  const date = dayjs(entry.date);
  const time = entry.startTime && entry.endTime ? `  ${entry.startTime} - ${entry.endTime}` : '';
  return `${date.year()}年${date.month() + 1}月${date.date()}日 ${formatOvertimeHours(entry.hours)}小时${time}`;
}

function formatByMonth(entries: OvertimeEntry[]) {
  const groups: string[] = [];
  let currentMonth = '';
  let lines: string[] = [];

  for (const entry of entries) {
    const month = entry.date.slice(0, 7);
    if (month !== currentMonth) {
      if (lines.length) groups.push(lines.join('\n'));
      currentMonth = month;
      lines = [];
    }
    lines.push(formatEntry(entry));
  }
  if (lines.length) groups.push(lines.join('\n'));
  return groups.join('\n\n');
}

export function formatOvertimeText(entries: OvertimeEntry[], year: number, month: number) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const balances = sorted.filter(entry => entry.type === 'balance');
  const overtime = sorted.filter(entry => entry.type === 'overtime');
  const leave = sorted.filter(entry => entry.type === 'leave');
  const sections: string[] = [];

  if (balances.length) {
    const first = balances[0];
    const date = dayjs(first.date);
    sections.push(`截止${date.month() + 1}月${date.date()}号剩余${formatOvertimeHours(balances.reduce((sum, entry) => sum + entry.hours, 0))}小时`);
  }
  if (overtime.length) sections.push(formatByMonth(overtime));
  if (leave.length) sections.push(`请假\n${formatByMonth(leave)}`);

  const endDate = dayjs(new Date(year, month, 0));
  sections.push(`截止${year}年${month}月${endDate.date()}日剩余${formatOvertimeHours(calculateOvertimeBalance(sorted))}小时`);
  return sections.join('\n\n') + '\n';
}
