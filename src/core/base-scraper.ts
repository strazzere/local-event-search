import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { VenueConfig, Event, ScraperResult, ScraperError, VenueInfo } from '../types';
import { HttpClient, httpClient } from '../utils/http-client';
import { BrowserClient, getBrowserClient } from '../utils/browser-client';
import { EventNormalizer, eventNormalizer, RawEventData } from '../utils/event-normalizer';
import { logger, createVenueLogger } from '../utils/logger';
import winston from 'winston';

export abstract class BaseScraper {
  protected config: VenueConfig;
  protected http: HttpClient;
  protected normalizer: EventNormalizer;
  protected logger: winston.Logger;

  constructor(config: VenueConfig) {
    this.config = config;
    this.http = httpClient;
    this.normalizer = eventNormalizer;
    this.logger = createVenueLogger(config.id);
  }

  async scrape(): Promise<ScraperResult> {
    const startTime = Date.now();
    const errors: ScraperError[] = [];
    const warnings: string[] = [];

    this.logger.info(`Starting scrape for ${this.config.name}`);

    try {
      const html = await this.fetchContent();
      const $ = cheerio.load(html);
      const rawEvents = await this.parseEvents($);

      this.logger.info(`Found ${rawEvents.length} raw events`);

      const events: Event[] = [];
      for (const rawEvent of rawEvents) {
        const event = this.normalizer.normalizeEvent(
          rawEvent,
          this.getVenueInfo(),
          this.config.id
        );
        if (event) {
          events.push(event);
        } else {
          warnings.push(`Could not normalize event: ${rawEvent.title || 'Unknown'}`);
        }
      }

      this.logger.info(`Successfully parsed ${events.length} events`);

      return {
        success: true,
        events,
        errors,
        warnings,
        metadata: {
          venueId: this.config.id,
          venueName: this.config.name,
          url: this.config.url,
          scrapedAt: new Date().toISOString(),
          duration: Date.now() - startTime,
          version: '1.0.0'
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Scrape failed: ${errorMessage}`);

      return {
        success: false,
        events: [],
        errors: [{
          code: 'SCRAPE_ERROR',
          message: errorMessage,
          details: error
        }],
        warnings,
        metadata: {
          venueId: this.config.id,
          venueName: this.config.name,
          url: this.config.url,
          scrapedAt: new Date().toISOString(),
          duration: Date.now() - startTime,
          version: '1.0.0'
        }
      };
    }
  }

  protected async fetchContent(): Promise<string> {
    if (this.config.config?.useBrowser) {
      this.logger.info('Using browser emulation for JavaScript-rendered content');
      const browser = getBrowserClient();
      return browser.fetchContent(this.config.url, {
        waitForSelector: this.config.config?.waitForSelector,
        timeout: this.config.config?.timeout
      });
    }
    return this.http.get(this.config.url);
  }

  protected abstract parseEvents($: cheerio.CheerioAPI): Promise<RawEventData[]>;

  protected getVenueInfo(): VenueInfo {
    return {
      name: this.config.venue.name,
      address: this.config.venue.address,
      city: this.config.venue.city,
      state: this.config.venue.state,
      zip: this.config.venue.zip,
      url: this.config.url,
      phone: this.config.venue.phone
    };
  }

  protected extractText($el: cheerio.Cheerio<AnyNode>): string {
    return $el.text().trim().replace(/\s+/g, ' ');
  }

  protected extractHref(
    $el: cheerio.Cheerio<AnyNode>,
    baseUrl?: string
  ): string | undefined {
    const href = $el.attr('href');
    if (!href) return undefined;

    if (href.startsWith('http')) return href;
    if (href.startsWith('/') && baseUrl) {
      const url = new URL(baseUrl);
      return `${url.origin}${href}`;
    }
    return href;
  }

  protected extractSrc(
    $el: cheerio.Cheerio<AnyNode>,
    baseUrl?: string
  ): string | undefined {
    const src = $el.attr('src') || $el.attr('data-src') || $el.attr('data-lazy-src');
    if (!src) return undefined;

    if (src.startsWith('http')) return src;
    if (src.startsWith('//')) return `https:${src}`;
    if (src.startsWith('/') && baseUrl) {
      const url = new URL(baseUrl);
      return `${url.origin}${src}`;
    }
    return src;
  }
}

export default BaseScraper;
