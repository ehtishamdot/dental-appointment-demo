export interface Appointment {
  id: string;
  patient_id: string;
  slot_datetime: string;
  status: 'booked' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface IdempotencyRecord {
  idempotency_key: string;
  request_hash: string;
  response_status: number;
  response_body: string;
  created_at: string;
}

export interface BookingRequest {
  patient_id: string;
  slot_datetime: string;
}

export enum ErrorCode {
  SLOT_TAKEN = 'SLOT_TAKEN',
  INVALID_SLOT = 'INVALID_SLOT',
  INVALID_PATIENT_ID = 'INVALID_PATIENT_ID',
  MISSING_IDEMPOTENCY_KEY = 'MISSING_IDEMPOTENCY_KEY',
  IDEMPOTENCY_KEY_MISMATCH = 'IDEMPOTENCY_KEY_MISMATCH',
  SLOT_IN_PAST = 'SLOT_IN_PAST',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  LOCK_TIMEOUT = 'LOCK_TIMEOUT',
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface BookingSuccessData {
  appointment_id: string;
  patient_id: string;
  slot_datetime: string;
  status: string;
  message: string;
}
