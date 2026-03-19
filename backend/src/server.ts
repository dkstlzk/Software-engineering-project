import "./config/env";

import express from "express";
import { db } from "./db";
import { buildings } from "./db/schema";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

app.get("/", async (req, res) => {
  try {
    const result = await db.select().from(buildings);

    res.json({
      message: "Fetched using Drizzle",
      data: result,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed" });
  }
});

app.post("/buildings", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const result = await db
      .insert(buildings)
      .values({ name })
      .returning();

    res.json({
      message: "Building created",
      data: result[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Insert failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});