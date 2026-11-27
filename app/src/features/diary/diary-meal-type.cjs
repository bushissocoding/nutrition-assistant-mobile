'use strict';

function suggestMealType(localHour) {
  if (!Number.isInteger(localHour) || localHour < 0 || localHour > 23) return 'SNACK';
  if (localHour >= 5 && localHour < 11) return 'BREAKFAST';
  if (localHour >= 11 && localHour < 15) return 'LUNCH';
  if (localHour >= 17 && localHour < 21) return 'DINNER';
  return 'SNACK';
}

module.exports = { suggestMealType };
