import "../config/env"; 

import { db } from "./index";
import { users } from "./schema";
import bcrypt from "bcrypt";
import logger from "../shared/utils/logger";

async function seed() {
  try {
    const password = "password123"; // dev only
    const passwordHash = await bcrypt.hash(password, 10);

    const seedData = [
      {
        name: "Admin User",
        email: "admin@iitj.ac.in",
        passwordHash,
        role: "ADMIN" as const,
      },
      {
        name: "Staff User",
        email: "staff@iitj.ac.in",
        passwordHash,
        role: "STAFF" as const,
      },
      {
        name: "Faculty User",
        email: "faculty@iitj.ac.in",
        passwordHash,
        role: "FACULTY" as const,
      },
      {
        name: "Student User",
        email: "student@iitj.ac.in",
        passwordHash,
        role: "STUDENT" as const,
      },
    ];

    for (const user of seedData) {
      await db.insert(users).values(user);
    }

    logger.info("✅ Users seeded successfully");
    process.exit(0);
  } catch (error: any) {
    if (error?.cause?.code === "23505") {
      logger.info("⚠️ Users already exist (unique constraint hit)");
      process.exit(0);
    }

    logger.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seed();