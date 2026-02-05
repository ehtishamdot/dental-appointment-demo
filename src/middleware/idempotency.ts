import { Request, Response, NextFunction } from 'express';
import { ApiResponse, ErrorCode } from '../types/index.js';

/**
 * Middleware to validate Idempotency-Key header
 * AI agents should always send this header to handle retries safely
 */
export function validateIdempotencyKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const idempotencyKey = req.headers['idempotency-key'];

  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    const response: ApiResponse = {
      success: false,
      error: {
        code: ErrorCode.MISSING_IDEMPOTENCY_KEY,
        message: 'Idempotency-Key header is required for this endpoint',
        details: {
          hint: 'Generate a unique UUID for each distinct booking request. Reuse the same key when retrying.',
        },
      },
    };
    res.status(400).json(response);
    return;
  }

  // Validate UUID format (loose validation)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(idempotencyKey)) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: ErrorCode.MISSING_IDEMPOTENCY_KEY,
        message: 'Idempotency-Key must be a valid UUID',
        details: {
          received: idempotencyKey,
          expected_format: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        },
      },
    };
    res.status(400).json(response);
    return;
  }

  // Attach to request for later use
  req.idempotencyKey = idempotencyKey;
  next();
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      idempotencyKey?: string;
    }
  }
}
