import { BaseScraper } from '../../core/base-scraper';
import { Event, ScraperResult } from '../../types';
import { RawEventData } from '../../utils/event-normalizer';

const API_BASE = 'https://www.highhandnursery.com/wp-json/tribe/events/v1/events';
const CATEGORY = 'high-hand-brewing-company';

interface TribeEventDateDetails {
  year: string;
  month: string;
  day: string;
  hour: string;
  minutes: string;
  seconds: string;
}

interface TribeEvent {
  title: string;
  description: string;
  url: string;
  start_date: string;
  end_date: string;
  start_date_details: TribeEventDateDetails;
  end_date_details: TribeEventDateDetails;
  cost: string;
  image: {
    url: string;
  };
}

interface TribeEventsResponse {
  events: TribeEvent[];
  total: number;
  total_pages: number;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatTime(details: TribeEventDateDetails): string {
  const hour = parseInt(details.hour, 10);
  const minutes = details.minutes;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minutes} ${ampm}`;
}

export class HighHandScraper extends BaseScraper {
  protected async parseEvents(): Promise<RawEventData[]> {
    // Not used - we override scrape() directly since we use a JSON API
    return [];
  }

  async scrape(): Promise<ScraperResult> {
    const startTime = Date.now();
    const errors: { code: string; message: string; details?: unknown }[] = [];
    const warnings: string[] = [];

    this.logger.info(`Starting scrape for ${this.config.name}`);

    try {
      const rawEvents = await this.fetchAllEvents(warnings);
      this.logger.info(`Found ${rawEvents.length} raw events from API`);

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
          url: this.config.url,
          scrapedAt: new Date().toISOString(),
          duration: Date.now() - startTime,
          version: '1.0.0'
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Scrape failed: ${errorMessage}`);

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
          url: this.config.url,
          scrapedAt: new Date().toISOString(),
          duration: Date.now() - startTime,
          version: '1.0.0'
        }
      };
    }
  }

  private async fetchAllEvents(warnings: string[]): Promise<RawEventData[]> {
    const allEvents: RawEventData[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const url = `${API_BASE}?categories=${CATEGORY}&page=${page}&per_page=50`;
      this.logger.info(`Fetching page ${page}/${totalPages}: ${url}`);

      const response = await this.http.getJson<TribeEventsResponse>(url, {
        headers: {
          'User-Agent': 'penryn-event-scraper/1.0',
          'Accept': 'application/json'
        }
      });

      if (page === 1) {
        totalPages = response.total_pages;
        this.logger.info(`Total events: ${response.total}, pages: ${totalPages}`);
      }

      for (const event of response.events) {
        const rawEvent = this.mapToRawEvent(event);
        if (rawEvent) {
          allEvents.push(rawEvent);
        } else {
          warnings.push(`Could not map API event: ${event.title || 'Unknown'}`);
        }
      }

      page++;
    } while (page <= totalPages);

    return allEvents;
  }

  private mapToRawEvent(event: TribeEvent): RawEventData | null {
    if (!event.title) {
      return null;
    }

    return {
      title: stripHtml(event.title),
      date: event.start_date,
      startTime: formatTime(event.start_date_details),
      endTime: formatTime(event.end_date_details),
      description: event.description ? stripHtml(event.description) : undefined,
      url: event.url,
      imageUrl: event.image?.url,
      price: event.cost || undefined
    };
  }
}
