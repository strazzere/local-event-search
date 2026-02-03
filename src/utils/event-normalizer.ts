import crypto from 'crypto';
import { Event, EventType, VenueInfo } from '../types';
import { dateParser } from './date-parser';
import { logger } from './logger';

const EVENT_TYPE_KEYWORDS: Record<EventType, string[]> = {
  trivia: ['trivia', 'quiz', 'game night', 'pub quiz'],
  music: ['music', 'live band', 'concert', 'dj', 'acoustic', 'open mic', 'karaoke', 'bingo'],
  food: ['food', 'dinner', 'brunch', 'lunch', 'food truck', 'bbq', 'taco', 'burger'],
  wine: ['wine', 'vino', 'sommelier', 'vineyard', 'wine tasting'],
  beer: ['beer', 'brew', 'ale', 'ipa', 'lager', 'stout', 'tap takeover'],
  paint: ['paint', 'art', 'canvas', 'sip and paint', 'paint & sip'],
  comedy: ['comedy', 'stand-up', 'standup', 'comedian', 'improv'],
  tasting: ['tasting', 'flight', 'sampling'],
  workshop: ['workshop', 'class', 'learn', 'education', 'seminar'],
  special: ['special', 'holiday', 'celebration', 'anniversary', 'grand opening'],
  recurring: [],
  other: []
};

export interface RawEventData {
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  description?: string;
  url?: string;
  imageUrl?: string;
  price?: string;
}

export class EventNormalizer {
  generateEventId(title: string, date: string, venue: string): string {
    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedVenue = venue.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hash = crypto
      .createHash('md5')
      .update(`${normalizedTitle}-${date}-${normalizedVenue}`)
      .digest('hex')
      .substring(0, 8);
    return `evt-${hash}`;
  }

  detectEventType(title: string, description?: string): EventType {
    const text = `${title} ${description || ''}`.toLowerCase();

    for (const [type, keywords] of Object.entries(EVENT_TYPE_KEYWORDS)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return type as EventType;
      }
    }

    return 'other';
  }

  extractTags(title: string, description?: string): string[] {
    const text = `${title} ${description || ''}`.toLowerCase();
    const tags: Set<string> = new Set();

    for (const [type, keywords] of Object.entries(EVENT_TYPE_KEYWORDS)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          tags.add(type);
          break;
        }
      }
    }

    // Add day-of-week tags for recurring events
    const dayMatch = text.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?/gi);
    if (dayMatch) {
      tags.add(dayMatch[0].toLowerCase().replace(/s$/, ''));
    }

    return Array.from(tags);
  }

  normalizeEvent(
    rawData: RawEventData,
    venue: VenueInfo,
    source: string
  ): Event | null {
    try {
      if (!rawData.title) {
        logger.warn('Event missing title, skipping');
        return null;
      }

      const date = rawData.date ? dateParser.parseDate(rawData.date) : null;
      if (!date) {
        logger.warn(`Could not parse date for event "${rawData.title}": ${rawData.date}`);
        return null;
      }

      const dateStr = dateParser.toISOString(date);
      const id = this.generateEventId(rawData.title, dateStr, venue.name);
      const eventType = this.detectEventType(rawData.title, rawData.description);
      const tags = this.extractTags(rawData.title, rawData.description);
      const recurringPattern = rawData.date ? dateParser.detectRecurringPattern(rawData.date) : null;

      const event: Event = {
        id,
        title: this.normalizeTitle(rawData.title),
        description: rawData.description?.trim(),
        date: dateStr,
        startTime: rawData.startTime,
        endTime: rawData.endTime,
        venue,
        type: eventType,
        tags,
        url: rawData.url,
        imageUrl: rawData.imageUrl,
        price: rawData.price,
        isRecurring: !!recurringPattern,
        recurringPattern: recurringPattern || undefined,
        scrapedAt: new Date().toISOString(),
        source,
        confidence: this.calculateConfidence(rawData)
      };

      return event;
    } catch (error) {
      logger.error(`Error normalizing event: ${error}`);
      return null;
    }
  }

  private normalizeTitle(title: string): string {
    return title
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^[–—-]\s*/, '')
      .replace(/\s*[–—-]$/, '');
  }

  private calculateConfidence(data: RawEventData): number {
    let score = 0.5;

    if (data.title && data.title.length > 5) score += 0.1;
    if (data.date) score += 0.15;
    if (data.startTime) score += 0.1;
    if (data.description && data.description.length > 20) score += 0.1;
    if (data.url) score += 0.05;

    return Math.min(score, 1);
  }
}

export const eventNormalizer = new EventNormalizer();
export default eventNormalizer;
