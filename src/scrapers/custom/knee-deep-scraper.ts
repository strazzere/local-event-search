import * as cheerio from 'cheerio';
import { BaseScraper } from '../../core/base-scraper';
import { RawEventData } from '../../utils/event-normalizer';

interface KneeDeepImage {
  url?: string;
  isPrimary?: boolean;
}

interface KneeDeepEvent {
  _id?: string;
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  images?: KneeDeepImage[];
  category?: string;
  tapRoom?: string;
  ticketPrice?: number;
  ticketUrl?: string;
  tags?: string[];
}

interface KneeDeepApiResponse {
  events?: KneeDeepEvent[];
}

/**
 * Custom scraper for Knee Deep Brewing.
 * Uses their public JSON events API rather than scraping HTML.
 */
export class KneeDeepScraper extends BaseScraper {
  private apiData: KneeDeepApiResponse | null = null;

  protected async fetchContent(): Promise<string> {
    this.apiData = await this.http.getJson<KneeDeepApiResponse>(this.config.url);
    // BaseScraper passes this through cheerio.load(); return empty doc
    // since parseEvents reads from this.apiData directly.
    return '';
  }

  protected async parseEvents(_$: cheerio.CheerioAPI): Promise<RawEventData[]> {
    const events: RawEventData[] = [];
    const apiEvents = this.apiData?.events ?? [];

    for (const ev of apiEvents) {
      if (!ev.title || !ev.startDate) continue;

      const primaryImage = ev.images?.find(img => img.isPrimary) ?? ev.images?.[0];

      events.push({
        title: ev.title,
        date: ev.startDate,
        startTime: this.formatTime(ev.startTime),
        endTime: this.formatTime(ev.endTime),
        description: ev.description?.trim() || undefined,
        url: ev.ticketUrl?.trim() || 'https://kneedeepbrewing.com/events',
        imageUrl: primaryImage?.url,
        price: ev.ticketPrice && ev.ticketPrice > 0 ? `$${ev.ticketPrice}` : 'Free',
        tags: ev.tags && ev.tags.length > 0 ? ev.tags : undefined
      });
    }

    return events;
  }

  /**
   * Convert 24-hour "HH:MM" times from the API into "h:MM AM/PM".
   */
  private formatTime(time?: string): string | undefined {
    if (!time) return undefined;
    const match = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return time;

    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return `${hours}:${minutes} ${period}`;
  }
}

export default KneeDeepScraper;
