// routes/recipe.js
import express from 'express';
import { db } from '../db.js';
import { searchRecipes } from '../searchRecipes.js';
import { health_info } from '../health_info.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

const router = express.Router();

// ==========================================
// 크롤링 기반 레시피 검색 (메인 기능)
// ==========================================
router.post('/recipes/search', async (req, res) => {
  try {
    const { ingredients, limit = 5, userId } = req.body;
    
    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return res.status(400).json({ error: '재료를 최소 1개 이상 선택해주세요.' });
    }

    console.log('🔍 레시피 검색 시작:', ingredients);

    // 사용자의 전체 재고 가져오기
    let grocery = [];
    if (userId) {
      const [inventory] = await db.query(`
        SELECT DISTINCT i.item_name
        FROM inventories inv
        JOIN items i ON inv.item_id = i.item_id
        WHERE inv.user_id = ? AND inv.quantity > 0
      `, [userId]);
      grocery = inventory.map(row => row.item_name);
    }

    // searchRecipes.js를 사용하여 크롤링
    const recipes = await searchRecipes(ingredients, grocery, limit);
    
    console.log(`✅ ${recipes.length}개 레시피 검색 완료`);

    // 검색된 레시피를 DB에 저장 (선택사항)
    for (const recipe of recipes) {
      try {
        // 중복 체크
        const [existing] = await db.query(
          'SELECT recipe_id FROM recipes WHERE menu = ? LIMIT 1',
          [recipe.title]
        );

        if (existing.length === 0) {
          // 레시피 저장
          const [result] = await db.query(
            'INSERT INTO recipes (menu, description, image_url) VALUES (?, ?, ?)',
            [recipe.title, recipe.url, recipe.image]
          );
          const recipeId = result.insertId;

          // 재료 저장
          for (const ingredient of recipe.ingredients) {
            await db.query(
              'INSERT INTO recipe_items (recipe_id, ingredient_name, quantity) VALUES (?, ?, ?)',
              [recipeId, ingredient, 1]
            );
          }
          console.log(`💾 레시피 DB 저장 완료: ${recipe.title}`);
        }
      } catch (dbError) {
        console.error('DB 저장 중 오류 (무시하고 계속):', dbError.message);
        // DB 저장 실패해도 검색 결과는 반환
      }
    }

    res.json({ recipes });
  } catch (error) {
    console.error('❌ 레시피 검색 실패:', error);
    res.status(500).json({ 
      error: '레시피 검색 중 오류가 발생했습니다.',
      message: error.message 
    });
  }
});

// ==========================================
// 레시피 상세 정보 크롤링
// ==========================================
router.post('/recipes/fetch-detail', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL이 필요합니다.' });
    }

    console.log('📖 레시피 상세 정보 크롤링:', url);

    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000
    });
    
    const $ = cheerio.load(data);
    
    // 레시피 제목
    const title = $('.view2_summary h3').text().trim() || 
                  $('meta[property="og:title"]').attr('content') || 
                  '레시피 제목';
    
    // 이미지
    const image = $('#main_thumbs').attr('src') || 
                  $('meta[property="og:image"]').attr('content') || 
                  null;
    
    // 재료 파싱
    const ingredients = [];
    $('#divConfirmedMaterialArea ul li, .ready_ingre3 ul li').each((_, el) => {
      const $el = $(el);
      // <a> 태그를 우선 확인
      const $link = $el.find('.ingre_list_name a');
      const name = $link.length > 0
        ? $link.text().trim()  // <a>가 있으면 <a>의 텍스트만
        : $el.find('.ingre_list_name').text().trim();  // 없으면 전체

      const amount = $el.find('.ingre_list_ea').text().trim();
      
      if (name) {
        ingredients.push(amount ? `${name} ${amount}` : name);
      }
    });
    
    // 조리 순서 파싱
    const steps = [];
    $('.view_step_cont').each((_, el) => {
      const stepText = $(el).text().trim();
      if (stepText && stepText.length > 5) { // 너무 짧은 텍스트 제외
        steps.push(stepText);
      }
    });

    // 조리 순서가 없는 경우 대체 방법 시도
    if (steps.length === 0) {
      $('.view_step .view_step_cont_txt').each((_, el) => {
        const stepText = $(el).text().trim();
        if (stepText && stepText.length > 5) {
          steps.push(stepText);
        }
      });
    }
    
    // 팁/소개 파싱
    const tips = $('.view2_summary_info, .cont_ingre2').first().text().trim() || '';
    
    console.log(`✅ 상세 정보 파싱 완료: ${ingredients.length}개 재료, ${steps.length}개 단계`);

    res.json({
      title,
      image,
      ingredients,
      steps: steps.length > 0 ? steps : ['레시피 단계를 불러올 수 없습니다. 원본 사이트를 확인해주세요.'],
      tips,
      url
    });
  } catch (error) {
    console.error('❌ 레시피 상세 정보 가져오기 실패:', error);
    res.status(500).json({ 
      error: '레시피 상세 정보를 가져오는데 실패했습니다.',
      message: error.message 
    });
  }
});

// ==========================================
// 레시피 건강 정보 조회 (영양 분석)
// ==========================================
router.post('/recipes/health-info', async (req, res) => {
  try {
    const { recipe_url } = req.body;
    
    if (!recipe_url) {
      return res.status(400).json({ error: 'recipe_url이 필요합니다.' });
    }
    
    console.log(`🔍 레시피 건강 정보 분석 중: ${recipe_url}`);
    
    const healthData = await health_info(recipe_url);
    
    if (!healthData) {
      return res.status(500).json({ 
        error: '건강 정보 분석 실패',
        success: false 
      });
    }
    
    console.log('✅ 건강 정보 분석 완료:', healthData);
    
    res.json({
      health_info: healthData,
      success: true
    });
    
  } catch (error) {
    console.error("❌ 건강 정보 조회 실패:", error);
    res.status(500).json({ 
      error: error.message || '건강 정보 분석 중 오류가 발생했습니다.',
      success: false 
    });
  }
});

// ==========================================
// 기존 DB 레시피 관련 API (유지)
// ==========================================

// 레시피 목록 조회
router.get('/recipes', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT * FROM recipes 
      ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('레시피 조회 실패:', error);
    res.status(500).json({ error: '레시피 조회 실패' });
  }
});

// 추천 레시피 (DB 기반)
router.get('/recipes/recommend/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // 사용자의 재고 조회
    const [inventory] = await db.query(`
      SELECT DISTINCT i.item_name
      FROM inventories inv
      JOIN items i ON inv.item_id = i.item_id
      WHERE inv.user_id = ? AND inv.quantity > 0
    `, [userId]);
    
    if (inventory.length === 0) {
      return res.json([]);
    }
    
    const userIngredients = inventory.map(row => row.item_name);
    
    // 레시피와 재료 조회
    const [recipes] = await db.query(`
      SELECT 
        r.recipe_id,
        r.menu,
        r.description,
        r.image_url,
        GROUP_CONCAT(
          COALESCE(i.item_name, ri.ingredient_name) 
          SEPARATOR ','
        ) as ingredients
      FROM recipes r
      LEFT JOIN recipe_items ri ON r.recipe_id = ri.recipe_id
      LEFT JOIN items i ON ri.item_id = i.item_id
      GROUP BY r.recipe_id
    `);
    
    // 재료 매칭
    const recommendedRecipes = recipes.map(recipe => {
      const recipeIngredients = recipe.ingredients 
        ? recipe.ingredients.split(',').filter(x => x)
        : [];
      
      const have = recipeIngredients.filter(ing => 
        userIngredients.some(ui => 
          ui.includes(ing) || ing.includes(ui)
        )
      );
      
      const need = recipeIngredients.filter(ing => 
        !userIngredients.some(ui => 
          ui.includes(ing) || ing.includes(ui)
        )
      );
      
      return {
        recipe_id: recipe.recipe_id,
        menu: recipe.menu,
        image_url: recipe.image_url,
        usedIngredients: have,
        missingIngredients: need,
        matchScore: have.length / (recipeIngredients.length || 1)
      };
    });
    
    // 매칭률 높은 순으로 정렬
    recommendedRecipes.sort((a, b) => b.matchScore - a.matchScore);
    
    res.json(recommendedRecipes);
  } catch (error) {
    console.error('추천 레시피 조회 실패:', error);
    res.status(500).json({ error: '추천 레시피 조회 실패' });
  }
});

// 레시피 상세 조회 (DB)
router.get('/recipes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 레시피 정보
    const [recipes] = await db.query(
      'SELECT * FROM recipes WHERE recipe_id = ?',
      [id]
    );
    
    if (recipes.length === 0) {
      return res.status(404).json({ error: '레시피를 찾을 수 없습니다' });
    }
    
    // 레시피 재료
    const [ingredients] = await db.query(`
      SELECT ri.*, i.item_name, i.category
      FROM recipe_items ri
      LEFT JOIN items i ON ri.item_id = i.item_id
      WHERE ri.recipe_id = ?
    `, [id]);
    
    res.json({
      ...recipes[0],
      ingredients
    });
  } catch (error) {
    console.error('레시피 상세 조회 실패:', error);
    res.status(500).json({ error: '레시피 상세 조회 실패' });
  }
});

// 레시피 추가 (수동)
router.post('/recipes', async (req, res) => {
  try {
    const { menu, description, image_url } = req.body;
    
    const [result] = await db.query(
      'INSERT INTO recipes (menu, description, image_url) VALUES (?, ?, ?)',
      [menu, description, image_url]
    );
    
    res.json({ 
      recipe_id: result.insertId,
      message: '레시피가 추가되었습니다' 
    });
  } catch (error) {
    console.error('레시피 추가 실패:', error);
    res.status(500).json({ error: '레시피 추가 실패' });
  }
});

// 레시피 재료 추가
router.post('/recipe-items', async (req, res) => {
  try {
    const { recipe_id, item_id, ingredient_name, quantity } = req.body;
    
    const [result] = await db.query(
      'INSERT INTO recipe_items (recipe_id, item_id, ingredient_name, quantity) VALUES (?, ?, ?, ?)',
      [recipe_id, item_id || null, ingredient_name, quantity || 1]
    );
    
    res.json({ 
      recipe_item_id: result.insertId,
      message: '레시피 재료가 추가되었습니다' 
    });
  } catch (error) {
    console.error('레시피 재료 추가 실패:', error);
    res.status(500).json({ error: '레시피 재료 추가 실패' });
  }
});

// 레시피 삭제
router.delete('/recipes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.query('DELETE FROM recipes WHERE recipe_id = ?', [id]);
    
    res.json({ message: '레시피가 삭제되었습니다' });
  } catch (error) {
    console.error('레시피 삭제 실패:', error);
    res.status(500).json({ error: '레시피 삭제 실패' });
  }
});

export default router;