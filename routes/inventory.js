import express from "express";
import { db } from "../db.js";

const router = express.Router();

// 재고 목록 조회 (단위 포함)
router.get("/", async (req, res) => {
  try {
    const user_id = req.query.user_id || 1;
    
    const [data] = await db.query(`
      SELECT 
        i.inventory_id, 
        i.item_id,
        it.item_name,
        it.category,
        it.calories,
        it.carbs,
        it.protein,
        it.fat,
        i.quantity,
        i.unit,
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

// 재고 추가 (단위 포함, 중복 체크)
router.post("/", async (req, res) => {
  try {
    const { user_id, item_id, quantity, unit, expiration_date } = req.body;
    
    // 중복 체크: 같은 user_id, item_id, unit, expiration_date
    const [existing] = await db.query(`
      SELECT inventory_id, quantity 
      FROM inventories 
      WHERE user_id = ? AND item_id = ? AND unit = ? AND expiration_date = ?
    `, [user_id, item_id, unit || '개', expiration_date]);
    
    if (existing.length > 0) {
      // 이미 있으면 수량 업데이트
      const newQuantity = existing[0].quantity + quantity;
      await db.query(`
        UPDATE inventories 
        SET quantity = ? 
        WHERE inventory_id = ?
      `, [newQuantity, existing[0].inventory_id]);
      
      return res.json({ 
        message: "재고 수량이 업데이트되었습니다!",
        updated: true,
        inventory_id: existing[0].inventory_id,
        new_quantity: newQuantity
      });
    }
    
    // 없으면 새로 추가
    const [result] = await db.query(`
      INSERT INTO inventories (user_id, item_id, quantity, unit, expiration_date)
      VALUES (?, ?, ?, ?, ?)
    `, [user_id, item_id, quantity, unit || '개', expiration_date]);
    
    res.json({ 
      message: "재고가 추가되었습니다!",
      updated: false,
      inventory_id: result.insertId
    });
  } catch (error) {
    console.error('재고 추가 실패:', error);
    res.status(500).json({ error: '재고 추가 실패' });
  }
});

// 재고 수량 업데이트
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, quantity } = req.body;
    
    await db.query(
      "UPDATE inventories SET quantity = ? WHERE inventory_id = ? AND user_id = ?",
      [quantity, id, user_id]
    );
    
    res.json({ message: "재고가 업데이트되었습니다!" });
  } catch (error) {
    console.error('재고 업데이트 실패:', error);
    res.status(500).json({ error: '재고 업데이트 실패' });
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