/**
 * Demo Script - Tests the three required scenarios:
 * 1. Idempotency - Duplicate requests return same response
 * 2. Concurrency - Parallel requests don't double-book
 * 3. Error Handling - Structured error codes for AI readability
 *
 * Run: npx tsx test/demo.ts
 */

import { v4 as uuidv4 } from 'uuid';

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

interface ApiResponse {
  success: boolean;
  data?: {
    appointment_id: string;
    patient_id: string;
    slot_datetime: string;
    status: string;
    message: string;
  };
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

async function makeBookingRequest(
  patientId: string,
  slotDatetime: string,
  idempotencyKey: string
): Promise<{ status: number; body: ApiResponse }> {
  const response = await fetch(`${BASE_URL}/api/appointments/book`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      patient_id: patientId,
      slot_datetime: slotDatetime,
    }),
  });

  const body = await response.json();
  return { status: response.status, body };
}

function getFutureSlot(minutesFromNow: number): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutesFromNow);
  date.setSeconds(0);
  date.setMilliseconds(0);
  return date.toISOString();
}

async function testIdempotency(): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: IDEMPOTENCY');
  console.log('='.repeat(60));
  console.log('Testing that duplicate requests with same Idempotency-Key return cached response...\n');

  const idempotencyKey = uuidv4();
  const slotTime = getFutureSlot(60); // 1 hour from now
  const patientId = 'patient-idem-001';

  // First request
  console.log(`Request 1 - Idempotency-Key: ${idempotencyKey}`);
  const result1 = await makeBookingRequest(patientId, slotTime, idempotencyKey);
  console.log(`Status: ${result1.status}`);
  console.log(`Response: ${JSON.stringify(result1.body, null, 2)}\n`);

  // Second request with SAME idempotency key (simulating retry)
  console.log(`Request 2 (retry) - Idempotency-Key: ${idempotencyKey}`);
  const result2 = await makeBookingRequest(patientId, slotTime, idempotencyKey);
  console.log(`Status: ${result2.status}`);
  console.log(`Response: ${JSON.stringify(result2.body, null, 2)}\n`);

  // Verify same appointment_id returned
  const sameAppointmentId =
    result1.body.data?.appointment_id === result2.body.data?.appointment_id;
  const sameStatus = result1.status === result2.status;

  if (sameAppointmentId && sameStatus && result1.body.success) {
    console.log('✅ PASS: Same response returned for duplicate request');
    console.log(`   - Appointment ID: ${result1.body.data?.appointment_id}`);
    return true;
  } else {
    console.log('❌ FAIL: Idempotency not working correctly');
    return false;
  }
}

async function testConcurrency(): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: CONCURRENCY CONTROL');
  console.log('='.repeat(60));
  console.log('Testing that parallel requests for same slot result in only ONE booking...\n');

  const slotTime = getFutureSlot(120); // 2 hours from now
  const numRequests = 5;

  // Create multiple requests for the SAME slot
  const requests = Array.from({ length: numRequests }, (_, i) => ({
    patientId: `patient-conc-00${i + 1}`,
    idempotencyKey: uuidv4(),
  }));

  console.log(`Sending ${numRequests} parallel requests for slot: ${slotTime}\n`);

  // Fire all requests simultaneously
  const results = await Promise.all(
    requests.map((req) =>
      makeBookingRequest(req.patientId, slotTime, req.idempotencyKey)
    )
  );

  // Analyze results
  let successCount = 0;
  let slotTakenCount = 0;

  results.forEach((result, i) => {
    const status = result.body.success ? 'SUCCESS' : result.body.error?.code;
    console.log(`Request ${i + 1} (${requests[i].patientId}): ${status}`);

    if (result.body.success) {
      successCount++;
      console.log(`   - Appointment ID: ${result.body.data?.appointment_id}`);
    } else if (result.body.error?.code === 'SLOT_TAKEN') {
      slotTakenCount++;
    }
  });

  console.log(`\nResults: ${successCount} booked, ${slotTakenCount} rejected with SLOT_TAKEN`);

  if (successCount === 1 && slotTakenCount === numRequests - 1) {
    console.log('✅ PASS: Only ONE booking succeeded, others correctly rejected');
    return true;
  } else {
    console.log('❌ FAIL: Concurrency control not working correctly');
    return false;
  }
}

async function testErrorHandling(): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: STRUCTURED ERROR HANDLING');
  console.log('='.repeat(60));
  console.log('Testing that errors return structured, AI-readable error codes...\n');

  let allPassed = true;

  // Test 3a: Missing Idempotency-Key
  console.log('Test 3a: Missing Idempotency-Key');
  const resp1 = await fetch(`${BASE_URL}/api/appointments/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patient_id: 'test', slot_datetime: getFutureSlot(30) }),
  });
  const body1: ApiResponse = await resp1.json();
  console.log(`Error Code: ${body1.error?.code}`);
  if (body1.error?.code === 'MISSING_IDEMPOTENCY_KEY') {
    console.log('✅ Correct error code\n');
  } else {
    console.log('❌ Wrong error code\n');
    allPassed = false;
  }

  // Test 3b: Invalid slot (past date)
  console.log('Test 3b: Slot in the past');
  const pastDate = new Date('2020-01-01T10:00:00Z').toISOString();
  const resp2 = await makeBookingRequest('patient-err-001', pastDate, uuidv4());
  console.log(`Error Code: ${resp2.body.error?.code}`);
  if (resp2.body.error?.code === 'SLOT_IN_PAST') {
    console.log('✅ Correct error code\n');
  } else {
    console.log('❌ Wrong error code\n');
    allPassed = false;
  }

  // Test 3c: Missing patient_id
  console.log('Test 3c: Missing patient_id');
  const resp3 = await fetch(`${BASE_URL}/api/appointments/book`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': uuidv4(),
    },
    body: JSON.stringify({ slot_datetime: getFutureSlot(30) }),
  });
  const body3: ApiResponse = await resp3.json();
  console.log(`Error Code: ${body3.error?.code}`);
  if (body3.error?.code === 'INVALID_PATIENT_ID') {
    console.log('✅ Correct error code\n');
  } else {
    console.log('❌ Wrong error code\n');
    allPassed = false;
  }

  // Test 3d: SLOT_TAKEN error
  console.log('Test 3d: SLOT_TAKEN error');
  const slotTime = getFutureSlot(180); // 3 hours from now
  await makeBookingRequest('patient-first', slotTime, uuidv4()); // Book first
  const resp4 = await makeBookingRequest('patient-second', slotTime, uuidv4()); // Try again
  console.log(`Error Code: ${resp4.body.error?.code}`);
  if (resp4.body.error?.code === 'SLOT_TAKEN') {
    console.log('✅ Correct error code\n');
  } else {
    console.log('❌ Wrong error code\n');
    allPassed = false;
  }

  if (allPassed) {
    console.log('✅ PASS: All error codes are structured and AI-readable');
    return true;
  } else {
    console.log('❌ FAIL: Some error codes are incorrect');
    return false;
  }
}

async function runAllTests() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     DENTAL APPOINTMENT API - DEMO TEST SUITE              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`\nTarget: ${BASE_URL}`);

  try {
    // Check server is running
    const health = await fetch(`${BASE_URL}/health`);
    if (!health.ok) throw new Error('Server not responding');
    console.log('Server is healthy ✓');

    const results = {
      idempotency: await testIdempotency(),
      concurrency: await testConcurrency(),
      errorHandling: await testErrorHandling(),
    };

    console.log('\n' + '='.repeat(60));
    console.log('FINAL RESULTS');
    console.log('='.repeat(60));
    console.log(`Idempotency:     ${results.idempotency ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Concurrency:     ${results.concurrency ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Error Handling:  ${results.errorHandling ? '✅ PASS' : '❌ FAIL'}`);
    console.log('='.repeat(60));

    const allPassed = Object.values(results).every(Boolean);
    console.log(`\n${allPassed ? '🎉 ALL TESTS PASSED!' : '⚠️  SOME TESTS FAILED'}\n`);

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Error running tests:', error);
    console.log('\nMake sure the server is running: npm run dev\n');
    process.exit(1);
  }
}

runAllTests();
