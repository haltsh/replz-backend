import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

const BASE_URL = "https://www.10000recipe.com";

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
  const materialsDict = JSON.parse(
    fs.readFileSync("./materials_dict.json", "utf8")
  );
  // 상세 페이지 파싱
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
        const materialCode = $(el).find(".ingre_list_name a").attr("href")?.match(/viewMaterial\('(\d+)'\)/)?.[1];
        const name = materialsDict[materialCode];
        rows.push(name);
      });
      recipe.ingredients = rows;
      const have=[];
      const need=[];
      for (let item of rows) {
        if (grocery.includes(item)) {
            have.push(item);
        }
        else need.push(item);
      }
      recipe.have=have;
      recipe.need=need;
    } catch (error) {
      console.error("❌ 처리 중 오류:", error.message);
    }
  }

  return recipes.slice(0, limit);
}

export default searchRecipes;
/*
input {[searching ingredients] , [inventory ingredients]}
output 
    [{
        "title": recipe["title"],
        "url": recipe["url"],
        "reviews": recipe["reviews"],
        "image": image,
        "ingredients": ingredients,
        "have": have,
        "need": need,
    }]
*/