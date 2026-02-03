import fs from 'fs';
import path from 'path';
import { Event } from '../types';
import { logger } from '../utils/logger';

export interface JsonOutputOptions {
  outputDir?: string;
  filename?: string;
  pretty?: boolean;
}

export interface JsonOutputMetadata {
  version: string;
  generatedAt: string;
  eventCount: number;
  venueCount: number;
  venues: string[];
}

export interface JsonOutputData {
  metadata: JsonOutputMetadata;
  events: Event[];
}

export class JsonOutput {
  private outputDir: string;
  private filename: string;
  private pretty: boolean;

  constructor(options: JsonOutputOptions = {}) {
    this.outputDir = options.outputDir || path.join(process.cwd(), 'output');
    this.filename = options.filename || 'events.json';
    this.pretty = options.pretty !== false;
  }

  async write(events: Event[]): Promise<string> {
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const venues = [...new Set(events.map(e => e.venue.name))];

    const data: JsonOutputData = {
      metadata: {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        eventCount: events.length,
        venueCount: venues.length,
        venues
      },
      events: events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    };

    const outputPath = path.join(this.outputDir, this.filename);
    const content = this.pretty
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);

    fs.writeFileSync(outputPath, content, 'utf-8');
    logger.info(`Wrote ${events.length} events to ${outputPath}`);

    return outputPath;
  }
}

export const jsonOutput = new JsonOutput();
export default jsonOutput;
