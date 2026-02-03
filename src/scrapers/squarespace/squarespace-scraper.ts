import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { BaseScraper } from '../../core/base-scraper';
import { RawEventData } from '../../utils/event-normalizer';

export class SquarespaceScraper extends BaseScraper {
  protected async parseEvents($: cheerio.CheerioAPI): Promise<RawEventData[]> {
    const events: RawEventData[] = [];
    const selectors = this.config.selectors;

    // Squarespace has several event layouts
    const containerSelectors = selectors?.eventContainer
      ? [selectors.eventContainer]
      : [
          '.eventlist-event',
          '.summary-item',
          '.blog-item',
          'article.eventlist-event',
          '[data-type="events"]',
          '.sqs-events-collection-item'
        ];

    let $events: cheerio.Cheerio<AnyNode> | null = null;

    for (const selector of containerSelectors) {
      const found = $(selector);
      if (found.length > 0) {
        $events = found;
        this.logger.debug(`Found events using selector: ${selector}`);
        break;
      }
    }

    if ($events && $events.length > 0) {
      $events.each((_, element) => {
        const $event = $(element);
        const event = this.parseEventElement($, $event);
        if (event) {
          events.push(event);
        }
      });
    }

    // If no structured events found, try to parse from page content
    if (events.length === 0) {
      const contentEvents = this.parseFromContent($);
      events.push(...contentEvents);
    }

    return events;
  }

  private parseEventElement(
    $: cheerio.CheerioAPI,
    $event: cheerio.Cheerio<AnyNode>
  ): RawEventData | null {
    // Extract title
    const titleSelectors = [
      '.eventlist-title',
      '.eventlist-title-link',
      '.summary-title',
      '.summary-title-link',
      'h1.eventlist-title',
      'h2',
      'h3',
      '.entry-title'
    ];

    let title = '';
    for (const sel of titleSelectors) {
      const $title = $event.find(sel).first();
      if ($title.length) {
        title = this.extractText($title);
        break;
      }
    }

    if (!title) return null;

    // Extract date
    const dateSelectors = [
      '.eventlist-meta-date',
      'time.event-date',
      '.summary-metadata-item--date',
      'time[datetime]',
      '.eventlist-datetag'
    ];

    let dateText = '';
    for (const sel of dateSelectors) {
      const $date = $event.find(sel).first();
      if ($date.length) {
        dateText = $date.attr('datetime') || this.extractText($date);
        break;
      }
    }

    // Extract time
    const $time = $event.find('.eventlist-meta-time, .event-time-12hr, time').first();
    const timeText = $time.length ? this.extractText($time) : undefined;

    // Extract description
    const $desc = $event.find('.eventlist-description, .summary-excerpt, .eventlist-body p').first();
    const description = $desc.length ? this.extractText($desc) : undefined;

    // Extract link
    const $link = $event.find('a.eventlist-title-link, a.summary-title-link, a').first();
    const url = this.extractHref($link, this.config.url);

    // Extract image
    const $img = $event.find('img, .summary-thumbnail img').first();
    const imageUrl = this.extractSrc($img, this.config.url);

    return {
      title,
      date: dateText,
      startTime: timeText,
      description,
      url,
      imageUrl
    };
  }

  private parseFromContent($: cheerio.CheerioAPI): RawEventData[] {
    const events: RawEventData[] = [];

    // Look for common patterns in Squarespace pages
    // Often events are listed with headers and dates

    $('h2, h3, h4').each((_, heading) => {
      const $heading = $(heading);
      const title = this.extractText($heading);

      // Look for date in next sibling elements
      const $next = $heading.next();
      const nextText = this.extractText($next);

      if (this.looksLikeDate(nextText)) {
        events.push({
          title,
          date: nextText,
          description: this.extractText($next.next())
        });
      } else if (this.looksLikeDate(title)) {
        // Sometimes the heading itself contains the date
        events.push({
          title: nextText || title,
          date: title
        });
      }
    });

    return events;
  }

  private looksLikeDate(text: string): boolean {
    const datePatterns = [
      /\d{1,2}\/\d{1,2}/,
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i,
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}/i,
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
    ];

    return datePatterns.some(pattern => pattern.test(text));
  }
}

export default SquarespaceScraper;
