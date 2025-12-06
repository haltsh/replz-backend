import axios from "axios";
import * as cheerio from "cheerio";
import qs from "qs";
import fs from "fs";
import OpenAI from "openai";

function computeNutrition(quantit, rows) {
    const results = [];

    for (const item of rows) {
        const ingredient = item["재료"];
        const usedGram = quantit[ingredient];

        // quantit에 없는 재료는 스킵
        if (!usedGram) continue;

        // 100g 기준
        const energy = parseFloat((item["에너지(㎉)"] || "0").replace(/,/g, ""));
        const carb   = parseFloat((item["탄수화물(g)"] || "0").replace(/,/g, ""));
        const sugar  = parseFloat((item["당류(g)"] || "0").replace(/,/g, ""));
        const fat    = parseFloat((item["지방(g)"] || "0").replace(/,/g, ""));
        const protein= parseFloat((item["단백질(g)"] || "0").replace(/,/g, ""));
        const sodium = parseFloat((item["나트륨(㎎)"] || "0").replace(/,/g, ""));

        // g 비율 계산
        const ratio = usedGram / 100;

        results.push({
            재료: ingredient,
            gram: usedGram,
            총칼로리: +(energy * ratio).toFixed(2),
            탄수화물: +(carb * ratio).toFixed(2),
            당류: +(sugar * ratio).toFixed(2),
            지방: +(fat * ratio).toFixed(2),
            단백질: +(protein * ratio).toFixed(2),
            나트륨: +(sodium * ratio / 100).toFixed(2)
        });
    }

    return results;
}
function sumNutrition(list) {
    const total = {
        총칼로리: 0,
        탄수화물: 0,
        당류: 0,
        지방: 0,
        단백질: 0,
        나트륨: 0
    };

    for (const item of list) {
        total.총칼로리 += item.총칼로리 || 0;
        total.탄수화물 += item.탄수화물 || 0;
        total.당류 += item.당류 || 0;
        total.지방 += item.지방 || 0;
        total.단백질 += item.단백질 || 0;
        total.나트륨 += item.나트륨 || 0;
    }

    // 소수점 2자리로 마무리
    for (const key in total) {
        total[key] = +total[key].toFixed(2);
    }

    return total;
}


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
async function quantity(food_el) {
    const prompt = `
    다음 식자재:수량 구조의 딕셔너리를 gram 단위 딕셔너리로 변환하세요.
    다른 재료들을 고려해서 1개의 의미가 어떤지 잘 판단하시오.
    반환 형식은 반드시 순수 JSON만. 코드블록, 설명, 텍스트 일절 금지.
    예시 입력: {'미역':'20g','다진마늘':'1T'}
    예시 출력: {"미역":20,"다진마늘":15}

    입력:
    ${JSON.stringify(food_el)}
    `;

    const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
            {
                role: "system",
                content:
                    "항상 valid JSON만 출력하세요. 설명, 문장, 주석, ```json 코드블록 모두 금지."
            },
            { role: "user", content: prompt }
        ]
    });
    let content = res.choices[0].message.content;
    let ingredients;
    try {
        ingredients = JSON.parse(content);
    } catch (err) {
        console.error("❌ JSON.parse 실패:", content);
        return null;
    }

    return ingredients;
}


async function getStatAnalysis(foodName) {
    const url = "https://various.foodsafetykorea.go.kr/nutrient/general/food/statAnalPop.do";

    const params = {
        dbGrpCm: "A",
        searchTextPre: "",
        searchTextListStr: "",
        sortOrder: "DESC",
        sortFieldCnt: "1",
        searchProcCode: "",
        searchLogType: "",
        searchSubOrderby: "",
        searchDetailMode: "all",
        searchGroup: "",
        searchCrtMth: "",
        searchMaker: "",
        searchSource: "",
        searchClass: "",
        searchQc: "",
        searchHcln: "",
        searchReduct: "",
        searchText: foodName,
        searchNotText: "",
        searchOper: "AND",
        searchGroupText: "",
        searchMakerText: "",
        searchOrderby: "CAL",
        searchPageCnt: "10",
        pagenum: "1",
        totalListCnt: "47",
        pageblock: "10",
        pagesize: "10",
        searchThrs: "N"
    };

    const res = await axios.post(url, qs.stringify(params), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    const $ = cheerio.load(res.data);
    var rows = [];

    $("table tbody tr").each((i, tr) => {
        const tds = $(tr).find("td").map((i, el) => $(el).text().trim()).get();
        rows = {...rows, [tds[0]]: tds[2] };
    });

    return rows;
}

export async function health_info(reciept_link) {
    try {
        const materialsDict = JSON.parse(fs.readFileSync("./materials_dict.json", "utf8"));
        const url = reciept_link;
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        const items = $("#divConfirmedMaterialArea ul li");
        var rows=[];
        for (const el of items) {
            const materialCode = $(el).find(".ingre_list_name a").attr("href")?.match(/viewMaterial\('(\d+)'\)/)?.[1];
            const name = materialsDict[materialCode];
            const ea = $(el).find(".ingre_list_ea").text().trim();
            // ★ await 추가 (중요)
            const stats = await getStatAnalysis(name);
            rows.push({"재료": name,"수량":ea,...stats});
        }
        const quan = {};
        rows.forEach(row => {
            const name = row["재료"];
            const amount = row["수량"];
            quan[name] = amount;
        });
        const quantit = await quantity(quan);
        const result = computeNutrition(quantit, rows);
        const final = sumNutrition(result);
        return final;
    } catch (error) {
        console.error("❌ 처리 중 오류:", error.message || error);
        return final;
    }
}

export default health_info;
