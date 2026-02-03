import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { BaseScraper } from '../../core/base-scraper';
import { RawEventData } from '../../utils/event-normalizer';

export class SpotHopperScraper extends BaseScraper {
  protected async parseEvents($: cheerio.CheerioAPI): Promise<RawEventData[]> {
    const events: RawEventData[] = [];

    // Try SpotHopper calendar cards first (modern format with data attributes)
    const $calendarCards = $('.event-calendar-card');
    if ($calendarCards.length > 0) {
      $calendarCards.each((_, element) => {
        const $event = $(element);
        const event = this.parseCalendarCard($, $event);
        if (event) {
          events.push(event);
        }
      });
      return events;
    }

    // Try legacy SpotHopper-specific selectors
    const spotHopperSelectors = [
      '.sh-event',
      '.sh-events-list .sh-event-item',
      '[data-sh-event]',
      '.spothopper-event'
    ];

    for (const selector of spotHopperSelectors) {
      const $events = $(selector);
      if ($events.length > 0) {
        $events.each((_, element) => {
          const $event = $(element);
          const event = this.parseSpotHopperEvent($, $event);
          if (event) {
            events.push(event);
          }
        });
        break;
      }
    }

    // If no SpotHopper-specific events found, try generic parsing
    if (events.length === 0) {
      const genericEvents = this.parseGenericEvents($);
      events.push(...genericEvents);
    }

    // Also check for embedded calendar or event widgets
    if (events.length === 0) {
      const widgetEvents = this.parseEventWidgets($);
      events.push(...widgetEvents);
    }

    return events;
  }

  private parseCalendarCard(
    $: cheerio.CheerioAPI,
    $event: cheerio.Cheerio<AnyNode>
  ): RawEventData | null {
    // Extract from data attributes
    const startDate = $event.attr('data-event-start-date');
    const startTime = $event.attr('data-event-start-time');
    const endDate = $event.attr('data-event-end-date');
    const recurrenceType = $event.attr('data-event-recurrence-type');
    const eventId = $event.attr('id');

    // Extract from HTML content
    const title = this.extractText($event.find('.event-text-holder h2, h2').first());
    if (!title) return null;

    const dayText = this.extractText($event.find('.event-main-text.event-day').first());
    const timeText = this.extractText($event.find('.event-main-text.event-time').first());
    const description = this.extractText($event.find('.event-info-text, .event-description, p').not('.event-main-text').first());
    const imageUrl = this.extractSrc($event.find('.event-image-holder img, img').first(), this.config.url);
    const url = this.extractHref($event.find('.event-read-more a, a').first(), this.config.url);

    // Use data attribute date if available, otherwise use text
    let date = startDate || dayText;

    // Add recurring info to description if present
    let fullDescription = description;
    if (recurrenceType && recurrenceType.toLowerCase() !== 'none') {
      fullDescription = fullDescription
        ? `${fullDescription} (Recurring: ${recurrenceType})`
        : `Recurring: ${recurrenceType}`;
    }

    return {
      title,
      date,
      startTime: timeText || startTime,
      description: fullDescription || undefined,
      url,
      imageUrl
    };
  }

  private parseSpotHopperEvent(
    $: cheerio.CheerioAPI,
    $event: cheerio.Cheerio<AnyNode>
  ): RawEventData | null {
    const title = this.extractText($event.find('.sh-event-title, .event-title, h3').first());
    if (!title) return null;

    const dateText = this.extractText($event.find('.sh-event-date, .event-date, time').first());
    const timeText = this.extractText($event.find('.sh-event-time, .event-time').first());
    const description = this.extractText($event.find('.sh-event-description, .event-description, p').first());
    const url = this.extractHref($event.find('a').first(), this.config.url);
    const imageUrl = this.extractSrc($event.find('img').first(), this.config.url);

    return {
      title,
      date: dateText,
      startTime: timeText,
      description: description || undefined,
      url,
      imageUrl
    };
  }

  private parseGenericEvents($: cheerio.CheerioAPI): RawEventData[] {
    const events: RawEventData[] = [];
    const selectors = this.config.selectors;

    const containerSelector = selectors?.eventContainer || '.event-card, .event-item, article';
    const $events = $(containerSelector);

    $events.each((_, element) => {
      const $event = $(element);

      const title = selectors?.title
        ? this.extractText($event.find(selectors.title))
        : this.extractText($event.find('h2, h3, .event-title').first());

      if (!title) return;

      const dateText = selectors?.date
        ? this.extractText($event.find(selectors.date))
        : this.extractText($event.find('time, .event-date, .date').first());

      const description = selectors?.description
        ? this.extractText($event.find(selectors.description))
        : this.extractText($event.find('p, .event-description').first());

      events.push({
        title,
        date: dateText,
        description: description || undefined,
        url: this.extractHref($event.find('a').first(), this.config.url),
        imageUrl: this.extractSrc($event.find('img').first(), this.config.url)
      });
    });

    return events;
  }

  private parseEventWidgets($: cheerio.CheerioAPI): RawEventData[] {
    const events: RawEventData[] = [];

    // Look for calendar widgets or event sections
    const widgetSelectors = [
      '.calendar-widget',
      '.events-widget',
      '[class*="calendar"]',
      '[class*="events-section"]'
    ];

    for (const selector of widgetSelectors) {
      const $widget = $(selector);
      if ($widget.length > 0) {
        // Try to extract events from widget
        $widget.find('li, .event, article').each((_, element) => {
          const $item = $(element);
          const text = this.extractText($item);

          // Try to parse date and title from text
          const dateMatch = text.match(/(\d{1,2}\/\d{1,2}|\w+ \d{1,2}(?:st|nd|rd|th)?)/i);
          if (dateMatch) {
            const title = text.replace(dateMatch[0], '').trim().split('\n')[0];
            if (title && title.length > 3) {
              events.push({
                title,
                date: dateMatch[1]
              });
            }
          }
        });
      }
    }

    return events;
  }
}

export default SpotHopperScraper;
