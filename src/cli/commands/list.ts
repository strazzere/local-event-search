import { Command } from 'commander';
import { ScraperRegistry } from '../../scrapers/registry';

export const listCommand = new Command('list')
  .description('List available venues')
  .option('--enabled', 'Show only enabled venues')
  .option('--disabled', 'Show only disabled venues')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const registry = new ScraperRegistry();
    let venues = registry.listVenues();

    if (options.enabled) {
      venues = venues.filter(v => v.enabled);
    } else if (options.disabled) {
      venues = venues.filter(v => !v.enabled);
    }

    if (options.json) {
      console.log(JSON.stringify(venues, null, 2));
      return;
    }

    console.log('Available Venues:');
    console.log('');

    const maxIdLen = Math.max(...venues.map(v => v.id.length));
    const maxNameLen = Math.max(...venues.map(v => v.name.length));

    console.log(
      'ID'.padEnd(maxIdLen + 2) +
      'Name'.padEnd(maxNameLen + 2) +
      'Platform'.padEnd(12) +
      'Status'
    );
    console.log('-'.repeat(maxIdLen + maxNameLen + 30));

    for (const venue of venues) {
      const status = venue.enabled ? 'enabled' : 'disabled';
      console.log(
        venue.id.padEnd(maxIdLen + 2) +
        venue.name.padEnd(maxNameLen + 2) +
        venue.platform.padEnd(12) +
        status
      );
    }

    console.log('');
    console.log(`Total: ${venues.length} venues`);
  });

export default listCommand;
