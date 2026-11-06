// EXPLAIN QUERY PLAN for the AGY-PORT 09 reads on node:sqlite. Tables carry
// the columns these queries use; indexes are copied verbatim from dbInit.ts and
// deliverySchema.ts. Output goes to the path given as argv[2].
const {DatabaseSync} = require('node:sqlite');
const fs = require('fs');
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT, due_date TEXT,
  due_time TEXT, is_completed INTEGER NOT NULL DEFAULT 0, deleted_at TEXT)`);
db.exec('CREATE INDEX idx_tasks_user_due ON tasks(user_id, is_completed, due_date, due_time)');
db.exec(`CREATE TABLE notes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, is_pinned INTEGER,
  sort_order INTEGER, updated_at TEXT, deleted_at TEXT)`);
db.exec('CREATE INDEX idx_notes_user_sort ON notes(user_id, is_pinned, sort_order, updated_at)');
db.exec(`CREATE TABLE reminders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, status TEXT,
  trigger_at TEXT, snooze_count INTEGER NOT NULL DEFAULT 0, deleted_at TEXT)`);
db.exec('CREATE INDEX idx_reminders_user_trigger ON reminders(user_id, status, trigger_at)');
db.exec(`CREATE TABLE reminder_delivery_jobs (reminder_id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
  generation INTEGER, state TEXT, trigger_at TEXT, registration_state TEXT,
  registered_generation INTEGER, source_type TEXT, source_id TEXT)`);
db.exec('CREATE INDEX idx_delivery_jobs_owner ON reminder_delivery_jobs(user_id, state, trigger_at)');
db.exec('CREATE INDEX idx_delivery_jobs_source ON reminder_delivery_jobs(user_id, source_type, source_id)');
db.exec(`CREATE TABLE reminder_delivery_events (id INTEGER PRIMARY KEY AUTOINCREMENT,
  reminder_id TEXT NOT NULL, user_id TEXT NOT NULL, generation INTEGER, event TEXT, code TEXT,
  origin TEXT, occurred_at TEXT)`);
db.exec('CREATE INDEX idx_delivery_events_reminder ON reminder_delivery_events(reminder_id, id)');
db.exec(`CREATE TABLE local_settings (user_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
  updated_at TEXT NOT NULL, PRIMARY KEY (user_id, key))`);

const queries = {
  'health aggregate (reminderHealthStore.read)': `SELECT
     COALESCE(SUM(j.state = 'armed'), 0) AS armed,
     COALESCE(SUM(j.state = 'armed' AND j.registration_state = 'registered'
       AND j.registered_generation = j.generation
       AND (SELECT e.event FROM reminder_delivery_events e
             WHERE e.reminder_id = j.reminder_id AND e.user_id = j.user_id
               AND e.generation = j.generation AND e.origin = 'native'
               AND e.event IN ('registered', 'registered_inexact')
             ORDER BY e.id DESC LIMIT 1) = 'registered_inexact'), 0) AS inexact
   FROM reminder_delivery_jobs j WHERE j.user_id = 'u'`,
  'health recent events (bounded table, 500 rows max)': `SELECT event, origin, occurred_at
   FROM reminder_delivery_events WHERE user_id = 'u' ORDER BY id DESC LIMIT 20`,
  'statistics: completed tasks': `SELECT COUNT(*) FROM tasks
   WHERE user_id = 'u' AND deleted_at IS NULL AND is_completed = 1`,
  'statistics: notes': `SELECT COUNT(*) FROM notes WHERE user_id = 'u' AND deleted_at IS NULL`,
  'statistics: reminder outcomes': `SELECT
     COALESCE(SUM(CASE WHEN status = 'acknowledged' AND snooze_count = 0 THEN 1 ELSE 0 END), 0),
     COALESCE(SUM(CASE WHEN status IN ('acknowledged', 'missed') THEN 1 ELSE 0 END), 0)
   FROM reminders WHERE user_id = 'u' AND deleted_at IS NULL`,
  'event defaults (personalMemoryStore.read)': `SELECT value FROM local_settings
   WHERE user_id = 'u' AND key = 'event_memory_v1'`,
};
const out = [`node ${process.version}, sqlite ${db.prepare('select sqlite_version() v').get().v}`, ''];
for (const [name, sql] of Object.entries(queries)) {
  out.push(`## ${name}`);
  for (const row of db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all()) out.push(`  ${row.detail}`);
  out.push('');
}
fs.writeFileSync(process.argv[2], out.join('\n'));
console.log(out.join('\n'));
