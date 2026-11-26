import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing } from '../../theme/tokens';
import { formatDateOfBirth, isValidProfileName, normalizeProfileName, parseDateOfBirthInput } from './profile-model.cjs';

function firstInitial(value) {
  return Array.from(String(value || 'T').trim())[0]?.toLocaleUpperCase('vi') || 'T';
}

export default function PersonalInfoScreen({ profile, account, onBack, onSave, onManageAccount }) {
  const [savedProfile, setSavedProfile] = useState(profile || {});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ username: savedProfile.username || account?.username || '', dateOfBirth: formatDateOfBirth(savedProfile.dateOfBirth) });
  const [error, setError] = useState('');
  const displayName = savedProfile.username || account?.username || 'Tài khoản';

  function startEditing() {
    setDraft({ username: savedProfile.username || account?.username || '', dateOfBirth: formatDateOfBirth(savedProfile.dateOfBirth) });
    setError('');
    setEditing(true);
  }

  function cancelEditing() {
    setDraft({ username: savedProfile.username || account?.username || '', dateOfBirth: formatDateOfBirth(savedProfile.dateOfBirth) });
    setError('');
    setEditing(false);
  }

  async function saveChanges() {
    const username = normalizeProfileName(draft.username);
    const dateText = String(draft.dateOfBirth).trim();
    const birthDate = dateText ? parseDateOfBirthInput(dateText) : null;
    if (!isValidProfileName(username)) {
      setError('Tên cần có 3–30 ký tự chữ hoặc số; có thể dùng dấu cách, . _ -.');
      return;
    }
    if (dateText && !birthDate) {
      setError('Nhập ngày sinh hợp lệ theo định dạng ngày/tháng/năm; ngày sinh cần cho độ tuổi từ 1 đến 120.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const nextProfile = { ...savedProfile, username, dateOfBirth: birthDate?.iso || null, age: birthDate?.age ?? savedProfile.age };
      const persistedProfile = await onSave?.(nextProfile);
      setSavedProfile(persistedProfile || nextProfile);
      setEditing(false);
    } catch (saveError) {
      setError(saveError?.message || 'Không thể lưu thay đổi lúc này. Hãy thử lại.');
    } finally {
      setSaving(false);
    }
  }

  return <View style={styles.root}>
    <View style={styles.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.backButton} onPress={onBack}><Text style={styles.backGlyph}>‹</Text></TouchableOpacity>
      <Text accessibilityRole="header" style={styles.title}>Thông tin cá nhân</Text>
      <View style={styles.headerSpacer} />
    </View>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.avatar}><Text style={styles.avatarText}>{firstInitial(displayName)}</Text></View>
      <Field label="Họ và tên" value={editing ? draft.username : displayName} editable={editing} onChangeText={username => setDraft(current => ({ ...current, username }))} />
      <Field label="Số điện thoại" value={account?.phone || 'Chưa thêm số điện thoại'} />
      <Field label="Email" value={account?.email || 'Chưa có email'} />
      <Field label="Ngày sinh" value={editing ? draft.dateOfBirth : formatDateOfBirth(savedProfile.dateOfBirth) || 'Chưa cung cấp'} editable={editing} keyboardType="numbers-and-punctuation" placeholder="DD/MM/YYYY" onChangeText={dateOfBirth => setDraft(current => ({ ...current, dateOfBirth }))} />
      <Text style={styles.note}>Ngày sinh được dùng để cập nhật tuổi trong hồ sơ dinh dưỡng tham khảo. Hồ sơ cũ chỉ có tuổi sẽ không tự suy ra ngày sinh.</Text>
      {onManageAccount && <TouchableOpacity accessibilityRole="button" style={styles.manageButton} onPress={onManageAccount}><Text style={styles.manageText}>Cài đặt tài khoản</Text></TouchableOpacity>}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </ScrollView>
    <View style={styles.footer}>
      {editing ? <View style={styles.editActions}>
        <TouchableOpacity accessibilityRole="button" style={styles.cancelButton} disabled={saving} onPress={cancelEditing}><Text style={styles.cancelText}>Hủy thay đổi</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={[styles.saveButton, saving && styles.disabledButton]} disabled={saving} onPress={saveChanges}>
          {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveText}>Lưu thay đổi</Text>}
        </TouchableOpacity>
      </View> : <TouchableOpacity accessibilityRole="button" style={styles.updateButton} onPress={startEditing}><Text style={styles.updateText}>Cập nhật</Text></TouchableOpacity>}
    </View>
  </View>;
}

function Field({ label, value, editable = false, onChangeText, keyboardType, placeholder }) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    {editable
      ? <TextInput accessibilityLabel={label} value={String(value ?? '')} onChangeText={onChangeText} keyboardType={keyboardType} placeholder={placeholder} style={styles.input} maxLength={label === 'Họ và tên' ? 60 : 10} />
      : <View style={styles.valueBox}><Text style={styles.valueText}>{value}</Text></View>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md },
  backButton: { width: 44, height: 44, justifyContent: 'center' },
  backGlyph: { color: colors.primary, fontSize: 32, lineHeight: 38 },
  title: { color: colors.primary, fontSize: 20, fontWeight: '800' },
  headerSpacer: { width: 44 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md },
  avatar: { width: 88, height: 88, borderRadius: 44, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: '#D8E2F2', marginVertical: spacing.md },
  avatarText: { color: colors.primaryDark, fontSize: 34, fontWeight: '800' },
  field: { marginTop: spacing.md },
  label: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: spacing.xs },
  valueBox: { minHeight: 50, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 12, backgroundColor: colors.softBlue },
  valueText: { color: colors.text, fontSize: 15 },
  input: { minHeight: 50, paddingHorizontal: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: '#CEDCFF', backgroundColor: colors.softBlue, color: colors.text, fontSize: 15 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: spacing.md },
  manageButton: { minHeight: 46, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 4 },
  manageText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18, marginTop: spacing.sm },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: 76, backgroundColor: colors.surface },
  updateButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.primary },
  updateText: { color: 'white', fontSize: 15, fontWeight: '800' },
  editActions: { flexDirection: 'row', gap: spacing.sm },
  cancelButton: { minHeight: 52, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.softBlue },
  cancelText: { color: colors.primaryDark, fontSize: 14, fontWeight: '800' },
  saveButton: { minHeight: 52, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.primary },
  disabledButton: { opacity: 0.6 },
  saveText: { color: 'white', fontSize: 14, fontWeight: '800' },
});
