const BOOKING_TIME_ZONE = process.env.BOOKING_TIME_ZONE || 'America/Sao_Paulo';

export const BOOKING_LOOKAHEAD_DAYS = 6;
export const MIN_BOOKING_LEAD_MINUTES = 5;
export const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed', 'completed'];

export type TimeRange = {
  start: number;
  end: number;
};

export function toMinutes(time: string) {
  const [hour, minute] = String(time || '00:00')
    .split(':')
    .map(Number);
  return hour * 60 + minute;
}

export function toTime(totalMinutes: number) {
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const m = String(totalMinutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function getWeekdayFromDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const dt = new Date(year, month - 1, day);
  return dt.getDay();
}

function getZonedParts() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BOOKING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: Number(get('hour') || 0),
    minute: Number(get('minute') || 0),
  };
}

export function getTodayIso() {
  const { year, month, day } = getZonedParts();
  return `${year}-${month}-${day}`;
}

export function getCurrentMinutes() {
  const { hour, minute } = getZonedParts();
  return hour * 60 + minute;
}

export function addDaysIso(baseIso: string, days: number) {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);

  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function getAllowedDateRange() {
  const today = getTodayIso();
  return {
    today,
    maxDate: addDaysIso(today, BOOKING_LOOKAHEAD_DAYS),
  };
}

export function isDateAllowed(bookingDate: string) {
  const { today, maxDate } = getAllowedDateRange();
  return bookingDate >= today && bookingDate <= maxDate;
}

export function isTooCloseToStart(bookingDate: string, startMinutes: number) {
  const { today } = getAllowedDateRange();
  if (bookingDate !== today) return false;

  return getCurrentMinutes() > startMinutes - MIN_BOOKING_LEAD_MINUTES;
}

export function overlapsAny(candidate: TimeRange, ranges: TimeRange[]) {
  return ranges.some((range) => candidate.start < range.end && candidate.end > range.start);
}

export function isInsideBreak(candidate: TimeRange, breakStart?: number | null, breakEnd?: number | null) {
  return (
    breakStart !== null &&
    breakStart !== undefined &&
    breakEnd !== null &&
    breakEnd !== undefined &&
    candidate.start < breakEnd &&
    candidate.end > breakStart
  );
}

export function isAlignedToSlot(startMinutes: number, workingStartMinutes: number, slotMinutes: number) {
  return (startMinutes - workingStartMinutes) % slotMinutes === 0;
}
