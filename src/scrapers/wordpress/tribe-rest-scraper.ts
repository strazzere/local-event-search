import { BaseScraper } from '../../core/base-scraper';
import { Event, ScraperResult } from '../../types';
import { RawEventData } from '../../utils/event-normalizer';
import { stripHtml } from '../../utils/html-text';

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
  cost?: string;
  image?: {
    url: string;
  };
}

interface TribeEventsResponse {
  events: TribeEvent[];
  total: number;
  total_pages: number;
}

function formatTime(details: TribeEventDateDetails): string {
  const hour = parseInt(details.hour, 10);
  const minutes = details.minutes;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minutes} ${ampm}`;
}

export class TribeRestScraper extends BaseScraper {
  protected async parseEvents(): Promise<RawEventData[]> {
    return [];
  }

  async scrape(): Promise<ScraperResult> {
    const startTime = Date.now();
    const errors: { code: string; message: string; details?: unknown }[] = [];
    const warnings: string[] = [];

    this.logger.info(`Starting Tribe REST scrape for ${this.config.name}`);

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

    const apiBase = this.config.config?.wordpressRestUrl || 
                    `${new URL(this.config.url).origin}/wp-json/tribe/events/v1/events`;

    const maxDaysAhead = this.config.config?.maxDaysAhead || 60;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + maxDaysAhead);

    const startDateParam = today.toISOString().split('T')[0];
    const endDateParam = endDate.toISOString().split('T')[0];

    do {
      const url = `${apiBase}?start_date=${startDateParam}&end_date=${endDateParam}&page=${page}&per_page=50`;
      this.logger.info(`Fetching page ${page}/${totalPages}: ${url}`);

      let response: TribeEventsResponse;
      try {
        response = await this.http.getJson<TribeEventsResponse>(url, {
          headers: {
            'User-Agent': 'penryn-event-scraper/1.0',
            'Accept': 'application/json'
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Stopped paginating at page ${page}: ${message}`);
        this.logger.warn(`Stopped paginating at page ${page}: ${message}`);
        break;
      }

      if (!response || !Array.isArray(response.events)) {
        warnings.push(`Page ${page} returned no events array; stopping pagination`);
        this.logger.warn(`Page ${page} returned no events array; stopping pagination`);
        break;
      }

      if (page === 1) {
        totalPages = response.total_pages || 1;
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
