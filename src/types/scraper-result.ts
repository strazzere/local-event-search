import { z } from 'zod';
import { EventSchema } from './event';

export const ScraperErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional()
});

export type ScraperError = z.infer<typeof ScraperErrorSchema>;

export const ScraperMetadataSchema = z.object({
  venueId: z.string(),
  venueName: z.string(),
  url: z.string(),
  scrapedAt: z.string(),
  duration: z.number(),
  version: z.string().default('1.0.0')
});

export type ScraperMetadata = z.infer<typeof ScraperMetadataSchema>;

export const ScraperResultSchema = z.object({
  success: z.boolean(),
  events: z.array(EventSchema),
  errors: z.array(ScraperErrorSchema).default([]),
  warnings: z.array(z.string()).default([]),
  metadata: ScraperMetadataSchema
});

export type ScraperResult = z.infer<typeof ScraperResultSchema>;

export function createSuccessResult(
  events: z.infer<typeof EventSchema>[],
  metadata: ScraperMetadata,
  warnings: string[] = []
): ScraperResult {
  return {
    success: true,
    events,
    errors: [],
    warnings,
    metadata
  };
}

export function createErrorResult(
  errors: ScraperError[],
  metadata: ScraperMetadata
): ScraperResult {
  return {
    success: false,
    events: [],
    errors,
    warnings: [],
    metadata
  };
}
