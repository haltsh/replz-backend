import vision from "@google-cloud/vision";
import path from "path";
import OpenAI from "openai";
import Hangul from "hangul-js";
import { distance } from "fastest-levenshtein";
import fs from "fs";

const materialDict = JSON.parse(fs.readFileSync("./materials_dict.json", "utf8"));

async function normalizeIngredient(input, vectors) {
  // 1) 정확히 일치하는 재료 우선
  const exact = vectors.find(v => v.name === input);
  if (exact) return exact;

  // 2) 부분 일치 우선 (장아찌 → 오이장아찌, 무장아찌 우선)
  const substringMatches = vectors.filter(v => v.name.includes(input));
  if (substringMatches.length > 0) {
    // 가장 이름이 짧은 항목을 우선으로
    substringMatches.sort((a, b) => a.name.length - b.name.length);
    return substringMatches[0];
  }

  // 3) 임베딩 유사도
  const emb = await embed(input);

  let best = null;
  let bestScore = -1;

  for (const v of vectors) {
    const score = cosine(emb, v.embedding);
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }

  return best;
}

// ----- 유사도 + 정규화 함수 -----
function normalize(str) {
  return str.replace(/\s+/g, "").replace(/[^\uAC00-\uD7A3a-zA-Z0-9]/g, "");
}

function jamo(str) {
  return Hangul.disassemble(str).join("");
}

function fuzzyScore(input, candidate) {
  const a = normalize(input);
  const b = normalize(candidate);

  // 1) 정확히 같은 단어면 최우선
  if (a === b) return 0;

  // 2) 단어 단위 포함 (장아찌 → "장아찌" 정확히 포함)
  if (b.split(/[\s]/).includes(a)) return 0.5;

  // 3) 뒤에 접미사만 붙은 경우 (오이장아찌 등)
  if (b.endsWith(a)) return 1;

  // 4) 일반적인 부분 포함
  if (b.includes(a)) return 2;

  // 5) 마지막으로 Levenshtein (거리 기반)
  return 3 + distance(jamo(a), jamo(b));
}

function findClosestMaterial(input) {
  let best = null;
  let bestScore = Infinity;

  for (const id in materialDict) {
    const name = materialDict[id];
    const score = fuzzyScore(input, name);

    if (score < bestScore) {
      bestScore = score;
      best = name;
    }
  }

  return best;
}

// ========== 키 치환 로직 ==========
function replaceIngredientKeys(ingredients) {
  const result = {};

  for (const [name, info] of Object.entries(ingredients)) {
    const newName = findClosestMaterial(name);
    result[newName] = info;
  }

  return result;
}

// ========== 오늘 날짜 계산 함수 ==========
function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calculateExpirationDate(days) {
  const today = new Date();
  today.setDate(today.getDate() + days);
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ==============================
// 환경 설정
// ==============================
let visionClient;

// Google Vision API 키 설정
if (process.env.GOOGLE_VISION_CREDENTIALS) {
  // Railway/Production: 환경변수에서 읽기
  const credentials = JSON.parse(process.env.GOOGLE_VISION_CREDENTIALS);
  visionClient = new vision.ImageAnnotatorClient({ credentials });
  console.log('✅ Google Vision API 환경변수 로드');
} else if (fs.existsSync('./google-vision-key.json')) {
  // Local: 파일에서 읽기
  const keyFilePath = path.resolve(process.cwd(), "./google-vision-key.json");
  visionClient = new vision.ImageAnnotatorClient({ keyFilename: keyFilePath });
  console.log('✅ Google Vision API 파일 로드');
} else {
  console.warn('⚠️ Google Vision API 키를 찾을 수 없습니다. OCR 비활성화');
  visionClient = null;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ==============================
// 🧾 함수: 이미지 경로 → 식재료 리스트 반환
// ==============================
export async function processReceipt(imagePath) {
  // ✅ Vision API가 없으면 빈 객체 반환
  if (!visionClient) {
    console.warn('⚠️ Google Vision API 미설정 - OCR 건너뜀');
    return {};
  }

  try {
    // 1️⃣ OCR (Google Vision)
    const [result] = await visionClient.textDetection(imagePath);
    const detections = result.textAnnotations;

    if (!detections || detections.length === 0) {
      console.warn("⚠️ 텍스트를 감지하지 못했습니다.");
      return {};
    }

    const ocrText = detections[0].description.trim();

    // 오늘 날짜 가져오기
    const todayDate = getTodayDate();

    // 2️⃣ GPT로 식재료만 정제
    const prompt = `
다음 영수증 텍스트에서 식재료 이름만 추출하고, 식재료 이름을 기반으로
{"식재료 이름":["카테고리","수량","유통기한","실제 유통기한"], "식재료 이름2":[...],...}
형태의 딕셔너리 형태로 반환하세요.

식재료 이름 규칙:
- 식재료란 다음을 포함합니다: 채소, 과일, 육류, 어류, 곡류, 김치, 장아찌 등 1차 조리식품, 라면, 밀키트 등 요리에 사용 가능한 식료품
- 비식품(봉투, 세제, 쿠폰, 총액, 포인트 등)은 모두 제외
- 브랜드명, 원산지 내용 제거
- 수량, 가격, 무게 정보 제거
- 식재료 이름은 상표명과 형용사등의 수식어 등을 제거해 일반화
- 딕셔너리 외 텍스트 출력 금지 ❌

카테고리는 반드시 다음 중 하나로만 분류합니다:
["육류", "생선", "채소", "과일", "가공식품", "유제품", "곡류"]

수량은 항상 1 입니다.

유통기한은 기본적으로 다음과 같습니다:
- 채소 : 3
- 육류 : 3
- 생선 : 2
- 과일 : 5
- 가공식품 : 30
- 유제품 : 14
- 곡류 : 30

실제 유통기한은 오늘 날짜(${todayDate})에 유통기한을 더한 날짜로 계산하며,
형식은 "YYYY-MM-DD"로 표시하세요.

예시:
- 오늘이 2025-01-15이고 채소(유통기한 3일)인 경우 → "2025-01-18"
- 오늘이 2025-01-15이고 가공식품(유통기한 30일)인 경우 → "2025-02-14"

영수증:
${ocrText}
`;

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: "식재료만 정확하게 정제해 반환" },
        { role: "user", content: prompt },
      ],
    });

    const content = res.choices[0].message.content;
    console.log('🤖 GPT 응답:', content);

    // 3️⃣ 결과 파싱
    let ingredients = {};
    try {
      ingredients = JSON.parse(content);
    } catch (parseError) {
      console.warn("⚠️ JSON 파싱 실패. 원문:", content);
      return {};
    }

    // 4️⃣ 재료명 정규화 (materials_dict.json 기반)
    const output = ingredients;
    
    // 5️⃣ 유통기한 재계산 (GPT가 잘못 계산했을 경우 대비)
    for (const [itemName, itemData] of Object.entries(output)) {
      if (Array.isArray(itemData) && itemData.length >= 3) {
        const expirationDays = parseInt(itemData[2]) || 7;
        itemData[3] = calculateExpirationDate(expirationDays);
      }
    }

    console.log('✅ 최종 결과:', output);
    return output;

  } catch (error) {
    console.error("❌ 처리 중 오류:", error.message || error);
    return {};
  }
}

export default processReceipt;