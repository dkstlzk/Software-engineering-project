import { Router } from "express";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined in environment");
}

// ------------------------
// POST /auth/login
// ------------------------
router.post("/login", async (req, res) => {
  try {
    const email = req.body?.email?.trim();
    const password = req.body?.password;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Login failed" });
  }
});

export default router;