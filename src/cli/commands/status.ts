import { Command } from 'commander';
import { promises as fs } from 'fs';
import path from 'path';
import { VenueStatusManager } from '../../utils/venue-status-manager';
import { ScraperRegistry } from '../../scrapers/registry';

export const statusCommand = new Command('status')
  .description('View and manage venue staleness status')
  .option('-d, --disable-stale', 'Disable venues recommended for disabling')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    const statusManager = new VenueStatusManager();
    const registry = new ScraperRegistry();

    const reports = await statusManager.generateStalenessReport();

    if (options.json) {
      console.log(JSON.stringify(reports, null, 2));
      return;
    }

    console.log(statusManager.formatStalenessReport(reports));

    if (options.disableStale) {
      const toDisable = reports.filter(r => r.recommendation === 'disable');

      if (toDisable.length === 0) {
        console.log('\nNo venues to disable.');
        return;
      }

      console.log(`\nDisabling ${toDisable.length} stale venues...`);

      for (const report of toDisable) {
        const configPath = path.join(process.cwd(), 'config', 'venues');
        const files = await fs.readdir(configPath);

        for (const file of files) {
          const filePath = path.join(configPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const config = JSON.parse(content);

          if (config.id === report.venueId) {
            config.enabled = false;
            config.disabledReason = report.reason;
            config.disabledAt = new Date().toISOString();

            await fs.writeFile(filePath, JSON.stringify(config, null, 2) + '\n');
            console.log(`  Disabled: ${report.venueName}`);
            break;
          }
        }
      }

      console.log('\nDone. Re-enable venues by setting "enabled": true in their config files.');
    }
  });

export default statusCommand;
