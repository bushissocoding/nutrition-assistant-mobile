const PROFILE_COLUMNS = 'id,username,mode,gender,age,height_cm,weight_kg,activity_level,condition_type,allergies,symptom_notes,red_flags,diagnosis_notes,hard_limits,medical_limits_confirmed,created_at,updated_at';

async function getProfile(db, ownerId) {
  const { data, error } = await db.from('profiles').select(PROFILE_COLUMNS).eq('id', ownerId).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function saveProfile(db, ownerId, profile) {
  const { data, error } = await db.from('profiles')
    .upsert({ id: ownerId, ...profile }, { onConflict: 'id' })
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

async function deleteProfile(db, ownerId) {
  const { error } = await db.from('profiles').delete().eq('id', ownerId);
  if (error) throw error;
}

module.exports = { PROFILE_COLUMNS, getProfile, saveProfile, deleteProfile };
