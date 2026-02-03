import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';
import { Event } from '../types';
import { logger } from '../utils/logger';

/**
 * Validates and sanitizes a URL for safe inclusion in Markdown.
 * Only allows http/https URLs to prevent javascript: and other injection attacks.
 */
function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      // Encode special markdown characters in the URL
      return parsed.href.replace(/[()]/g, encodeURIComponent);
    }
    return null;
  } catch {
    return null;
  }
}

export interface MarkdownOutputOptions {
  outputDir?: string;
  filename?: string;
}

export class MarkdownOutput {
  private outputDir: string;
  private filename: string;

  constructor(options: MarkdownOutputOptions = {}) {
    this.outputDir = options.outputDir || path.join(process.cwd(), 'output');
    this.filename = options.filename || 'README.md';
  }

  async write(events: Event[]): Promise<string> {
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const content = this.generateMarkdown(events);
    const outputPath = path.join(this.outputDir, this.filename);

    fs.writeFileSync(outputPath, content, 'utf-8');
    logger.info(`Wrote summary to ${outputPath}`);

    return outputPath;
  }

  private generateMarkdown(events: Event[]): string {
    const lines: string[] = [];
    const now = new Date();

    // Header
    lines.push('# Local Events');
    lines.push('');
    lines.push(`*Last updated: ${format(now, 'MMMM d, yyyy \'at\' h:mm a')}*`);
    lines.push('');

    // Stats
    lines.push('## Summary');
    lines.push('');
    lines.push(this.generateStats(events));
    lines.push('');

    // Events by Date
    lines.push('## Upcoming Events');
    lines.push('');
    lines.push(this.generateEventsByDate(events));

    // Events by Venue
    lines.push('## Events by Venue');
    lines.push('');
    lines.push(this.generateEventsByVenue(events));

    // Events by Type
    lines.push('## Events by Type');
    lines.push('');
    lines.push(this.generateEventsByType(events));

    return lines.join('\n');
  }

  private generateStats(events: Event[]): string {
    const venues = [...new Set(events.map(e => e.venue.name))];
    const types = [...new Set(events.map(e => e.type).filter(Boolean))];
    const recurring = events.filter(e => e.isRecurring).length;

    const lines: string[] = [];
    lines.push(`- **Total Events**: ${events.length}`);
    lines.push(`- **Venues**: ${venues.length}`);
    lines.push(`- **Event Types**: ${types.length}`);
    lines.push(`- **Recurring Events**: ${recurring}`);

    return lines.join('\n');
  }

  private generateEventsByDate(events: Event[]): string {
    const sortedEvents = [...events].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Group by date
    const byDate = new Map<string, Event[]>();
    for (const event of sortedEvents) {
      const dateKey = event.date.split('T')[0];
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, []);
      }
      byDate.get(dateKey)!.push(event);
    }

    const lines: string[] = [];

    for (const [dateKey, dateEvents] of byDate) {
      const date = new Date(dateKey);
      const dateStr = format(date, 'EEEE, MMMM d, yyyy');

      lines.push(`### ${dateStr}`);
      lines.push('');

      for (const event of dateEvents) {
        const time = event.startTime ? ` at ${event.startTime}` : '';
        const venue = event.venue.name;
        const safeUrl = event.url ? sanitizeUrl(event.url) : null;
        const link = safeUrl ? ` ([details](${safeUrl}))` : '';

        lines.push(`- **${event.title}**${time} - ${venue}${link}`);

        if (event.description) {
          const shortDesc = event.description.length > 100
            ? event.description.substring(0, 100) + '...'
            : event.description;
          lines.push(`  - ${shortDesc}`);
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  private generateEventsByVenue(events: Event[]): string {
    // Group by venue
    const byVenue = new Map<string, Event[]>();
    for (const event of events) {
      const venue = event.venue.name;
      if (!byVenue.has(venue)) {
        byVenue.set(venue, []);
      }
      byVenue.get(venue)!.push(event);
    }

    const lines: string[] = [];

    // Sort venues alphabetically
    const sortedVenues = [...byVenue.keys()].sort();

    for (const venue of sortedVenues) {
      const venueEvents = byVenue.get(venue)!;
      const firstEvent = venueEvents[0];

      lines.push(`### ${venue}`);
      lines.push('');

      if (firstEvent.venue.address) {
        const addr = [
          firstEvent.venue.address,
          firstEvent.venue.city,
          firstEvent.venue.state
        ].filter(Boolean).join(', ');
        lines.push(`*${addr}*`);
        lines.push('');
      }

      // Sort events by date
      venueEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      for (const event of venueEvents) {
        const date = format(new Date(event.date), 'MMM d');
        const time = event.startTime ? ` at ${event.startTime}` : '';
        lines.push(`- **${date}**: ${event.title}${time}`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  private generateEventsByType(events: Event[]): string {
    // Group by type
    const byType = new Map<string, Event[]>();
    for (const event of events) {
      const type = event.type || 'other';
      if (!byType.has(type)) {
        byType.set(type, []);
      }
      byType.get(type)!.push(event);
    }

    const lines: string[] = [];

    // Sort types by count
    const sortedTypes = [...byType.entries()].sort((a, b) => b[1].length - a[1].length);

    for (const [type, typeEvents] of sortedTypes) {
      const typeTitle = type.charAt(0).toUpperCase() + type.slice(1);
      lines.push(`### ${typeTitle} (${typeEvents.length})`);
      lines.push('');

      // Sort by date
      typeEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      for (const event of typeEvents.slice(0, 10)) { // Limit to 10 per type
        const date = format(new Date(event.date), 'MMM d');
        lines.push(`- **${date}**: ${event.title} at ${event.venue.name}`);
      }

      if (typeEvents.length > 10) {
        lines.push(`- *...and ${typeEvents.length - 10} more*`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }
}

export const markdownOutput = new MarkdownOutput();
export default markdownOutput;
