import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { validateVenueConfig, VenueConfigSchema } from '../../types';
import { logger } from '../../utils/logger';

export const validateCommand = new Command('validate')
  .description('Validate venue configuration files')
  .option('-c, --config <file>', 'Validate a specific config file')
  .option('-a, --all', 'Validate all config files')
  .action(async (options) => {
    const configDir = path.join(process.cwd(), 'config', 'venues');

    if (options.config) {
      // Validate single config
      const result = validateConfigFile(options.config);
      process.exit(result ? 0 : 1);
    } else if (options.all) {
      // Validate all configs
      if (!fs.existsSync(configDir)) {
        console.error(`Config directory not found: ${configDir}`);
        process.exit(1);
      }

      const files = fs.readdirSync(configDir)
        .filter(f => f.endsWith('.json'));

      console.log(`Validating ${files.length} config files...\n`);

      let valid = 0;
      let invalid = 0;

      for (const file of files) {
        const filePath = path.join(configDir, file);
        const result = validateConfigFile(filePath);
        if (result) {
          valid++;
        } else {
          invalid++;
        }
      }

      console.log(`\n--- Results ---`);
      console.log(`Valid: ${valid}`);
      console.log(`Invalid: ${invalid}`);

      process.exit(invalid > 0 ? 1 : 0);
    } else {
      console.error('Please specify --config <file> or --all');
      process.exit(1);
    }
  });

function validateConfigFile(filePath: string): boolean {
  const filename = path.basename(filePath);

  try {
    if (!fs.existsSync(filePath)) {
      console.log(`[FAIL] ${filename}: File not found`);
      return false;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    let json: unknown;

    try {
      json = JSON.parse(content);
    } catch (e) {
      console.log(`[FAIL] ${filename}: Invalid JSON`);
      return false;
    }

    const result = VenueConfigSchema.safeParse(json);

    if (result.success) {
      console.log(`[OK] ${filename}: ${result.data.name} (${result.data.platform})`);
      return true;
    } else {
      console.log(`[FAIL] ${filename}:`);
      for (const error of result.error.errors) {
        console.log(`  - ${error.path.join('.')}: ${error.message}`);
      }
      return false;
    }
  } catch (error) {
    console.log(`[FAIL] ${filename}: ${error}`);
    return false;
  }
}

export default validateCommand;
