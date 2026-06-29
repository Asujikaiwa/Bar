-- D1 schema — เก็บแค่ข้อมูลร้าน (ถาวร ไม่ถูกลบรายคืน)
-- รัน: wrangler d1 execute bar-app --file=./schema.sql --remote

CREATE TABLE IF NOT EXISTS bars (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 120,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ร้านตัวอย่างไว้เทส
INSERT OR IGNORE INTO bars (id, name, lat, lng, radius_meters)
VALUES ('demo', 'Demo Bar', 13.7563, 100.5018, 150);
