-- Optional seed data for first deployment

BEGIN;

-- Ensure one global preferences row exists
INSERT INTO system_preferences (
  id,
  manual_data_loading,
  auto_load_dependent_data,
  auto_load_sections
)
VALUES (
  1,
  true,
  false,
  '{"dashboard":false,"bookings":false,"rooms":false,"availability":false,"bookingRequests":false,"users":false}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Create a default slot system if none exists
INSERT INTO slot_systems (name, is_locked, committed_snapshot_json, version)
SELECT 'Default Slot System', false, '{}'::jsonb, 1
WHERE NOT EXISTS (SELECT 1 FROM slot_systems);

-- Sample campus buildings
INSERT INTO buildings (name, description, location)
VALUES
  ('Academic Block A', 'Main teaching block', 'North Campus'),
  ('Academic Block B', 'Large lecture halls', 'North Campus')
ON CONFLICT DO NOTHING;

-- Sample rooms
INSERT INTO rooms (name, building_id, capacity, room_type, has_projector, has_mic, accessible)
SELECT 'A-101', b.id, 120, 'LECTURE_HALL', true, true, true
FROM buildings b
WHERE lower(b.name) = lower('Academic Block A')
ON CONFLICT DO NOTHING;

INSERT INTO rooms (name, building_id, capacity, room_type, has_projector, has_mic, accessible)
SELECT 'A-201', b.id, 60, 'CLASSROOM', true, false, true
FROM buildings b
WHERE lower(b.name) = lower('Academic Block A')
ON CONFLICT DO NOTHING;

INSERT INTO rooms (name, building_id, capacity, room_type, has_projector, has_mic, accessible)
SELECT 'B-LH1', b.id, 220, 'LECTURE_HALL', true, true, true
FROM buildings b
WHERE lower(b.name) = lower('Academic Block B')
ON CONFLICT DO NOTHING;

COMMIT;
