import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { WordPressScraper } from './wordpress-scraper';
import { RawEventData } from '../../utils/event-normalizer';

export class MindscapeScraper extends WordPressScraper {
  protected async parseEvents($: cheerio.CheerioAPI): Promise<RawEventData[]> {
    const events: RawEventData[] = [];

    // Mindscape uses Modern Events Calendar (MEC) plugin
    // Try multiple selector patterns
    const eventContainers = [
      'article.mec-event-article',
      '.mec-event-article',
      '.mec-event-list-modern article',
      // Fallback to Tribe Events Calendar selectors
      '.tribe-events-calendar-list__event',
      '.tribe-common-g-row'
    ];

    let $events: cheerio.Cheerio<AnyNode> | null = null;

    for (const selector of eventContainers) {
      const found = $(selector);
      if (found.length > 0) {
        $events = found;
        this.logger.debug(`Found events using selector: ${selector}`);
        break;
      }
    }

    if (!$events || $events.length === 0) {
      this.logger.warn('No events found with any selector pattern');
      return events;
    }

    $events.each((_, element) => {
      const $event = $(element);

      // Extract title - MEC uses h4 for event titles
      const $titleLink = $event.find('h4 a, .mec-event-title a, h4.mec-event-title a').first();
      const title = this.extractText($titleLink.length ? $titleLink : $event.find('h4, h3, h2').first());

      // Extract date and time - MEC format: "04 February Wednesday"
      const $dateEl = $event.find('.mec-event-date, .mec-start-date');
      let dateText = '';
      let timeText = '';

      if ($dateEl.length) {
        // MEC date format has separate divs for day, month, weekday
        const day = this.extractText($dateEl.find('.event-d, .mec-day'));
        const month = this.extractText($dateEl.find('.event-f, .mec-month'));

        if (day && month) {
          dateText = `${month} ${day}`;
        } else {
          // Fallback: get all text and parse
          const fullText = this.extractText($dateEl);
          // Parse "04 February Wednesday" format
          const match = fullText.match(/(\d+)\s+(\w+)/);
          if (match) {
            dateText = `${match[2]} ${match[1]}`;
          }
        }
      }

      // Extract time from separate element if available
      const $timeEl = $event.find('.mec-event-time, .mec-time-details');
      if ($timeEl.length) {
        timeText = this.extractText($timeEl);
      }

      // Extract description
      const description = this.extractText(
        $event.find('.mec-event-description p, .mec-event-content p, .event-excerpt').first()
      );

      // Extract link
      const url = this.extractHref($titleLink.length ? $titleLink : $event.find('a').first(), this.config.url);

      // Extract image
      const imageUrl = this.extractSrc(
        $event.find('.mec-event-image img, .mec-event-featured-image img, img').first(),
        this.config.url
      );

      if (title && title.length > 0) {
        events.push({
          title,
          date: dateText,
          startTime: timeText,
          description: description || undefined,
          url,
          imageUrl
        });
      }
    });

    return events;
  }
}

export default MindscapeScraper;
