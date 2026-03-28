import "../config/env"; 

import { db } from "./index";
import { users } from "./schema";
import bcrypt from "bcrypt";

async function seed() {
  try {
    const password = "password123"; // dev only
    const passwordHash = await bcrypt.hash(password, 10);

    const seedData = [
      {
        name: "Admin User",
        email: "admin@ura.com",
        passwordHash,
        role: "ADMIN" as const,
      },
      {
        name: "Staff User",
        email: "staff@ura.com",
        passwordHash,
        role: "STAFF" as const,
      },
      {
        name: "Faculty User",
        email: "faculty@ura.com",
        passwordHash,
        role: "FACULTY" as const,
      },
      {
        name: "Student User",
        email: "student@ura.com",
        passwordHash,
        role: "STUDENT" as const,
      },
    ];

    for (const user of seedData) {
      await db.insert(users).values(user);
    }

    console.log("✅ Users seeded successfully");
    process.exit(0);
  } catch (error: any) {
    if (error?.cause?.code === "23505") {
      console.log("⚠️ Users already exist (unique constraint hit)");
      process.exit(0);
    }

    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seed();