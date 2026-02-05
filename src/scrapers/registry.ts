import fs from 'fs';
import path from 'path';
import { VenueConfig, validateVenueConfig } from '../types';
import { BaseScraper } from '../core/base-scraper';
import { logger } from '../utils/logger';

// Import all scrapers
import { WordPressScraper, MindscapeScraper, HappyDayzScraper } from './wordpress';
import { SquarespaceScraper, OmakaseScraper } from './squarespace';
import { ShopifyScraper } from './shopify';
import { SpotHopperScraper } from './spothopper';
import { WixScraper, MoonrakerScraper } from './wix';
import { BuenosAiresScraper, MoksaScraper, GenericScraper } from './custom';

type ScraperClass = new (config: VenueConfig) => BaseScraper;

const SCRAPER_MAP: Record<string, ScraperClass> = {
  // Platform-based scrapers
  'wordpress': WordPressScraper,
  'squarespace': SquarespaceScraper,
  'shopify': ShopifyScraper,
  'spothopper': SpotHopperScraper,
  'wix': WixScraper,
  'godaddy': BuenosAiresScraper, // GoDaddy uses custom parsing
  'custom': GenericScraper,

  // Custom scrapers for specific venues
  'mindscape-fermentations': MindscapeScraper,
  'omakase-por-favor': OmakaseScraper,
  'buenos-aires-grill': BuenosAiresScraper,
  'moksa-brewing': MoksaScraper,
  'moksa': MoksaScraper,
  'moonraker-brewing': MoonrakerScraper,
  'happy-dayz-vineyard': HappyDayzScraper
};

export class ScraperRegistry {
  private configs: Map<string, VenueConfig> = new Map();
  private configDir: string;

  constructor(configDir?: string) {
    this.configDir = configDir || path.join(process.cwd(), 'config', 'venues');
    this.loadConfigs();
  }

  private loadConfigs(): void {
    if (!fs.existsSync(this.configDir)) {
      logger.warn(`Config directory not found: ${this.configDir}`);
      return;
    }

    const files = fs.readdirSync(this.configDir)
      .filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const filePath = path.join(this.configDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const rawConfig = JSON.parse(content);
        const config = validateVenueConfig(rawConfig);

        this.configs.set(config.id, config);
        logger.debug(`Loaded config: ${config.id}`);
      } catch (error) {
        logger.error(`Failed to load config ${file}: ${error}`);
      }
    }

    logger.info(`Loaded ${this.configs.size} venue configs`);
  }

  getConfig(venueId: string): VenueConfig | undefined {
    return this.configs.get(venueId);
  }

  getAllConfigs(): VenueConfig[] {
    return Array.from(this.configs.values());
  }

  getEnabledConfigs(): VenueConfig[] {
    return this.getAllConfigs().filter(c => c.enabled);
  }

  createScraper(venueId: string): BaseScraper | null {
    const config = this.configs.get(venueId);
    if (!config) {
      logger.error(`No config found for venue: ${venueId}`);
      return null;
    }

    // Try venue-specific scraper first
    let ScraperClass = SCRAPER_MAP[venueId];

    // Fall back to platform scraper
    if (!ScraperClass) {
      ScraperClass = SCRAPER_MAP[config.platform];
    }

    // Fall back to custom parser if specified
    if (!ScraperClass && config.customParser) {
      ScraperClass = SCRAPER_MAP[config.customParser];
    }

    if (!ScraperClass) {
      logger.error(`No scraper found for venue ${venueId} (platform: ${config.platform})`);
      return null;
    }

    return new ScraperClass(config);
  }

  listVenues(): { id: string; name: string; enabled: boolean; platform: string }[] {
    return this.getAllConfigs().map(c => ({
      id: c.id,
      name: c.name,
      enabled: c.enabled,
      platform: c.platform
    }));
  }

  registerScraper(key: string, scraperClass: ScraperClass): void {
    SCRAPER_MAP[key] = scraperClass;
  }
}

export const registry = new ScraperRegistry();
export default registry;
