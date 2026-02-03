#!/usr/bin/env node

import { Command } from 'commander';
import { scrapeCommand } from './commands/scrape';
import { validateCommand } from './commands/validate';
import { testScraperCommand } from './commands/test-scraper';
import { listCommand } from './commands/list';
import { statusCommand } from './commands/status';

const program = new Command();

program
  .name('event-scrape')
  .description('Scrape events from brewery, winery, and restaurant websites')
  .version('1.0.0');

// Add commands
program.addCommand(scrapeCommand);
program.addCommand(validateCommand);
program.addCommand(testScraperCommand);
program.addCommand(listCommand);
program.addCommand(statusCommand);

// Set scrape as default command when no command specified
program
  .argument('[command]', 'Command to run', 'help')
  .action((cmd) => {
    if (cmd === 'help' || !cmd) {
      program.help();
    }
  });

program.parse();
