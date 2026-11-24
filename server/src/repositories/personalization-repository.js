'use strict';

class PersonalizationRepositoryError extends Error {
  constructor(message = 'Không thể đọc hoặc lưu lựa chọn cá nhân hóa lúc này.', status = 503, code = 'PERSONALIZATION_UNAVAILABLE') {
    super(message);
    this.name = 'PersonalizationRepositoryError';
    this.status = status;
    this.code = code;
  }
}

const DEFAULT_PERSONALIZATION = Object.freeze({
  dietaryVariety: 'balanced',
  foodPreferences: Object.freeze(['Vietnamese']),
  allergyReminder: true,
  trackConfirmedTargets: false,
});

function throwIfError(error) {
  if (error) throw new PersonalizationRepositoryError();
}

function createPersonalizationRepository() {
  return {
    async get({ db, userId }) {
      const { data, error } = await db.from('nutrition_preferences')
        .select('dietary_variety,food_preferences,allergy_reminder,track_confirmed_targets,updated_at')
        .eq('user_id', userId).maybeSingle();
      throwIfError(error);
      if (!data) return { ...DEFAULT_PERSONALIZATION, foodPreferences: [...DEFAULT_PERSONALIZATION.foodPreferences], updatedAt: null };
      return {
        dietaryVariety: data.dietary_variety,
        foodPreferences: [...data.food_preferences],
        allergyReminder: data.allergy_reminder,
        trackConfirmedTargets: data.track_confirmed_targets,
        updatedAt: data.updated_at,
      };
    },
    async save({ db, preferences }) {
      const { data, error } = await db.rpc('save_nutrition_preferences', { p_preferences: preferences });
      throwIfError(error);
      return data;
    },
  };
}

module.exports = { DEFAULT_PERSONALIZATION, PersonalizationRepositoryError, createPersonalizationRepository };
