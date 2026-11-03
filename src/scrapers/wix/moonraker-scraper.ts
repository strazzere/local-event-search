import * as cheerio from 'cheerio';
import { WixScraper } from './wix-scraper';
import { RawEventData } from '../../utils/event-normalizer';
import { getBrowserClient } from '../../utils/browser-client';

export class MoonrakerScraper extends WixScraper {
  protected async fetchContent(): Promise<string> {
    // Moonraker requires special handling for age verification and iframe
    const browser = getBrowserClient();
    return browser.fetchWithAgeVerification(
      this.config.url,
      {
        waitForSelector: 'iframe[src*="boomte.ch"]',
        timeout: this.config.config?.timeout || 45000,
        ageVerificationSelector: 'text=Yes, I am!'
      }
    );
  }

  protected async parseEvents($: cheerio.CheerioAPI): Promise<RawEventData[]> {
    const events: RawEventData[] = [];

    // Parse the Boomtech/FullCalendar format from iframe content
    const calendarEvents = this.parseBoomtechCalendar($);
    events.push(...calendarEvents);

    if (events.length > 0) {
      return events;
    }

    // Fallback to standard Wix parsing
    return super.parseEvents($);
  }

  private parseBoomtechCalendar($: cheerio.CheerioAPI): RawEventData[] {
    const events: RawEventData[] = [];
    const seenEvents = new Set<string>();

    // Boomtech uses FullCalendar with data-date attributes on day cells
    // Find all day cells with date attributes
    $('[data-date], .fc-daygrid-day').each((_, dayCell) => {
      const $day = $(dayCell);
      const dateStr = $day.attr('data-date'); // Format: "2026-02-01"

      if (!dateStr) return;

      // Find all events in this day cell
      $day.find('.fc-event, .fc-daygrid-event, [class*="event"]').each((_, eventEl) => {
        const $event = $(eventEl);
        let eventText = $event.text().trim();

        if (!eventText || eventText.length < 3) return;

        // Use a regex to match all event patterns in the text
        // Match patterns like "12p Title", "6pm Title", "10:30am Title"
        // This avoids the splitting problem with "12p" being split into "1" + "2p"
        const eventPattern = /(\d{1,2})(?::(\d{2}))?(am|pm|a|p)\s*([^0-9][^\d{1,2}(?:am|pm|a|p)]{2,}?)(?=\d{1,2}(?:am|pm|a|p)|$)/gi;
        const matches = Array.from(eventText.matchAll(eventPattern));

        if (matches.length === 0) {
          // No matches found, try treating the whole text as a single event
          const singlePattern = /^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)\s*(.+)$/i;
          const singleMatch = singlePattern.exec(eventText);
          if (singleMatch) {
            matches.push(singleMatch);
          }
        }

        for (const match of matches) {
          let hour = parseInt(match[1]);
          const minutes = match[2] || '00';
          const period = match[3].toLowerCase();
          let title = match[4].trim();
          
          // Properly handle AM/PM conversion
          const isAM = period === 'a' || period === 'am';
          const isPM = period === 'p' || period === 'pm';
          
          if (isPM && hour !== 12) {
            hour += 12;
          } else if (isAM && hour === 12) {
            hour = 0;
          }
          
          // Convert back to 12-hour format for display
          let displayHour = hour % 12;
          if (displayHour === 0) displayHour = 12;
          const displayPeriod = hour >= 12 ? 'PM' : 'AM';
          const startTime = `${displayHour}:${minutes} ${displayPeriod}`;

          // Clean up title - remove trailing time patterns and numbers
          title = title.replace(/\d{1,2}(?::\d{2})?(?:am|pm|a|p)?$/i, '').trim();
          
          // Skip if title is too short, just a number, or contains noise
          if (!title || title.length < 3) continue;
          if (/^\d+$/.test(title)) continue;
          if (/^(?:closing|closed|open)/i.test(title)) continue;

          const key = `${dateStr}:${title}:${startTime}`;
          if (seenEvents.has(key)) continue;
          seenEvents.add(key);

          // Determine event type based on title keywords
          const eventType = this.detectBoomtechEventType(title);

          events.push({
            title,
            date: dateStr,
            startTime,
            type: eventType
          });
        }
      });
    });

    // Deduplicate - FullCalendar often has multiple DOM elements per event
    const uniqueEvents = this.deduplicateEvents(events);

    this.logger.debug(`Parsed ${uniqueEvents.length} events from Boomtech calendar`);
    return uniqueEvents;
  }

  private detectBoomtechEventType(title: string): 'food' | 'music' | 'paint' | 'trivia' | 'other' {
    const lower = title.toLowerCase();
    
    // Check for music events
    if (lower.includes('live music') || lower.includes('band') || 
        lower.includes('acoustic') || lower.includes('karaoke') ||
        lower.includes('dj ') || lower.includes('concert')) {
      return 'music';
    }
    
    // Check for trivia
    if (lower.includes('trivia')) {
      return 'trivia';
    }
    
    // Check for paint events
    if (lower.includes('paint')) {
      return 'paint';
    }
    
    // Check for food trucks and food events
    if (lower.includes('food truck') || lower.includes('truck') || 
        lower.includes('taco') || lower.includes('burger') ||
        lower.includes('bbq') || lower.includes('cuisine') ||
        lower.includes('hot dog')) {
      return 'food';
    }
    
    return 'other';
  }

  private deduplicateEvents(events: RawEventData[]): RawEventData[] {
    const seen = new Map<string, RawEventData>();

    for (const event of events) {
      const key = `${event.date}:${event.title}`;
      if (!seen.has(key)) {
        seen.set(key, event);
      }
    }

    return Array.from(seen.values());
  }
}

export default MoonrakerScraper;
