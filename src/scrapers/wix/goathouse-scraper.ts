import * as cheerio from 'cheerio';
import { WixScraper } from './wix-scraper';
import { RawEventData } from '../../utils/event-normalizer';

export class GoathouseScraper extends WixScraper {
  protected async parseEvents($: cheerio.CheerioAPI): Promise<RawEventData[]> {
    const events: RawEventData[] = [];
    const currentYear = new Date().getFullYear();

    // Get all text content and look for the Food Truck Schedule section
    const bodyText = $('body').text();

    // Find the Food Truck Schedule section - stop at common section boundaries
    const scheduleMatch = bodyText.match(/Food Truck Schedule[\s\S]*?(?=Reserve Our|Hours|Contact|Newsletter|Host your|©|\bMenu\b|$)/i);
    if (!scheduleMatch) {
      this.logger.debug('Could not find Food Truck Schedule section');
      return super.parseEvents($);
    }

    const scheduleText = scheduleMatch[0];
    const lines = scheduleText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let currentMonth = '';
    const months: Record<string, number> = {
      'january': 1, 'february': 2, 'march': 3, 'april': 4,
      'may': 5, 'june': 6, 'july': 7, 'august': 8,
      'september': 9, 'october': 10, 'november': 11, 'december': 12
    };

    // First pass: collect all events to determine date range
    const rawEvents: Array<{ month: string; day: number; foodTruck: string }> = [];

    for (const line of lines) {
      // Check for month header (e.g., "January:" or "February:")
      const monthMatch = line.match(/^(january|february|march|april|may|june|july|august|september|october|november|december):?$/i);
      if (monthMatch) {
        currentMonth = monthMatch[1].toLowerCase();
        continue;
      }

      // Skip lines without a current month context
      if (!currentMonth) continue;

      // Skip "No Food Truck" and "BYOF" entries
      if (/no food truck|byof/i.test(line)) continue;

      // Parse date lines like:
      // "Sat 31: Los Pinches Tacos"
      // "Sun 1: West Coast Tacos"
      // "Thurs: 29: No Food Truck BYOF :)"
      const dateMatch = line.match(/^(?:sun|mon|tues?|wed|thurs?|fri|sat)[a-z]*:?\s*(\d{1,2}):?\s*(.+)$/i);
      if (dateMatch) {
        const day = parseInt(dateMatch[1]);
        let foodTruck = dateMatch[2].trim();

        // Clean up the food truck name - remove anything after common section markers
        foodTruck = foodTruck.split(/Reserve|Hours|Contact|Host your/i)[0].trim();

        // Skip if no food truck name or it's a "no food truck" entry
        if (!foodTruck || foodTruck.length < 2) continue;
        if (/no food truck|byof/i.test(foodTruck)) continue;

        const monthNum = months[currentMonth];
        if (!monthNum || day < 1 || day > 31) continue;

        rawEvents.push({ month: currentMonth, day, foodTruck });
      }
    }

    // Determine years for each event
    // If the schedule has future dates in a month, assume all dates in that month are current year
    const now = new Date();
    const currentMonthNum = now.getMonth() + 1;
    const currentDay = now.getDate();

    for (const { month, day, foodTruck } of rawEvents) {
      const monthNum = months[month];

      // Check if this month has any future dates in the schedule
      const monthHasFutureDates = rawEvents.some(e =>
        e.month === month && (months[e.month] > currentMonthNum ||
          (months[e.month] === currentMonthNum && e.day >= currentDay))
      );

      let year = currentYear;
      // Only roll to next year if the entire month is in the past
      if (monthNum < currentMonthNum && !monthHasFutureDates) {
        year = currentYear + 1;
      }

      const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      events.push({
        title: foodTruck,
        date: dateStr,
        description: `Food truck at Goathouse Brewing`,
        type: 'food'
      });
    }

    if (events.length > 0) {
      this.logger.debug(`Parsed ${events.length} food truck events from Goathouse schedule`);
      return events;
    }

    // Fallback to standard Wix parsing
    return super.parseEvents($);
  }
}

export default GoathouseScraper;
