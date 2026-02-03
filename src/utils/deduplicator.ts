import { Event } from '../types';
import { logger } from './logger';

interface EventFingerprint {
  normalizedTitle: string;
  date: string;
  venue: string;
}

export class EventDeduplicator {
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getFingerprint(event: Event): EventFingerprint {
    return {
      normalizedTitle: this.normalizeString(event.title),
      date: event.date.split('T')[0], // Just the date part
      venue: this.normalizeString(event.venue.name)
    };
  }

  private fingerprintKey(fp: EventFingerprint): string {
    return `${fp.normalizedTitle}|${fp.date}|${fp.venue}`;
  }

  private selectBestEvent(events: Event[]): Event {
    // Score each event by completeness
    const scored = events.map(event => {
      let score = 0;
      if (event.description) score += event.description.length / 100;
      if (event.startTime) score += 1;
      if (event.endTime) score += 1;
      if (event.url) score += 1;
      if (event.imageUrl) score += 1;
      if (event.price) score += 0.5;
      if (event.tags.length > 0) score += 0.5;
      score += event.confidence;
      return { event, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0].event;
  }

  deduplicate(events: Event[]): Event[] {
    const seen = new Map<string, Event[]>();

    for (const event of events) {
      const fp = this.getFingerprint(event);
      const key = this.fingerprintKey(fp);

      if (!seen.has(key)) {
        seen.set(key, []);
      }
      seen.get(key)!.push(event);
    }

    const deduplicated: Event[] = [];
    let duplicateCount = 0;

    for (const [key, eventGroup] of seen) {
      if (eventGroup.length > 1) {
        duplicateCount += eventGroup.length - 1;
        logger.debug(`Found ${eventGroup.length} duplicates for: ${key}`);
      }
      deduplicated.push(this.selectBestEvent(eventGroup));
    }

    if (duplicateCount > 0) {
      logger.info(`Removed ${duplicateCount} duplicate events`);
    }

    return deduplicated;
  }

  findSimilar(event: Event, events: Event[], threshold: number = 0.8): Event[] {
    const fp = this.getFingerprint(event);

    return events.filter(other => {
      if (event.id === other.id) return false;

      const otherFp = this.getFingerprint(other);
      const similarity = this.calculateSimilarity(fp, otherFp);

      return similarity >= threshold;
    });
  }

  private calculateSimilarity(a: EventFingerprint, b: EventFingerprint): number {
    // Exact venue and date match required
    if (a.venue !== b.venue || a.date !== b.date) {
      return 0;
    }

    // Calculate title similarity using Jaccard index
    const wordsA = new Set(a.normalizedTitle.split(' '));
    const wordsB = new Set(b.normalizedTitle.split(' '));

    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);

    return intersection.size / union.size;
  }
}

export const deduplicator = new EventDeduplicator();
export default deduplicator;
