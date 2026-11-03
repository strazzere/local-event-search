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
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';
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
      // ISO dates with timezone info are already correct
      // ISO dates without timezone should be interpreted as Pacific time
      if (!cleanedDate.match(/[+-]\d{2}:\d{2}|Z$/)) {
        return fromZonedTime(isoDate, this.timezone);
      }
      return isoDate;
    }

    // Try each format
    for (const fmt of DATE_FORMATS) {
      try {
        const parsed = parse(cleanedDate, fmt, reference);
        if (isValid(parsed)) {
          // Extract components from the parsed date
          let year = parsed.getFullYear();
          const month = parsed.getMonth();
          const day = parsed.getDate();
          const hours = parsed.getHours();
          const minutes = parsed.getMinutes();
          const seconds = parsed.getSeconds();
          
          // If year is missing (e.g., "January 15"), assume current/next year
          // Compare by calendar date in Pacific timezone to avoid off-by-one errors
          if (!cleanedDate.match(/\d{4}/)) {
            const nowPacific = toZonedTime(new Date(), this.timezone);
            
            // Compare year, month, and day
            if (
              year < nowPacific.getFullYear() ||
              (year === nowPacific.getFullYear() && 
               (month < nowPacific.getMonth() ||
                (month === nowPacific.getMonth() && 
                 day < nowPacific.getDate())))
            ) {
              year = nowPacific.getFullYear() + 1;
            }
          }
          
          // Create a date with these components in Pacific timezone
          // by constructing a local date and converting it
          const pacificDate = new Date(year, month, day, hours, minutes, seconds);
          return fromZonedTime(pacificDate, this.timezone);
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
        // Convert back to zoned time to manipulate, then convert to UTC
        const zonedDate = toZonedTime(date, this.timezone);
        zonedDate.setHours(time.hours, time.minutes, 0, 0);
        return fromZonedTime(zonedDate, this.timezone);
      }
    }

    return date;
  }

  toISOString(date: Date): string {
    // Format the date in Pacific timezone with explicit offset
    // This produces strings like "2026-11-07T18:00:00-08:00" or "2026-05-15T18:00:00-07:00"
    // DST is handled automatically by the formatter
    return formatInTimeZone(date, this.timezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
  }

  toLocalString(date: Date, fmt: string = 'yyyy-MM-dd HH:mm:ss'): string {
    return formatInTimeZone(date, this.timezone, fmt);
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

    // Work with Pacific time for relative dates
    const pacificRef = toZonedTime(reference, this.timezone);

    if (lower === 'today') return fromZonedTime(pacificRef, this.timezone);
    if (lower === 'tomorrow') return fromZonedTime(addDays(pacificRef, 1), this.timezone);

    // "next Monday", "this Friday"
    const dayMatch = lower.match(/(next|this)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
    if (dayMatch) {
      const dayNum = DAY_NAMES[dayMatch[2]];
      if (dayNum !== undefined) {
        let result = nextDay(pacificRef, dayNum);
        if (dayMatch[1] === 'next') {
          result = addWeeks(result, 1);
        }
        return fromZonedTime(result, this.timezone);
      }
    }

    // "Every Monday" - recurring, return next occurrence
    const everyMatch = lower.match(/every\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
    if (everyMatch) {
      const dayNum = DAY_NAMES[everyMatch[1]];
      if (dayNum !== undefined) {
        return fromZonedTime(nextDay(pacificRef, dayNum), this.timezone);
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
