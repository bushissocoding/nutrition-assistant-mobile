const fs = require('node:fs');
const path = require('node:path');

function readJson(fileName) {
  const filePath = path.join(__dirname, '..', '..', 'data', fileName);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to load ${fileName}: ${error.message}`);
  }
}

function loadCatalog() {
  const foods = readJson('foods.json');
  const mealTemplates = readJson('meals.json');
  if (!Array.isArray(foods) || !Array.isArray(mealTemplates)) {
    throw new Error('Catalog files must contain JSON arrays.');
  }
  return { foods, mealTemplates };
}

module.exports = { loadCatalog };
