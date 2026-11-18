export function listSettings(db) {
  return db.prepare('SELECT * FROM settings').all();
}

export function findSetting(db, key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
}

export function saveSetting(db, key, value) {
  return db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value).run();
}

export function listAgentSettings(db) {
  return db.prepare("SELECT key, value FROM settings WHERE key IN ('report_interval', 'ping_node_ct', 'ping_node_cu', 'ping_node_cm')").all();
}

export function saveVisits(db, total, today, date) {
  return db.prepare(`INSERT INTO settings (key, value) VALUES ('visits_total', ?), ('visits_today', ?), ('visits_date', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(total, today, date).run();
}
