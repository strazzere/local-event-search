import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { BaseScraper } from '../../core/base-scraper';
import { RawEventData } from '../../utils/event-normalizer';

export class MoksaScraper extends BaseScraper {
  protected async parseEvents($: cheerio.CheerioAPI): Promise<RawEventData[]> {
    const events: RawEventData[] = [];

    // Moksa Brewing typically has food trucks and events
    // Try to find their event/food truck schedule

    // Look for common patterns
    const containerSelectors = [
      '.event',
      '.event-item',
      '.food-truck',
      'article',
      '.schedule-item',
      '[class*="event"]',
      '.post'
    ];

    for (const selector of containerSelectors) {
      const $events = $(selector);
      if ($events.length > 0) {
        $events.each((_, element) => {
          const $event = $(element);
          const event = this.parseEventElement($, $event);
          if (event) {
            events.push(event);
          }
        });

        if (events.length > 0) break;
      }
    }

    // Parse from page content if no structured events found
    if (events.length === 0) {
      const contentEvents = this.parseFromPageContent($);
      events.push(...contentEvents);
    }

    return events;
  }

  private parseEventElement(
    $: cheerio.CheerioAPI,
    $event: cheerio.Cheerio<AnyNode>
  ): RawEventData | null {
    const title = this.extractText($event.find('h2, h3, h4, .title, .event-title').first());
    if (!title) return null;

    const dateText = this.extractText($event.find('time, .date, .event-date, [class*="date"]').first());
    const timeText = this.extractText($event.find('.time, .event-time').first());
    const description = this.extractText($event.find('p, .description, .event-description').first());
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

  private parseFromPageContent($: cheerio.CheerioAPI): RawEventData[] {
    const events: RawEventData[] = [];

    // Get main content
    const mainContent = $('main, .main-content, #content, body').first();
    const contentText = this.extractText(mainContent);

    // Look for food truck schedules (common for breweries)
    const foodTruckPatterns = [
      /(\w+day)s?\s*[-–:]\s*([^,\n]+)/gi,
      /(\d{1,2}\/\d{1,2})\s*[-–:]\s*([^,\n]+)/g
    ];

    for (const pattern of foodTruckPatterns) {
      let match;
      while ((match = pattern.exec(contentText)) !== null) {
        const day = match[1];
        const info = match[2].trim();

        // Check if it looks like an event/food truck
        if (this.looksLikeEvent(info)) {
          events.push({
            title: `${info} at Moksa`,
            date: day,
            description: `Food/event at Moksa Brewing`
          });
        }
      }
    }

    // Also look for explicit event headings
    mainContent.find('h2, h3, h4').each((_, heading) => {
      const $heading = $(heading);
      const headingText = this.extractText($heading);

      if (this.looksLikeEventTitle(headingText)) {
        const $next = $heading.next();
        const nextText = this.extractText($next);
        const dateMatch = this.extractDateFromText(nextText);

        events.push({
          title: headingText,
          date: dateMatch || 'See website',
          description: nextText.length < 200 ? nextText : undefined
        });
      }
    });

    return events;
  }

  private looksLikeEvent(text: string): boolean {
    const keywords = ['food', 'truck', 'taco', 'bbq', 'pizza', 'music', 'live', 'band'];
    const lower = text.toLowerCase();
    return keywords.some(kw => lower.includes(kw));
  }

  private looksLikeEventTitle(text: string): boolean {
    const keywords = ['event', 'music', 'food', 'truck', 'live', 'trivia', 'night'];
    const lower = text.toLowerCase();
    return keywords.some(kw => lower.includes(kw));
  }

  private extractDateFromText(text: string): string | null {
    const patterns = [
      /(\d{1,2}\/\d{1,2})/,
      /(\w+ \d{1,2}(?:st|nd|rd|th)?)/i,
      /(every \w+day)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }

    return null;
  }
}

export default MoksaScraper;
