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
  const metadata = readJson('catalog-manifest.json');
  if (!Array.isArray(foods) || !Array.isArray(mealTemplates) || !metadata || typeof metadata !== 'object') {
    throw new Error('Catalog files must contain JSON arrays and a versioned manifest.');
  }
  return { foods, mealTemplates, metadata };
}

module.exports = { loadCatalog };
