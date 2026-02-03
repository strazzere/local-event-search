import fs from 'fs';
import path from 'path';
import icalGenerator, { ICalCalendar, ICalEventData } from 'ical-generator';
import { Event } from '../types';
import { logger } from '../utils/logger';

export interface IcsOutputOptions {
  outputDir?: string;
  filename?: string;
  calendarName?: string;
}

export class IcsOutput {
  private outputDir: string;
  private filename: string;
  private calendarName: string;

  constructor(options: IcsOutputOptions = {}) {
    this.outputDir = options.outputDir || path.join(process.cwd(), 'output');
    this.filename = options.filename || 'events.ics';
    this.calendarName = options.calendarName || 'Local Events';
  }

  async write(events: Event[]): Promise<string> {
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const calendar = icalGenerator({
      name: this.calendarName,
      timezone: 'America/Los_Angeles'
    });

    for (const event of events) {
      const icalEvent = this.eventToIcal(event);
      if (icalEvent) {
        calendar.createEvent(icalEvent);
      }
    }

    const outputPath = path.join(this.outputDir, this.filename);
    const content = calendar.toString();

    fs.writeFileSync(outputPath, content, 'utf-8');
    logger.info(`Wrote ${events.length} events to ${outputPath}`);

    return outputPath;
  }

  private eventToIcal(event: Event): ICalEventData | null {
    try {
      const startDate = new Date(event.date);

      // If we have a start time, apply it
      if (event.startTime) {
        const timeParts = this.parseTime(event.startTime);
        if (timeParts) {
          startDate.setHours(timeParts.hours, timeParts.minutes, 0, 0);
        }
      }

      // Calculate end date
      let endDate = new Date(startDate);
      if (event.endTime) {
        const timeParts = this.parseTime(event.endTime);
        if (timeParts) {
          endDate.setHours(timeParts.hours, timeParts.minutes, 0, 0);
        }
      } else {
        // Default to 2 hours if no end time
        endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
      }

      // Build location string
      const locationParts = [event.venue.name];
      if (event.venue.address) locationParts.push(event.venue.address);
      if (event.venue.city && event.venue.state) {
        locationParts.push(`${event.venue.city}, ${event.venue.state}`);
      }
      const location = locationParts.join(', ');

      // Build description
      const descParts: string[] = [];
      if (event.description) descParts.push(event.description);
      if (event.price) descParts.push(`Price: ${event.price}`);
      if (event.url) descParts.push(`More info: ${event.url}`);
      if (event.tags.length > 0) descParts.push(`Tags: ${event.tags.join(', ')}`);

      return {
        id: event.id,
        start: startDate,
        end: endDate,
        summary: event.title,
        description: descParts.join('\n\n'),
        location,
        url: event.url
      };
    } catch (error) {
      logger.warn(`Could not convert event to iCal: ${event.title} - ${error}`);
      return null;
    }
  }

  private parseTime(timeStr: string): { hours: number; minutes: number } | null {
    // Try parsing "7:00 PM" or "19:00" formats
    const match12 = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)/i);
    if (match12) {
      let hours = parseInt(match12[1], 10);
      const minutes = match12[2] ? parseInt(match12[2], 10) : 0;
      const period = match12[3].toLowerCase();

      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;

      return { hours, minutes };
    }

    const match24 = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (match24) {
      return {
        hours: parseInt(match24[1], 10),
        minutes: parseInt(match24[2], 10)
      };
    }

    return null;
  }
}

export const icsOutput = new IcsOutput();
export default icsOutput;
