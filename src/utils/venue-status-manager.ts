import { promises as fs } from 'fs';
import path from 'path';
import { Event } from '../types';
import { VenueStatus, VenueStatusFile, StalenessReport } from '../types/venue-status';
import { logger } from './logger';

const STATUS_FILE = 'venue-status.json';
const MAX_HISTORY_ENTRIES = 10;
const STALE_DAYS_THRESHOLD = 90;
const CONSECUTIVE_EMPTY_THRESHOLD = 3;

export class VenueStatusManager {
  private outputDir: string;
  private statusFile: VenueStatusFile | null = null;

  constructor(outputDir: string = 'output') {
    this.outputDir = outputDir;
  }

  private get filePath(): string {
    return path.join(this.outputDir, STATUS_FILE);
  }

  async load(): Promise<VenueStatusFile> {
    if (this.statusFile) {
      return this.statusFile;
    }

    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      this.statusFile = JSON.parse(content) as VenueStatusFile;
    } catch {
      this.statusFile = {
        version: '1.0.0',
        updatedAt: new Date().toISOString(),
        venues: {}
      };
    }

    return this.statusFile;
  }

  async save(): Promise<void> {
    if (!this.statusFile) {
      return;
    }

    this.statusFile.updatedAt = new Date().toISOString();

    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.writeFile(
      this.filePath,
      JSON.stringify(this.statusFile, null, 2)
    );

    logger.debug(`Venue status saved to ${this.filePath}`);
  }

  filterFutureEvents(events: Event[], asOfDate: Date = new Date()): Event[] {
    const startOfDay = new Date(asOfDate);
    startOfDay.setHours(0, 0, 0, 0);

    return events.filter(event => {
      const eventDate = new Date(event.date);
      return eventDate >= startOfDay;
    });
  }

  async updateVenueStatus(
    venueId: string,
    venueName: string,
    allEvents: Event[],
    futureEvents: Event[],
    scrapedAt: Date = new Date()
  ): Promise<VenueStatus> {
    const statusFile = await this.load();

    const lastEventDate = this.findLastEventDate(allEvents);
    const hasFutureEvents = futureEvents.length > 0;

    const existingStatus = statusFile.venues[venueId];
    const previousConsecutive = existingStatus?.consecutiveScrapesWithNoFutureEvents ?? 0;

    const status: VenueStatus = {
      venueId,
      venueName,
      lastScrapedAt: scrapedAt.toISOString(),
      lastEventDate,
      hasFutureEvents,
      futureEventCount: futureEvents.length,
      totalEventCount: allEvents.length,
      consecutiveScrapesWithNoFutureEvents: hasFutureEvents ? 0 : previousConsecutive + 1,
      scrapeHistory: this.updateHistory(existingStatus?.scrapeHistory, {
        scrapedAt: scrapedAt.toISOString(),
        hadFutureEvents: hasFutureEvents,
        futureEventCount: futureEvents.length,
        totalEventCount: allEvents.length,
        lastEventDate
      })
    };

    statusFile.venues[venueId] = status;
    return status;
  }

  private findLastEventDate(events: Event[]): string | null {
    if (events.length === 0) {
      return null;
    }

    const dates = events
      .map(e => new Date(e.date))
      .filter(d => !isNaN(d.getTime()));

    if (dates.length === 0) {
      return null;
    }

    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    return maxDate.toISOString();
  }

  private updateHistory(
    existing: VenueStatus['scrapeHistory'],
    newEntry: NonNullable<VenueStatus['scrapeHistory']>[0]
  ): VenueStatus['scrapeHistory'] {
    const history = existing ? [...existing] : [];
    history.push(newEntry);

    if (history.length > MAX_HISTORY_ENTRIES) {
      return history.slice(-MAX_HISTORY_ENTRIES);
    }

    return history;
  }

  async generateStalenessReport(asOfDate: Date = new Date()): Promise<StalenessReport[]> {
    const statusFile = await this.load();
    const reports: StalenessReport[] = [];

    for (const status of Object.values(statusFile.venues)) {
      const report = this.analyzeVenueStaleness(status, asOfDate);
      reports.push(report);
    }

    return reports.sort((a, b) => {
      const order = { disable: 0, monitor: 1, keep: 2 };
      return order[a.recommendation] - order[b.recommendation];
    });
  }

  private analyzeVenueStaleness(status: VenueStatus, asOfDate: Date): StalenessReport {
    let daysSinceLastEvent: number | null = null;
    let reason: string | null = null;
    let isStale = false;
    let recommendation: StalenessReport['recommendation'] = 'keep';

    if (status.lastEventDate) {
      const lastEvent = new Date(status.lastEventDate);
      daysSinceLastEvent = Math.floor(
        (asOfDate.getTime() - lastEvent.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceLastEvent > STALE_DAYS_THRESHOLD) {
        isStale = true;
        reason = `Last event was ${daysSinceLastEvent} days ago`;
        recommendation = 'disable';
      }
    } else {
      isStale = true;
      reason = 'No events ever found';
      recommendation = status.consecutiveScrapesWithNoFutureEvents >= CONSECUTIVE_EMPTY_THRESHOLD
        ? 'disable'
        : 'monitor';
    }

    if (status.consecutiveScrapesWithNoFutureEvents >= CONSECUTIVE_EMPTY_THRESHOLD) {
      isStale = true;
      reason = reason
        ? `${reason}; ${status.consecutiveScrapesWithNoFutureEvents} consecutive scrapes with no future events`
        : `${status.consecutiveScrapesWithNoFutureEvents} consecutive scrapes with no future events`;
      recommendation = 'disable';
    } else if (status.consecutiveScrapesWithNoFutureEvents > 0 && recommendation !== 'disable') {
      recommendation = 'monitor';
    }

    return {
      venueId: status.venueId,
      venueName: status.venueName,
      isStale,
      reason,
      lastEventDate: status.lastEventDate,
      daysSinceLastEvent,
      consecutiveEmptyScrapes: status.consecutiveScrapesWithNoFutureEvents,
      recommendation
    };
  }

  async getVenueStatus(venueId: string): Promise<VenueStatus | null> {
    const statusFile = await this.load();
    return statusFile.venues[venueId] ?? null;
  }

  formatStalenessReport(reports: StalenessReport[]): string {
    const lines: string[] = ['', '--- Venue Staleness Report ---'];

    const staleVenues = reports.filter(r => r.isStale);
    const activeVenues = reports.filter(r => !r.isStale);

    if (staleVenues.length > 0) {
      lines.push(`\nStale venues (${staleVenues.length}):`);
      for (const report of staleVenues) {
        const lastEvent = report.lastEventDate
          ? new Date(report.lastEventDate).toLocaleDateString()
          : 'never';
        const daysAgo = report.daysSinceLastEvent !== null
          ? ` (${report.daysSinceLastEvent} days ago)`
          : '';
        lines.push(`  [${report.recommendation.toUpperCase()}] ${report.venueName}`);
        lines.push(`    Last event: ${lastEvent}${daysAgo}`);
        lines.push(`    Reason: ${report.reason}`);
      }
    }

    if (activeVenues.length > 0) {
      lines.push(`\nActive venues (${activeVenues.length}):`);
      for (const report of activeVenues) {
        const lastEvent = report.lastEventDate
          ? new Date(report.lastEventDate).toLocaleDateString()
          : 'never';
        lines.push(`  ${report.venueName} - last event: ${lastEvent}`);
      }
    }

    return lines.join('\n');
  }
}

export const venueStatusManager = new VenueStatusManager();
