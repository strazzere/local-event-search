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

  private areVenuesNearby(venue1: Event['venue'], venue2: Event['venue']): boolean {
    if (!venue1.lat || !venue1.lng || !venue2.lat || !venue2.lng) {
      return false;
    }

    const lat1 = venue1.lat;
    const lng1 = venue1.lng;
    const lat2 = venue2.lat;
    const lng2 = venue2.lng;

    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance < 0.5;
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
    const nearbyDuplicates: [Event, Event][] = [];

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

    const result: Event[] = [];
    const skipIds = new Set<string>();

    for (let i = 0; i < deduplicated.length; i++) {
      if (skipIds.has(deduplicated[i].id)) continue;

      let foundNearbyDupe = false;
      for (let j = i + 1; j < deduplicated.length; j++) {
        if (skipIds.has(deduplicated[j].id)) continue;

        const event1 = deduplicated[i];
        const event2 = deduplicated[j];

        if (event1.date.split('T')[0] === event2.date.split('T')[0]) {
          const title1Words = new Set(this.normalizeString(event1.title).split(' ').filter(w => w.length > 2));
          const title2Words = new Set(this.normalizeString(event2.title).split(' ').filter(w => w.length > 2));
          const intersection = new Set([...title1Words].filter(x => title2Words.has(x)));
          const union = new Set([...title1Words, ...title2Words]);
          const titleSimilarity = union.size > 0 ? intersection.size / union.size : 0;

          if (titleSimilarity > 0.7) {
            const venuesNearby = this.areVenuesNearby(event1.venue, event2.venue);
            const venuesSimilar = this.normalizeString(event1.venue.name) === this.normalizeString(event2.venue.name);

            if (venuesNearby || venuesSimilar) {
              foundNearbyDupe = true;
              duplicateCount++;
              const better = this.selectBestEvent([event1, event2]);
              if (better.id === event2.id) {
                skipIds.add(event1.id);
                if (!skipIds.has(event2.id)) {
                  result.push(event2);
                  skipIds.add(event2.id);
                }
              } else {
                skipIds.add(event2.id);
              }
              logger.debug(`Found nearby/similar duplicate: "${event1.title}" at ${event1.venue.name} and "${event2.title}" at ${event2.venue.name}`);
              break;
            }
          }
        }
      }

      if (!foundNearbyDupe && !skipIds.has(deduplicated[i].id)) {
        result.push(deduplicated[i]);
      }
    }

    if (duplicateCount > 0) {
      logger.info(`Removed ${duplicateCount} duplicate events`);
    }

    return result;
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
    // Date match required
    if (a.date !== b.date) {
      return 0;
    }

    // Venues must match exactly or be empty/generic
    if (a.venue !== b.venue) {
      // Allow matching if one venue is empty or very generic
      const genericVenues = ['', 'venue', 'location', 'various'];
      const aIsGeneric = genericVenues.includes(a.venue);
      const bIsGeneric = genericVenues.includes(b.venue);
      
      if (!aIsGeneric && !bIsGeneric) {
        return 0;
      }
    }

    // Calculate title similarity using Jaccard index
    const wordsA = new Set(a.normalizedTitle.split(' ').filter(w => w.length > 2));
    const wordsB = new Set(b.normalizedTitle.split(' ').filter(w => w.length > 2));

    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);

    if (union.size === 0) return 0;

    return intersection.size / union.size;
  }
}

export const deduplicator = new EventDeduplicator();
export default deduplicator;
