import {
  parse,
  parseISO,
  format,
  isValid,
  addDays,
  addWeeks,
  addMonths,
  nextDay,
  setHours,
  setMinutes
} from 'date-fns';
import { utcToZonedTime, format as formatTz } from 'date-fns-tz';
import { logger } from './logger';

const DEFAULT_TIMEZONE = 'America/Los_Angeles';

const DATE_FORMATS = [
  'MMMM d, yyyy',
  'MMMM d yyyy',
  'MMMM d',
  'MMM d, yyyy',
  'MMM d yyyy',
  'MMM d',
  'MM/dd/yyyy',
  'M/d/yyyy',
  'MM/dd',
  'M/d',
  'yyyy-MM-dd',
  'EEEE, MMMM d, yyyy',
  'EEEE, MMMM d',
  'EEEE MMMM d',
  'EEE, MMM d',
  'EEE MMM d',
  'd MMMM yyyy',
  'd MMM yyyy',
  'd MMMM',
  'd MMM'
];

const TIME_FORMATS = [
  'h:mm a',
  'hh:mm a',
  'H:mm',
  'HH:mm',
  'h a',
  'ha',
  'h:mma',
  'hh:mma'
];

const DAY_NAMES: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
  'sunday': 0, 'sun': 0,
  'monday': 1, 'mon': 1,
  'tuesday': 2, 'tue': 2, 'tues': 2,
  'wednesday': 3, 'wed': 3,
  'thursday': 4, 'thu': 4, 'thurs': 4,
  'friday': 5, 'fri': 5,
  'saturday': 6, 'sat': 6
};

export class DateParser {
  private timezone: string;

  constructor(timezone: string = DEFAULT_TIMEZONE) {
    this.timezone = timezone;
  }

  parseDate(dateStr: string, referenceDate?: Date): Date | null {
    if (!dateStr) return null;

    const cleanedDate = this.cleanDateString(dateStr);
    const reference = referenceDate || new Date();

    // Try ISO format first
    const isoDate = parseISO(cleanedDate);
    if (isValid(isoDate)) {
      return isoDate;
    }

    // Try each format
    for (const fmt of DATE_FORMATS) {
      try {
        const parsed = parse(cleanedDate, fmt, reference);
        if (isValid(parsed)) {
          // If year is missing (e.g., "January 15"), assume current/next year
          if (!cleanedDate.match(/\d{4}/)) {
            const now = new Date();
            if (parsed < now) {
              parsed.setFullYear(now.getFullYear() + 1);
            }
          }
          return parsed;
        }
      } catch {
        continue;
      }
    }

    // Try relative date parsing
    const relativeDate = this.parseRelativeDate(cleanedDate, reference);
    if (relativeDate) return relativeDate;

    logger.warn(`Could not parse date: "${dateStr}"`);
    return null;
  }

  parseTime(timeStr: string): { hours: number; minutes: number } | null {
    if (!timeStr) return null;

    const cleanedTime = this.cleanTimeString(timeStr);

    for (const fmt of TIME_FORMATS) {
      try {
        const parsed = parse(cleanedTime, fmt, new Date());
        if (isValid(parsed)) {
          return {
            hours: parsed.getHours(),
            minutes: parsed.getMinutes()
          };
        }
      } catch {
        continue;
      }
    }

    // Handle simple patterns like "7pm" or "7:30 PM"
    const simpleMatch = cleanedTime.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (simpleMatch) {
      let hours = parseInt(simpleMatch[1], 10);
      const minutes = simpleMatch[2] ? parseInt(simpleMatch[2], 10) : 0;
      const period = simpleMatch[3]?.toLowerCase();

      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;

      return { hours, minutes };
    }

    logger.warn(`Could not parse time: "${timeStr}"`);
    return null;
  }

  parseDateTime(dateStr: string, timeStr?: string): Date | null {
    const date = this.parseDate(dateStr);
    if (!date) return null;

    if (timeStr) {
      const time = this.parseTime(timeStr);
      if (time) {
        date.setHours(time.hours, time.minutes, 0, 0);
      }
    }

    return date;
  }

  toISOString(date: Date): string {
    return date.toISOString();
  }

  toLocalString(date: Date, fmt: string = 'yyyy-MM-dd HH:mm:ss'): string {
    const zonedDate = utcToZonedTime(date, this.timezone);
    return formatTz(zonedDate, fmt, { timeZone: this.timezone });
  }

  formatForDisplay(date: Date): string {
    return format(date, 'EEEE, MMMM d, yyyy');
  }

  formatTimeForDisplay(date: Date): string {
    return format(date, 'h:mm a');
  }

  private cleanDateString(dateStr: string): string {
    return dateStr
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/(\d+)(st|nd|rd|th)/gi, '$1')
      .replace(/[–—]/g, '-');
  }

  private cleanTimeString(timeStr: string): string {
    return timeStr
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .replace(/\./g, '');
  }

  private parseRelativeDate(dateStr: string, reference: Date): Date | null {
    const lower = dateStr.toLowerCase();

    if (lower === 'today') return reference;
    if (lower === 'tomorrow') return addDays(reference, 1);

    // "next Monday", "this Friday"
    const dayMatch = lower.match(/(next|this)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
    if (dayMatch) {
      const dayNum = DAY_NAMES[dayMatch[2]];
      if (dayNum !== undefined) {
        let result = nextDay(reference, dayNum);
        if (dayMatch[1] === 'next') {
          result = addWeeks(result, 1);
        }
        return result;
      }
    }

    // "Every Monday" - recurring, return next occurrence
    const everyMatch = lower.match(/every\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
    if (everyMatch) {
      const dayNum = DAY_NAMES[everyMatch[1]];
      if (dayNum !== undefined) {
        return nextDay(reference, dayNum);
      }
    }

    return null;
  }

  detectRecurringPattern(dateStr: string): string | null {
    const lower = dateStr.toLowerCase();

    if (lower.includes('every')) {
      const dayMatch = lower.match(/every\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
      if (dayMatch) return `weekly:${dayMatch[1]}`;

      if (lower.includes('week')) return 'weekly';
      if (lower.includes('month')) return 'monthly';
      if (lower.includes('day')) return 'daily';
    }

    // "1st and 3rd Thursday"
    const ordinalMatch = lower.match(/(\d+)(st|nd|rd|th)\s+and\s+(\d+)(st|nd|rd|th)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
    if (ordinalMatch) {
      return `monthly:${ordinalMatch[1]},${ordinalMatch[3]}:${ordinalMatch[5]}`;
    }

    return null;
  }
}

export const dateParser = new DateParser();
export default dateParser;
