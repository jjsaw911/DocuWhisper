import { pool } from "./db";

export type NoteCreditUsageSummary = {
  currentPeriodCount: number;
  totalCount: number;
  currentPeriodStart: Date;
  nextResetAt: Date;
};

export function getNoteCreditPeriodWindow(reference = new Date()): {
  start: Date;
  end: Date;
} {
  const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  const end = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1));
  return { start, end };
}

export async function ensureNoteCreditUsageSchema() {
  await pool.query(`
    ALTER TABLE subscriptions
      ADD COLUMN IF NOT EXISTS plan_code text;
  `);

  await pool.query(`
    ALTER TABLE notes
      ADD COLUMN IF NOT EXISTS credit_consumed_at timestamp;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS note_credit_events (
      id serial PRIMARY KEY,
      user_id varchar NOT NULL,
      note_id integer NOT NULL UNIQUE,
      event_type text NOT NULL DEFAULT 'finalized_soap',
      billing_period_start timestamp NOT NULL,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS note_credit_events_user_id_created_at_idx
      ON note_credit_events (user_id, created_at);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS note_credit_events_user_id_billing_period_start_idx
      ON note_credit_events (user_id, billing_period_start);
  `);
}
