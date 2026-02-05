import { Router, Request, Response } from 'express';
import { validateIdempotencyKey } from '../middleware/idempotency.js';
import { bookingService } from '../services/booking.service.js';
import { ApiResponse, BookingRequest, ErrorCode } from '../types/index.js';

const router = Router();

/**
 * POST /api/appointments/book
 *
 * Book a dental appointment with idempotency and concurrency control.
 *
 * Headers:
 *   Idempotency-Key: UUID (required) - Unique key for this request
 *
 * Body:
 *   patient_id: string (required) - Patient identifier
 *   slot_datetime: string (required) - ISO 8601 datetime for the appointment
 *
 * Responses:
 *   201: Appointment successfully created
 *   400: Invalid request (missing fields, invalid datetime, etc.)
 *   409: Slot already taken (SLOT_TAKEN)
 *   503: Temporary lock contention, retry recommended (LOCK_TIMEOUT)
 *   500: Internal server error
 */
router.post('/book', validateIdempotencyKey, async (req: Request, res: Response) => {
  const idempotencyKey = req.idempotencyKey!;
  const bookingRequest: BookingRequest = {
    patient_id: req.body.patient_id,
    slot_datetime: req.body.slot_datetime,
  };

  try {
    // 1. Check idempotency key
    const idempotencyCheck = await bookingService.checkIdempotencyKey(
      idempotencyKey,
      bookingRequest
    );

    // If key was used with different request body, reject
    if (idempotencyCheck.mismatch) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: ErrorCode.IDEMPOTENCY_KEY_MISMATCH,
          message: 'This Idempotency-Key was already used with different request parameters',
          details: {
            hint: 'Generate a new Idempotency-Key for requests with different parameters',
          },
        },
      };
      res.status(422).json(response);
      return;
    }

    // Return cached response for duplicate request
    if (idempotencyCheck.found && idempotencyCheck.response) {
      res.status(idempotencyCheck.status!).json(idempotencyCheck.response);
      return;
    }

    // 2. Validate request
    const validationError = bookingService.validateRequest(bookingRequest);
    if (validationError) {
      // Store failed validation in idempotency cache
      await bookingService.storeIdempotencyKey(
        idempotencyKey,
        bookingRequest,
        400,
        validationError as ApiResponse<any>
      );
      res.status(400).json(validationError);
      return;
    }

    // 3. Attempt to book with concurrency control
    const result = await bookingService.bookAppointment(bookingRequest);

    // 4. Store result in idempotency cache (except for lock timeouts which should be retried)
    if (result.response.error?.code !== ErrorCode.LOCK_TIMEOUT) {
      await bookingService.storeIdempotencyKey(
        idempotencyKey,
        bookingRequest,
        result.status,
        result.response
      );
    }

    res.status(result.status).json(result.response);
  } catch (error) {
    console.error('Unexpected error in booking endpoint:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'An unexpected error occurred',
      },
    };
    res.status(500).json(response);
  }
});

export default router;
