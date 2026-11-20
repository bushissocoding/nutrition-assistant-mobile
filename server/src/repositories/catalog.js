const fs = require('node:fs');
const path = require('node:path');
const { NUTRIENTS, validateFoodCatalog } = require('../services/food-catalog');

function readJson(fileName) {
  const filePath = path.join(__dirname, '..', '..', 'data', fileName);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to load ${fileName}: ${error.message}`);
  }
}

function loadCatalog() {
  const catalogFile = readJson('foods.json');
  if (catalogFile.status === 'synthetic-fixture') throw new Error('Synthetic fixture catalogs cannot be served by the API.');
  const mealTemplates = readJson('meals.json');
  const sourceRegistry = readJson('sources.json');
  const validation = validateFoodCatalog(catalogFile, { sourceRegistry });
  if (validation.errors.length) {
    throw new Error(`Food catalog is invalid: ${validation.errors.join(' ')}`);
  }
  if (!Array.isArray(mealTemplates)) {
    throw new Error('Catalog files must contain JSON arrays.');
  }

  const sourceById = new Map(sourceRegistry.records.map(source => [source.id, source]));
  const foods = catalogFile.foods.map(food => {
    const nutritionProvenance = food.provenance.groups.nutrition;
    const source = sourceById.get(nutritionProvenance.sourceId);
    const per100g = Object.fromEntries(Object.entries(food.nutrition.values)
      .filter(([, nutrient]) => nutrient.status === 'reported' && Number.isFinite(nutrient.value))
      .map(([key, nutrient]) => [key, nutrient.value]));
    return {
      ...food,
      per100g,
      source: {
        id: source.id,
        name: source.name,
        url: source.url,
        note: nutritionProvenance.method,
        dataset: source.dataset || source.name,
        edition: nutritionProvenance.edition,
        sourceRecordId: nutritionProvenance.sourceRecordId,
        license: source.rights?.license || null,
        redistributionStatus: source.rights?.redistributionStatus || 'not-applicable',
        attribution: source.rights?.attribution || null,
      },
    };
  });

  const catalog = {
    version: catalogFile.version,
    status: catalogFile.status,
    notice: catalogFile.notice,
    limitations: catalogFile.limitations,
    nutrientUnits: Object.fromEntries(Object.entries(NUTRIENTS).map(([key, nutrient]) => [key, nutrient.unit])),
    sources: sourceRegistry.records,
  };
  return { foods, mealTemplates, catalog };
}

module.exports = { loadCatalog };
