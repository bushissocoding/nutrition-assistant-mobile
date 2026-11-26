const NUTRIENTS = {
  energyKcal: { unit: 'kcal', max: 1000 },
  proteinG: { unit: 'g', max: 100 },
  carbohydrateG: { unit: 'g', max: 100 },
  fatG: { unit: 'g', max: 100 },
  fiberG: { unit: 'g', max: 100 },
  sodiumMg: { unit: 'mg', max: 100000 },
};
const PROVENANCE_GROUPS = ['identity', 'preparation', 'serving', 'nutrition'];
const PREPARATION_STATES = ['raw', 'cooked', 'processed', 'dried', 'fermented', 'unknown'];
const MATURITY_STATES = ['ripe', 'unripe', 'not-applicable', 'unknown'];

function normalizedText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi').trim().replace(/\s+/g, ' ');
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function validateFoodCatalog(input, { sourceRegistry = { records: [] }, strictImport = false } = {}) {
  const errors = [];
  const fail = message => errors.push(message);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { catalog: input, errors: ['Catalog must be an object.'] };
  }
  if (input.schemaVersion !== 1) fail('schemaVersion must be 1.');
  if (typeof input.version !== 'string' || !input.version.trim()) fail('version is required.');
  if (!['pending', 'prototype', 'synthetic-fixture', 'licensed'].includes(input.status)) fail('status must be pending, prototype, synthetic-fixture, or licensed.');
  if (!Array.isArray(input.foods)) fail('foods must be an array.');
  else if (input.status === 'pending' && input.foods.length > 0) fail('pending catalogs cannot contain food records.');
  else if (input.status !== 'pending' && input.foods.length === 0) fail('foods must be a non-empty array unless the catalog is pending.');
  const sourceRows = Array.isArray(sourceRegistry?.records) ? sourceRegistry.records : [];
  const sources = new Map(sourceRows.map(source => [source.id, source]));
  if (!Array.isArray(sourceRegistry?.records)) fail('source registry records must be an array.');
  const ids = new Set();
  const names = new Set();

  for (const [index, food] of (Array.isArray(input.foods) ? input.foods : []).entries()) {
    const path = `foods[${index}]`;
    if (!food || typeof food !== 'object' || Array.isArray(food)) { fail(`${path} must be an object.`); continue; }
    if (typeof food.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(food.id)) fail(`${path}.id is required and must be a stable kebab-case identifier.`);
    else if (ids.has(food.id)) fail(`${path}.id duplicate: ${food.id}.`);
    else ids.add(food.id);
    if (typeof food.version !== 'string' || !food.version.trim()) fail(`${path}.version is required.`);
    if (typeof food.name !== 'string' || !food.name.trim()) fail(`${path}.name is required.`);
    if (!Array.isArray(food.aliases) || food.aliases.some(alias => typeof alias !== 'string' || !alias.trim())) fail(`${path}.aliases must be an array of non-empty strings.`);
    const aliasSet = new Set([normalizedText(food.name), ...(Array.isArray(food.aliases) ? food.aliases.map(normalizedText) : [])]);
    if (aliasSet.size !== (Array.isArray(food.aliases) ? food.aliases.length + 1 : aliasSet.size)) fail(`${path}.aliases contains duplicate names.`);
    if (typeof food.category !== 'string' || !food.category.trim()) fail(`${path}.category is required.`);
    for (const field of ['allergens', 'tags']) {
      if (!Array.isArray(food[field]) || food[field].some(value => typeof value !== 'string' || !value.trim())) fail(`${path}.${field} must be an array of non-empty strings.`);
    }

    if (!food.preparation || !PREPARATION_STATES.includes(food.preparation.state)) fail(`${path}.preparation.state is invalid or missing.`);
    if (!food.preparation || !MATURITY_STATES.includes(food.preparation.maturity)) fail(`${path}.preparation.maturity is invalid or missing.`);
    if (!food.serving || !Number.isFinite(food.serving.amount) || food.serving.amount <= 0 || food.serving.unit !== 'g') fail(`${path}.serving must have a positive amount in canonical g units.`);
    if (!food.serving || typeof food.serving.household !== 'string' || !food.serving.household.trim()) fail(`${path}.serving.household is required.`);
    const conversions = food.serving?.conversions;
    if (!Array.isArray(conversions)) fail(`${path}.serving.conversions must be an array.`);
    else {
      const conversionUnits = new Set();
      for (const [conversionIndex, conversion] of conversions.entries()) {
        if (!['piece', 'bowl', 'palm', 'fillet', 'cup', 'tbsp', 'tsp', 'ml', 'l', 'bunch', 'pack'].includes(conversion?.unit)) fail(`${path}.serving.conversions[${conversionIndex}] has unsupported unit.`);
        if (!conversion || typeof conversion.unit !== 'string' || !Number.isFinite(conversion.amount) || conversion.amount <= 0 || !Number.isFinite(conversion.grams) || conversion.grams <= 0 || typeof conversion.method !== 'string' || !conversion.method.trim()) {
          fail(`${path}.serving.conversions[${conversionIndex}] requires positive amount/grams, unit, and method.`);
        } else if (conversionUnits.has(conversion.unit)) fail(`${path}.serving.conversions duplicates unit ${conversion.unit}.`);
        else conversionUnits.add(conversion.unit);
      }
    }

    const nutrition = food.nutrition;
    if (!nutrition || nutrition.basis?.amount !== 100 || nutrition.basis?.unit !== 'g' || nutrition.basis?.ediblePortion !== true) fail(`${path}.nutrition.basis must identify 100 g edible portion.`);
    if (!nutrition?.values || typeof nutrition.values !== 'object' || Array.isArray(nutrition.values)) fail(`${path}.nutrition.values is required.`);
    else {
      for (const key of Object.keys(NUTRIENTS)) {
        const nutrient = nutrition.values[key];
        const spec = NUTRIENTS[key];
        if (!nutrient || typeof nutrient !== 'object' || nutrient.unit !== spec.unit) {
          fail(`${path}.nutrition.values.${key} is required and unit must be ${spec.unit}.`);
          continue;
        }
        if (nutrient.value === null) {
          if (nutrient.status !== 'missing' || typeof nutrient.reason !== 'string' || !nutrient.reason.trim()) fail(`${path}.nutrition.values.${key} null requires status missing and a reason.`);
        } else if (!Number.isFinite(nutrient.value) || nutrient.value < 0 || nutrient.value > spec.max || nutrient.status !== 'reported') {
          fail(`${path}.nutrition.values.${key} is outside the allowed range or has invalid status.`);
        }
      }
      for (const key of Object.keys(nutrition.values)) if (!Object.hasOwn(NUTRIENTS, key)) fail(`${path}.nutrition.values.${key} is not a supported nutrient.`);
    }

    const groups = food.provenance?.groups;
    if (!groups || typeof groups !== 'object' || Array.isArray(groups)) fail(`${path}.provenance.groups is required.`);
    else for (const group of PROVENANCE_GROUPS) {
      const provenance = groups[group];
      const source = sources.get(provenance?.sourceId);
      if (!provenance || !source || typeof provenance.method !== 'string' || !provenance.method.trim() || typeof provenance.edition !== 'string' || !provenance.edition.trim()) {
        fail(`${path}.provenance.groups.${group} requires a registered source, edition, and method.`);
        continue;
      }
      if (!['external', 'internal', 'synthetic-fixture'].includes(source.kind)) fail(`${path} source kind is unsupported.`);
      if (source.kind === 'external' && source.rights?.redistributionStatus !== 'permitted') fail(`${path} source ${source.id} lacks confirmed redistribution rights.`);
      if (source.kind === 'synthetic-fixture' && input.status !== 'synthetic-fixture') fail(`${path} synthetic fixture data requires a fixture catalog.`);
      if (strictImport && source.kind === 'external') {
        const rights = source.rights || {};
        if (rights.redistributionStatus !== 'permitted' || !rights.license?.name || !rights.verifiedOn || !rights.attribution) {
          fail(`${path}.provenance.groups.${group} source ${source.id} lacks confirmed redistribution rights, license, verification date, or attribution.`);
        }
        if (!provenance.sourceRecordId || !provenance.edition || /unknown|not-recorded|uncaptured/i.test(provenance.edition)) {
          fail(`${path}.provenance.groups.${group} external source requires an exact sourceRecordId and edition.`);
        }
      }
      if (strictImport && source.kind === 'synthetic-fixture' && input.status !== 'synthetic-fixture') {
        fail(`${path}.provenance.groups.${group} synthetic fixture data cannot be imported into a non-fixture catalog.`);
      }
    }
    if (!food.review || !['fixture-only', 'needs-source-verification', 'pending-review', 'approved'].includes(food.review.status)) fail(`${path}.review.status is required and must be supported.`);
    else if (food.review.status === 'approved' && (!food.review.reviewedBy || !food.review.reviewedOn)) fail(`${path}.review approved status requires reviewer and date.`);

    const duplicateKey = [normalizedText(food.name), normalizedText(food.category), food.preparation?.state, food.preparation?.maturity].join('|');
    if (duplicateKey.startsWith('|') || duplicateKey.includes('||')) continue;
    if (names.has(duplicateKey)) fail(`${path} duplicate food identity: ${food.name}.`);
    names.add(duplicateKey);
  }
  return { catalog: input, errors };
}

function createChangeReport(previous, next) {
  const previousRows = new Map((previous?.foods || []).map(food => [food.id, food]));
  const nextRows = new Map((next?.foods || []).map(food => [food.id, food]));
  const added = [];
  const removed = [];
  const unchanged = [];
  const updated = [];
  for (const id of [...new Set([...previousRows.keys(), ...nextRows.keys()])].sort()) {
    const before = previousRows.get(id);
    const after = nextRows.get(id);
    if (!before) { added.push(id); continue; }
    if (!after) { removed.push(id); continue; }
    const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    const changedFields = fields.filter(key => JSON.stringify(stableValue(before[key])) !== JSON.stringify(stableValue(after[key])));
    if (changedFields.length) updated.push({ id, changedFields });
    else unchanged.push(id);
  }
  return {
    fromVersion: previous?.version || null,
    toVersion: next?.version || null,
    added,
    updated,
    removed,
    unchanged,
    counts: { added: added.length, updated: updated.length, removed: removed.length, unchanged: unchanged.length },
  };
}

module.exports = { NUTRIENTS, createChangeReport, validateFoodCatalog };
