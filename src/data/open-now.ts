// Real working_hours format from locations.json (jq .[0],[5],[20]):
// .[0]:  day 1-7, open:"10:00", close:"22:00", break_start:"13:30", break_end:"14:00", is_closed:false
// .[5]:  day 1-7, open:"09:00", close:"21:00", break_start:"13:00", break_end:"13:30", is_closed:false
// .[20]: day 1-7, open:"09:00", close:"02:00", break_start:null, break_end:null, is_closed:false (overnight)
// All entries have is_closed field; no 00:00-00:00 24h case found in real data;
// overnight encoded as e.g. open:"09:00" close:"02:00" (close < open = next day).

import type { WorkingHour } from '../core/types';

export interface Now { day: number; minutes: number; }

// JS getDay() returns 0=Sun..6=Sat; we use 1=Mon..7=Sun
const WD: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function minskNow(date = new Date()): Now {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Minsk',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const g = (t: string) => p.find(x => x.type === t)!.value;
  return { day: WD[g('weekday')], minutes: (Number(g('hour')) % 24) * 60 + Number(g('minute')) };
}

const m = (t: string): number => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; };

function dayOpen(h: WorkingHour, mins: number): boolean {
  if (h.is_closed || !h.open || !h.close) return false;
  // 24h: open === close (both "00:00")
  if (h.open === h.close) return true;
  const o = m(h.open), c = m(h.close);
  // overnight window: close < open (e.g. 09:00 → 02:00)
  const inWin = c > o ? (mins >= o && mins < c) : (mins >= o || mins < c);
  if (!inWin) return false;
  if (h.break_start && h.break_end) {
    const bs = m(h.break_start), be = m(h.break_end);
    if (mins >= bs && mins < be) return false;
  }
  return true;
}

export function isOpenNow(hours: WorkingHour[], now: Now = minskNow()): boolean {
  // Check today's entry
  const today = hours.find(h => h.day === now.day);
  if (today && dayOpen(today, now.minutes)) return true;
  // Check previous day's overnight window: if prev day is overnight and we are within its close time
  const prevDay = now.day === 1 ? 7 : now.day - 1;
  const prev = hours.find(h => h.day === prevDay);
  if (prev && prev.open && prev.close) {
    const po = m(prev.open), pc = m(prev.close);
    const isOvernight = pc < po; // close < open means spans midnight
    if (isOvernight && now.minutes < pc) return true;
  }
  return false;
}
