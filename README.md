# Dental Appointment Booking API

AI Voice SaaS backend API for dental appointment booking with **Vapi voice integration**, **idempotency**, **concurrency control**, and **structured error handling**.

## Features

- **Vapi Voice AI**: Natural phone conversations for booking appointments
- **Idempotency**: Duplicate requests with the same `Idempotency-Key` return cached responses
- **Concurrency Control**: SQLite transactions prevent double-booking
- **Structured Errors**: Machine-readable error codes (e.g., `SLOT_TAKEN`, `INVALID_SLOT`)
- **Local Storage**: SQLite database - no external services needed

## Tech Stack

- Node.js + TypeScript
- Express.js
- SQLite (better-sqlite3)
- Vapi (Voice AI)

## Quick Start

```bash
# Install dependencies
npm install

# Start server
npm run dev

# Run tests (in another terminal)
API_URL=http://localhost:3001 npm run test:demo
```

Server runs on `http://localhost:3001`

## API Endpoint

### `POST /api/appointments/book`

Book a dental appointment.

**Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| `Idempotency-Key` | Yes | UUID for request deduplication |
| `Content-Type` | Yes | `application/json` |

**Body:**
```json
{
  "patient_id": "patient-123",
  "slot_datetime": "2025-01-15T10:00:00Z"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "appointment_id": "uuid",
    "patient_id": "patient-123",
    "slot_datetime": "2025-01-15T10:00:00.000Z",
    "status": "booked",
    "message": "Appointment successfully booked"
  }
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `MISSING_IDEMPOTENCY_KEY` | Idempotency-Key header missing |
| 400 | `INVALID_PATIENT_ID` | patient_id missing or invalid |
| 400 | `INVALID_SLOT` | slot_datetime missing or invalid |
| 400 | `SLOT_IN_PAST` | Cannot book past appointments |
| 409 | `SLOT_TAKEN` | Time slot already booked |
| 422 | `IDEMPOTENCY_KEY_MISMATCH` | Key reused with different params |

## Testing

Run the demo test suite:

```bash
# Start server first
npm run dev

# In another terminal
API_URL=http://localhost:3001 npm run test:demo
```

The test suite validates:
1. **Idempotency** - Same response for duplicate requests
2. **Concurrency** - Only one booking succeeds for parallel requests
3. **Error Handling** - Correct structured error codes

## Example cURL Commands

**Book an appointment:**
```bash
curl -X POST http://localhost:3001/api/appointments/book \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"patient_id": "patient-001", "slot_datetime": "2025-02-10T14:00:00Z"}'
```

**Health check:**
```bash
curl http://localhost:3001/health
```

## Vapi Voice Integration

### Setup Vapi

1. Expose your local server with ngrok:
   ```bash
   npx ngrok http 3001
   ```

2. Update Vapi Assistant webhook URL:
   - Go to [dashboard.vapi.ai](https://dashboard.vapi.ai)
   - Find "Dental Appointment Assistant" (ID: `de3e42d4-9c6e-42ee-8496-ad155a73f14b`)
   - Update Server URL to: `https://xxx.ngrok.io/api/vapi/webhook`

3. Buy/import a phone number and assign to the assistant

4. Call the phone number and say: "I'd like to book an appointment for tomorrow at 2pm"

### How It Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Patient   │────▶│    Vapi     │────▶│  Your API   │────▶│   SQLite    │
│   (Phone)   │     │  (Voice AI) │     │  /api/vapi  │     │  (Local DB) │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

### Vapi Webhook Endpoint

`POST /api/vapi/webhook` handles:
- `book_appointment`: Books appointment with patient details
- `check_availability`: Returns available time slots
- `cancel_appointment`: Cancels existing appointments

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Express Server                          │
├─────────────────────────────────────────────────────────────┤
│  POST /api/appointments/book                                │
│    ├── Idempotency Middleware (check/store keys)           │
│    ├── Validation (patient_id, slot_datetime)              │
│    └── Booking Service (SQLite transaction)                │
├─────────────────────────────────────────────────────────────┤
│  POST /api/vapi/webhook                                     │
│    ├── Parse Vapi tool-calls                               │
│    ├── Execute function (book/check/cancel)                │
│    └── Return voice-friendly response                      │
├─────────────────────────────────────────────────────────────┤
│                    SQLite Database                          │
│    ├── appointments (id, patient_id, slot_datetime, status)│
│    └── idempotency_keys (key, hash, response)              │
└─────────────────────────────────────────────────────────────┘
```

## How Concurrency Control Works

SQLite uses serialized write transactions:
1. Request comes in for a specific time slot
2. Transaction begins (SQLite serializes concurrent writes)
3. Check if slot already booked
4. If available, insert appointment
5. Transaction commits (or rolls back on conflict)

The unique index on `(slot_datetime) WHERE status = 'booked'` ensures no double-booking even under race conditions.

## Project Structure

```
├── src/
│   ├── index.ts              # Express server
│   ├── routes/
│   │   ├── booking.route.ts  # POST /api/appointments/book
│   │   └── vapi.route.ts     # POST /api/vapi/webhook
│   ├── services/
│   │   └── booking.service.ts # Core booking logic
│   ├── middleware/
│   │   └── idempotency.ts    # Idempotency-Key validation
│   ├── db/
│   │   └── sqlite.ts         # SQLite setup & queries
│   └── types/
│       └── index.ts          # TypeScript types
├── test/
│   └── demo.ts               # Test suite for 3 requirements
├── vapi/
│   ├── assistant-config.json # Vapi assistant configuration
│   └── tools-config.json     # Function definitions
└── data/
    └── appointments.db       # SQLite database (auto-created)
```
