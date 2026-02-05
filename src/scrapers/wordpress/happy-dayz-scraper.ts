import * as cheerio from 'cheerio';
import { WordPressScraper } from './wordpress-scraper';
import { RawEventData } from '../../utils/event-normalizer';

export class HappyDayzScraper extends WordPressScraper {
  protected async parseEvents($: cheerio.CheerioAPI): Promise<RawEventData[]> {
    const events: RawEventData[] = [];

    // Get page text and look for date patterns
    // Add newlines before block elements to preserve structure
    $('br, p, div, h1, h2, h3, h4, h5, h6, li').each((_, el) => {
      $(el).prepend('\n');
    });

    const pageText = $('body').text();
    // Limit line length to prevent ReDoS attacks on regex patterns
    const MAX_LINE_LENGTH = 500;
    const lines = pageText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 5)
      .map(l => l.length > MAX_LINE_LENGTH ? l.substring(0, MAX_LINE_LENGTH) : l);

    // Patterns for Happy Dayz date formats:
    // "Feb 6th & 7th 11-4pm"
    // "Feb 27th 11-4pm"
    // "March 13th, 14th & 15th 12-5pm"
    // "March 20th 5:30-7pm Kick off Spring with Wine Bottle Bouquet Workshop"

    const months = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';

    // Pattern for date with times and optional event description
    const datePattern = new RegExp(
      `(${months})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*[,&]\\s*(\\d{1,2})(?:st|nd|rd|th)?)*\\s+(\\d{1,2}(?::\\d{2})?\\s*-\\s*\\d{1,2}(?::\\d{2})?(?:am|pm)?)\\s*(.*)`,
      'gi'
    );

    for (const line of lines) {
      // Skip closed notices
      if (line.toLowerCase().includes('closed')) continue;

      const match = datePattern.exec(line);
      if (match) {
        const month = match[1];
        const timePart = match[4];
        const description = match[5]?.trim();

        // Extract days only from the portion between month and time
        // This avoids picking up numbers from times like "11-4pm"
        const dayPortionMatch = line.match(new RegExp(`${months}\\s+([\\d,&\\s]+(?:st|nd|rd|th)?[\\d,&\\s]*?)\\s+\\d{1,2}(?::\\d{2})?\\s*-`, 'i'));
        const dayPortion = dayPortionMatch ? dayPortionMatch[1] : match[2];
        const dayMatches = dayPortion.match(/\d{1,2}/g);
        const days = dayMatches ? dayMatches.map(d => parseInt(d)).filter(d => d >= 1 && d <= 31) : [];

        // Create event title
        let title = 'Wine Tasting';
        if (description && description.length > 5) {
          title = description;
        }

        // Parse start time
        const timeMatch = timePart.match(/(\d{1,2})(?::(\d{2}))?/);
        const startTime = timeMatch ? `${timeMatch[1]}:${timeMatch[2] || '00'} PM` : undefined;

        // Create event for each day
        for (const day of days) {
          events.push({
            title,
            date: `${month} ${day}`,
            startTime,
            description: description || `Open for wine tasting ${timePart}`
          });
        }
      }

      // Reset regex lastIndex for next line
      datePattern.lastIndex = 0;
    }

    if (events.length > 0) {
      this.logger.debug(`Parsed ${events.length} events from Happy Dayz page`);
      return events;
    }

    // Fallback to parent parsing
    return super.parseEvents($);
  }
}

export default HappyDayzScraper;
