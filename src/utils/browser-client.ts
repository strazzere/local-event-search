import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { logger } from './logger';

export interface BrowserClientOptions {
  timeout?: number;
  headless?: boolean;
  userAgent?: string;
}

export interface FetchOptions {
  waitForSelector?: string;
  waitForTimeout?: number;
  timeout?: number;
}

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class BrowserClient {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private options: Required<BrowserClientOptions>;

  constructor(options: BrowserClientOptions = {}) {
    this.options = {
      timeout: options.timeout ?? 30000,
      headless: options.headless ?? true,
      userAgent: options.userAgent ?? DEFAULT_USER_AGENT
    };
  }

  async initialize(): Promise<void> {
    if (this.browser) return;

    logger.debug('Launching browser...');
    this.browser = await chromium.launch({
      headless: this.options.headless
    });

    this.context = await this.browser.newContext({
      userAgent: this.options.userAgent,
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/Los_Angeles'
    });

    logger.debug('Browser launched successfully');
  }

  async fetchContent(url: string, options: FetchOptions = {}): Promise<string> {
    await this.initialize();

    if (!this.context) {
      throw new Error('Browser context not initialized');
    }

    const page = await this.context.newPage();
    const timeout = options.timeout ?? this.options.timeout;

    try {
      logger.debug(`Browser fetching: ${url}`);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout
      });

      // Wait for network to be idle (no requests for 500ms)
      await page.waitForLoadState('networkidle', { timeout }).catch(() => {
        logger.debug('Network idle timeout, continuing...');
      });

      // Wait for specific selector if provided
      if (options.waitForSelector) {
        logger.debug(`Waiting for selector: ${options.waitForSelector}`);
        try {
          await page.waitForSelector(options.waitForSelector, {
            timeout: options.waitForTimeout ?? 10000,
            state: 'attached'
          });
          logger.debug('Selector found');
        } catch {
          logger.debug(`Selector not found: ${options.waitForSelector}, continuing with available content`);
        }
      }

      // Additional wait for any lazy-loaded content
      if (options.waitForTimeout) {
        await page.waitForTimeout(options.waitForTimeout);
      }

      // Scroll to trigger any lazy-loading
      await this.scrollPage(page);

      // Get main page HTML
      let html = await page.content();

      // Also extract content from iframes (calendar widgets, etc.)
      const iframeContent = await this.extractIframeContent(page);
      if (iframeContent) {
        // Append iframe content in a special div (comments get mangled by Cheerio)
        // Base64 encode to avoid any parsing issues
        const encoded = Buffer.from(iframeContent).toString('base64');
        html += `\n<div id="__iframe_content__" data-content="${encoded}"></div>`;
      }

      logger.debug(`Browser received ${html.length} bytes from ${url}`);

      return html;
    } finally {
      await page.close();
    }
  }

  private async extractIframeContent(page: Page): Promise<string> {
    const frames = page.frames();
    const iframeContents: string[] = [];

    for (const frame of frames) {
      const frameUrl = frame.url();
      // Skip the main frame and blank frames
      if (!frameUrl || frameUrl === 'about:blank' || frameUrl === page.url()) {
        continue;
      }

      // Look for calendar/event iframes
      if (frameUrl.includes('calendar') || frameUrl.includes('event') || frameUrl.includes('boomte')) {
        try {
          const frameHtml = await frame.content();
          if (frameHtml && frameHtml.length > 100) {
            logger.debug(`Extracted iframe content from: ${frameUrl.substring(0, 50)}...`);
            iframeContents.push(frameHtml);
          }
        } catch (e) {
          logger.debug(`Could not extract iframe content: ${e}`);
        }
      }
    }

    return iframeContents.join('\n');
  }

  private async scrollPage(page: Page): Promise<void> {
    await page.evaluate(`(async () => {
      const scrollStep = 300;
      const scrollDelay = 100;
      const maxScrolls = 10;

      for (let i = 0; i < maxScrolls; i++) {
        window.scrollBy(0, scrollStep);
        await new Promise(r => setTimeout(r, scrollDelay));

        if (window.innerHeight + window.scrollY >= document.body.scrollHeight) {
          break;
        }
      }

      // Scroll back to top
      window.scrollTo(0, 0);
    })()`);
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.debug('Browser closed');
    }
  }
}

// Singleton instance for shared use
let browserClientInstance: BrowserClient | null = null;

export function getBrowserClient(): BrowserClient {
  if (!browserClientInstance) {
    browserClientInstance = new BrowserClient();
  }
  return browserClientInstance;
}

export async function closeBrowserClient(): Promise<void> {
  if (browserClientInstance) {
    await browserClientInstance.close();
    browserClientInstance = null;
  }
}

export default BrowserClient;
