const { getProfile } = require('../repositories/profile-repository');
const { toProfileDto } = require('./profile');

function createAccountDeletionService({ adminClient, deletionSteps = [] } = {}) {
  if (!Array.isArray(deletionSteps) || deletionSteps.some(step => typeof step !== 'function')) {
    throw new TypeError('Account deletion steps must be functions.');
  }
  return async function deleteAccount({ userId, db }) {
    if (!adminClient?.auth?.admin?.deleteUser) {
      const error = new Error('Account deletion is not configured.');
      error.code = 'ACCOUNT_DELETE_UNAVAILABLE';
      throw error;
    }
    for (const deleteOwnedData of deletionSteps) await deleteOwnedData({ userId, db });
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error && !['user_not_found', 'USER_NOT_FOUND'].includes(error.code)) {
      const failure = new Error('Account deletion provider failed.');
      failure.code = 'ACCOUNT_DELETE_UNAVAILABLE';
      throw failure;
    }
  };
}

async function exportAccount({ db, user }) {
  const profile = await getProfile(db, user.id);
  const { data: consents, error } = await db.from('consent_records')
    .select('version,choices,accepted_at')
    .eq('user_id', user.id)
    .order('accepted_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;
  const { data: plans, error: planError } = await db.from('meal_plans')
    .select('id,plan,profile_updated_at,catalog_version,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (planError) throw planError;
  const { data: mealEntries, error: mealEntryError } = await db.from('meal_entries')
    .select('id,food_id,food_name,portion_grams,meal_type,consumed_at,time_zone,notes,nutrients,source,food_snapshot,catalog_version,created_at,updated_at')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('consumed_at', { ascending: true })
    .order('id', { ascending: true });
  if (mealEntryError) throw mealEntryError;
  const { data: shoppingLists, error: shoppingListError } = await db.from('shopping_lists')
    .select('id,source_plan_id,request_key,is_current,created_at,updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (shoppingListError) throw shoppingListError;
  const listIds = (shoppingLists || []).map(list => list.id);
  let shoppingItems = [];
  if (listIds.length) {
    const { data, error } = await db.from('shopping_list_items')
      .select('id,list_id,food_id,name,amount,unit,purchased,source,catalog_version,created_at,updated_at')
      .in('list_id', listIds)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;
    shoppingItems = data || [];
  }
  const { data: pantryItems, error: pantryError } = await db.from('pantry_items')
    .select('id,food_id,name,amount,unit,source,catalog_version,created_at,updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (pantryError) throw pantryError;
  return {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    identity: { id: user.id, email: user.email },
    profile: toProfileDto(profile),
    consentRecords: (consents || []).map(record => ({ version: record.version, choices: record.choices, acceptedAt: record.accepted_at })),
    mealPlans: (plans || []).map(record => ({ id: record.id, plan: record.plan, profileUpdatedAt: record.profile_updated_at, catalogVersion: record.catalog_version, createdAt: record.created_at })),
    mealEntries: (mealEntries || []).map(record => ({
      id: record.id,
      foodId: record.food_id,
      foodName: record.food_name,
      portion: { amount: Number(record.portion_grams), unit: 'g' },
      mealType: record.meal_type,
      consumedAt: record.consumed_at,
      timeZone: record.time_zone,
      notes: record.notes,
      nutrients: record.nutrients,
      source: record.source,
      foodSnapshot: record.food_snapshot,
      catalogVersion: record.catalog_version,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    })),
    shoppingLists: (shoppingLists || []).map(record => ({
      id: record.id,
      sourcePlanId: record.source_plan_id,
      requestKey: record.request_key,
      isCurrent: record.is_current,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      items: shoppingItems.filter(item => item.list_id === record.id).map(item => ({
        id: item.id,
        foodId: item.food_id,
        name: item.name,
        amount: Number(item.amount),
        unit: item.unit,
        purchased: item.purchased,
        source: item.source,
        catalogVersion: item.catalog_version,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
    })),
    pantryItems: (pantryItems || []).map(item => ({
      id: item.id,
      foodId: item.food_id,
      name: item.name,
      amount: Number(item.amount),
      unit: item.unit,
      source: item.source,
      catalogVersion: item.catalog_version,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
  };
}

module.exports = { createAccountDeletionService, exportAccount };
