import { z } from 'zod';

/**
 * Validates CSS selector strings to prevent selector injection.
 * Allows standard CSS selector characters while blocking potentially dangerous patterns.
 */
const CssSelectorSchema = z.string().refine(
  (selector) => {
    // Max length to prevent ReDoS and resource exhaustion
    if (selector.length > 500) return false;

    // Block javascript:, data:, and other URI schemes
    if (/(?:javascript|data|vbscript):/i.test(selector)) return false;

    // Block HTML tags and script content
    if (/<[^>]*>/i.test(selector)) return false;

    // Allow standard CSS selector characters:
    // alphanumeric, dots, hashes, brackets, quotes, spaces, colons,
    // commas, >, +, ~, *, =, ^, $, |, -, _, parentheses
    const validSelectorPattern = /^[\w\s.,#\[\]'"=:>+~*^$|()@-]+$/;
    return validSelectorPattern.test(selector);
  },
  { message: 'Invalid CSS selector: contains disallowed characters or patterns' }
);

export const PlatformSchema = z.enum([
  'wordpress',
  'wix',
  'squarespace',
  'shopify',
  'spothopper',
  'godaddy',
  'custom'
]);

export type Platform = z.infer<typeof PlatformSchema>;

export const SelectorsSchema = z.object({
  eventContainer: CssSelectorSchema,
  title: CssSelectorSchema,
  date: CssSelectorSchema.optional(),
  time: CssSelectorSchema.optional(),
  description: CssSelectorSchema.optional(),
  link: CssSelectorSchema.optional(),
  image: CssSelectorSchema.optional(),
  price: CssSelectorSchema.optional()
});

export type Selectors = z.infer<typeof SelectorsSchema>;

export const VenueConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  platform: PlatformSchema,
  enabled: z.boolean().default(true),
  venue: z.object({
    name: z.string(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    phone: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional()
  }),
  selectors: SelectorsSchema.optional(),
  config: z.object({
    useBrowser: z.boolean().optional().default(false),
    waitForSelector: CssSelectorSchema.optional(),
    timeout: z.number().optional().default(30000),
    retries: z.number().optional().default(3),
    dateFormat: z.string().optional(),
    timezone: z.string().optional().default('America/Los_Angeles'),
    icsUrl: z.string().url().optional(),
    icsFilters: z.object({
      includeKeywords: z.array(z.string()).optional(),
      excludeKeywords: z.array(z.string()).optional(),
      includeCategories: z.array(z.string()).optional(),
      excludeCategories: z.array(z.string()).optional()
    }).optional(),
    wordpressRestUrl: z.string().url().optional(),
    maxDaysAhead: z.number().optional().default(60)
  }).optional().default(() => ({
    useBrowser: false,
    timeout: 30000,
    retries: 3,
    timezone: 'America/Los_Angeles',
    maxDaysAhead: 60
  })),
  customParser: z.string().optional()
});

export type VenueConfig = z.infer<typeof VenueConfigSchema>;

export function validateVenueConfig(config: unknown): VenueConfig {
  return VenueConfigSchema.parse(config);
}

export function isValidVenueConfig(config: unknown): config is VenueConfig {
  return VenueConfigSchema.safeParse(config).success;
}
