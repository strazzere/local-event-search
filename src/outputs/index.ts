export * from './json-output';
export * from './csv-output';
export * from './ics-output';
export * from './markdown-output';

import { Event } from '../types';
import { JsonOutput, JsonOutputOptions } from './json-output';
import { CsvOutput, CsvOutputOptions } from './csv-output';
import { IcsOutput, IcsOutputOptions } from './ics-output';
import { MarkdownOutput, MarkdownOutputOptions } from './markdown-output';
import { logger } from '../utils/logger';

export type OutputFormat = 'json' | 'csv' | 'ics' | 'markdown' | 'all';

export interface OutputOptions {
  outputDir?: string;
  formats?: OutputFormat[];
}

export async function writeOutputs(
  events: Event[],
  options: OutputOptions = {}
): Promise<Record<string, string>> {
  const { outputDir, formats = ['json', 'csv', 'ics', 'markdown'] } = options;
  const results: Record<string, string> = {};

  const formatList = formats.includes('all')
    ? ['json', 'csv', 'ics', 'markdown']
    : formats;

  for (const format of formatList) {
    try {
      switch (format) {
        case 'json': {
          const writer = new JsonOutput({ outputDir });
          results.json = await writer.write(events);
          break;
        }
        case 'csv': {
          const writer = new CsvOutput({ outputDir });
          results.csv = await writer.write(events);
          break;
        }
        case 'ics': {
          const writer = new IcsOutput({ outputDir });
          results.ics = await writer.write(events);
          break;
        }
        case 'markdown': {
          const writer = new MarkdownOutput({ outputDir });
          results.markdown = await writer.write(events);
          break;
        }
      }
    } catch (error) {
      logger.error(`Failed to write ${format} output: ${error}`);
    }
  }

  return results;
}
