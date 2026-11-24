const MAX_RECORD_SOURCE_BYTES = 8 * 1024 * 1024;

function parseLabCandidates(text) {
  if (typeof text !== 'string' || text.length > 100_000) return [];
  const candidates = [];
  const seen = new Set();
  for (const rawLine of text.split(/\r?\n/).slice(0, 500)) {
    const line = rawLine.trim().replace(/\s+/g, ' ');
    const match = /^(.{2,80}?)(?:\s*[:=]\s*|\s+)([-+]?\d+(?:[.,]\d+)?)(?:\s+([A-Za-zµμ/%][A-Za-z0-9µμ/%^.-]{0,39}))?(?:\s*\(\s*([-+]?\d+(?:[.,]\d+)?)\s*(?:-|–|—|to)\s*([-+]?\d+(?:[.,]\d+)?)\s*\))?$/i.exec(line);
    if (!match) continue;
    const name = match[1].trim().replace(/[:=]+$/, '').trim();
    if (!name || /^(date|ngày|time|giờ|patient|bệnh nhân|result|kết quả)(?:\s|$)/i.test(name)) continue;
    const key = name.toLocaleLowerCase('vi');
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      id: `ocr-${candidates.length + 1}`,
      name: name.slice(0, 100),
      value: match[2].replace(',', '.'),
      unit: (match[3] || '').slice(0, 40),
      referenceRange: match[4] && match[5] ? `${match[4]}–${match[5]}` : '',
      confirmed: false,
    });
    if (candidates.length >= 50) break;
  }
  return candidates;
}

function validateHealthRecordCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 50) return false;
  return candidates.every(item => item && typeof item.name === 'string' && item.name.trim().length > 0 && item.name.trim().length <= 100
    && typeof item.value === 'string' && item.value.trim().length > 0 && item.value.trim().length <= 100
    && typeof item.unit === 'string' && item.unit.length <= 40
    && typeof item.referenceRange === 'string' && item.referenceRange.length <= 80
    && item.confirmed === true);
}

module.exports = { MAX_RECORD_SOURCE_BYTES, parseLabCandidates, validateHealthRecordCandidates };
