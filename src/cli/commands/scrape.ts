import { Command } from 'commander';
import { ScraperRegistry } from '../../scrapers/registry';
import { Event, ScraperResult, StalenessReport } from '../../types';
import { writeOutputs, OutputFormat } from '../../outputs';
import { deduplicator } from '../../utils/deduplicator';
import { logger } from '../../utils/logger';
import { VenueStatusManager } from '../../utils/venue-status-manager';
import { closeBrowserClient } from '../../utils/browser-client';

export const scrapeCommand = new Command('scrape')
  .description('Scrape events from venues')
  .option('-a, --all', 'Scrape all enabled venues')
  .option('-v, --venue <id>', 'Scrape a specific venue')
  .option('-o, --output <formats>', 'Output formats (json,csv,ics,markdown,all)', 'all')
  .option('-d, --dry-run', 'Run without writing files')
  .option('--include-past', 'Include past events (default: only current/future events)')
  .option('--skip-stale', 'Skip venues recommended for disabling')
  .option('--staleness-report', 'Show detailed staleness report')
  .option('--verbose', 'Enable verbose logging')
  .action(async (options) => {
    if (options.verbose) {
      logger.level = 'debug';
    }

    const registry = new ScraperRegistry();
    const statusManager = new VenueStatusManager();
    const results: ScraperResult[] = [];
    let allEvents: Event[] = [];
    const scrapeDate = new Date();

    if (options.venue) {
      // Scrape single venue
      const scraper = registry.createScraper(options.venue);
      if (!scraper) {
        console.error(`Unknown venue: ${options.venue}`);
        console.log('\nAvailable venues:');
        registry.listVenues().forEach(v => {
          console.log(`  ${v.id} - ${v.name} (${v.platform})`);
        });
        process.exit(1);
      }

      const config = registry.getConfig(options.venue);
      console.log(`Scraping ${options.venue}...`);
      const result = await scraper.scrape();
      results.push(result);

      const futureEvents = statusManager.filterFutureEvents(result.events, scrapeDate);
      await statusManager.updateVenueStatus(
        options.venue,
        config?.name ?? options.venue,
        result.events,
        futureEvents,
        scrapeDate
      );

      allEvents = options.includePast ? result.events : futureEvents;
      console.log(`  Found ${result.events.length} total, ${futureEvents.length} current/future`);
    } else if (options.all) {
      // Scrape all enabled venues
      let configs = registry.getEnabledConfigs();

      // Skip stale venues if requested
      if (options.skipStale) {
        const preStalenessReports = await statusManager.generateStalenessReport(scrapeDate);
        const staleVenueIds = new Set(
          preStalenessReports
            .filter(r => r.recommendation === 'disable')
            .map(r => r.venueId)
        );

        const skipped = configs.filter(c => staleVenueIds.has(c.id));
        configs = configs.filter(c => !staleVenueIds.has(c.id));

        if (skipped.length > 0) {
          console.log(`Skipping ${skipped.length} stale venues: ${skipped.map(c => c.name).join(', ')}\n`);
        }
      }

      console.log(`Scraping ${configs.length} venues...\n`);

      for (const config of configs) {
        const scraper = registry.createScraper(config.id);
        if (!scraper) {
          logger.warn(`Could not create scraper for ${config.id}`);
          continue;
        }

        process.stdout.write(`  ${config.name}... `);
        try {
          const result = await scraper.scrape();
          results.push(result);

          if (result.success) {
            const futureEvents = statusManager.filterFutureEvents(result.events, scrapeDate);
            await statusManager.updateVenueStatus(
              config.id,
              config.name,
              result.events,
              futureEvents,
              scrapeDate
            );

            const eventsToKeep = options.includePast ? result.events : futureEvents;
            console.log(`${result.events.length} total, ${futureEvents.length} current/future`);
            allEvents.push(...eventsToKeep);
          } else {
            await statusManager.updateVenueStatus(
              config.id,
              config.name,
              [],
              [],
              scrapeDate
            );
            console.log(`failed: ${result.errors[0]?.message}`);
          }
        } catch (error) {
          console.log(`error: ${error}`);
        }
      }
    } else {
      console.error('Please specify --all or --venue <id>');
      process.exit(1);
    }

    // Deduplicate events
    console.log(`\nTotal events to save: ${allEvents.length}`);
    allEvents = deduplicator.deduplicate(allEvents);
    console.log(`After deduplication: ${allEvents.length}`);

    // Print summary
    printSummary(results, allEvents);

    // Print staleness report
    const stalenessReports = await statusManager.generateStalenessReport(scrapeDate);
    if (options.stalenessReport) {
      console.log(statusManager.formatStalenessReport(stalenessReports));
    } else {
      printStalenessOverview(stalenessReports);
    }

    // Save venue status
    if (!options.dryRun) {
      await statusManager.save();
    }

    // Write outputs
    if (!options.dryRun && allEvents.length > 0) {
      const formats = options.output.split(',') as OutputFormat[];
      console.log(`\nWriting outputs (${formats.join(', ')})...`);

      const outputPaths = await writeOutputs(allEvents, { formats });

      console.log('\nOutput files:');
      for (const [format, path] of Object.entries(outputPaths)) {
        console.log(`  ${format}: ${path}`);
      }
    } else if (options.dryRun) {
      console.log('\nDry run - no files written');
    } else if (allEvents.length === 0) {
      console.log('\nNo current/future events to save');
    }

    // Clean up browser if used
    await closeBrowserClient();
  });

function printSummary(results: ScraperResult[], events: Event[]): void {
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log('\n--- Summary ---');
  console.log(`Venues scraped: ${results.length} (${successful} successful, ${failed} failed)`);
  console.log(`Total events: ${events.length}`);

  // Events by venue
  const byVenue = new Map<string, number>();
  for (const event of events) {
    const venue = event.venue.name;
    byVenue.set(venue, (byVenue.get(venue) || 0) + 1);
  }

  console.log('\nEvents by venue:');
  for (const [venue, count] of byVenue) {
    console.log(`  ${venue}: ${count}`);
  }

  // Events by type
  const byType = new Map<string, number>();
  for (const event of events) {
    const type = event.type || 'other';
    byType.set(type, (byType.get(type) || 0) + 1);
  }

  console.log('\nEvents by type:');
  for (const [type, count] of byType) {
    console.log(`  ${type}: ${count}`);
  }

  // Errors
  const allErrors = results.flatMap(r => r.errors);
  if (allErrors.length > 0) {
    console.log('\nErrors:');
    for (const error of allErrors) {
      console.log(`  ${error.code}: ${error.message}`);
    }
  }

  // Warnings
  const allWarnings = results.flatMap(r => r.warnings);
  if (allWarnings.length > 0) {
    console.log(`\nWarnings: ${allWarnings.length}`);
    for (const warning of allWarnings.slice(0, 5)) {
      console.log(`  - ${warning}`);
    }
    if (allWarnings.length > 5) {
      console.log(`  ... and ${allWarnings.length - 5} more`);
    }
  }
}

function printStalenessOverview(reports: StalenessReport[]): void {
  const toDisable = reports.filter(r => r.recommendation === 'disable');
  const toMonitor = reports.filter(r => r.recommendation === 'monitor');

  if (toDisable.length > 0 || toMonitor.length > 0) {
    console.log('\n--- Staleness Overview ---');
    if (toDisable.length > 0) {
      console.log(`\nConsider disabling (${toDisable.length}):`);
      for (const report of toDisable) {
        const lastEvent = report.lastEventDate
          ? new Date(report.lastEventDate).toLocaleDateString()
          : 'never';
        console.log(`  ${report.venueName} - last event: ${lastEvent}`);
      }
    }
    if (toMonitor.length > 0) {
      console.log(`\nMonitor (${toMonitor.length}):`);
      for (const report of toMonitor) {
        console.log(`  ${report.venueName} - ${report.consecutiveEmptyScrapes} empty scrapes`);
      }
    }
    console.log('\nRun with --staleness-report for full details');
  }
}

export default scrapeCommand;
