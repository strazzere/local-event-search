import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { BaseScraper } from '../../core/base-scraper';
import { RawEventData } from '../../utils/event-normalizer';

export class WixScraper extends BaseScraper {
  protected async parseEvents($: cheerio.CheerioAPI): Promise<RawEventData[]> {
    const events: RawEventData[] = [];

    // Wix has multiple event widget types
    const wixEventSelectors = [
      // Wix Events app
      '[data-hook="event-list-item"]',
      '[data-hook="events-card"]',
      '.wixui-events-widget__item',

      // Generic Wix selectors
      '.event-item',
      '[class*="Event"]',

      // Wix Pro Gallery (sometimes used for events)
      '.pro-gallery-item',

      // Repeaters (common in Wix)
      '[data-hook="item-container"]'
    ];

    for (const selector of wixEventSelectors) {
      const $events = $(selector);
      if ($events.length > 0) {
        this.logger.debug(`Found ${$events.length} events with selector: ${selector}`);

        $events.each((_, element) => {
          const $event = $(element);
          const event = this.parseWixEvent($, $event);
          if (event) {
            events.push(event);
          }
        });

        if (events.length > 0) break;
      }
    }

    // Try to extract from page content if no structured events found
    if (events.length === 0) {
      const contentEvents = this.parseFromContent($);
      events.push(...contentEvents);
    }

    return events;
  }

  private parseWixEvent(
    $: cheerio.CheerioAPI,
    $event: cheerio.Cheerio<AnyNode>
  ): RawEventData | null {
    // Title extraction
    const titleSelectors = [
      '[data-hook="event-title"]',
      '[data-hook="title"]',
      '.event-title',
      'h2',
      'h3',
      '[class*="title"]'
    ];

    let title = '';
    for (const sel of titleSelectors) {
      const $title = $event.find(sel).first();
      if ($title.length) {
        title = this.extractText($title);
        if (title) break;
      }
    }

    if (!title) return null;

    // Date extraction
    const dateSelectors = [
      '[data-hook="event-date"]',
      '[data-hook="date"]',
      '.event-date',
      'time',
      '[class*="date"]'
    ];

    let dateText = '';
    for (const sel of dateSelectors) {
      const $date = $event.find(sel).first();
      if ($date.length) {
        dateText = $date.attr('datetime') || this.extractText($date);
        if (dateText) break;
      }
    }

    // Time extraction
    const $time = $event.find('[data-hook="event-time"], .event-time, [class*="time"]').first();
    const timeText = $time.length ? this.extractText($time) : undefined;

    // Description
    const $desc = $event.find('[data-hook="event-description"], .event-description, p').first();
    const description = $desc.length ? this.extractText($desc) : undefined;

    // Link
    const $link = $event.find('a').first();
    const url = this.extractHref($link, this.config.url);

    // Image
    const $img = $event.find('img, [data-hook="image"]').first();
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

    // Get full page text for text-based event parsing
    // Replace block elements with newlines to preserve text structure
    $('br, p, div, h1, h2, h3, h4, h5, h6, li, tr').each((_, el) => {
      $(el).prepend('\n');
    });
    const pageText = $('body').text();

    // Parse text-based events (common on Wix sites without event widgets)
    const textEvents = this.parseTextBasedEvents(pageText);
    events.push(...textEvents);

    if (events.length > 0) {
      return events;
    }

    // Fallback: Look for headings that look like events
    const contentSelectors = [
      'main',
      '#SITE_PAGES',
      '[id^="comp-"]',
      '.wixui-rich-text'
    ];

    for (const selector of contentSelectors) {
      const $content = $(selector);
      if ($content.length === 0) continue;

      $content.find('h2, h3, h4').each((_, heading) => {
        const $heading = $(heading);
        const headingText = this.extractText($heading);

        if (this.looksLikeEventTitle(headingText)) {
          const $parent = $heading.parent();
          const siblingText = this.extractText($parent);
          const dateMatch = this.extractDateFromText(siblingText);

          events.push({
            title: headingText,
            date: dateMatch || 'See website for dates',
            description: siblingText.length < 200 ? siblingText : undefined
          });
        }
      });
    }

    return events;
  }

  private parseTextBasedEvents(text: string): RawEventData[] {
    const events: RawEventData[] = [];

    // Normalize text - split by both newlines and common Wix text separators
    const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 5);

    // Pattern 1: "Event Name - Day, Month Date" all on one line
    const namedEventPattern = /^([^-–]+?)\s*[-–]\s*((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?)/i;

    // Pattern 2: "Every Day | Time" (e.g., "Every Thursday | 6:00")
    const recurringPattern = /^(Every\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))\s*\|?\s*(\d{1,2}(?::\d{2})?\s*(?:-\s*)?(?:AM|PM|Close)?)/i;

    const seenEvents = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip lines that are likely navigation or form elements
      if (line.toLowerCase().includes('click') ||
          line.toLowerCase().includes('form') ||
          line.toLowerCase().includes('intake') ||
          line.length < 15) {
        continue;
      }

      // Try named event pattern - ensure title has some substance
      const namedMatch = line.match(namedEventPattern);
      if (namedMatch) {
        const title = namedMatch[1].trim();
        const date = namedMatch[2].trim();

        // Skip if title looks like a form/link text
        if (title.length < 5 || title.toLowerCase().includes('form') ||
            title.toLowerCase().includes('click')) {
          continue;
        }

        const key = `${title}:${date}`;
        if (seenEvents.has(key)) continue;
        seenEvents.add(key);

        // Look for description in following lines
        let description = '';
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j];
          if (nextLine.length > 20 && !this.looksLikeEventTitle(nextLine) &&
              !namedEventPattern.test(nextLine) && !recurringPattern.test(nextLine) &&
              !nextLine.toLowerCase().includes('door') &&
              !nextLine.toLowerCase().includes('ticket')) {
            description = nextLine;
            break;
          }
        }

        events.push({
          title,
          date,
          description: description || undefined
        });
        continue;
      }

      // Try recurring event pattern
      const recurringMatch = line.match(recurringPattern);
      if (recurringMatch) {
        const dayPattern = recurringMatch[1];
        const time = recurringMatch[2];

        // Look for event description in following lines
        let title = '';
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          const nextLine = lines[j];
          if (nextLine.length > 10 && nextLine.length < 150 &&
              !recurringPattern.test(nextLine) && !namedEventPattern.test(nextLine)) {
            title = nextLine;
            break;
          }
        }

        if (title) {
          const key = `${title}:${dayPattern}`;
          if (seenEvents.has(key)) continue;
          seenEvents.add(key);

          events.push({
            title,
            date: dayPattern,
            startTime: time
          });
        }
      }
    }

    return events;
  }

  private looksLikeEventTitle(text: string): boolean {
    const eventKeywords = [
      'live', 'music', 'trivia', 'event', 'night', 'day',
      'special', 'tasting', 'dinner', 'brunch', 'concert',
      'band', 'dj', 'karaoke', 'bingo', 'comedy'
    ];
    const lower = text.toLowerCase();
    return eventKeywords.some(kw => lower.includes(kw));
  }

  private extractDateFromText(text: string): string | null {
    const patterns = [
      /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/,
      /(\w+day,?\s+\w+ \d{1,2}(?:st|nd|rd|th)?)/i,
      /(every\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }

    return null;
  }
}

export default WixScraper;
