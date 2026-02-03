# Event Search Scraper

A modular TypeScript scraper that independently scrapes 12+ brewery/winery/restaurant event pages and outputs standardized JSON/CSV/ICS files.

## Features

- **Multi-platform support**: WordPress, Squarespace, Shopify, Wix, SpotHopper, and custom sites
- **Multiple output formats**: JSON, CSV, ICS (calendar), and Markdown
- **Configurable**: Each venue is configured via JSON files
- **Event deduplication**: Automatically removes duplicate events
- **Event categorization**: Auto-detects event types (trivia, music, food, etc.)
- **Scheduled scraping**: GitHub Actions workflow for automated weekly updates

## Installation

```bash
npm install
npm run build
```

## Usage

### Scrape all venues

```bash
npm run scrape -- --all --output all
```

### Scrape a specific venue

```bash
npm run scrape -- --venue mindscape-fermentations
```

### List available venues

```bash
npm run scrape list
```

### Test a scraper with verbose output

```bash
npm run scrape test-scraper mindscape-fermentations
```

### Validate configuration files

```bash
npm run scrape validate --all
```

### Dry run (no output files)

```bash
npm run scrape -- --all --dry-run
```

## Output Formats

- **JSON** (`output/events.json`): Full event data with metadata
- **CSV** (`output/events.csv`): Flattened event data for spreadsheets
- **ICS** (`output/events.ics`): iCalendar format for importing to calendars
- **Markdown** (`output/README.md`): Human-readable event summary

## Adding a New Venue

1. Create a configuration file in `config/venues/`:

```json
{
  "id": "venue-id",
  "name": "Venue Name",
  "url": "https://example.com/events",
  "platform": "wordpress|squarespace|shopify|wix|spothopper|custom",
  "enabled": true,
  "venue": {
    "name": "Venue Name",
    "address": "123 Main St",
    "city": "City",
    "state": "CA",
    "zip": "12345"
  },
  "selectors": {
    "eventContainer": ".event-item",
    "title": ".event-title",
    "date": ".event-date",
    "description": ".event-description"
  },
  "config": {
    "useBrowser": false,
    "timeout": 30000
  }
}
```

2. If the venue requires custom parsing logic, create a scraper in `src/scrapers/custom/` and register it in `src/scrapers/registry.ts`.

## Supported Venues

| Venue | Platform | Status |
|-------|----------|--------|
| Mindscape Fermentations | WordPress | Enabled |
| Buenos Aires Grill | GoDaddy | Enabled |
| Omakase Por Favor | Squarespace | Enabled |
| Happy Dayz Vineyard | WordPress | Enabled |
| Fowler Ranch | Wix | Enabled |
| Goathouse Brewing | Wix | Enabled |
| Auburn Alehouse | Shopify | Enabled |
| Crooked Lane Brewing | SpotHopper | Enabled |
| The Hillmont | Squarespace | Enabled |
| Moonraker Brewing | Wix | Enabled |
| Moksa Brewing | Custom | Enabled |
| Gander Taphouse | Squarespace | Enabled |

## Development

### Project Structure

```
event-search/
├── src/
│   ├── types/          # TypeScript interfaces
│   ├── core/           # BaseScraper class
│   ├── scrapers/       # Platform-specific scrapers
│   ├── outputs/        # Output generators
│   ├── utils/          # Utilities (logging, HTTP, etc.)
│   └── cli/            # CLI commands
├── config/
│   └── venues/         # Venue configuration files
├── output/             # Generated output files
└── tests/              # Test files
```

### Running Tests

```bash
npm test
```

### Building

```bash
npm run build
```

## GitHub Actions

The scraper runs automatically every Monday at 9 AM UTC via GitHub Actions. You can also trigger it manually from the Actions tab.

## License

MIT
