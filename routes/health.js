// routes/health.js
import express from 'express';
import { db } from '../db.js';  // ✅ 중괄호로 import

const router = express.Router();

// 1. 사용자 건강 프로필 조회
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const [users] = await db.query(
      'SELECT user_id, username, height, weight, age, gender, target_weight FROM users WHERE user_id = ?',
      [userId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    
    res.json(users[0]);
  } catch (error) {
    console.error('프로필 조회 오류:', error);
    res.status(500).json({ error: '프로필 조회 실패' });
  }
});

// 2. 사용자 건강 프로필 업데이트
router.put('/users/:userId/health', async (req, res) => {
  try {
    const { userId } = req.params;
    const { height, weight, age, gender, target_weight } = req.body;
    
    await db.query(
      'UPDATE users SET height = ?, weight = ?, age = ?, gender = ?, target_weight = ? WHERE user_id = ?',
      [height, weight, age, gender, target_weight, userId]
    );
    
    res.json({ success: true, message: '건강 프로필이 업데이트되었습니다.' });
  } catch (error) {
    console.error('프로필 업데이트 오류:', error);
    res.status(500).json({ error: '프로필 업데이트 실패' });
  }
});

// 3. 오늘의 섭취량 조회 (특정 날짜)
router.get('/health/intake/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { date } = req.query; // YYYY-MM-DD
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const [results] = await db.query(
      `SELECT 
        COALESCE(SUM(calories), 0) as calories,
        COALESCE(SUM(carbs), 0) as carbs,
        COALESCE(SUM(protein), 0) as protein,
        COALESCE(SUM(fat), 0) as fat
      FROM daily_intake 
      WHERE user_id = ? AND intake_date = ?`,
      [userId, targetDate]
    );
    
    res.json(results[0] || { calories: 0, carbs: 0, protein: 0, fat: 0 });
  } catch (error) {
    console.error('섭취량 조회 오류:', error);
    res.status(500).json({ error: '섭취량 조회 실패' });
  }
});

// 4. 식사 기록 추가
router.post('/health/intake', async (req, res) => {
  try {
    const { user_id, meal_name, calories, carbs, protein, fat, intake_date } = req.body;
    
    const targetDate = intake_date || new Date().toISOString().split('T')[0];
    
    const [result] = await db.query(
      `INSERT INTO daily_intake (user_id, meal_name, calories, carbs, protein, fat, intake_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, meal_name, calories || 0, carbs || 0, protein || 0, fat || 0, targetDate]
    );
    
    res.json({ 
      success: true, 
      intake_id: result.insertId,
      message: '식사 기록이 추가되었습니다.' 
    });
  } catch (error) {
    console.error('식사 기록 추가 오류:', error);
    res.status(500).json({ error: '식사 기록 추가 실패' });
  }
});

// 5. 몸무게 기록 조회 (최근 2주)
router.get('/health/weight/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const [results] = await db.query(
      `SELECT weight, DATE_FORMAT(record_date, '%Y-%m-%d') as record_date
      FROM daily_weight 
      WHERE user_id = ? 
      AND record_date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
      ORDER BY record_date ASC`,
      [userId]
    );
    
    res.json(results);
  } catch (error) {
    console.error('몸무게 기록 조회 오류:', error);
    res.status(500).json({ error: '몸무게 기록 조회 실패' });
  }
});

// 6. 몸무게 기록 추가/업데이트
router.post('/health/weight', async (req, res) => {
  try {
    const { user_id, weight, record_date } = req.body;
    
    const targetDate = record_date || new Date().toISOString().split('T')[0];
    
    // UPSERT: 같은 날짜 기록이 있으면 업데이트, 없으면 추가
    await db.query(
      `INSERT INTO daily_weight (user_id, weight, record_date)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE weight = VALUES(weight)`,
      [user_id, weight, targetDate]
    );
    
    res.json({ 
      success: true,
      message: '몸무게가 기록되었습니다.' 
    });
  } catch (error) {
    console.error('몸무게 기록 오류:', error);
    res.status(500).json({ error: '몸무게 기록 실패' });
  }
});

// 7. 최근 N일 식단 일기 조회
router.get('/health/meals/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { days = 5 } = req.query;
    
    const [results] = await db.query(
      `SELECT 
        DATE_FORMAT(intake_date, '%Y-%m-%d') as date,
        COALESCE(SUM(carbs), 0) as carbs,
        COALESCE(SUM(protein), 0) as protein,
        COALESCE(SUM(fat), 0) as fat
      FROM daily_intake 
      WHERE user_id = ? 
      AND intake_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY intake_date
      ORDER BY intake_date DESC
      LIMIT ?`,
      [userId, parseInt(days), parseInt(days)]
    );
    
    res.json(results);
  } catch (error) {
    console.error('식단 일기 조회 오류:', error);
    res.status(500).json({ error: '식단 일기 조회 실패' });
  }
});

// 8. 특정 날짜의 상세 식사 내역 조회
router.get('/health/meals/:userId/detail', async (req, res) => {
  try {
    const { userId } = req.params;
    const { date } = req.query;
    
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const [results] = await db.query(
      `SELECT intake_id, meal_name, calories, carbs, protein, fat, 
        DATE_FORMAT(created_at, '%H:%i') as time
      FROM daily_intake 
      WHERE user_id = ? AND intake_date = ?
      ORDER BY created_at ASC`,
      [userId, targetDate]
    );
    
    res.json(results);
  } catch (error) {
    console.error('식사 내역 조회 오류:', error);
    res.status(500).json({ error: '식사 내역 조회 실패' });
  }
});

// 9. 식사 기록 삭제
router.delete('/health/intake/:intakeId', async (req, res) => {
  try {
    const { intakeId } = req.params;
    
    await db.query('DELETE FROM daily_intake WHERE intake_id = ?', [intakeId]);
    
    res.json({ success: true, message: '식사 기록이 삭제되었습니다.' });
  } catch (error) {
    console.error('식사 기록 삭제 오류:', error);
    res.status(500).json({ error: '식사 기록 삭제 실패' });
  }
});

// 10. 몸무게 기록 삭제
router.delete('/health/weight/:weightId', async (req, res) => {
  try {
    const { weightId } = req.params;
    
    await db.query('DELETE FROM daily_weight WHERE weight_id = ?', [weightId]);
    
    res.json({ success: true, message: '몸무게 기록이 삭제되었습니다.' });
  } catch (error) {
    console.error('몸무게 기록 삭제 오류:', error);
    res.status(500).json({ error: '몸무게 기록 삭제 실패' });
  }
});

// 11. 주간 통계 조회 (추가 기능)
router.get('/health/stats/:userId/weekly', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // 최근 7일 평균 영양소
    const [nutrition] = await db.query(
      `SELECT 
        ROUND(AVG(daily_calories), 1) as avg_calories,
        ROUND(AVG(daily_carbs), 1) as avg_carbs,
        ROUND(AVG(daily_protein), 1) as avg_protein,
        ROUND(AVG(daily_fat), 1) as avg_fat
      FROM (
        SELECT 
          intake_date,
          SUM(calories) as daily_calories,
          SUM(carbs) as daily_carbs,
          SUM(protein) as daily_protein,
          SUM(fat) as daily_fat
        FROM daily_intake
        WHERE user_id = ? 
        AND intake_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        GROUP BY intake_date
      ) as daily_totals`,
      [userId]
    );
    
    // 주간 체중 변화
    const [weight] = await db.query(
      `SELECT 
        (SELECT weight FROM daily_weight WHERE user_id = ? ORDER BY record_date DESC LIMIT 1) as current_weight,
        (SELECT weight FROM daily_weight WHERE user_id = ? AND record_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) ORDER BY record_date ASC LIMIT 1) as week_ago_weight`,
      [userId, userId]
    );
    
    const weightChange = weight[0].current_weight && weight[0].week_ago_weight 
      ? (weight[0].current_weight - weight[0].week_ago_weight).toFixed(1)
      : 0;
    
    res.json({
      nutrition: nutrition[0],
      weight: {
        current: weight[0].current_weight,
        change: weightChange
      }
    });
  } catch (error) {
    console.error('주간 통계 조회 오류:', error);
    res.status(500).json({ error: '주간 통계 조회 실패' });
  }
});

export default router;