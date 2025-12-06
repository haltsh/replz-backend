import express from "express";
import { db } from "../db.js";

const router = express.Router();

/**
 * GET /api/users/:userId
 * 사용자 정보 조회 (email 제거)
 */
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const [rows] = await db.query(
      `SELECT user_id, username, login_id, height, weight, age, gender, target_weight 
       FROM users 
       WHERE user_id = ?`, 
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("GET /users Error:", error);
    return res.status(500).json({ message: "서버 오류" });
  }
});

/**
 * PUT /api/users/:userId/health
 * 건강 정보 저장 (height, weight, age, gender, target_weight)
 */
router.put("/:userId/health", async (req, res) => {
  try {
    const { userId } = req.params;
    const { height, weight, age, gender, target_weight } = req.body;

    // 기본 유효성 검사
    if (!height || !weight || !age || !gender) {
      return res.status(400).json({ message: "필수 필드 누락" });
    }

    const query = `
      UPDATE users
      SET height = ?, weight = ?, age = ?, gender = ?, target_weight = ?
      WHERE user_id = ?
    `;

    await db.query(query, [
      height,
      weight,
      age,
      gender,
      target_weight,
      userId,
    ]);

    return res.json({ message: "건강 프로필이 저장되었습니다." });
  } catch (error) {
    console.error("PUT /users/health Error:", error);
    return res.status(500).json({ message: "서버 오류" });
  }
});

export default router;