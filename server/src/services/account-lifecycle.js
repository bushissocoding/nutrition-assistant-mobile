const { getProfile } = require('../repositories/profile-repository');
const { toProfileDto } = require('./profile');

const STORAGE_LIST_PAGE_SIZE = 100;
const ACCOUNT_EXPORT_PAGE_SIZE = 500;
const ACCOUNT_EXPORT_ID_BATCH_SIZE = 100;

async function fetchAllPages(query) {
  const rows = [];
  for (let offset = 0; ; offset += ACCOUNT_EXPORT_PAGE_SIZE) {
    const { data, error } = await query.range(offset, offset + ACCOUNT_EXPORT_PAGE_SIZE - 1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Account export query returned invalid data.');
    rows.push(...data);
    if (data.length < ACCOUNT_EXPORT_PAGE_SIZE) return rows;
  }
}

async function fetchRowsForIds(ids, buildQuery) {
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += ACCOUNT_EXPORT_ID_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + ACCOUNT_EXPORT_ID_BATCH_SIZE);
    rows.push(...await fetchAllPages(buildQuery(batch)));
  }
  return rows;
}

async function removeStorageFiles(bucket, rootFolder) {
  const pendingFolders = [{ folder: rootFolder, offset: 0, expectedRemovedChild: null }];
  let consecutiveNoProgressRemovals = 0;
  while (pendingFolders.length) {
    const current = pendingFolders[pendingFolders.length - 1];
    const { data, error } = await bucket.list(current.folder, { limit: STORAGE_LIST_PAGE_SIZE, offset: current.offset });
    if (error || !Array.isArray(data)) throw new Error('Private health record files could not be listed.');

    if (current.expectedRemovedChild) {
      const childStillExists = data.some(entry => entry && `${current.folder}/${entry.name}` === current.expectedRemovedChild);
      if (childStillExists) throw new Error('Private health record storage did not remove an empty folder.');
      current.expectedRemovedChild = null;
    }

    if (!data.length) {
      const emptiedFolder = current.folder;
      pendingFolders.pop();
      if (pendingFolders.length) {
        const { data: removed, error: removeError } = await bucket.remove([emptiedFolder]);
        if (removeError || !Array.isArray(removed)) throw new Error('Private health record folders could not be deleted.');
        pendingFolders[pendingFolders.length - 1].expectedRemovedChild = emptiedFolder;
      }
      continue;
    }

    const filePaths = [];
    let childFolder = null;
    for (const entry of data) {
      if (!entry || typeof entry.name !== 'string' || !entry.name || entry.name.includes('/') || entry.name.includes('\\') || entry.name === '.' || entry.name === '..') {
        throw new Error('Private health record storage returned an invalid path.');
      }
      const path = `${current.folder}/${entry.name}`;
      if (entry.id === null && entry.metadata == null) {
        childFolder ||= path;
      } else if (typeof entry.id === 'string' && entry.id.length > 0) {
        filePaths.push(path);
      } else {
        throw new Error('Private health record storage returned an invalid entry.');
      }
    }

    if (filePaths.length) {
      const { data: removed, error: removeError } = await bucket.remove(filePaths);
      if (removeError || !Array.isArray(removed)) throw new Error('Private health record files could not be deleted.');
      if (removed.length === 0) {
        consecutiveNoProgressRemovals += 1;
        if (consecutiveNoProgressRemovals >= 2) throw new Error('Private health record storage made no progress during deletion.');
      } else {
        consecutiveNoProgressRemovals = 0;
      }
      current.offset = 0;
      continue;
    }

    if (childFolder) {
      pendingFolders.push({ folder: childFolder, offset: 0, expectedRemovedChild: null });
      continue;
    }

    current.offset += data.length;
    if (data.length < STORAGE_LIST_PAGE_SIZE) throw new Error('Private health record storage returned an unprocessable page.');
  }
}

function createAccountDeletionService({ adminClient, deletionSteps = [] } = {}) {
  if (!Array.isArray(deletionSteps) || deletionSteps.some(step => typeof step !== 'function')) {
    throw new TypeError('Account deletion steps must be functions.');
  }
  const healthRecordStorageCleanup = adminClient?.storage?.from ? async ({ userId }) => {
    const bucket = adminClient.storage.from('health-record-images');
    try { await removeStorageFiles(bucket, userId); }
    catch {
      const failure = new Error('Private health record files could not be deleted.');
      failure.code = 'ACCOUNT_DELETE_UNAVAILABLE';
      throw failure;
    }
  } : null;
  return async function deleteAccount({ userId, db }) {
    if (!adminClient?.auth?.admin?.deleteUser) {
      const error = new Error('Account deletion is not configured.');
      error.code = 'ACCOUNT_DELETE_UNAVAILABLE';
      throw error;
    }
    for (const deleteOwnedData of [...deletionSteps, ...(healthRecordStorageCleanup ? [healthRecordStorageCleanup] : [])]) await deleteOwnedData({ userId, db });
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
  const consents = await fetchAllPages(db.from('consent_records')
    .select('version,choices,accepted_at')
    .eq('user_id', user.id)
    .order('accepted_at', { ascending: false })
    .order('id', { ascending: false }));
  const healthRecords = await fetchAllPages(db.from('health_records')
    .select('id,title,source_date,note,file_mime_type,file_size,created_at,updated_at')
    .eq('user_id', user.id)
    .order('source_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true }));
  const healthRecordIds = (healthRecords || []).map(record => record.id);
  const healthRecordResults = await fetchRowsForIds(healthRecordIds, batch =>
    db.from('health_record_results')
      .select('id,record_id,name,value,unit,reference_range,created_at')
      .eq('user_id', user.id).in('record_id', batch)
      .order('created_at', { ascending: true }).order('id', { ascending: true }));
  const assistantConsents = await fetchAllPages(db.from('assistant_ai_consents')
    .select('version,choice,recorded_at')
    .eq('user_id', user.id)
    .order('recorded_at', { ascending: true })
    .order('id', { ascending: true }));
  const assistantTurns = await fetchAllPages(db.from('assistant_turns')
    .select('id,request_key,user_message,assistant_message,status,created_at,updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true }));
  const appointmentMessages = await fetchAllPages(db.from('appointment_messages')
    .select('id,appointment_id,sender_user_id,client_message_id,body,created_at')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true }));
  const { data: notificationPreferences, error: notificationPreferenceError } = await db.from('notification_preferences')
    .select('in_app_appointments,in_app_payments,in_app_messages,push_enabled,push_appointments,push_payments,push_messages,updated_at')
    .eq('user_id', user.id).maybeSingle();
  if (notificationPreferenceError) throw notificationPreferenceError;
  const { data: nutritionPreferences, error: nutritionPreferenceError } = await db.from('nutrition_preferences')
    .select('dietary_variety,food_preferences,allergy_reminder,track_confirmed_targets,updated_at')
    .eq('user_id', user.id).maybeSingle();
  if (nutritionPreferenceError) throw nutritionPreferenceError;
  const notifications = await fetchAllPages(db.from('notifications')
    .select('id,kind,reference_id,title,body,read_at,created_at')
    .eq('user_id', user.id).order('created_at', { ascending: true }).order('id', { ascending: true }));
  const plans = await fetchAllPages(db.from('meal_plans')
    .select('id,plan,profile_updated_at,catalog_version,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false }));
  const mealEntries = await fetchAllPages(db.from('meal_entries')
    .select('id,food_id,food_name,portion_grams,meal_type,consumed_at,time_zone,notes,nutrients,source,food_snapshot,catalog_version,created_at,updated_at')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('consumed_at', { ascending: true })
    .order('id', { ascending: true }));
  const shoppingLists = await fetchAllPages(db.from('shopping_lists')
    .select('id,source_plan_id,request_key,is_current,created_at,updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true }));
  const listIds = (shoppingLists || []).map(list => list.id);
  const shoppingItems = await fetchRowsForIds(listIds, batch =>
    db.from('shopping_list_items')
      .select('id,list_id,food_id,name,amount,unit,purchased,source,catalog_version,created_at,updated_at')
      .in('list_id', batch)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }));
  const pantryItems = await fetchAllPages(db.from('pantry_items')
    .select('id,food_id,name,amount,unit,source,catalog_version,created_at,updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true }));
  const appointments = await fetchAllPages(db.from('appointments')
    .select('id,provider_id,slot_id,provider_name,provider_specialty,starts_at,ends_at,fee_vnd,currency,status,patient_name,patient_phone,symptom_note,provider_sharing_version,provider_sharing_accepted_at,hold_expires_at,cancellation_reason,cancellation_note,created_at,updated_at')
    .eq('patient_user_id', user.id)
    .order('starts_at', { ascending: true })
    .order('id', { ascending: true }));
  const payments = await fetchAllPages(db.from('appointment_payments')
    .select('id,appointment_id,order_code,amount_vnd,currency,status,payment_link_id,provider_reference,provider_transaction_at,link_created_at,paid_at,created_at,updated_at')
    .eq('patient_user_id', user.id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true }));
  const { data: providerProfile, error: providerError } = await db.from('care_providers')
    .select('id,display_name,specialty,bio,experience_years,fee_vnd,verification_status,verified_at,created_at,updated_at')
    .eq('user_id', user.id).maybeSingle();
  if (providerError) throw providerError;
  let providerCredentials = null;
  let providerAvailability = [];
  if (providerProfile) {
    const { data: credentials, error: credentialError } = await db.from('care_provider_credentials')
      .select('license_number,region,review_status,reviewed_at,created_at,updated_at')
      .eq('user_id', user.id).maybeSingle();
    if (credentialError) throw credentialError;
    providerCredentials = credentials || null;
    const slots = await fetchAllPages(db.from('provider_availability')
      .select('id,starts_at,ends_at,status,created_at,updated_at')
      .eq('provider_id', providerProfile.id)
      .order('starts_at', { ascending: true })
      .order('id', { ascending: true }));
    providerAvailability = slots;
  }
  return {
    exportVersion: 6,
    exportedAt: new Date().toISOString(),
    identity: { id: user.id, email: user.email },
    profile: toProfileDto(profile),
    consentRecords: (consents || []).map(record => ({ version: record.version, choices: record.choices, acceptedAt: record.accepted_at })),
    assistantAiConsentRecords: (assistantConsents || []).map(record => ({ version: record.version, accepted: record.choice === 'accepted', recordedAt: record.recorded_at })),
    assistantTurns: (assistantTurns || []).map(turn => ({ id: turn.id, clientMessageId: turn.request_key, userMessage: turn.user_message, assistantMessage: turn.assistant_message, status: turn.status, createdAt: turn.created_at, updatedAt: turn.updated_at })),
    appointmentMessages: (appointmentMessages || []).map(message => ({ id: message.id, appointmentId: message.appointment_id, senderUserId: message.sender_user_id, clientMessageId: message.client_message_id, body: message.body, createdAt: message.created_at })),
    notificationPreferences: notificationPreferences ? {
      inAppAppointments: notificationPreferences.in_app_appointments,
      inAppPayments: notificationPreferences.in_app_payments,
      inAppMessages: notificationPreferences.in_app_messages,
      pushEnabled: notificationPreferences.push_enabled,
      pushAppointments: notificationPreferences.push_appointments,
      pushPayments: notificationPreferences.push_payments,
      pushMessages: notificationPreferences.push_messages,
      updatedAt: notificationPreferences.updated_at,
    } : null,
    nutritionPreferences: nutritionPreferences ? {
      dietaryVariety: nutritionPreferences.dietary_variety,
      foodPreferences: nutritionPreferences.food_preferences,
      allergyReminder: nutritionPreferences.allergy_reminder,
      trackConfirmedTargets: nutritionPreferences.track_confirmed_targets,
      updatedAt: nutritionPreferences.updated_at,
    } : null,
    notifications: (notifications || []).map(item => ({ id: item.id, kind: item.kind, referenceId: item.reference_id, title: item.title, body: item.body, readAt: item.read_at, createdAt: item.created_at })),
    healthRecords: (healthRecords || []).map(record => ({ id: record.id, title: record.title, sourceDate: record.source_date, note: record.note, source: record.file_mime_type ? { mimeType: record.file_mime_type, size: Number(record.file_size) } : null, results: healthRecordResults.filter(result => result.record_id === record.id).map(result => ({ id: result.id, name: result.name, value: result.value, unit: result.unit, referenceRange: result.reference_range, createdAt: result.created_at })), createdAt: record.created_at, updatedAt: record.updated_at })),
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
    appointments: (appointments || []).map(item => ({
      id: item.id,
      providerId: item.provider_id,
      slotId: item.slot_id,
      provider: { name: item.provider_name, specialty: item.provider_specialty },
      startsAt: item.starts_at,
      endsAt: item.ends_at,
      amount: { value: Number(item.fee_vnd), currency: item.currency },
      status: item.status,
      patient: { name: item.patient_name, phone: item.patient_phone, preliminarySymptoms: item.symptom_note },
      providerSharing: { version: item.provider_sharing_version, acceptedAt: item.provider_sharing_accepted_at },
      holdExpiresAt: item.hold_expires_at,
      cancellation: item.cancellation_reason ? { reason: item.cancellation_reason, note: item.cancellation_note } : null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
    appointmentPayments: (payments || []).map(item => ({
      id: item.id,
      appointmentId: item.appointment_id,
      orderCode: Number(item.order_code),
      amount: { value: Number(item.amount_vnd), currency: item.currency },
      status: item.status,
      paymentLinkId: item.payment_link_id,
      providerReference: item.provider_reference,
      providerTransactionAt: item.provider_transaction_at,
      linkCreatedAt: item.link_created_at,
      paidAt: item.paid_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
    providerApplication: providerProfile ? {
      id: providerProfile.id,
      displayName: providerProfile.display_name,
      specialty: providerProfile.specialty,
      bio: providerProfile.bio,
      experienceYears: Number(providerProfile.experience_years),
      feeVnd: Number(providerProfile.fee_vnd),
      verificationStatus: providerProfile.verification_status,
      verifiedAt: providerProfile.verified_at,
      credentials: providerCredentials ? {
        licenseNumber: providerCredentials.license_number,
        region: providerCredentials.region,
        reviewStatus: providerCredentials.review_status,
        reviewedAt: providerCredentials.reviewed_at,
      } : null,
      availability: providerAvailability.map(slot => ({ id: slot.id, startsAt: slot.starts_at, endsAt: slot.ends_at, status: slot.status, createdAt: slot.created_at, updatedAt: slot.updated_at })),
      createdAt: providerProfile.created_at,
      updatedAt: providerProfile.updated_at,
    } : null,
  };
}

module.exports = { createAccountDeletionService, exportAccount };
