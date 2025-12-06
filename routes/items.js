import express from "express";
import { db } from "../db.js";

const router = express.Router();

// 품목 목록 조회
router.get("/", async (req, res) => {
  try {
    const [data] = await db.query(`
      SELECT item_id, item_name, category
      FROM items
      ORDER BY item_name ASC
    `);
    res.json(data);
  } catch (error) {
    console.error('품목 조회 실패:', error);
    res.status(500).json({ error: '품목 조회 실패' });
  }
});

export default router;