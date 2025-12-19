import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

const BASE_URL = "https://www.10000recipe.com";
const EMBEDDING_SERVER = process.env.EMBEDDING_SERVER_URL || "http://localhost:8000"; // ✅ 환경변수

/* -----------------------------
   임베딩 서버 호출
------------------------------*/
async function embedIngredients(ingredients) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return [];
  }

  try {
    const res = await fetch(`${EMBEDDING_SERVER}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: ingredients }),
    });

    if (!res.ok) {
      throw new Error("Embedding server error");
    }

    const data = await res.json();
    return data.embeddings;
  } catch (error) {
    console.error("⚠️ 임베딩 서버 연결 실패, 기본 매칭 사용:", error.message);
    return null; // ✅ 실패 시 null 반환
  }
}

/* -----------------------------
   cosine similarity
------------------------------*/
function cosineSimilarity(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/* -----------------------------
   메인 함수
------------------------------*/
export async function searchRecipes(ingredients, grocery, limit = 5) {
  const query = ingredients.join("+");
  const url = `${BASE_URL}/recipe/list.html?q=${query}`;

  const res = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 15000,
  });

  const $ = cheerio.load(res.data);

  let recipes = [];
  $(".common_sp_list_li")
    .slice(0, limit * 2)
    .each((_, el) => {
      const titleTag = $(el).find(".common_sp_caption_tit");
      const linkTag = $(el).find(".common_sp_link");
      const reviewTag = $(el).find(".common_sp_caption_rv_ea");

      if (!titleTag.length || !linkTag.length) return;

      const title = titleTag.text().trim();
      let reviews = 0;

      if (reviewTag.length) {
        const num = reviewTag.text().replace(/,/g, "").match(/\d+/);
        reviews = num ? parseInt(num[0], 10) : 0;
      }

      recipes.push({
        title,
        url: BASE_URL + linkTag.attr("href"),
        reviews,
      });
    });

  recipes.sort((a, b) => b.reviews - a.reviews);

  // ✅ 사전 로드
  const materialsDict = JSON.parse(
    fs.readFileSync("./materials_dict.json", "utf8")
  );

  // ✅ 임베딩 시도 (실패 시 기본 매칭)
  let materialsNameVector = null;
  let grocery_vector = null;
  
  try {
    materialsNameVector = JSON.parse(
      fs.readFileSync("./materials_name_vector.json", "utf8")
    );
    grocery_vector = await embedIngredients(grocery);
  } catch (error) {
    console.log("⚠️ 임베딩 비활성화, 기본 문자열 매칭 사용");
  }

  const useEmbedding = grocery_vector && materialsNameVector; // ✅ 임베딩 사용 여부

  // ✅ 상세 페이지 파싱
  for (const recipe of recipes) {
    try {
      const { data } = await axios.get(recipe.url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });

      const $detail = cheerio.load(data);

      const imgTag = $detail("#main_thumbs");
      recipe.image = imgTag.length ? imgTag.attr("src") : null;

      const items = $detail("#divConfirmedMaterialArea ul li");
      let rows = [];

      items.each((_, el) => {
        const materialCode = $(el)
          .find(".ingre_list_name a")
          .attr("href")
          ?.match(/viewMaterial\('(\d+)'\)/)?.[1];

        const name = materialsDict[materialCode];
        if (name) rows.push(name);
      });

      recipe.ingredients = rows;

      // ✅ have / need 분류
      const have = [];
      const need = [];

      if (useEmbedding) {
        // 🔥 임베딩 기반 매칭
        for (let item of rows) {
          const itemVector = materialsNameVector[item];
          
          if (!itemVector) {
            need.push(item);
            continue;
          }

          let isHave = false;
          for (let gv of grocery_vector) {
            const score = cosineSimilarity(itemVector, gv);
            if (score >= 0.6) {
              isHave = true;
              break;
            }
          }

          if (isHave) {
            have.push(item);
          } else {
            need.push(item);
          }
        }
      } else {
        // 🔥 기본 문자열 매칭
        for (let item of rows) {
          if (grocery.includes(item)) {
            have.push(item);
          } else {
            need.push(item);
          }
        }
      }

      recipe.have = have;
      recipe.need = need;

    } catch (error) {
      console.error("❌ 처리 중 오류:", error.message);
    }
  }

  return recipes.slice(0, limit);
}

export default searchRecipes;