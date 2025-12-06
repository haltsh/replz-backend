import express from "express";
import { db } from "../db.js";

const router = express.Router();

// 재고 목록 조회
router.get("/", async (req, res) => {
  try {
    const user_id = req.query.user_id || 1;
    
    const [data] = await db.query(`
      SELECT 
        i.inventory_id, 
        i.item_id,
        it.item_name, 
        i.quantity, 
        DATE_FORMAT(i.expiration_date, '%Y-%m-%d') as expiration_date,
        DATE_FORMAT(i.purchased_date, '%Y-%m-%d') as purchased_date,
        DATEDIFF(i.expiration_date, CURDATE()) as dday,
        i.created_at,
        i.updated_at
      FROM inventories i
      JOIN items it ON i.item_id = it.item_id
      WHERE i.user_id = ?
      ORDER BY i.expiration_date ASC
    `, [user_id]);
    
    res.json(data);
  } catch (error) {
    console.error('재고 조회 실패:', error);
    res.status(500).json({ error: '재고 조회 실패' });
  }
});

// 재고 추가
router.post("/", async (req, res) => {
  try {
    const { user_id, item_id, quantity, expiration_date } = req.body;
    
    await db.query(`
      INSERT INTO inventories (user_id, item_id, quantity, expiration_date)
      VALUES (?, ?, ?, ?)
    `, [user_id, item_id, quantity, expiration_date]);
    
    res.json({ message: "재고가 추가되었습니다!" });
  } catch (error) {
    console.error('재고 추가 실패:', error);
    res.status(500).json({ error: '재고 추가 실패' });
  }
});

// 재고 삭제
router.delete("/:id", async (req, res) => {
  try {
    const user_id = req.query.user_id || 1;
    
    await db.query(
      "DELETE FROM inventories WHERE inventory_id = ? AND user_id = ?",
      [req.params.id, user_id]
    );
    
    res.json({ message: "재고가 삭제되었습니다!" });
  } catch (error) {
    console.error('재고 삭제 실패:', error);
    res.status(500).json({ error: '재고 삭제 실패' });
  }
});

export default router;