import * as cheerio from 'cheerio';
import { SquarespaceScraper } from './squarespace-scraper';
import { RawEventData } from '../../utils/event-normalizer';

export class OmakaseScraper extends SquarespaceScraper {
  protected async parseEvents($: cheerio.CheerioAPI): Promise<RawEventData[]> {
    const events: RawEventData[] = [];

    // First try the standard Squarespace parsing
    const standardEvents = await super.parseEvents($);
    events.push(...standardEvents);

    // If no events found, try Omakase-specific patterns
    if (events.length === 0) {
      // Omakase often has recurring events like "Oyster Mondays"
      // Look for these patterns

      const pageText = $('body').text();

      // Look for recurring events mentioned
      const recurringPatterns = [
        { pattern: /oyster\s+mondays?/gi, title: 'Oyster Mondays', day: 'Monday' },
        { pattern: /wine\s+dinner/gi, title: 'Wine Dinner', day: null },
        { pattern: /sake\s+tasting/gi, title: 'Sake Tasting', day: null },
        { pattern: /omakase\s+experience/gi, title: 'Omakase Experience', day: null }
      ];

      for (const { pattern, title, day } of recurringPatterns) {
        if (pattern.test(pageText)) {
          events.push({
            title,
            date: day ? `Every ${day}` : 'See website for dates',
            description: `${title} at Omakase Por Favor - check website for current availability`
          });
        }
      }

      // Look for specific event sections
      $('section, div[class*="content"], .page-section').each((_, section) => {
        const $section = $(section);
        const sectionText = this.extractText($section);

        // Check if this section contains event-like content
        if (this.containsEventKeywords(sectionText)) {
          const $headings = $section.find('h1, h2, h3, h4');

          $headings.each((_, heading) => {
            const $heading = $(heading);
            const title = this.extractText($heading);

            // Skip navigation-like headings
            if (title.length < 3 || title.length > 100) return;

            // Look for date nearby
            const $parent = $heading.parent();
            const surroundingText = this.extractText($parent);
            const dateMatch = this.extractDateFromText(surroundingText);

            if (dateMatch || this.isEventTitle(title)) {
              events.push({
                title,
                date: dateMatch || 'See website for dates',
                description: surroundingText.length < 300 ? surroundingText : undefined
              });
            }
          });
        }
      });
    }

    // Deduplicate by title similarity
    const seen = new Set<string>();
    return events.filter(e => {
      const key = (e.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private containsEventKeywords(text: string): boolean {
    const keywords = ['event', 'dinner', 'tasting', 'reservation', 'book', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'weekly', 'monthly'];
    const lower = text.toLowerCase();
    return keywords.some(kw => lower.includes(kw));
  }

  private isEventTitle(title: string): boolean {
    const eventKeywords = ['dinner', 'tasting', 'event', 'night', 'special', 'experience', 'pairing', 'class'];
    const lower = title.toLowerCase();
    return eventKeywords.some(kw => lower.includes(kw));
  }

  private extractDateFromText(text: string): string | null {
    const datePatterns = [
      /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
      /(\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/i,
      /(every\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))/i
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }

    return null;
  }
}

export default OmakaseScraper;
