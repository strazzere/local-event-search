import * as cheerio from 'cheerio';
import { BaseScraper } from '../../core/base-scraper';
import { RawEventData } from '../../utils/event-normalizer';

export class WordPressScraper extends BaseScraper {
  protected async parseEvents($: cheerio.CheerioAPI): Promise<RawEventData[]> {
    const events: RawEventData[] = [];
    const selectors = this.config.selectors;

    if (!selectors) {
      this.logger.warn('No selectors configured, using defaults');
      return this.parseWithDefaults($);
    }

    $(selectors.eventContainer).each((_, element) => {
      const $event = $(element);

      const title = selectors.title
        ? this.extractText($event.find(selectors.title))
        : this.extractText($event.find('h2, h3, .event-title'));

      const dateText = selectors.date
        ? this.extractText($event.find(selectors.date))
        : this.extractText($event.find('time, .event-date'));

      const timeText = selectors.time
        ? this.extractText($event.find(selectors.time))
        : undefined;

      const description = selectors.description
        ? this.extractText($event.find(selectors.description))
        : this.extractText($event.find('.event-description, p'));

      const link = selectors.link
        ? this.extractHref($event.find(selectors.link), this.config.url)
        : this.extractHref($event.find('a'), this.config.url);

      const image = selectors.image
        ? this.extractSrc($event.find(selectors.image), this.config.url)
        : this.extractSrc($event.find('img'), this.config.url);

      if (title) {
        events.push({
          title,
          date: dateText,
          startTime: timeText,
          description,
          url: link,
          imageUrl: image
        });
      }
    });

    return events;
  }

  private parseWithDefaults($: cheerio.CheerioAPI): RawEventData[] {
    const events: RawEventData[] = [];

    // Try common WordPress event plugin selectors
    const commonSelectors = [
      '.tribe-events-calendar-list__event',
      '.tribe-common-g-row',
      '.event-item',
      '.wp-block-tribe-events-event-datetime',
      'article.post'
    ];

    for (const selector of commonSelectors) {
      if ($(selector).length > 0) {
        $(selector).each((_, element) => {
          const $event = $(element);
          const title = this.extractText($event.find('h1, h2, h3, .tribe-events-title, .event-title').first());
          const dateText = this.extractText($event.find('time, .tribe-events-start-datetime, .event-date').first());

          if (title) {
            events.push({
              title,
              date: dateText,
              description: this.extractText($event.find('p, .tribe-events-content, .event-description').first()),
              url: this.extractHref($event.find('a').first(), this.config.url)
            });
          }
        });

        if (events.length > 0) break;
      }
    }

    return events;
  }
}

export default WordPressScraper;
