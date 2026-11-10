import ICAL from 'ical.js';
import { formatInTimeZone } from 'date-fns-tz';
import { BaseScraper } from '../../core/base-scraper';
import { Event, ScraperResult } from '../../types';
import { RawEventData } from '../../utils/event-normalizer';
import { stripHtml } from '../../utils/html-text';

export class IcsScraper extends BaseScraper {
  protected async parseEvents(): Promise<RawEventData[]> {
    return [];
  }

  async scrape(): Promise<ScraperResult> {
    const startTime = Date.now();
    const errors: { code: string; message: string; details?: unknown }[] = [];
    const warnings: string[] = [];

    this.logger.info(`Starting ICS scrape for ${this.config.name}`);

    try {
      const icsUrl = this.config.config?.icsUrl || this.config.url;
      const icsData = await this.http.get(icsUrl);
      const rawEvents = this.parseIcsData(icsData, warnings);

      this.logger.info(`Found ${rawEvents.length} raw events from ICS feed`);

      const events: Event[] = [];
      for (const rawEvent of rawEvents) {
        const event = this.normalizer.normalizeEvent(
          rawEvent,
          this.getVenueInfo(),
          this.config.id
        );
        if (event) {
          events.push(event);
        } else {
          warnings.push(`Could not normalize event: ${rawEvent.title || 'Unknown'}`);
        }
      }

      this.logger.info(`Successfully parsed ${events.length} events`);

      return {
        success: true,
        events,
        errors,
        warnings,
        metadata: {
          venueId: this.config.id,
          venueName: this.config.name,
          url: icsUrl,
          scrapedAt: new Date().toISOString(),
          duration: Date.now() - startTime,
          version: '1.0.0'
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`ICS scrape failed: ${errorMessage}`);

      return {
        success: false,
        events: [],
        errors: [{
          code: 'SCRAPE_ERROR',
          message: errorMessage,
          details: error
        }],
        warnings,
        metadata: {
          venueId: this.config.id,
          venueName: this.config.name,
          url: this.config.config?.icsUrl || this.config.url,
          scrapedAt: new Date().toISOString(),
          duration: Date.now() - startTime,
          version: '1.0.0'
        }
      };
    }
  }

  private parseIcsData(icsData: string, warnings: string[]): RawEventData[] {
    const events: RawEventData[] = [];
    
    try {
      const jcalData = ICAL.parse(icsData);
      const comp = new ICAL.Component(jcalData);
      const vevents = comp.getAllSubcomponents('vevent');

      const maxDaysAhead = this.config.config?.maxDaysAhead || 60;
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const maxDate = new Date(now);
      maxDate.setDate(maxDate.getDate() + maxDaysAhead);

      const filters = this.config.config?.icsFilters;

      for (const vevent of vevents) {
        try {
          const event = new ICAL.Event(vevent);
          const expandedEvents = this.expandRecurringEvent(event, now, maxDate);

          for (const expandedEvent of expandedEvents) {
            const rawEvent = this.convertIcalEventToRaw(expandedEvent);
            
            if (rawEvent && this.passesFilters(rawEvent, filters)) {
              events.push(rawEvent);
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          warnings.push(`Failed to parse VEVENT: ${errorMessage}`);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse ICS data: ${errorMessage}`);
    }

    return events;
  }

  private expandRecurringEvent(
    event: ICAL.Event,
    startDate: Date,
    endDate: Date
  ): ICAL.Event[] {
    if (!event.isRecurring()) {
      const eventStartDate = event.startDate.toJSDate();
      if (eventStartDate >= startDate && eventStartDate <= endDate) {
        return [event];
      }
      return [];
    }

    const expanded: ICAL.Event[] = [];
    const iterator = event.iterator();
    let next;
    let count = 0;
    const maxIterations = 1000;

    while ((next = iterator.next()) && count < maxIterations) {
      count++;
      const occurrenceDate = next.toJSDate();
      
      if (occurrenceDate > endDate) {
        break;
      }
      
      if (occurrenceDate >= startDate) {
        const occurrence = event.getOccurrenceDetails(next);
        const occurrenceEvent = new ICAL.Event(occurrence.item as unknown as ICAL.Component);
        expanded.push(occurrenceEvent);
      }
    }

    return expanded;
  }

  private convertIcalEventToRaw(event: ICAL.Event): RawEventData | null {
    const summary = event.summary;
    if (!summary) {
      return null;
    }

    const startDate = event.startDate.toJSDate();
    const endDate = event.endDate?.toJSDate();
    const description = event.description;
    const location = event.location;
    const urlProp = event.component.getFirstPropertyValue('url');
    const url = typeof urlProp === 'string' ? urlProp : undefined;

    const isAllDay = event.startDate.isDate;
    
    let startTime: string | undefined;
    let endTime: string | undefined;

    if (!isAllDay) {
      const timezone = this.config.config?.timezone || 'America/Los_Angeles';
      startTime = this.formatTime(startDate, timezone);
      if (endDate) {
        endTime = this.formatTime(endDate, timezone);
      }
    }

    return {
      title: stripHtml(summary),
      date: startDate.toISOString(),
      startTime,
      endTime,
      description: description ? stripHtml(description) : undefined,
      url
    };
  }

  private formatTime(date: Date, timezone: string): string {
    return formatInTimeZone(date, timezone, 'h:mm a');
  }

  private passesFilters(
    event: RawEventData,
    filters?: {
      includeKeywords?: string[];
      excludeKeywords?: string[];
      includeCategories?: string[];
      excludeCategories?: string[];
    }
  ): boolean {
    if (!filters) {
      return true;
    }

    const searchText = `${event.title} ${event.description || ''}`.toLowerCase();

    if (filters.excludeKeywords) {
      for (const keyword of filters.excludeKeywords) {
        if (searchText.includes(keyword.toLowerCase())) {
          return false;
        }
      }
    }

    if (filters.includeKeywords && filters.includeKeywords.length > 0) {
      let found = false;
      for (const keyword of filters.includeKeywords) {
        if (searchText.includes(keyword.toLowerCase())) {
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }

    return true;
  }
}

export default IcsScraper;
