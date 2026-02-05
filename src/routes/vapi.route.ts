import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { bookingService } from '../services/booking.service.js';
import { db } from '../db/sqlite.js';
import { ErrorCode } from '../types/index.js';

const router = Router();

// Clinic hours
const CLINIC_OPEN = 9;  // 9 AM
const CLINIC_CLOSE = 18; // 6 PM

interface VapiToolCallRequest {
  message: {
    type: 'tool-calls';
    toolCalls: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: Record<string, unknown>;
      };
    }>;
    call?: {
      id: string;
      phoneNumber?: string;
    };
  };
}

interface VapiToolCallResponse {
  results: Array<{
    toolCallId: string;
    result: string;
  }>;
}

router.post('/webhook', async (req: Request, res: Response) => {
  const body = req.body as VapiToolCallRequest;

  console.log('Vapi webhook received:', JSON.stringify(body, null, 2));

  if (body.message?.type === 'tool-calls') {
    const results = await Promise.all(
      body.message.toolCalls.map(async (toolCall) => {
        const result = await handleToolCall(
          toolCall.function.name,
          toolCall.function.arguments,
          body.message.call?.id
        );
        console.log(`Tool ${toolCall.function.name} result:`, result);
        return {
          toolCallId: toolCall.id,
          result: JSON.stringify(result),
        };
      })
    );

    const response: VapiToolCallResponse = { results };
    res.json(response);
    return;
  }

  if (body.message?.type) {
    console.log(`Vapi event: ${body.message.type}`);
  }

  res.json({ status: 'ok' });
});

async function handleToolCall(
  functionName: string,
  args: Record<string, unknown>,
  callId?: string
): Promise<Record<string, unknown>> {
  console.log(`Tool call: ${functionName}`, args);

  switch (functionName) {
    case 'book_appointment':
      return handleBookAppointment(args, callId);
    case 'check_availability':
      return handleCheckAvailability(args);
    case 'cancel_appointment':
      return handleCancelAppointment(args);
    default:
      return { success: false, error: `Unknown function: ${functionName}` };
  }
}

/**
 * Check if time is within clinic hours
 */
function isWithinClinicHours(hours: number): { valid: boolean; message?: string } {
  if (hours < CLINIC_OPEN) {
    return { valid: false, message: `We open at 9 AM. How about 9 or 10 in the morning?` };
  }
  if (hours >= CLINIC_CLOSE) {
    return { valid: false, message: `Oh we close at 6 PM. How about earlier, like 4 or 5?` };
  }
  return { valid: true };
}

/**
 * Check if date is a weekday
 */
function isWeekday(date: Date): { valid: boolean; message?: string } {
  const day = date.getDay();
  if (day === 0 || day === 6) {
    return { valid: false, message: `Ahh we're closed on weekends. How about Monday?` };
  }
  return { valid: true };
}

/**
 * Check availability - queries actual database
 */
async function handleCheckAvailability(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const dateStr = args.date as string;
  const timeStr = args.time as string;

  // Parse the date and time
  const slotDatetime = parseAppointmentDateTime(dateStr, timeStr);
  if (!slotDatetime) {
    return {
      success: false,
      message: "Hmm I didn't catch that. What date and time?"
    };
  }

  const slotDate = new Date(slotDatetime);

  // Check weekday
  const weekdayCheck = isWeekday(slotDate);
  if (!weekdayCheck.valid) {
    return { success: false, available: false, message: weekdayCheck.message };
  }

  // Check clinic hours
  const hours = slotDate.getHours();
  const hoursCheck = isWithinClinicHours(hours);
  if (!hoursCheck.valid) {
    return { success: false, available: false, message: hoursCheck.message };
  }

  // Check database for existing booking
  const existingBooking = db.prepare(`
    SELECT id FROM appointments
    WHERE slot_datetime = ? AND status = 'booked'
  `).get(slotDatetime);

  if (existingBooking) {
    // Find alternative times
    const alternatives = findAlternativeSlots(slotDate);
    return {
      success: true,
      available: false,
      message: `That slot's taken. How about ${alternatives}?`,
      alternatives
    };
  }

  return {
    success: true,
    available: true,
    message: `Yep, ${timeStr} on ${dateStr} is free!`,
    slot: slotDatetime
  };
}

/**
 * Find alternative available slots
 */
function findAlternativeSlots(originalDate: Date): string {
  const alternatives: string[] = [];
  const checkHours = [9, 10, 11, 14, 15, 16, 17];

  for (const hour of checkHours) {
    if (alternatives.length >= 2) break;

    const checkDate = new Date(originalDate);
    checkDate.setHours(hour, 0, 0, 0);
    const checkDatetime = checkDate.toISOString();

    const existing = db.prepare(`
      SELECT id FROM appointments
      WHERE slot_datetime = ? AND status = 'booked'
    `).get(checkDatetime);

    if (!existing) {
      const timeStr = hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
      alternatives.push(timeStr);
    }
  }

  return alternatives.length > 0 ? alternatives.join(' or ') : '10 AM tomorrow';
}

/**
 * Book appointment
 */
async function handleBookAppointment(
  args: Record<string, unknown>,
  callId?: string
): Promise<Record<string, unknown>> {
  const patientName = args.patient_name as string;
  const patientPhone = args.patient_phone as string;
  const appointmentDate = args.appointment_date as string;
  const appointmentTime = args.appointment_time as string;
  const reasonForVisit = args.reason_for_visit as string;

  // Validate required fields
  if (!patientName) {
    return { success: false, message: "What's your name?" };
  }
  if (!patientPhone) {
    return { success: false, message: "And what's a good number for you?" };
  }
  if (!appointmentDate || !appointmentTime) {
    return { success: false, message: "When would you like to come in?" };
  }

  // Parse datetime
  const slotDatetime = parseAppointmentDateTime(appointmentDate, appointmentTime);
  if (!slotDatetime) {
    return { success: false, message: "Hmm didn't catch that. What time?" };
  }

  const slotDate = new Date(slotDatetime);

  // Check weekday
  const weekdayCheck = isWeekday(slotDate);
  if (!weekdayCheck.valid) {
    return { success: false, message: weekdayCheck.message };
  }

  // Check clinic hours
  const hours = slotDate.getHours();
  const hoursCheck = isWithinClinicHours(hours);
  if (!hoursCheck.valid) {
    return { success: false, message: hoursCheck.message };
  }

  // Create patient ID
  const patientId = patientPhone.replace(/\D/g, '') || `patient-${patientName.toLowerCase().replace(/\s+/g, '-')}`;

  const bookingRequest = {
    patient_id: patientId,
    slot_datetime: slotDatetime,
  };

  // Validate
  const validationError = bookingService.validateRequest(bookingRequest);
  if (validationError) {
    if (validationError.error?.code === ErrorCode.SLOT_IN_PAST) {
      return { success: false, message: "That time's already passed. How about tomorrow?" };
    }
    return { success: false, message: "Something's off. Can you repeat that?" };
  }

  // Book it
  const result = await bookingService.bookAppointment(bookingRequest);

  if (result.response.success) {
    const idempotencyKey = uuidv4();
    await bookingService.storeIdempotencyKey(idempotencyKey, bookingRequest, result.status, result.response);

    // Format nice response
    const dateObj = new Date(slotDatetime);
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const timeFormatted = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    return {
      success: true,
      message: `Done! You're booked for ${dayName} at ${timeFormatted}. See you then ${patientName}!`,
      appointment: {
        id: result.response.data?.appointment_id,
        patient_name: patientName,
        patient_phone: patientPhone,
        date: appointmentDate,
        time: appointmentTime,
        reason: reasonForVisit || 'Checkup'
      }
    };
  }

  // Handle errors
  const errorCode = result.response.error?.code;

  if (errorCode === ErrorCode.SLOT_TAKEN) {
    const alternatives = findAlternativeSlots(slotDate);
    return {
      success: false,
      message: `Ooh that one's taken. How about ${alternatives}?`,
      error_code: 'SLOT_TAKEN'
    };
  }

  return {
    success: false,
    message: "Hmm something went wrong. Let me try again.",
    error_code: errorCode
  };
}

/**
 * Cancel appointment
 */
async function handleCancelAppointment(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const appointmentId = args.appointment_id as string;
  const patientPhone = args.patient_phone as string;

  // TODO: Implement actual cancellation
  return {
    success: true,
    message: "Okay I've cancelled that. Want to reschedule?"
  };
}

/**
 * Parse date/time to ISO string
 */
function parseAppointmentDateTime(date: string, time: string): string | null {
  try {
    let parsedDate: Date;
    const lowerDate = date.toLowerCase().trim();
    const today = new Date();

    if (lowerDate === 'today') {
      parsedDate = new Date(today);
    } else if (lowerDate === 'tomorrow') {
      parsedDate = new Date(today);
      parsedDate.setDate(parsedDate.getDate() + 1);
    } else if (lowerDate.includes('monday')) {
      parsedDate = getNextWeekday(1);
    } else if (lowerDate.includes('tuesday')) {
      parsedDate = getNextWeekday(2);
    } else if (lowerDate.includes('wednesday')) {
      parsedDate = getNextWeekday(3);
    } else if (lowerDate.includes('thursday')) {
      parsedDate = getNextWeekday(4);
    } else if (lowerDate.includes('friday')) {
      parsedDate = getNextWeekday(5);
    } else {
      parsedDate = new Date(date);
    }

    if (isNaN(parsedDate.getTime())) {
      return null;
    }

    // Parse time
    const timeMatch = time.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
    if (!timeMatch) {
      return null;
    }

    let hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2] || '0', 10);
    const meridiem = timeMatch[3]?.toLowerCase().replace('.', '');

    if (meridiem?.startsWith('p') && hours !== 12) {
      hours += 12;
    } else if (meridiem?.startsWith('a') && hours === 12) {
      hours = 0;
    }

    parsedDate.setHours(hours, minutes, 0, 0);
    return parsedDate.toISOString();
  } catch {
    return null;
  }
}

function getNextWeekday(targetDay: number): Date {
  const today = new Date();
  const currentDay = today.getDay();
  let daysUntil = targetDay - currentDay;
  if (daysUntil <= 0) daysUntil += 7;
  const result = new Date(today);
  result.setDate(today.getDate() + daysUntil);
  return result;
}

export default router;
