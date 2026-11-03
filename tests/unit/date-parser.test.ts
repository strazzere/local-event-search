import { DateParser } from '../../src/utils/date-parser';
import { strict as assert } from 'assert';

const dateParser = new DateParser('America/Los_Angeles');

function testTimezoneHandling() {
  console.log('Testing timezone handling...');
  
  // Test that dates are output with Pacific offset, not Z suffix
  const date = dateParser.parseDate('November 7, 2026');
  assert(date !== null, 'Date should parse successfully');
  
  const isoString = dateParser.toISOString(date);
  console.log(`  Parsed "November 7, 2026" -> ${isoString}`);
  
  // Should have Pacific offset (-08:00 or -07:00), not Z
  assert(!isoString.endsWith('Z'), 'ISO string should not end with Z');
  assert(
    isoString.includes('-08:00') || isoString.includes('-07:00'),
    'ISO string should have Pacific timezone offset'
  );
  
  // Should represent November 7 at midnight Pacific
  assert(isoString.startsWith('2026-11-07T00:00:00'), 'Should represent midnight on November 7');
  
  console.log('  ✓ Timezone handling correct');
}

function testDSTHandling() {
  console.log('Testing DST handling...');
  
  // November is typically PST (-08:00)
  const winterDate = dateParser.parseDate('November 15, 2026');
  const winterISO = dateParser.toISOString(winterDate!);
  console.log(`  November date: ${winterISO}`);
  assert(winterISO.includes('-08:00'), 'November should use PST (-08:00)');
  
  // June is typically PDT (-07:00)
  const summerDate = dateParser.parseDate('June 15, 2026');
  const summerISO = dateParser.toISOString(summerDate!);
  console.log(`  June date: ${summerISO}`);
  assert(summerISO.includes('-07:00'), 'June should use PDT (-07:00)');
  
  console.log('  ✓ DST handling correct');
}

function testYearRollover() {
  console.log('Testing year rollover logic...');
  
  // Set a reference date in November
  const novemberRef = new Date('2026-11-03T00:00:00Z');
  
  // Date in the past (October) should roll to next year
  const pastDate = dateParser.parseDate('October 15', novemberRef);
  assert(pastDate !== null, 'Past date should parse');
  const pastISO = dateParser.toISOString(pastDate);
  console.log(`  "October 15" with Nov 3 reference -> ${pastISO}`);
  assert(pastISO.startsWith('2027-10-15'), 'Past date should roll to next year');
  
  // Date in the future (December) should stay in current year
  const futureDate = dateParser.parseDate('December 15', novemberRef);
  assert(futureDate !== null, 'Future date should parse');
  const futureISO = dateParser.toISOString(futureDate);
  console.log(`  "December 15" with Nov 3 reference -> ${futureISO}`);
  assert(futureISO.startsWith('2026-12-15'), 'Future date should stay in current year');
  
  // Today's date should stay in current year (comparing by Pacific calendar date)
  const todayDate = dateParser.parseDate('November 3', novemberRef);
  assert(todayDate !== null, 'Today date should parse');
  const todayISO = dateParser.toISOString(todayDate);
  console.log(`  "November 3" with Nov 3 reference -> ${todayISO}`);
  assert(todayISO.startsWith('2026-11-03'), 'Today should stay in current year');
  
  console.log('  ✓ Year rollover logic correct');
}

function testTimezoneParsing() {
  console.log('Testing datetime parsing with times...');
  
  const datetime = dateParser.parseDateTime('November 7, 2026', '6:00 PM');
  assert(datetime !== null, 'DateTime should parse successfully');
  
  const iso = dateParser.toISOString(datetime);
  console.log(`  "November 7, 2026" at "6:00 PM" -> ${iso}`);
  
  // Should represent 6 PM Pacific
  assert(iso.startsWith('2026-11-07T18:00:00'), 'Should represent 6 PM on November 7');
  assert(
    iso.includes('-08:00') || iso.includes('-07:00'),
    'Should have Pacific timezone offset'
  );
  
  console.log('  ✓ DateTime parsing correct');
}

function testRelativeDates() {
  console.log('Testing relative date parsing...');
  
  const ref = new Date('2026-11-05T20:00:00Z'); // A date in UTC
  
  const today = dateParser.parseDate('today', ref);
  assert(today !== null, 'Today should parse');
  const todayISO = dateParser.toISOString(today);
  console.log(`  "today" -> ${todayISO}`);
  assert(
    todayISO.includes('-08:00') || todayISO.includes('-07:00'),
    'Should have Pacific offset'
  );
  
  const tomorrow = dateParser.parseDate('tomorrow', ref);
  assert(tomorrow !== null, 'Tomorrow should parse');
  const tomorrowISO = dateParser.toISOString(tomorrow);
  console.log(`  "tomorrow" -> ${tomorrowISO}`);
  
  console.log('  ✓ Relative dates correct');
}

function runTests() {
  console.log('=== Date Parser Tests ===\n');
  
  try {
    testTimezoneHandling();
    testDSTHandling();
    testYearRollover();
    testTimezoneParsing();
    testRelativeDates();
    
    console.log('\n✅ All date parser tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

runTests();
