const round = value => Math.round(value * 10) / 10;

function calculateFood(food, grams) {
  const factor = grams / 100;
  return Object.fromEntries(Object.entries(food.per100g).map(([key, value]) => [key, round(value * factor)]));
}

function calculateTotals(items, foods) {
  const byId = new Map(foods.map(food => [food.id, food]));
  const totals = { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0, sodiumMg: 0 };
  for (const item of items) {
    const food = byId.get(item.foodId);
    if (!food) continue;
    const nutrients = calculateFood(food, item.grams);
    for (const [key, value] of Object.entries(nutrients)) totals[key] = round((totals[key] || 0) + value);
  }
  return totals;
}

module.exports = { calculateFood, calculateTotals };
