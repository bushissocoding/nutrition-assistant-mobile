#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { createChangeReport, validateFoodCatalog } = require('../src/services/food-catalog');

function parseArgs(args) {
  const options = {
    check: false,
    allowLegacy: false,
    sources: path.join(__dirname, '..', 'data', 'sources.json'),
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--check') options.check = true;
    else if (argument === '--allow-legacy') options.allowLegacy = true;
    else if (['--input', '--sources', '--previous', '--output', '--report'].includes(argument)) {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a file path.`);
      options[argument.slice(2)] = value;
      index += 1;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.input) throw new Error('Usage: node server/scripts/import-food-catalog.js --input <source.json> --sources server/data/sources.json --previous <old.json> --output <catalog.json> [--report <report.json>]');
  if (options.allowLegacy && !options.check) throw new Error('--allow-legacy is validation-only and requires --check; it cannot write an imported catalog.');
  if (!options.check && !options.output) throw new Error('--output is required unless --check is used.');
  if (options.input && options.output && path.resolve(options.input) === path.resolve(options.output)) throw new Error('Input and output paths must differ.');
  const protectedPaths = [options.input, options.sources, options.previous, path.join(__dirname, '..', 'data', 'foods.json')]
    .filter(Boolean).map(file => path.resolve(file));
  for (const destination of [options.output, options.report].filter(Boolean)) {
    if (protectedPaths.includes(path.resolve(destination))) throw new Error('Output/report must not overwrite input, active catalog, source registry, or previous catalog.');
  }
  if (options.output && options.report && path.resolve(options.output) === path.resolve(options.report)) throw new Error('Output and report paths must differ.');
  return options;
}

function readJson(fileName, description) {
  try { return JSON.parse(fs.readFileSync(fileName, 'utf8')); }
  catch (error) { throw new Error(`Unable to read ${description} ${fileName}: ${error.message}`); }
}

function importCatalog(options) {
  const sourceRegistry = readJson(options.sources, 'source registry');
  const candidate = readJson(options.input, 'input catalog');
  if (!options.check && candidate?.status === 'synthetic-fixture') {
    throw new Error('Synthetic fixture catalogs are validation-only and cannot be written.');
  }
  const validation = validateFoodCatalog(candidate, { sourceRegistry, strictImport: !options.allowLegacy });
  if (validation.errors.length) throw new Error(`Catalog validation failed:\n- ${validation.errors.join('\n- ')}`);
  const previous = options.previous ? readJson(options.previous, 'previous catalog') : null;
  const report = createChangeReport(previous, candidate);
  if (!options.check) {
    fs.writeFileSync(options.output, `${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
    if (options.report) fs.writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  return { catalogVersion: candidate.version, checked: options.check, written: options.check ? null : path.resolve(options.output), report };
}

function main(args = process.argv.slice(2)) {
  try {
    const result = importCatalog(parseArgs(args));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (require.main === module) process.exitCode = main();

module.exports = { importCatalog, main, parseArgs };
