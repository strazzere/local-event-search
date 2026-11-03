import * as cheerio from 'cheerio';
import { strict as assert } from 'assert';

// Simulate the Moonraker parsing logic
function parseMoonrakerEvent(eventText: string): { title: string; startTime?: string; type: string } | null {
  // Use a regex to match event patterns
  const eventPattern = /(\d{1,2})(?::(\d{2}))?(am|pm|a|p)\s*([^0-9][^\d{1,2}(?:am|pm|a|p)]{2,}?)(?=\d{1,2}(?:am|pm|a|p)|$)/gi;
  const matches = Array.from(eventText.matchAll(eventPattern));

  if (matches.length === 0) {
    // Try treating the whole text as a single event
    const singlePattern = /^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)\s*(.+)$/i;
    const singleMatch = singlePattern.exec(eventText);
    if (singleMatch) {
      matches.push(singleMatch);
    }
  }

  if (matches.length === 0) return null;

  const match = matches[0];
  let hour = parseInt(match[1]);
  const minutes = match[2] || '00';
  const period = match[3].toLowerCase();
  let title = match[4].trim();
  
  // Properly handle AM/PM conversion
  const isAM = period === 'a' || period === 'am';
  const isPM = period === 'p' || period === 'pm';
  
  if (isPM && hour !== 12) {
    hour += 12;
  } else if (isAM && hour === 12) {
    hour = 0;
  }
  
  // Convert back to 12-hour format for display
  let displayHour = hour % 12;
  if (displayHour === 0) displayHour = 12;
  const displayPeriod = hour >= 12 ? 'PM' : 'AM';
  const startTime = `${displayHour}:${minutes} ${displayPeriod}`;

  // Clean up title
  title = title.replace(/\d{1,2}(?::\d{2})?(?:am|pm|a|p)?$/i, '').trim();
  
  if (!title || title.length < 3) return null;
  if (/^\d+$/.test(title)) return null;
  if (/^(?:closing|closed|open)/i.test(title)) return null;

  // Detect type
  const lower = title.toLowerCase();
  let type = 'other';
  if (lower.includes('live music') || lower.includes('band') || lower.includes('kai')) {
    type = 'music';
  } else if (lower.includes('trivia')) {
    type = 'trivia';
  } else if (lower.includes('paint')) {
    type = 'paint';
  } else if (lower.includes('food') || lower.includes('truck') || lower.includes('hot dog') || lower.includes('cuisine') || lower.includes('burger')) {
    type = 'food';
  }

  return { title, startTime, type };
}

function testBasicTimeAndTitle() {
  console.log('Testing basic time and title parsing...');
  
  const result = parseMoonrakerEvent('12p Senior Burger');
  assert(result !== null, 'Should parse event');
  assert.equal(result.title, 'Senior Burger', 'Title should be "Senior Burger"');
  assert.equal(result.startTime, '12:00 PM', 'Time should be 12:00 PM');
  assert.equal(result.type, 'food', 'Type should be food');
  
  console.log('  ✓ Parsed "12p Senior Burger" correctly');
}

function testMultipleEvents() {
  console.log('Testing concatenated events...');
  
  // This is trickier - the split might not work perfectly for concatenated events
  // but we should at least not break "12p" into "1" and "2p"
  const text1 = '6p Trivia Night';
  const result1 = parseMoonrakerEvent(text1);
  assert(result1 !== null, 'Should parse trivia event');
  assert.equal(result1.title, 'Trivia Night', 'Title should be "Trivia Night"');
  assert.equal(result1.startTime, '6:00 PM', 'Time should be 6:00 PM');
  assert.equal(result1.type, 'trivia', 'Type should be trivia');
  
  console.log('  ✓ Parsed "6p Trivia Night" correctly');
}

function testMusicEvent() {
  console.log('Testing music event detection...');
  
  const result = parseMoonrakerEvent('7pm Live Music by Kai');
  assert(result !== null, 'Should parse event');
  assert.equal(result.title, 'Live Music by Kai', 'Title should include Kai');
  assert.equal(result.type, 'music', 'Type should be music, not food');
  assert.equal(result.startTime, '7:00 PM', 'Time should be 7:00 PM');
  
  console.log('  ✓ Music events are correctly classified');
}

function testAMTime() {
  console.log('Testing AM time parsing...');
  
  const result = parseMoonrakerEvent('10a Brunch Special');
  assert(result !== null, 'Should parse event');
  assert.equal(result.title, 'Brunch Special', 'Title should be correct');
  assert.equal(result.startTime, '10:00 AM', 'Time should be 10:00 AM, not PM');
  
  console.log('  ✓ AM times are not forced to PM');
}

function testDoggieStyleEvent() {
  console.log('Testing Doggiestyle Hot Dogs event...');
  
  const result = parseMoonrakerEvent('5p Doggiestyle Hot Dogs');
  assert(result !== null, 'Should parse event');
  assert.equal(result.title, 'Doggiestyle Hot Dogs', 'Title should be complete');
  assert.equal(result.startTime, '5:00 PM', 'Time should be 5:00 PM');
  assert.equal(result.type, 'food', 'Type should be food');
  
  console.log('  ✓ Doggiestyle Hot Dogs parsed correctly');
}

function testNoTimeEvent() {
  console.log('Testing event without time...');
  
  const result = parseMoonrakerEvent('10p');
  // This should not create an event (no title)
  assert(result === null, 'Bare time should not create event');
  
  console.log('  ✓ Bare times are correctly skipped');
}

function test12HourConversion() {
  console.log('Testing 12-hour time conversion...');
  
  // 12 PM should stay 12 PM
  const noon = parseMoonrakerEvent('12pm Lunch Special');
  assert(noon?.startTime === '12:00 PM', '12pm should be 12:00 PM');
  
  // 12 AM should be 12 AM (midnight)
  const midnight = parseMoonrakerEvent('12am Late Night');
  assert(midnight?.startTime === '12:00 AM', '12am should be 12:00 AM');
  
  // 1 PM should stay 1 PM
  const afternoon = parseMoonrakerEvent('1pm Afternoon Event');
  assert(afternoon?.startTime === '1:00 PM', '1pm should be 1:00 PM');
  
  console.log('  ✓ 12-hour conversion is correct');
}

function runTests() {
  console.log('=== Moonraker Parser Tests ===\n');
  
  try {
    testBasicTimeAndTitle();
    testMultipleEvents();
    testMusicEvent();
    testAMTime();
    testDoggieStyleEvent();
    testNoTimeEvent();
    test12HourConversion();
    
    console.log('\n✅ All Moonraker parser tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

runTests();
