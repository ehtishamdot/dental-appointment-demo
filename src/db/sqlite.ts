import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'data/appointments.db');

const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    slot_datetime TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'booked',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE UNIQUE INDEX IF NOT EXISTS unique_booked_slot
  ON appointments(slot_datetime)
  WHERE status = 'booked';

  CREATE INDEX IF NOT EXISTS idx_appointments_slot ON appointments(slot_datetime);
  CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);

  CREATE TABLE IF NOT EXISTS idempotency_keys (
    idempotency_key TEXT PRIMARY KEY,
    request_hash TEXT NOT NULL,
    response_status INTEGER NOT NULL,
    response_body TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at);
`);

console.log(`Database initialized: ${dbPath}`);

export const statements = {
  getIdempotencyKey: db.prepare(`
    SELECT * FROM idempotency_keys WHERE idempotency_key = ?
  `),

  insertIdempotencyKey: db.prepare(`
    INSERT OR IGNORE INTO idempotency_keys (idempotency_key, request_hash, response_status, response_body)
    VALUES (?, ?, ?, ?)
  `),

  getBookedSlot: db.prepare(`
    SELECT id FROM appointments
    WHERE slot_datetime = ? AND status = 'booked'
  `),

  insertAppointment: db.prepare(`
    INSERT INTO appointments (id, patient_id, slot_datetime, status)
    VALUES (?, ?, ?, 'booked')
  `),

  getAppointmentById: db.prepare(`
    SELECT * FROM appointments WHERE id = ?
  `),

  cancelAppointment: db.prepare(`
    UPDATE appointments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
};

export const bookAppointmentTransaction = db.transaction(
  (id: string, patientId: string, slotDatetime: string) => {
    const existing = statements.getBookedSlot.get(slotDatetime);
    if (existing) {
      return { success: false, error_code: 'SLOT_TAKEN' };
    }

    statements.insertAppointment.run(id, patientId, slotDatetime);
    return { success: true, appointment_id: id };
  }
);
