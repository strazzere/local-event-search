import * as cheerio from 'cheerio';
import { BaseScraper } from '../../core/base-scraper';
import { RawEventData } from '../../utils/event-normalizer';

/**
 * Generic scraper that uses selectors from venue config to parse events.
 * Used for venues with "custom" platform that don't have a specific scraper.
 */
export class GenericScraper extends BaseScraper {
  protected async parseEvents($: cheerio.CheerioAPI): Promise<RawEventData[]> {
    const events: RawEventData[] = [];
    const selectors = this.config.selectors;

    if (!selectors?.eventContainer) {
      this.logger.warn('No event container selector configured');
      return events;
    }

    $(selectors.eventContainer).each((_, element) => {
      const $event = $(element);

      const title = selectors.title
        ? this.extractText($event.find(selectors.title).first())
        : this.extractText($event.find('h1, h2, h3, h4, .title, [class*="title"]').first());

      const date = selectors.date
        ? this.extractText($event.find(selectors.date).first())
        : this.extractText($event.find('time, .date, [class*="date"]').first());

      const description = selectors.description
        ? this.extractText($event.find(selectors.description).first())
        : undefined;

      const url = this.extractHref(
        $event.find('a').first(),
        this.config.url
      );

      if (title && title.length > 2) {
        events.push({
          title,
          date: date || undefined,
          description,
          url
        });
      }
    });

    return events;
  }
}

export default GenericScraper;
