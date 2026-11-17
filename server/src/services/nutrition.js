const round = value => Math.round(value * 10) / 10;
const NUTRIENT_KEYS = ['energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fiberG', 'sodiumMg'];

function convertQuantityToGrams(amount, unit, food) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Portion amount must be a positive finite number.');
  const massFactors = { mg: 0.001, g: 1, kg: 1000 };
  if (Object.hasOwn(massFactors, unit)) return amount * massFactors[unit];
  const conversion = food?.serving?.conversions?.find(item => item.unit === unit);
  if (conversion && Number.isFinite(conversion.amount) && conversion.amount > 0 && Number.isFinite(conversion.grams) && conversion.grams > 0) {
    return amount * conversion.grams / conversion.amount;
  }
  throw new Error(`No explicit conversion from ${unit} to grams is available for this food.`);
}

function nutrientValues(food) {
  if (food.nutrition?.values) {
    return Object.fromEntries(NUTRIENT_KEYS.map(key => [key, food.nutrition.values[key]?.value ?? null]));
  }
  return Object.fromEntries(NUTRIENT_KEYS.map(key => [key, food.per100g?.[key] ?? null]));
}

function calculateFood(food, grams) {
  const factor = grams / 100;
  return Object.fromEntries(Object.entries(nutrientValues(food)).map(([key, value]) => [key, value === null ? null : round(value * factor)]));
}

function calculatePortion(food, portion) {
  if (!portion || typeof portion !== 'object' || Array.isArray(portion)) throw new Error('Portion must include amount and unit.');
  return calculateFood(food, convertQuantityToGrams(portion.amount, portion.unit, food));
}

function calculateTotals(items, foods) {
  const byId = new Map(foods.map(food => [food.id, food]));
  const totals = Object.fromEntries(NUTRIENT_KEYS.map(key => [key, 0]));
  for (const item of items) {
    const food = byId.get(item.foodId);
    if (!food) continue;
    const nutrients = calculateFood(food, item.grams);
    for (const [key, value] of Object.entries(nutrients)) totals[key] = value === null || totals[key] === null ? null : round(totals[key] + value);
  }
  return totals;
}

module.exports = { calculateFood, calculatePortion, calculateTotals, convertQuantityToGrams };
