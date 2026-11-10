import { strict as assert } from 'assert';
import { formatInTimeZone } from 'date-fns-tz';

function testTimezoneFormatting() {
  console.log('Testing ICS event time formatting in Pacific timezone...');

  // Test case 1: Nov 9, 2026 at 2:45 PM Pacific (the PTC Meeting case)
  const ptcMeetingDate = new Date('2026-11-09T14:45:00-08:00');
  const formattedTime1 = formatInTimeZone(ptcMeetingDate, 'America/Los_Angeles', 'h:mm a');
  console.log(`  2026-11-09T14:45:00-08:00 -> "${formattedTime1}"`);
  assert.strictEqual(formattedTime1, '2:45 PM', 'Should format as 2:45 PM, not 10:45 PM');

  // Test case 2: Nov 5, 2026 at 6:00 PM Pacific (LUSD Board Meeting)
  const boardMeetingDate = new Date('2026-11-05T18:00:00-08:00');
  const formattedTime2 = formatInTimeZone(boardMeetingDate, 'America/Los_Angeles', 'h:mm a');
  console.log(`  2026-11-05T18:00:00-08:00 -> "${formattedTime2}"`);
  assert.strictEqual(formattedTime2, '6:00 PM', 'Should format as 6:00 PM, not 2:00 AM');

  // Test case 3: Nov 10, 2026 at 2:30 PM Pacific (Esports Practice)
  const esportsDate = new Date('2026-11-10T14:30:00-08:00');
  const formattedTime3 = formatInTimeZone(esportsDate, 'America/Los_Angeles', 'h:mm a');
  console.log(`  2026-11-10T14:30:00-08:00 -> "${formattedTime3}"`);
  assert.strictEqual(formattedTime3, '2:30 PM', 'Should format as 2:30 PM, not 10:30 PM');

  // Test case 4: Dec 3, 2026 at 9:00 AM Pacific (Esports Tournament)
  const tournamentDate = new Date('2026-12-03T09:00:00-08:00');
  const formattedTime4 = formatInTimeZone(tournamentDate, 'America/Los_Angeles', 'h:mm a');
  console.log(`  2026-12-03T09:00:00-08:00 -> "${formattedTime4}"`);
  assert.strictEqual(formattedTime4, '9:00 AM', 'Should format as 9:00 AM, not 5:00 PM');

  // Test case 5: Dec 17, 2026 at 5:00 PM Pacific (Dance)
  const danceDate = new Date('2026-12-17T17:00:00-08:00');
  const formattedTime5 = formatInTimeZone(danceDate, 'America/Los_Angeles', 'h:mm a');
  console.log(`  2026-12-17T17:00:00-08:00 -> "${formattedTime5}"`);
  assert.strictEqual(formattedTime5, '5:00 PM', 'Should format as 5:00 PM, not 1:00 AM');

  console.log('  ✓ All timezone formatting tests passed');
}

function testUTCEnvironmentSimulation() {
  console.log('Testing time formatting would work correctly in UTC environment (GitHub Actions)...');

  // Simulate what happens in GitHub Actions where TZ is UTC
  // The formatInTimeZone function should still produce correct Pacific times
  const date = new Date('2026-11-09T22:45:00Z'); // This is 2:45 PM Pacific in UTC
  const formattedTime = formatInTimeZone(date, 'America/Los_Angeles', 'h:mm a');
  console.log(`  2026-11-09T22:45:00Z formatted in America/Los_Angeles -> "${formattedTime}"`);
  assert.strictEqual(formattedTime, '2:45 PM', 'Should format as 2:45 PM even in UTC environment');

  console.log('  ✓ UTC environment simulation passed');
}

function runTests() {
  console.log('=== ICS Timezone Formatting Tests ===\n');

  try {
    testTimezoneFormatting();
    testUTCEnvironmentSimulation();

    console.log('\n✅ All ICS timezone tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

runTests();
