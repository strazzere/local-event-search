import * as cheerio from 'cheerio';
import { WordPressScraper } from './wordpress-scraper';
import { RawEventData } from '../../utils/event-normalizer';

interface JsonLdEvent {
  '@type'?: string | string[];
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  url?: string;
  image?: string;
  location?: { name?: string; address?: string };
  offers?: { url?: string; price?: string };
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function formatTime(iso: string): string | undefined {
  // Accept "2026-04-04T08:00" or "2026-04-04T08:00:00-07:00"
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return undefined;
  let hour = parseInt(m[1], 10);
  const minutes = m[2];
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minutes} ${ampm}`;
}

/**
 * The Pour Choice uses the Modern Events Calendar Lite (MEC) WordPress plugin.
 * Its events page renders one JSON-LD <script type="application/ld+json"> block
 * per event occurrence, which is more reliable to parse than the calendar DOM.
 */
export class PourChoiceScraper extends WordPressScraper {
  protected async parseEvents($: cheerio.CheerioAPI): Promise<RawEventData[]> {
    const events: RawEventData[] = [];
    const seen = new Set<string>();

    $('script[type="application/ld+json"]').each((_, el) => {
      const raw = $(el).contents().text();
      if (!raw || !raw.includes('"Event"')) return;

      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }

      const items: JsonLdEvent[] = [];
      const collect = (node: unknown) => {
        if (!node || typeof node !== 'object') return;
        const obj = node as Record<string, unknown>;
        const type = obj['@type'];
        const isEvent = type === 'Event' || (Array.isArray(type) && type.includes('Event'));
        if (isEvent) items.push(obj as JsonLdEvent);
        if (Array.isArray(obj['@graph'])) {
          for (const child of obj['@graph']) collect(child);
        }
      };

      if (Array.isArray(data)) {
        for (const item of data) collect(item);
      } else {
        collect(data);
      }

      for (const item of items) {
        if (!item.name || !item.startDate) continue;

        const title = stripHtml(item.name);
        const date = item.startDate.split('T')[0];
        const dedupeKey = `${title}|${date}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        events.push({
          title,
          date,
          startTime: formatTime(item.startDate),
          endTime: item.endDate ? formatTime(item.endDate) : undefined,
          description: item.description ? stripHtml(item.description) : undefined,
          url: item.url || item.offers?.url,
          imageUrl: item.image || undefined,
          price: item.offers?.price || undefined
        });
      }
    });

    if (events.length > 0) {
      this.logger.debug(`Parsed ${events.length} events from JSON-LD`);
      return events;
    }

    this.logger.warn('No JSON-LD events found, falling back to default WordPress parsing');
    return super.parseEvents($);
  }
}

export default PourChoiceScraper;
