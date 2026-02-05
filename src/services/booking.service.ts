import { createHash, randomUUID } from 'crypto';
import { db, statements, bookAppointmentTransaction } from '../db/sqlite.js';
import {
  ApiResponse,
  BookingRequest,
  BookingSuccessData,
  ErrorCode,
  IdempotencyRecord,
} from '../types/index.js';

export class BookingService {
  /**
   * Generate a hash of the request body for idempotency comparison
   */
  private hashRequest(request: BookingRequest): string {
    const normalized = JSON.stringify({
      patient_id: request.patient_id,
      slot_datetime: request.slot_datetime,
    });
    return createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Check if an idempotency key has been used before
   * Returns the cached response if found with matching request hash
   */
  async checkIdempotencyKey(
    idempotencyKey: string,
    request: BookingRequest
  ): Promise<{
    found: boolean;
    response?: ApiResponse<BookingSuccessData>;
    status?: number;
    mismatch?: boolean;
  }> {
    const requestHash = this.hashRequest(request);

    const row = statements.getIdempotencyKey.get(idempotencyKey) as IdempotencyRecord | undefined;

    if (row) {
      // Key exists - verify request hash matches
      if (row.request_hash !== requestHash) {
        return { found: true, mismatch: true };
      }
      // Return cached response
      return {
        found: true,
        response: JSON.parse(row.response_body) as ApiResponse<BookingSuccessData>,
        status: row.response_status,
      };
    }

    return { found: false };
  }

  /**
   * Store idempotency key with response for future duplicate detection
   */
  async storeIdempotencyKey(
    idempotencyKey: string,
    request: BookingRequest,
    responseStatus: number,
    responseBody: ApiResponse<BookingSuccessData>
  ): Promise<void> {
    const requestHash = this.hashRequest(request);

    try {
      statements.insertIdempotencyKey.run(
        idempotencyKey,
        requestHash,
        responseStatus,
        JSON.stringify(responseBody)
      );
    } catch (error) {
      // Ignore duplicate key errors
      console.error('Failed to store idempotency key:', error);
    }
  }

  /**
   * Validate the booking request
   */
  validateRequest(request: BookingRequest): ApiResponse<never> | null {
    if (
      !request.patient_id ||
      typeof request.patient_id !== 'string' ||
      request.patient_id.trim() === ''
    ) {
      return {
        success: false,
        error: {
          code: ErrorCode.INVALID_PATIENT_ID,
          message: 'patient_id is required and must be a non-empty string',
        },
      };
    }

    if (!request.slot_datetime || typeof request.slot_datetime !== 'string') {
      return {
        success: false,
        error: {
          code: ErrorCode.INVALID_SLOT,
          message: 'slot_datetime is required and must be a valid ISO 8601 datetime string',
        },
      };
    }

    const slotDate = new Date(request.slot_datetime);
    if (isNaN(slotDate.getTime())) {
      return {
        success: false,
        error: {
          code: ErrorCode.INVALID_SLOT,
          message: 'slot_datetime must be a valid ISO 8601 datetime string',
          details: { received: request.slot_datetime },
        },
      };
    }

    // Check if slot is in the past
    if (slotDate < new Date()) {
      return {
        success: false,
        error: {
          code: ErrorCode.SLOT_IN_PAST,
          message: 'Cannot book appointments in the past',
          details: { slot_datetime: request.slot_datetime },
        },
      };
    }

    return null;
  }

  /**
   * Book an appointment with concurrency control
   * Uses SQLite transaction with serialized access to prevent race conditions
   */
  async bookAppointment(
    request: BookingRequest
  ): Promise<{ status: number; response: ApiResponse<BookingSuccessData> }> {
    // Normalize the datetime to ensure consistent slot matching
    const slotDatetime = new Date(request.slot_datetime).toISOString();
    const appointmentId = randomUUID();

    try {
      // Execute booking in a transaction (SQLite serializes writes)
      const result = bookAppointmentTransaction(
        appointmentId,
        request.patient_id,
        slotDatetime
      );

      if (!result.success) {
        if (result.error_code === 'SLOT_TAKEN') {
          return {
            status: 409,
            response: {
              success: false,
              error: {
                code: ErrorCode.SLOT_TAKEN,
                message: 'This time slot is already booked',
                details: { slot_datetime: slotDatetime },
              },
            },
          };
        }

        return {
          status: 500,
          response: {
            success: false,
            error: {
              code: ErrorCode.INTERNAL_ERROR,
              message: 'Failed to book appointment',
            },
          },
        };
      }

      // Success!
      return {
        status: 201,
        response: {
          success: true,
          data: {
            appointment_id: result.appointment_id!,
            patient_id: request.patient_id,
            slot_datetime: slotDatetime,
            status: 'booked',
            message: 'Appointment successfully booked',
          },
        },
      };
    } catch (error: unknown) {
      console.error('Booking error:', error);

      // Check for unique constraint violation
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        return {
          status: 409,
          response: {
            success: false,
            error: {
              code: ErrorCode.SLOT_TAKEN,
              message: 'This time slot is already booked',
              details: { slot_datetime: slotDatetime },
            },
          },
        };
      }

      return {
        status: 500,
        response: {
          success: false,
          error: {
            code: ErrorCode.INTERNAL_ERROR,
            message: 'An internal error occurred while processing your request',
          },
        },
      };
    }
  }
}

export const bookingService = new BookingService();
