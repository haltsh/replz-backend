// routes/health.js
import express from 'express';
import { db } from '../db.js';  // ✅ 중괄호로 import

const router = express.Router();
function calculateDailyNutrition({
  gender,
  weight,
  activityLevel = 'moderate',
  height,
  age,
  goal = 'maintain'
}) {
  const ACTIVITY_FACTOR = {
    low: 1.2,
    light: 1.375,
    moderate: 1.55,
    high: 1.725,
    very_high: 1.9
  };

  // BMR 계산
  const bmr = height && age
    ? gender === 'M'
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161
    : gender === 'M'
      ? 24 * weight
      : 22 * weight;

  // TDEE 계산
  const tdee = bmr * ACTIVITY_FACTOR[activityLevel];

  // 목표 칼로리
  const targetCalories = 
    goal === 'lose' ? tdee - 400 :
    goal === 'gain' ? tdee + 400 :
    tdee;

  // 탄단지 계산
  const protein = weight * 1.4;
  const proteinCalories = protein * 4;
  const fatCalories = targetCalories * 0.3;
  const fat = fatCalories / 9;
  const carbCalories = targetCalories - proteinCalories - fatCalories;
  const carbs = carbCalories / 4;

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    targetCalories: Math.round(targetCalories),
    macros: {
      calories: Math.round(targetCalories),
      carbs: Math.round(carbs),
      protein: Math.round(protein),
      fat: Math.round(fat)
    }
  };
}

// ✅ 사용자 권장 영양소 조회
router.get('/health/standards/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // 사용자 정보 조회
    const [users] = await db.query(
      'SELECT height, weight, age, gender, target_weight FROM users WHERE user_id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    const user = users[0];

    // 필수 정보가 없으면 기본값 반환
    if (!user.weight || !user.gender) {
      return res.json({
        calories: 2000,
        carbs: 300,
        protein: 48,
        fat: 60,
        isDefault: true
      });
    }

    // 목표 결정 (현재 vs 목표 몸무게)
    let goal = 'maintain';
    if (user.target_weight) {
      if (user.weight > user.target_weight) {
        goal = 'lose';
      } else if (user.weight < user.target_weight) {
        goal = 'gain';
      }
    }

    // 계산
    const nutrition = calculateDailyNutrition({
      gender: user.gender,
      weight: user.weight,
      activityLevel: 'moderate',
      height: user.height,
      age: user.age,
      goal
    });

    res.json({
      ...nutrition.macros,
      isDefault: false,
      goal,
      bmr: nutrition.bmr,
      tdee: nutrition.tdee
    });

  } catch (error) {
    console.error('❌ 권장 영양소 조회 실패:', error);
    res.status(500).json({ 
      error: '권장 영양소 조회에 실패했습니다.',
      message: error.message 
    });
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