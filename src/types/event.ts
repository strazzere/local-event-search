import { z } from 'zod';

export const EventTypeSchema = z.enum([
  'trivia',
  'music',
  'food',
  'wine',
  'beer',
  'paint',
  'comedy',
  'tasting',
  'workshop',
  'special',
  'recurring',
  'other'
]);

export type EventType = z.infer<typeof EventTypeSchema>;

export const VenueInfoSchema = z.object({
  name: z.string(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  url: z.string().url().optional(),
  phone: z.string().optional()
});

export type VenueInfo = z.infer<typeof VenueInfoSchema>;

export const EventSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  date: z.string(), // ISO date string
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  venue: VenueInfoSchema,
  type: EventTypeSchema.optional(),
  tags: z.array(z.string()).default([]),
  url: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  price: z.string().optional(),
  isRecurring: z.boolean().default(false),
  recurringPattern: z.string().optional(),
  scrapedAt: z.string(),
  source: z.string(),
  confidence: z.number().min(0).max(1).default(1)
});

export type Event = z.infer<typeof EventSchema>;

export function validateEvent(event: unknown): Event {
  return EventSchema.parse(event);
}

export function isValidEvent(event: unknown): event is Event {
  return EventSchema.safeParse(event).success;
}
