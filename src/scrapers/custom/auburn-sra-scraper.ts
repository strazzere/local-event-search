import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { BaseScraper } from '../../core/base-scraper';
import { RawEventData } from '../../utils/event-normalizer';

/**
 * Custom scraper for Auburn State Recreation Area (CA State Parks).
 * Parses guided hikes, Junior Cubs programs, and campfire programs
 * from the parks.ca.gov page.
 */
export class AuburnSraScraper extends BaseScraper {
  protected async parseEvents($: cheerio.CheerioAPI): Promise<RawEventData[]> {
    const events: RawEventData[] = [];

    const mainContent = $('#page-content, .page-content, #main-content, main, .field-items, article, body').first();

    // Parse structured event blocks with dates/times
    events.push(...this.parseEventBlocks($, mainContent));

    // Parse Junior Cubs as a recurring event
    events.push(...this.parseJuniorCubs($, mainContent));

    // Parse campfire programs if listed
    events.push(...this.parseCampfirePrograms($, mainContent));

    return events;
  }

  private parseEventBlocks(
    $: cheerio.CheerioAPI,
    $content: cheerio.Cheerio<AnyNode>
  ): RawEventData[] {
    const events: RawEventData[] = [];
    const contentText = this.extractText($content);

    // Match specific dated events like hikes
    // Pattern: Event name followed by date, time, and location details
    const headings = $content.find('h2, h3, h4, strong, b');

    headings.each((_, heading) => {
      const $heading = $(heading);
      const headingText = this.extractText($heading);

      if (!this.isEventHeading(headingText)) return;

      // Gather text from siblings until next heading
      const details = this.gatherDetailsAfterHeading($, $heading);

      const dateTime = this.extractDateTime(details);
      const location = this.extractLocation(details);
      const description = this.buildDescription(details);

      if (dateTime.date) {
        events.push({
          title: headingText,
          date: dateTime.date,
          startTime: dateTime.time,
          description: description || undefined,
          url: this.config.url,
          price: this.extractPrice(details)
        });
      }
    });

    // Also try regex-based extraction from full text for events
    // that may not have heading structure
    events.push(...this.parseFromText(contentText));

    return events;
  }

  private parseJuniorCubs(
    $: cheerio.CheerioAPI,
    $content: cheerio.Cheerio<AnyNode>
  ): RawEventData[] {
    const events: RawEventData[] = [];
    const contentText = this.extractText($content);
    const lower = contentText.toLowerCase();

    if (!lower.includes('junior cubs')) return events;

    // Extract schedule details for Junior Cubs
    // Typically: "1st Saturday of each month 10:00-11:00 AM"
    const timeMatch = contentText.match(
      /junior\s+cubs.*?(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2}\s*[AP]M)/i
    ) || contentText.match(
      /(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2}\s*[AP]M).*?junior\s+cubs/i
    );

    const startTime = timeMatch ? timeMatch[1] + (timeMatch[2].match(/[AP]M/)?.[0] || ' AM') : '10:00 AM';
    const endTime = timeMatch ? timeMatch[2] : '11:00 AM';

    // Generate upcoming 1st Saturday dates for the next 6 months
    const upcomingDates = this.getFirstSaturdaysFromNow(6);

    for (const date of upcomingDates) {
      events.push({
        title: 'Junior Cubs Program',
        date,
        startTime,
        endTime,
        description: 'Nature program for ages 3-6. Includes story and craft. Held at Murphy House (501 El Dorado Street, Auburn). Free program, no RSVP required.',
        url: this.config.url,
        price: 'Free',
        type: 'workshop',
        tags: ['for-kids']
      });
    }

    return events;
  }

  private parseCampfirePrograms(
    $: cheerio.CheerioAPI,
    $content: cheerio.Cheerio<AnyNode>
  ): RawEventData[] {
    const events: RawEventData[] = [];
    const contentText = this.extractText($content);
    const lower = contentText.toLowerCase();

    if (!lower.includes('campfire program')) return events;

    // Campfire programs are seasonal (summer) - look for specific dates
    const headings = $content.find('h2, h3, h4, strong, b');
    headings.each((_, heading) => {
      const $heading = $(heading);
      const text = this.extractText($heading);
      if (/campfire/i.test(text)) {
        const details = this.gatherDetailsAfterHeading($, $heading);
        const dateTime = this.extractDateTime(details);

        if (dateTime.date) {
          events.push({
            title: text || 'Campfire Program',
            date: dateTime.date,
            startTime: dateTime.time,
            description: 'Interactive educational campfire program led by park staff and volunteers. Typically lasts one hour.',
            url: this.config.url,
            price: 'Free',
            type: 'special'
          });
        }
      }
    });

    return events;
  }

  private gatherDetailsAfterHeading(
    $: cheerio.CheerioAPI,
    $heading: cheerio.Cheerio<AnyNode>
  ): string {
    const parts: string[] = [];
    let $next = $heading.parent().next();

    // If heading is inside a <p> or <strong>, walk siblings at parent level
    if ($heading.is('strong, b')) {
      $next = $heading.parent().next();
    }

    let count = 0;
    while ($next.length > 0 && count < 10) {
      const tagName = ($next.prop('tagName') || '').toLowerCase();
      // Stop at next heading
      if (['h1', 'h2', 'h3', 'h4'].includes(tagName)) break;

      const text = this.extractText($next);
      // Stop if we hit another event-like heading in bold/strong
      if ($next.find('strong, b').length > 0) {
        const strongText = this.extractText($next.find('strong, b').first());
        if (this.isEventHeading(strongText) && count > 0) break;
      }

      if (text) parts.push(text);
      $next = $next.next();
      count++;
    }

    return parts.join(' ');
  }

  private isEventHeading(text: string): boolean {
    if (!text || text.length < 3 || text.length > 200) return false;
    const lower = text.toLowerCase();
    const eventKeywords = [
      'hike', 'walk', 'trail', 'trek', 'loop',
      'cubs', 'campfire', 'program', 'tour',
      'creek', 'canyon', 'ridge', 'newt',
      'nature', 'bird', 'wildflower'
    ];
    return eventKeywords.some(kw => lower.includes(kw));
  }

  private extractDateTime(text: string): { date: string | undefined; time: string | undefined } {
    let date: string | undefined = undefined;
    let time: string | undefined = undefined;

    // Match full dates: "Saturday, March 7, 2026" or "March 7, 2026"
    const fullDateMatch = text.match(
      /(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*,?\s+)?(\w+ \d{1,2},?\s+\d{4})/i
    );
    if (fullDateMatch) {
      date = fullDateMatch[1];
    }

    // Match month day without year: "March 7" or "March 18"
    if (!date) {
      const shortDateMatch = text.match(
        /(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*,?\s+)?(\w+ \d{1,2})(?:st|nd|rd|th)?(?!\s*,?\s*\d{4})/i
      );
      if (shortDateMatch) {
        const months = ['january', 'february', 'march', 'april', 'may', 'june',
          'july', 'august', 'september', 'october', 'november', 'december'];
        const firstWord = shortDateMatch[1].split(' ')[0].toLowerCase();
        if (months.includes(firstWord)) {
          date = shortDateMatch[1];
        }
      }
    }

    // Match time: "9:00 AM", "10:00-11:00 AM"
    const timeMatch = text.match(/(\d{1,2}:\d{2}\s*[AP]M)/i);
    if (timeMatch) {
      time = timeMatch[1];
    }

    return { date, time };
  }

  private extractLocation(text: string): string | null {
    // Match location patterns like "Location: ..." or addresses
    const locationMatch = text.match(
      /(?:location|meet|trailhead|parking)[:\s]+([^.]+)/i
    );
    return locationMatch ? locationMatch[1].trim() : null;
  }

  private extractPrice(text: string): string | undefined {
    if (/free/i.test(text)) return 'Free';
    const priceMatch = text.match(/\$(\d+)/);
    if (priceMatch) return `$${priceMatch[1]} parking fee`;
    return undefined;
  }

  private buildDescription(text: string): string {
    // Truncate to a reasonable description length
    if (text.length > 500) {
      return text.substring(0, 497) + '...';
    }
    return text;
  }

  private parseFromText(text: string): RawEventData[] {
    const events: RawEventData[] = [];

    // Match patterns like "Event Name - Saturday, March 7, 2026 at 9:00 AM"
    const eventPattern = /([A-Z][A-Za-z\s]+?)(?:\s*[-–]\s*|\s+on\s+)(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*,?\s+)?(\w+ \d{1,2},?\s+\d{4})\s+(?:at\s+)?(\d{1,2}:\d{2}\s*[AP]M)/gi;

    let match;
    while ((match = eventPattern.exec(text)) !== null) {
      const title = match[1].trim();
      if (title.length > 3 && this.isEventHeading(title)) {
        events.push({
          title,
          date: match[2],
          startTime: match[3],
          url: this.config.url
        });
      }
    }

    return events;
  }

  private getFirstSaturdaysFromNow(months: number): string[] {
    const dates: string[] = [];
    const now = new Date();

    for (let i = 0; i < months; i++) {
      const year = now.getFullYear();
      const month = now.getMonth() + i;
      const targetYear = year + Math.floor(month / 12);
      const targetMonth = month % 12;

      // Find first Saturday of the month
      const firstDay = new Date(targetYear, targetMonth, 1);
      const dayOfWeek = firstDay.getDay(); // 0=Sun, 6=Sat
      const firstSaturday = dayOfWeek <= 6
        ? new Date(targetYear, targetMonth, 1 + ((6 - dayOfWeek) % 7))
        : firstDay;

      // Skip if in the past
      if (firstSaturday >= now) {
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        dates.push(`${monthNames[targetMonth]} ${firstSaturday.getDate()}, ${targetYear}`);
      }
    }

    return dates;
  }
}

export default AuburnSraScraper;
