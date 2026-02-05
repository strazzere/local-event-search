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

        // Handle multiple events concatenated (e.g., "12pSenior Burger6pTrivia Night")
        // Split on time patterns
        const eventParts = eventText.split(/(?=\d{1,2}(?:p|pm|a|am))/i).filter(p => p.trim());

        for (const part of eventParts) {
          const trimmedPart = part.trim();
          if (!trimmedPart || trimmedPart.length < 3) continue;

          // Parse time and title from format like "12pSenior Burger"
          const timeMatch = trimmedPart.match(/^(\d{1,2})(?:p|pm|a|am)\s*(.*)$/i);

          let title: string;
          let startTime: string | undefined;

          if (timeMatch) {
            const hour = parseInt(timeMatch[1]);
            title = timeMatch[2].trim();
            // Convert to 12-hour format with PM (most events are afternoon/evening)
            startTime = hour <= 12 ? `${hour}:00 PM` : `${hour - 12}:00 PM`;
          } else {
            title = trimmedPart;
          }

          // Skip if title is just a time or too short
          if (!title || title.length < 3 || /^\d+p?m?$/i.test(title)) continue;

          // Skip if title looks like just a number
          if (/^\d+$/.test(title)) continue;

          // Skip "closing" events (e.g., "Closing at 5pm")
          if (/closing/i.test(title)) continue;

          const key = `${dateStr}:${title}:${startTime || ''}`;
          if (seenEvents.has(key)) continue;
          seenEvents.add(key);

          // Determine event type based on title
          let eventType: 'food' | 'paint' | 'trivia' = 'food';
          const lowerTitle = title.toLowerCase();
          if (lowerTitle.includes('paint')) {
            eventType = 'paint';
          } else if (lowerTitle.includes('trivia')) {
            eventType = 'trivia';
          }

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
