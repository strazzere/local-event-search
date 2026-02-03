import fs from 'fs';
import path from 'path';
import { Event } from '../types';
import { logger } from '../utils/logger';

export interface CsvOutputOptions {
  outputDir?: string;
  filename?: string;
  delimiter?: string;
}

export class CsvOutput {
  private outputDir: string;
  private filename: string;
  private delimiter: string;

  constructor(options: CsvOutputOptions = {}) {
    this.outputDir = options.outputDir || path.join(process.cwd(), 'output');
    this.filename = options.filename || 'events.csv';
    this.delimiter = options.delimiter || ',';
  }

  private escapeValue(value: string | undefined | null): string {
    if (value === undefined || value === null) return '';

    const stringValue = String(value);
    // If value contains delimiter, newline, or quotes, wrap in quotes and escape quotes
    if (stringValue.includes(this.delimiter) || stringValue.includes('\n') || stringValue.includes('"')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  }

  private flattenEvent(event: Event): Record<string, string> {
    return {
      id: event.id,
      title: event.title,
      description: event.description || '',
      date: event.date,
      startTime: event.startTime || '',
      endTime: event.endTime || '',
      venueName: event.venue.name,
      venueAddress: event.venue.address || '',
      venueCity: event.venue.city || '',
      venueState: event.venue.state || '',
      venueZip: event.venue.zip || '',
      venueUrl: event.venue.url || '',
      venuePhone: event.venue.phone || '',
      type: event.type || '',
      tags: event.tags.join('; '),
      url: event.url || '',
      imageUrl: event.imageUrl || '',
      price: event.price || '',
      isRecurring: event.isRecurring ? 'yes' : 'no',
      recurringPattern: event.recurringPattern || '',
      scrapedAt: event.scrapedAt,
      source: event.source,
      confidence: String(event.confidence)
    };
  }

  async write(events: Event[]): Promise<string> {
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Sort events by date
    const sortedEvents = [...events].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    if (sortedEvents.length === 0) {
      logger.warn('No events to write to CSV');
      return '';
    }

    // Get headers from first event
    const firstFlattened = this.flattenEvent(sortedEvents[0]);
    const headers = Object.keys(firstFlattened);

    // Build CSV content
    const lines: string[] = [];

    // Header row
    lines.push(headers.map(h => this.escapeValue(h)).join(this.delimiter));

    // Data rows
    for (const event of sortedEvents) {
      const flattened = this.flattenEvent(event);
      const values = headers.map(h => this.escapeValue(flattened[h]));
      lines.push(values.join(this.delimiter));
    }

    const content = lines.join('\n');
    const outputPath = path.join(this.outputDir, this.filename);

    fs.writeFileSync(outputPath, content, 'utf-8');
    logger.info(`Wrote ${events.length} events to ${outputPath}`);

    return outputPath;
  }
}

export const csvOutput = new CsvOutput();
export default csvOutput;
