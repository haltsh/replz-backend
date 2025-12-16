// routes/intake.js
import express from 'express';
import { db } from '../db.js';

const router = express.Router();
/**
 * 먹은 음식 추가
 */
router.post('/intake', async (req, res) => {
  console.log('🔥 [POST] /api/intake 호출됨');
  console.log('📦 req.body:', req.body);

  try {
    /**
     * 🔹 camelCase / snake_case 둘 다 허용
     */
    const user_id =
      req.body.user_id ?? req.body.userId;

    const meal_name =
      req.body.meal_name ?? req.body.mealName;

    const calories = req.body.calories;
    const carbs = req.body.carbs ?? 0;
    const protein = req.body.protein ?? 0;
    const fat = req.body.fat ?? 0;

    const intake_date =
      req.body.intake_date ??
      req.body.intakeDate ??
      new Date().toISOString().split('T')[0];

    console.log('🧪 파싱 결과:', {
      user_id,
      meal_name,
      calories,
      carbs,
      protein,
      fat,
      intake_date
    });

    /**
     * 🔹 유효성 검사 (여기 걸리면 에러 아님!)
     */
    if (!user_id || !meal_name || calories == null) {
      console.warn('⚠️ 유효성 검사 실패');

      return res.status(400).json({
        success: false,
        error: '필수 정보가 누락되었습니다.',
        debug: {
          user_id,
          meal_name,
          calories
        }
      });
    }

    /**
     * 🔹 DB INSERT
     */
    const [result] = await db.query(
      `
      INSERT INTO daily_intake
      (user_id, meal_name, calories, carbs, protein, fat, intake_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        user_id,
        meal_name,
        Math.round(calories),
        Math.round(carbs),
        Math.round(protein),
        Math.round(fat),
        intake_date
      ]
    );

    console.log(
      `✅ 먹은 음식 추가 완료: ${meal_name} (${calories} kcal)`
    );

    return res.json({
      success: true,
      intake_id: result.insertId,
      message: '먹은 음식이 추가되었습니다.'
    });

  } catch (error) {
    /**
     * 🔥 진짜 에러 (DB, SQL, 서버)
     */
    console.error('❌ 먹은 음식 추가 실패 [ERROR]');
    console.error({
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlMessage: error.sqlMessage,
      sql: error.sql
    });

    return res.status(500).json({
      success: false,
      error: '먹은 음식 추가에 실패했습니다.',
      message: error.message
    });
  }
});

/**
 * 특정 날짜 섭취 기록 조회
 */
router.get('/intake/:userId/:date', async (req, res) => {
  try {
    const { userId, date } = req.params;

    const [records] = await db.query(
      `
      SELECT *
      FROM daily_intake
      WHERE user_id = ? AND intake_date = ?
      ORDER BY created_at DESC
      `,
      [userId, date]
    );

    const totals = records.reduce(
      (acc, record) => ({
        calories: acc.calories + (record.calories || 0),
        carbs: acc.carbs + (record.carbs || 0),
        protein: acc.protein + (record.protein || 0),
        fat: acc.fat + (record.fat || 0),
      }),
      { calories: 0, carbs: 0, protein: 0, fat: 0 }
    );

    res.json({
      success: true,
      records,
      totals
    });

  } catch (error) {
    console.error('❌ 섭취 기록 조회 실패:', error);

    res.status(500).json({
      success: false,
      error: '섭취 기록 조회에 실패했습니다.'
    });
  }
});

/**
 * 섭취 기록 삭제
 */
router.delete('/intake/:intakeId', async (req, res) => {
  try {
    const { intakeId } = req.params;

    await db.query(
      'DELETE FROM daily_intake WHERE intake_id = ?',
      [intakeId]
    );

    res.json({
      success: true,
      message: '섭취 기록이 삭제되었습니다.'
    });

  } catch (error) {
    console.error('❌ 섭취 기록 삭제 실패:', error);

    res.status(500).json({
      success: false,
      error: '섭취 기록 삭제에 실패했습니다.'
    });
  }
});

export default router;
