import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { BaseScraper } from '../../core/base-scraper';
import { RawEventData } from '../../utils/event-normalizer';

export class ShopifyScraper extends BaseScraper {
  protected async parseEvents($: cheerio.CheerioAPI): Promise<RawEventData[]> {
    const events: RawEventData[] = [];
    const selectors = this.config.selectors;

    // Shopify sites often use collections or custom sections for events
    const containerSelectors = selectors?.eventContainer
      ? [selectors.eventContainer]
      : [
          '.event-card',
          '.collection-product-card',
          '.product-card',
          '.grid-item',
          '[class*="event"]',
          'article'
        ];

    let $events: cheerio.Cheerio<AnyNode> | null = null;

    for (const selector of containerSelectors) {
      const found = $(selector);
      if (found.length > 0) {
        $events = found;
        this.logger.debug(`Found events using selector: ${selector}`);
        break;
      }
    }

    if ($events && $events.length > 0) {
      $events.each((_, element) => {
        const $event = $(element);
        const event = this.parseEventElement($, $event);
        if (event) {
          events.push(event);
        }
      });
    }

    // Also try to find events in page content
    if (events.length === 0) {
      const contentEvents = this.parseFromPageContent($);
      events.push(...contentEvents);
    }

    return events;
  }

  private parseEventElement(
    $: cheerio.CheerioAPI,
    $event: cheerio.Cheerio<AnyNode>
  ): RawEventData | null {
    const selectors = this.config.selectors;

    // Extract title
    const titleSelectors = selectors?.title
      ? [selectors.title]
      : ['.event-title', '.card-title', '.product-title', 'h2', 'h3'];

    let title = '';
    for (const sel of titleSelectors) {
      const $title = $event.find(sel).first();
      if ($title.length) {
        title = this.extractText($title);
        break;
      }
    }

    if (!title) return null;

    // Extract date
    const dateSelectors = selectors?.date
      ? [selectors.date]
      : ['.event-date', '.date', 'time', '[class*="date"]'];

    let dateText = '';
    for (const sel of dateSelectors) {
      const $date = $event.find(sel).first();
      if ($date.length) {
        dateText = $date.attr('datetime') || this.extractText($date);
        break;
      }
    }

    // Try to extract date from title if not found
    if (!dateText) {
      const dateMatch = title.match(/(\d{1,2}\/\d{1,2}|\w+ \d{1,2}(?:st|nd|rd|th)?)/i);
      if (dateMatch) {
        dateText = dateMatch[1];
      }
    }

    // Extract description
    const $desc = $event.find('.event-description, .card-text, .product-description, p').first();
    const description = $desc.length ? this.extractText($desc) : undefined;

    // Extract link
    const $link = $event.find('a').first();
    const url = this.extractHref($link, this.config.url);

    // Extract image
    const $img = $event.find('img').first();
    const imageUrl = this.extractSrc($img, this.config.url);

    // Extract price if available
    const $price = $event.find('.price, .event-price, [class*="price"]').first();
    const price = $price.length ? this.extractText($price) : undefined;

    return {
      title,
      date: dateText,
      description,
      url,
      imageUrl,
      price
    };
  }

  private parseFromPageContent($: cheerio.CheerioAPI): RawEventData[] {
    const events: RawEventData[] = [];

    // Look for event-like content in the page
    const pageText = $('main, .main-content, #MainContent, article').text();

    // Find date patterns followed by event info
    const eventPatterns = [
      /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*[-–]\s*([^\n]+)/g,
      /(\w+ \d{1,2}(?:st|nd|rd|th)?(?:,? \d{4})?)\s*[-–:]\s*([^\n]+)/gi
    ];

    for (const pattern of eventPatterns) {
      let match;
      while ((match = pattern.exec(pageText)) !== null) {
        const date = match[1];
        const title = match[2].trim();

        if (title && title.length > 3 && title.length < 100) {
          events.push({
            title,
            date
          });
        }
      }
    }

    return events;
  }
}

export default ShopifyScraper;
