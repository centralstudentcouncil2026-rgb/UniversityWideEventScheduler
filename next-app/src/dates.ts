import type { Occurrence } from './types';

export const pad = (value: number) => String(value).padStart(2, '0');
export const dateKey = (value: Date | string) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
export const fromDateKey = (value: string) => new Date(`${value}T12:00:00`);
export const addDays = (value: Date | string, count: number) => {
  const date = typeof value === 'string' ? fromDateKey(value) : new Date(value);
  date.setDate(date.getDate() + count);
  return date;
};
export const nextDateKey = (value: string) => dateKey(addDays(value, 1));
export const startOfWeek = (value: Date) => addDays(value, -((value.getDay() + 6) % 7));
export const startOfMonthGrid = (value: Date) => startOfWeek(new Date(value.getFullYear(), value.getMonth(), 1, 12));
export const sameDay = (a: Date | string, b: Date | string) => dateKey(a) === dateKey(b);
export const monthLabel = (value: Date) => value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
export const timeLabel = (value: string) => new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const shortDate = (value: string) => fromDateKey(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const localIso = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();
export const timeInput = (value: string) => new Date(value).toTimeString().slice(0, 5);
export const createId = () => crypto.randomUUID();
export const dateRange = (start: string, end: string) => {
  const result: string[] = [];
  for (let date = start; date <= end; date = nextDateKey(date)) result.push(date);
  return result;
};
export const occurrencesForDates = (dates: string[], start = '09:00', end = '10:00'): Occurrence[] =>
  dates.map((date) => ({ id: createId(), date, start_time: localIso(date, start), end_time: localIso(date, end) }));
export const hourSlots = Array.from({ length: 14 }, (_, index) => index + 7);
