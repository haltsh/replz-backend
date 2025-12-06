import express from "express";
import multer from "multer";
import path from "path";
import { db } from "../db.js";
import { processReceipt } from "../ocr/processReceipt.js";

const router = express.Router();

// 이미지 업로드 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}_${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("이미지 파일만 업로드 가능합니다."));
  }
});

// 1️⃣ 영수증 이미지 업로드 + OCR 처리
router.post("/upload", upload.single("receipt"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "파일이 없습니다." });
    }

    const user_id = req.body.user_id || 1;
    const imagePath = req.file.path;
    const imageUrl = `/uploads/${req.file.filename}`;

    // receipts 테이블에 이미지 저장
    const [result] = await db.query(
      "INSERT INTO receipts (user_id, image_url) VALUES (?, ?)",
      [user_id, imageUrl]
    );

    const receipt_id = result.insertId;

    // OCR 처리
    try {
      console.log('🔍 OCR 처리 시작...');
      const ocrResult = await processReceipt(imagePath);
      
      console.log('📋 OCR 결과:', ocrResult);

      // processReceipt가 딕셔너리 형태로 반환
      // { "재료명": ["카테고리", 수량, 유통기한(일), "실제날짜"], ... }
      let extractedData = {};
      
      if (Array.isArray(ocrResult) && ocrResult.length > 0) {
        extractedData = ocrResult[0];
      } else if (typeof ocrResult === 'object' && ocrResult !== null) {
        extractedData = ocrResult;
      }

      // receipt_items 테이블에 추출된 품목 저장
      const itemNames = Object.keys(extractedData);
      
      if (itemNames.length > 0) {
        const values = itemNames.map(name => {
          const itemData = extractedData[name];
          const quantity = Array.isArray(itemData) ? (itemData[1] || 1) : 1;
          return [receipt_id, name, quantity];
        });
        
        await db.query(
          "INSERT INTO receipt_items (receipt_id, item_name, quantity) VALUES ?",
          [values]
        );
        
        console.log(`✅ ${itemNames.length}개 항목 저장 완료`);
      }

      res.json({
        receipt_id,
        image_url: imageUrl,
        extracted_items: extractedData, // 딕셔너리 형태로 반환
        message: "영수증 처리 완료"
      });

    } catch (ocrError) {
      console.error("❌ OCR 처리 실패:", ocrError);
      res.json({
        receipt_id,
        image_url: imageUrl,
        extracted_items: {},
        message: "이미지는 저장되었으나 OCR 처리 실패"
      });
    }

  } catch (error) {
    console.error("❌ 업로드 에러:", error);
    res.status(500).json({ error: error.message });
  }
});

// 2️⃣ OCR 추출 결과 조회
router.get("/:receipt_id/items", async (req, res) => {
  try {
    const [data] = await db.query(
      "SELECT item_name, quantity FROM receipt_items WHERE receipt_id = ?",
      [req.params.receipt_id]
    );
    res.json({ items: data });
  } catch (error) {
    console.error('영수증 아이템 조회 실패:', error);
    res.status(500).json({ error: '조회 실패' });
  }
});

// 3️⃣ 영수증 목록 조회
router.get("/", async (req, res) => {
  try {
    const user_id = req.query.user_id || 1;
    
    const [data] = await db.query(`
      SELECT 
        receipt_id,
        image_url,
        DATE_FORMAT(uploaded_at, '%Y-%m-%d %H:%i') as uploaded_at
      FROM receipts
      WHERE user_id = ?
      ORDER BY uploaded_at DESC
    `, [user_id]);
    
    res.json(data);
  } catch (error) {
    console.error('영수증 목록 조회 실패:', error);
    res.status(500).json({ error: '조회 실패' });
  }
});

// 4️⃣ items 테이블에 일괄 추가/업데이트
router.post("/items/batch", async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items 배열이 필요합니다." });
    }

    const values = items.map(({ item_name, category, basic_expiration_days }) => [
      item_name,
      category || "기타",
      basic_expiration_days || null
    ]);

    const [result] = await db.query(`
      INSERT INTO items (item_name, category, basic_expiration_days)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        category = VALUES(category),
        basic_expiration_days = VALUES(basic_expiration_days)
    `, [values]);

    res.json({ 
      message: "items 저장 완료",
      affectedRows: result.affectedRows 
    });
  } catch (error) {
    console.error('items 저장 실패:', error);
    res.status(500).json({ error: '저장 실패' });
  }
});

// 5️⃣ inventories에 추가
router.post("/add-to-inventory", async (req, res) => {
  try {
    const { user_id, items } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "items가 필요합니다." });
    }

    // 각 아이템 처리
    for (const { item_name, quantity, expiration_date } of items) {
      // item_name으로 item_id 찾기
      const [itemResult] = await db.query(
        "SELECT item_id FROM items WHERE item_name = ?",
        [item_name]
      );

      if (itemResult.length === 0) {
        // items 테이블에 없으면 자동으로 추가
        const [insertResult] = await db.query(
          "INSERT INTO items (item_name, category) VALUES (?, ?)",
          [item_name, "기타"]
        );
        
        const item_id = insertResult.insertId;

        // inventories에 추가
        await db.query(
          "INSERT INTO inventories (user_id, item_id, quantity, expiration_date) VALUES (?, ?, ?, ?)",
          [user_id, item_id, quantity || 1, expiration_date]
        );
      } else {
        const item_id = itemResult[0].item_id;

        // inventories에 추가
        await db.query(
          "INSERT INTO inventories (user_id, item_id, quantity, expiration_date) VALUES (?, ?, ?, ?)",
          [user_id, item_id, quantity || 1, expiration_date]
        );
      }
    }

    res.json({ message: "재고 추가 완료" });
  } catch (error) {
    console.error('재고 추가 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;