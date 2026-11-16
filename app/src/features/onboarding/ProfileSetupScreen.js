import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { buildProfileDraft, calculateAdultBmi, createEmptyProfile, NUTRIENTS, RED_FLAG_SYMPTOMS, validateProfile } from '../profile/profile-model.cjs';

const ACTIVITIES = [['low', 'Thấp'], ['moderate', 'Vừa'], ['high', 'Cao']];

export default function ProfileSetupScreen({ onComplete, initialProfile }) {
  const [profile, setProfile] = useState(() => ({ ...createEmptyProfile(), ...(initialProfile || {}) }));
  const [allergyText, setAllergyText] = useState((initialProfile?.allergies || []).join(', '));
  const [limitInputs, setLimitInputs] = useState(() => Object.fromEntries(NUTRIENTS.flatMap(({ key }) => [[`${key}Min`, initialProfile?.hardLimits?.[key]?.min == null ? '' : String(initialProfile.hardLimits[key].min)], [`${key}Max`, initialProfile?.hardLimits?.[key]?.max == null ? '' : String(initialProfile.hardLimits[key].max)]])));
  const [attempted, setAttempted] = useState(false);
  const errors = useMemo(() => validateProfile(buildProfileDraft(profile, allergyText, limitInputs), limitInputs), [profile, allergyText, limitInputs]);
  const bmi = calculateAdultBmi(profile);
  const isPatient = profile.mode === 'patient';

  function setField(key, value) { setProfile(current => ({ ...current, [key]: value })); }
  function toggleFlag(key) { setProfile(current => ({ ...current, redFlags: current.redFlags.includes(key) ? current.redFlags.filter(item => item !== key) : [...current.redFlags, key] })); }
  function submit() {
    setAttempted(true);
    const next = buildProfileDraft(profile, allergyText, limitInputs);
    const nextErrors = validateProfile(next, limitInputs);
    if (Object.keys(nextErrors).length) return;
    onComplete(next);
  }
  const showError = key => attempted && errors[key] ? <Text style={styles.error}>{errors[key]}</Text> : null;
  const hasRedFlag = profile.mode === 'healthy' && profile.redFlags.length > 0;

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Thiết lập hồ sơ</Text>
    <Text style={styles.subtitle}>Bản demo chỉ dành cho dữ liệu giả lập. Không nhập dữ liệu sức khỏe thật hoặc tải lên hồ sơ bệnh án.</Text>
    <View style={styles.card}><Text style={styles.heading}>Bạn sử dụng ứng dụng với chế độ nào?</Text><View style={styles.modeRow}>
      {[['healthy', 'Khỏe mạnh'], ['patient', 'Có chỉ định ăn uống']].map(([key, label]) => <TouchableOpacity key={key} style={[styles.modeCard, profile.mode === key && styles.modeSelected]} onPress={() => setField('mode', key)}><Text style={[styles.modeText, profile.mode === key && styles.modeTextSelected]}>{label}</Text></TouchableOpacity>)}
    </View>{showError('mode')}</View>
    <View style={styles.card}><Text style={styles.heading}>Thông tin cơ bản</Text><View style={styles.inputRow}><Field label="Tuổi" value={profile.age} onChangeText={value => setField('age', value)} keyboardType="number-pad" placeholder="Ví dụ: 30" /><Field label="Chiều cao (cm)" value={profile.heightCm} onChangeText={value => setField('heightCm', value)} keyboardType="decimal-pad" placeholder="170" /></View><Field label="Cân nặng (kg)" value={profile.weightKg} onChangeText={value => setField('weightKg', value)} keyboardType="decimal-pad" placeholder="62" />{showError('age')}{showError('heightCm')}{showError('weightKg')}
      <Text style={styles.label}>Mức độ vận động</Text><View style={styles.modeRow}>{ACTIVITIES.map(([key, label]) => <TouchableOpacity key={key} style={[styles.chip, profile.activityLevel === key && styles.chipSelected]} onPress={() => setField('activityLevel', key)}><Text style={[styles.chipText, profile.activityLevel === key && styles.chipTextSelected]}>{label}</Text></TouchableOpacity>)}</View>
      {bmi != null && <Text style={styles.info}>BMI tính toán theo công thức cân nặng/chiều cao²: {bmi}. Đây chỉ là chỉ số tham khảo cho người từ 18 tuổi, không phải chẩn đoán.</Text>}
    </View>
    {!isPatient && <View style={styles.card}><Text style={styles.heading}>Sàng lọc dấu hiệu cần chú ý</Text><Text style={styles.small}>Đây không phải công cụ chẩn đoán. Nếu bạn đang gặp triệu chứng nghiêm trọng, hãy liên hệ dịch vụ y tế khẩn cấp tại địa phương.</Text>{RED_FLAG_SYMPTOMS.map(item => <TouchableOpacity key={item.key} style={styles.checkRow} onPress={() => toggleFlag(item.key)}><View style={[styles.checkbox, profile.redFlags.includes(item.key) && styles.checkboxOn]}><Text style={styles.checkmark}>{profile.redFlags.includes(item.key) ? '✓' : ''}</Text></View><Text style={styles.checkLabel}>{item.label}</Text></TouchableOpacity>)}
      <Text style={styles.label}>Triệu chứng hoặc ghi chú (tùy chọn)</Text><TextInput value={profile.symptomNotes} onChangeText={value => setField('symptomNotes', value)} style={[styles.input, styles.multiline]} multiline placeholder="Mô tả ngắn; thông tin chỉ phục vụ bản demo" />{hasRedFlag && <Text style={styles.error}>Đã đánh dấu dấu hiệu cảnh báo. Không thể tiếp tục lập thực đơn; hãy liên hệ dịch vụ y tế khẩn cấp tại địa phương.</Text>}</View>}
    {isPatient && <View style={styles.card}><Text style={styles.heading}>Chỉ tiêu theo hướng dẫn của bác sĩ</Text><Text style={styles.small}>Nhập khoảng dinh dưỡng tối thiểu/tối đa nếu có trên tài liệu đã được bác sĩ xác nhận. Không tự đặt ngưỡng điều trị. Bản demo chưa nhận hoặc phân tích ảnh hồ sơ.</Text><Text style={styles.label}>Ghi chú chẩn đoán (không bắt buộc)</Text><TextInput value={profile.diagnosisNotes} onChangeText={value => setField('diagnosisNotes', value)} style={styles.input} placeholder="Không dùng thay cho chẩn đoán của bác sĩ" />{NUTRIENTS.map(nutrient => <View key={nutrient.key}><View style={styles.inputRow}><Field label={`${nutrient.label} min (${nutrient.unit})`} value={limitInputs[`${nutrient.key}Min`]} onChangeText={value => setLimitInputs(current => ({ ...current, [`${nutrient.key}Min`]: value }))} keyboardType="decimal-pad" placeholder="Min" /><Field label={`${nutrient.label} max (${nutrient.unit})`} value={limitInputs[`${nutrient.key}Max`]} onChangeText={value => setLimitInputs(current => ({ ...current, [`${nutrient.key}Max`]: value }))} keyboardType="decimal-pad" placeholder="Max" /></View>{attempted && (errors[`${nutrient.key}Min`] || errors[`${nutrient.key}Max`]) && <Text style={styles.error}>{errors[`${nutrient.key}Min`] || errors[`${nutrient.key}Max`]}</Text>}</View>)}
      <TouchableOpacity style={styles.checkRow} onPress={() => setField('medicalLimitsConfirmed', !profile.medicalLimitsConfirmed)}><View style={[styles.checkbox, profile.medicalLimitsConfirmed && styles.checkboxOn]}><Text style={styles.checkmark}>{profile.medicalLimitsConfirmed ? '✓' : ''}</Text></View><Text style={styles.checkLabel}>Tôi đã đối chiếu các giới hạn đã nhập với hướng dẫn của bác sĩ.</Text></TouchableOpacity>{showError('medicalLimitsConfirmed')}</View>}
    <View style={styles.card}><Text style={styles.heading}>Dị ứng / thực phẩm cần tránh</Text><Text style={styles.small}>Nhập tên phân cách bằng dấu phẩy. Đây là thông tin tránh món ở mức dữ liệu mẫu, không thay thế kiểm tra thành phần thực tế.</Text><TextInput value={allergyText} onChangeText={setAllergyText} style={styles.input} placeholder="Ví dụ: cá, trứng" /></View>
    <TouchableOpacity style={styles.button} onPress={submit}><Text style={styles.buttonText}>Lưu hồ sơ trên thiết bị</Text></TouchableOpacity>
    <Text style={styles.footnote}>Chưa có tài khoản, đồng bộ máy chủ, OCR hồ sơ hay tư vấn y tế.</Text>
  </ScrollView>;
}

function Field({ label, value, onChangeText, keyboardType = 'default', placeholder }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} style={styles.input} placeholder={placeholder} /></View>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 18, paddingBottom: 30 }, title: { color: colors.primary, fontSize: 24, fontWeight: '800' }, subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 10 }, card: { backgroundColor: 'white', borderRadius: radius.md, padding: 15, marginVertical: 7 }, heading: { color: colors.text, fontSize: 15, fontWeight: '800' }, modeRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }, modeCard: { flex: 1, minHeight: 44, padding: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12 }, modeSelected: { backgroundColor: colors.softBlue, borderColor: colors.primary }, modeText: { color: colors.text, fontWeight: '700', fontSize: 12 }, modeTextSelected: { color: colors.primary }, inputRow: { flexDirection: 'row', gap: 8 }, field: { flex: 1, minWidth: 90 }, label: { color: colors.text, fontWeight: '700', fontSize: 11, marginTop: 12 }, input: { minHeight: 42, backgroundColor: '#F5F7FB', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, marginTop: 5, color: colors.text, fontSize: 12 }, multiline: { minHeight: 74, textAlignVertical: 'top' }, chip: { borderRadius: 18, backgroundColor: colors.softBlue, paddingHorizontal: 13, paddingVertical: 8 }, chipSelected: { backgroundColor: colors.primary }, chipText: { color: colors.primary, fontWeight: '700', fontSize: 11 }, chipTextSelected: { color: 'white' }, info: { color: colors.primaryDark, backgroundColor: colors.softBlue, padding: 10, borderRadius: 9, fontSize: 11, lineHeight: 17, marginTop: 12 }, small: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 6 }, checkRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 10 }, checkbox: { width: 22, height: 22, borderWidth: 1.5, borderColor: '#9AA8C3', borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary }, checkmark: { color: 'white', fontWeight: '800' }, checkLabel: { flex: 1, color: colors.text, fontSize: 11, lineHeight: 17 }, button: { minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 12 }, buttonText: { color: 'white', fontWeight: '800' }, error: { color: colors.danger, fontSize: 11, lineHeight: 16, marginTop: 7 }, footnote: { color: colors.muted, fontSize: 10, textAlign: 'center', marginVertical: 14 } });
