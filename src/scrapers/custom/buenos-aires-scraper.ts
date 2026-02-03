import * as cheerio from 'cheerio';
import { BaseScraper } from '../../core/base-scraper';
import { RawEventData } from '../../utils/event-normalizer';

export class BuenosAiresScraper extends BaseScraper {
  protected async parseEvents($: cheerio.CheerioAPI): Promise<RawEventData[]> {
    const events: RawEventData[] = [];

    // Buenos Aires Grill is a food truck - they typically list their schedule
    // Look for schedule patterns in the page content

    // Common patterns for food truck schedules:
    // - Tables with dates and locations
    // - List items with date/location pairs
    // - Sections with schedule headers

    // Try to find schedule sections
    const schedulePatterns = [
      'table',
      '.schedule',
      '[class*="schedule"]',
      '[class*="event"]',
      '.location-list',
      'ul li',
      '.grid-item'
    ];

    // Try table-based schedule first
    const $tables = $('table');
    if ($tables.length > 0) {
      $tables.each((_, table) => {
        const $rows = $(table).find('tr');
        $rows.each((_, row) => {
          const cells = $(row).find('td, th');
          if (cells.length >= 2) {
            const dateText = this.extractText($(cells[0]));
            const locationText = this.extractText($(cells[1]));

            // Check if this looks like a date
            if (this.looksLikeDate(dateText)) {
              events.push({
                title: `Buenos Aires Grill at ${locationText || 'Location TBA'}`,
                date: dateText,
                description: `Food truck stop at ${locationText}`
              });
            }
          }
        });
      });
    }

    // Try to extract from page content with date patterns
    const textContent = $('body').text();
    const dateRegex = /(\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{0,4})\s*[-–]?\s*([^,\n]+)?/gi;

    let match;
    while ((match = dateRegex.exec(textContent)) !== null) {
      const dateStr = match[1];
      const locationStr = match[2]?.trim();

      if (dateStr && !events.some(e => e.date === dateStr)) {
        events.push({
          title: locationStr
            ? `Buenos Aires Grill at ${locationStr}`
            : 'Buenos Aires Grill - Food Truck Stop',
          date: dateStr,
          description: locationStr ? `Food truck serving at ${locationStr}` : undefined
        });
      }
    }

    // Look for structured event data
    $('[class*="event"], [class*="schedule"], .entry, article').each((_, element) => {
      const $el = $(element);
      const text = this.extractText($el);

      // Skip if already found similar content
      if (events.some(e => text.includes(e.title || ''))) return;

      const dateMatch = text.match(/(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\w+ \d{1,2})/);
      if (dateMatch) {
        const title = this.extractText($el.find('h1, h2, h3, h4, .title').first()) ||
          'Buenos Aires Grill Event';

        events.push({
          title,
          date: dateMatch[1],
          description: text.length < 500 ? text : undefined
        });
      }
    });

    // Deduplicate based on date
    const seen = new Set<string>();
    return events.filter(e => {
      if (!e.date) return false;
      const key = `${e.date}-${e.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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

export default BuenosAiresScraper;
