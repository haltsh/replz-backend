// 👇 맨 위에 추가
const fetch = globalThis.fetch || ((...args) =>
  import('node-fetch').then(({ default: f }) => f(...args)));

const ingredients = ['돼지고기', '김치'];

async function fetchRecommendedRecipes(ingredients, baseUrl = 'http://127.0.0.1:8000') {
  const res = await fetch(`${baseUrl}/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ingredients })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

(async () => {
  try {
    const data = await fetchRecommendedRecipes(ingredients);
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Request failed:', e);
    process.exit(1);
  }
})();
