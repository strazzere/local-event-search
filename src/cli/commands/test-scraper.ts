import { Command } from 'commander';
import { ScraperRegistry } from '../../scrapers/registry';
import { logger } from '../../utils/logger';
import { closeBrowserClient } from '../../utils/browser-client';

export const testScraperCommand = new Command('test-scraper')
  .description('Test a scraper with verbose output')
  .argument('<venue-id>', 'The venue ID to test')
  .option('--show-html', 'Show fetched HTML content')
  .option('--show-raw', 'Show raw parsed events before normalization')
  .action(async (venueId, options) => {
    // Enable debug logging
    logger.level = 'debug';

    const registry = new ScraperRegistry();
    const config = registry.getConfig(venueId);

    if (!config) {
      console.error(`Unknown venue: ${venueId}`);
      console.log('\nAvailable venues:');
      registry.listVenues().forEach(v => {
        console.log(`  ${v.id} - ${v.name}`);
      });
      process.exit(1);
    }

    console.log('=== Venue Configuration ===');
    console.log(JSON.stringify(config, null, 2));
    console.log('');

    const scraper = registry.createScraper(venueId);
    if (!scraper) {
      console.error(`Could not create scraper for ${venueId}`);
      process.exit(1);
    }

    console.log('=== Starting Scrape ===');
    console.log(`URL: ${config.url}`);
    console.log('');

    try {
      const result = await scraper.scrape();

      console.log('=== Scrape Result ===');
      console.log(`Success: ${result.success}`);
      console.log(`Events found: ${result.events.length}`);
      console.log(`Duration: ${result.metadata.duration}ms`);
      console.log('');

      if (result.errors.length > 0) {
        console.log('=== Errors ===');
        for (const error of result.errors) {
          console.log(`  ${error.code}: ${error.message}`);
        }
        console.log('');
      }

      if (result.warnings.length > 0) {
        console.log('=== Warnings ===');
        for (const warning of result.warnings) {
          console.log(`  - ${warning}`);
        }
        console.log('');
      }

      if (result.events.length > 0) {
        console.log('=== Events ===');
        for (const event of result.events) {
          console.log('');
          console.log(`Title: ${event.title}`);
          console.log(`Date: ${event.date}`);
          if (event.startTime) console.log(`Time: ${event.startTime}`);
          console.log(`Type: ${event.type || 'unknown'}`);
          console.log(`Tags: ${event.tags.join(', ') || 'none'}`);
          if (event.description) {
            const shortDesc = event.description.length > 100
              ? event.description.substring(0, 100) + '...'
              : event.description;
            console.log(`Description: ${shortDesc}`);
          }
          if (event.url) console.log(`URL: ${event.url}`);
          console.log(`Confidence: ${(event.confidence * 100).toFixed(0)}%`);
          console.log('---');
        }
      }

    } catch (error) {
      console.error('Scrape failed:', error);
      process.exit(1);
    } finally {
      await closeBrowserClient();
    }
  });

export default testScraperCommand;
