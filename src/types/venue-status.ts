import { z } from 'zod';

export const VenueStatusSchema = z.object({
  venueId: z.string(),
  venueName: z.string(),
  lastScrapedAt: z.string(),
  lastEventDate: z.string().nullable(),
  hasFutureEvents: z.boolean(),
  futureEventCount: z.number(),
  totalEventCount: z.number(),
  consecutiveScrapesWithNoFutureEvents: z.number().default(0),
  scrapeHistory: z.array(z.object({
    scrapedAt: z.string(),
    hadFutureEvents: z.boolean(),
    futureEventCount: z.number(),
    totalEventCount: z.number(),
    lastEventDate: z.string().nullable()
  })).default([]).optional()
});

export type VenueStatus = z.infer<typeof VenueStatusSchema>;

export const VenueStatusFileSchema = z.object({
  version: z.string().default('1.0.0'),
  updatedAt: z.string(),
  venues: z.record(z.string(), VenueStatusSchema)
});

export type VenueStatusFile = z.infer<typeof VenueStatusFileSchema>;

export interface StalenessReport {
  venueId: string;
  venueName: string;
  isStale: boolean;
  reason: string | null;
  lastEventDate: string | null;
  daysSinceLastEvent: number | null;
  consecutiveEmptyScrapes: number;
  recommendation: 'keep' | 'monitor' | 'disable';
}
