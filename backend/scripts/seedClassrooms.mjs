import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: "./.env" });

const { Pool } = pg;

const CLASSROOM_MAP = {
  BB: ["101", "102", "104", "105"],
  CI: ["110"],
  CS: ["101"],
  CY: ["107", "108"],
  EE: ["108", "109", "114", "115"],
  LHC: ["105", "106", "110", "204", "205", "206", "207", "304", "305", "306", "307", "308"],
  "LHC-2": ["101", "102", "103"],
  ME: ["108", "109", "114", "115"],
  MT: ["109", "110", "112", "113"],
  PH: ["101", "102", "104", "105"],
  SME: ["L1", "L2", "L5", "L6"],
  SOLA: ["SOLA"],
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function getOrCreateBuilding(client, buildingName) {
  const existing = await client.query(
    "SELECT id FROM buildings WHERE lower(name) = lower($1) LIMIT 1",
    [buildingName],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return { id: existing.rows[0].id, created: false };
  }

  const inserted = await client.query(
    "INSERT INTO buildings (name) VALUES ($1) RETURNING id",
    [buildingName],
  );

  return { id: inserted.rows[0].id, created: true };
}

async function roomExists(client, buildingId, roomName) {
  const existing = await client.query(
    "SELECT id FROM rooms WHERE building_id = $1 AND lower(name) = lower($2) LIMIT 1",
    [buildingId, roomName],
  );

  return Boolean(existing.rowCount && existing.rowCount > 0);
}

async function seedClassrooms() {
  const client = await pool.connect();

  let buildingsCreated = 0;
  let roomsCreated = 0;
  let roomsSkipped = 0;

  try {
    await client.query("BEGIN");

    const buildings = Object.entries(CLASSROOM_MAP)
      .map(([name, roomList]) => ({
        name,
        rooms: Array.from(new Set(roomList.map((value) => value.trim()).filter(Boolean))),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const building of buildings) {
      const result = await getOrCreateBuilding(client, building.name);
      if (result.created) {
        buildingsCreated += 1;
      }

      for (const roomName of building.rooms) {
        const exists = await roomExists(client, result.id, roomName);
        if (exists) {
          roomsSkipped += 1;
          continue;
        }

        await client.query(
          "INSERT INTO rooms (name, building_id) VALUES ($1, $2)",
          [roomName, result.id],
        );

        roomsCreated += 1;
      }
    }

    await client.query("COMMIT");

    console.log("Classroom seeding complete.");
    console.log(`Buildings created: ${buildingsCreated}`);
    console.log(`Rooms created: ${roomsCreated}`);
    console.log(`Rooms skipped (already existed): ${roomsSkipped}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedClassrooms()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed to seed classrooms:", error);
    process.exit(1);
  });
