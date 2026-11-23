import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { buildProfileDraft, calculateAdultBmi, createEmptyProfile, NUTRIENTS, RED_FLAG_SYMPTOMS, validateProfile } from '../profile/profile-model.cjs';

const ACTIVITIES = [['low', 'Thấp'], ['moderate', 'Vừa'], ['high', 'Cao']];
const STEP_COUNT = 6;

export default function ProfileSetupScreen({ onComplete, initialProfile, onBack, onWithdrawConsent }) {
  const [profile, setProfile] = useState(() => ({ ...createEmptyProfile(), ...(initialProfile || {}) }));
  const [allergyText, setAllergyText] = useState((initialProfile?.allergies || []).join(', '));
  const [limitInputs, setLimitInputs] = useState(() => Object.fromEntries(NUTRIENTS.flatMap(({ key }) => [[`${key}Min`, initialProfile?.hardLimits?.[key]?.min == null ? '' : String(initialProfile.hardLimits[key].min)], [`${key}Max`, initialProfile?.hardLimits?.[key]?.max == null ? '' : String(initialProfile.hardLimits[key].max)]])));
  const [step, setStep] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const errors = useMemo(() => validateProfile(buildProfileDraft(profile, allergyText, limitInputs), limitInputs), [profile, allergyText, limitInputs]);
  const bmi = calculateAdultBmi(profile);
  const isPatient = profile.mode === 'patient';
  const hasRedFlag = profile.mode === 'healthy' && profile.redFlags.length > 0;

  function setField(key, value) { setProfile(current => ({ ...current, [key]: value })); }
  function toggleFlag(key) { setProfile(current => ({ ...current, redFlags: current.redFlags.includes(key) ? current.redFlags.filter(item => item !== key) : [...current.redFlags, key] })); }
  function errorFor(key) { return attempted && errors[key] ? <Text accessibilityRole="alert" style={styles.error}>{errors[key]}</Text> : null; }
  function goForward() {
    setAttempted(true);
    const requiredKey = ({ 1: 'weightKg', 2: 'heightCm', 3: 'age' })[step];
    if (requiredKey && errors[requiredKey]) return;
    if (step === 4 && isPatient && (errors.medicalLimitsConfirmed || NUTRIENTS.some(({ key }) => errors[`${key}Min`] || errors[`${key}Max`]))) return;
    if (step < STEP_COUNT - 1) { setAttempted(false); setStep(value => value + 1); return; }
    const next = buildProfileDraft(profile, allergyText, limitInputs);
    if (Object.keys(validateProfile(next, limitInputs)).length) return;
    onComplete(next);
  }
  function skipStep() {
    if (step === 0) setField('gender', 'unspecified');
    if (step === 5) {
      const next = buildProfileDraft(profile, allergyText, limitInputs);
      const nextErrors = validateProfile(next, limitInputs);
      if (Object.keys(nextErrors).length) { setAttempted(true); return; }
      onComplete(next); return;
    }
    setAttempted(false); setStep(value => Math.min(STEP_COUNT - 1, value + 1));
  }

  const stepTitles = ['Giới tính', 'Cân nặng', 'Chiều cao', 'Độ tuổi', 'Tình trạng sức khỏe', 'Dị ứng thực phẩm'];

  return <View style={styles.screen}>
    <View style={styles.topBar}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={step ? 'Quay lại bước trước' : 'Quay lại'} style={styles.topBack} onPress={() => step ? (setAttempted(false), setStep(value => value - 1)) : onBack?.()}><Text style={styles.backGlyph}>‹</Text></TouchableOpacity>
      <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityLabel={`Bước ${step + 1} trên ${STEP_COUNT}`} accessibilityValue={{ min: 0, max: STEP_COUNT, now: step + 1 }}><View style={[styles.progressFill, { width: `${((step + 1) / STEP_COUNT) * 100}%` }]} /></View>
      {step === 0 || step === 5 || (step === 4 && !isPatient) ? <TouchableOpacity accessibilityRole="button" style={styles.skipButton} onPress={skipStep}><Text style={styles.skipText}>Bỏ qua</Text></TouchableOpacity> : <View style={styles.skipSpace} />}
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepLabel}>BƯỚC {step + 1} / {STEP_COUNT}</Text>
      <Text accessibilityRole="header" style={styles.title}>{stepTitles[step]}</Text>
      <Text style={styles.subtitle}>{step === 5 ? 'Hãy chọn các mục cần tránh trong thực đơn mẫu.' : 'Thông tin chỉ dùng để thiết lập hồ sơ tham khảo trên thiết bị.'}</Text>
      <View style={styles.demoBanner}><Text style={styles.demoTitle}>HỒ SƠ DEMO · CHỈ DỮ LIỆU TỔNG HỢP</Text><Text style={styles.small}>Không nhập thông tin cá nhân, triệu chứng thật hoặc hồ sơ bệnh án.</Text></View>

      {step === 0 && <View style={styles.stepBody}>
        <Text style={styles.prompt}>Hãy chọn giới tính của bạn</Text>
        <View style={styles.genderGrid}>
          <GenderCard label="Nữ" icon="♀" value="female" selected={profile.gender === 'female'} onPress={() => setField('gender', 'female')} />
          <GenderCard label="Nam" icon="♙" value="male" selected={profile.gender === 'male'} onPress={() => setField('gender', 'male')} />
          <GenderCard label="Không muốn trả lời" icon="—" value="unspecified" selected={profile.gender === 'unspecified'} onPress={() => setField('gender', 'unspecified')} />
        </View>
        <Text style={styles.helper}>Thông tin này tùy chọn, không dùng để chẩn đoán hoặc thay đổi mục tiêu y tế.</Text>
      </View>}

      {step === 1 && <NumericStep title="Bạn nặng bao nhiêu?" value={profile.weightKg} unit="kg" label="Cân nặng tính bằng kilogram" onChange={value => setField('weightKg', value)} onMinus={() => setField('weightKg', String(Math.max(2, (Number(profile.weightKg) || 60) - 1)))} onPlus={() => setField('weightKg', String(Math.min(500, (Number(profile.weightKg) || 60) + 1)))} error={errorFor('weightKg')} />}
      {step === 2 && <NumericStep title="Bạn cao bao nhiêu?" value={profile.heightCm} unit="cm" label="Chiều cao tính bằng centimet" onChange={value => setField('heightCm', value)} onMinus={() => setField('heightCm', String(Math.max(50, (Number(profile.heightCm) || 160) - 1)))} onPlus={() => setField('heightCm', String(Math.min(260, (Number(profile.heightCm) || 160) + 1)))} error={errorFor('heightCm')} />}
      {step === 3 && <NumericStep title="Bạn bao nhiêu tuổi?" value={profile.age} unit="tuổi" label="Tuổi" onChange={value => setField('age', value)} keyboardType="number-pad" onMinus={() => setField('age', String(Math.max(1, (Number(profile.age) || 30) - 1)))} onPlus={() => setField('age', String(Math.min(120, (Number(profile.age) || 30) + 1)))} error={errorFor('age')} />}

      {step === 4 && <View style={styles.stepBody}>
        <Text style={styles.prompt}>Bạn muốn dùng loại hồ sơ nào?</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Chọn chế độ hồ sơ" style={styles.modeRow}>{[['healthy', 'Tham khảo cơ bản'], ['patient', 'Theo chỉ tiêu đã được bác sĩ xác nhận']].map(([key, label]) => <TouchableOpacity key={key} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected: profile.mode === key }} style={[styles.modeCard, profile.mode === key && styles.modeSelected]} onPress={() => setField('mode', key)}><Text style={[styles.modeText, profile.mode === key && styles.modeTextSelected]}>{label}</Text></TouchableOpacity>)}</View>
        <Text style={styles.label}>Mức độ vận động</Text><View accessibilityRole="radiogroup" accessibilityLabel="Mức độ vận động" style={styles.modeRow}>{ACTIVITIES.map(([key, label]) => <TouchableOpacity key={key} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected: profile.activityLevel === key }} style={[styles.chip, profile.activityLevel === key && styles.chipSelected]} onPress={() => setField('activityLevel', key)}><Text style={[styles.chipText, profile.activityLevel === key && styles.chipTextSelected]}>{label}</Text></TouchableOpacity>)}</View>
        {isPatient ? <View style={styles.limitCard}><Text style={styles.heading}>Chỉ tiêu đã đối chiếu với bác sĩ</Text><Text style={styles.small}>Chỉ nhập khoảng dinh dưỡng có trong hướng dẫn đã xác nhận. Không tự đặt ngưỡng điều trị.</Text>{NUTRIENTS.map(nutrient => <View key={nutrient.key}><View style={styles.inputRow}><Field label={`${nutrient.label} min (${nutrient.unit})`} value={limitInputs[`${nutrient.key}Min`]} onChangeText={value => setLimitInputs(current => ({ ...current, [`${nutrient.key}Min`]: value }))} keyboardType="decimal-pad" placeholder="Min" /><Field label={`${nutrient.label} max (${nutrient.unit})`} value={limitInputs[`${nutrient.key}Max`]} onChangeText={value => setLimitInputs(current => ({ ...current, [`${nutrient.key}Max`]: value }))} keyboardType="decimal-pad" placeholder="Max" /></View>{attempted && (errors[`${nutrient.key}Min`] || errors[`${nutrient.key}Max`]) && <Text style={styles.error}>{errors[`${nutrient.key}Min`] || errors[`${nutrient.key}Max`]}</Text>}</View>)}
          <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel="Xác nhận đã đối chiếu các giới hạn với bác sĩ" accessibilityState={{ checked: profile.medicalLimitsConfirmed }} style={styles.checkRow} onPress={() => setField('medicalLimitsConfirmed', !profile.medicalLimitsConfirmed)}><View style={[styles.checkbox, profile.medicalLimitsConfirmed && styles.checkboxOn]}><Text style={styles.checkmark}>{profile.medicalLimitsConfirmed ? '✓' : ''}</Text></View><Text style={styles.checkLabel}>Tôi đã đối chiếu chỉ tiêu với hướng dẫn của bác sĩ.</Text></TouchableOpacity>{errorFor('medicalLimitsConfirmed')}</View> : <View style={styles.screening}><Text style={styles.heading}>Dấu hiệu cần lưu ý</Text><Text style={styles.small}>Đây không phải công cụ chẩn đoán. Triệu chứng nghiêm trọng cần được nhân viên y tế đánh giá.</Text>{RED_FLAG_SYMPTOMS.map(item => <TouchableOpacity key={item.key} accessibilityRole="checkbox" accessibilityLabel={item.label} accessibilityState={{ checked: profile.redFlags.includes(item.key) }} style={styles.checkRow} onPress={() => toggleFlag(item.key)}><View style={[styles.checkbox, profile.redFlags.includes(item.key) && styles.checkboxOn]}><Text style={styles.checkmark}>{profile.redFlags.includes(item.key) ? '✓' : ''}</Text></View><Text style={styles.checkLabel}>{item.label}</Text></TouchableOpacity>)}
          <Text style={styles.label}>Ghi chú tùy chọn</Text><TextInput accessibilityLabel="Triệu chứng hoặc ghi chú (tùy chọn)" value={profile.symptomNotes} onChangeText={value => setField('symptomNotes', value)} style={[styles.input, styles.multiline]} multiline maxLength={501} placeholder="Chỉ dùng nội dung tổng hợp" />{errorFor('symptomNotes')}{hasRedFlag && <Text accessibilityRole="alert" style={styles.error}>Đã đánh dấu dấu hiệu cảnh báo. App không tạo thực đơn cho hồ sơ này.</Text>}</View>}
      </View>}

      {step === 5 && <View style={styles.stepBody}>
        <View style={styles.allergyIllustration}><Text style={styles.allergySymbol}>✳</Text><View style={styles.bubbleOne} /><View style={styles.bubbleTwo} /><View style={styles.bubbleThree} /></View>
        <Text style={styles.prompt}>Bạn có dị ứng gì không?</Text><Text style={styles.helper}>Nhập tên thực phẩm cần tránh, phân cách bằng dấu phẩy. Đừng sử dụng thay cho việc kiểm tra thành phần thực tế.</Text>
        <TextInput accessibilityLabel="Dị ứng hoặc thực phẩm cần tránh" value={allergyText} onChangeText={setAllergyText} style={styles.allergyInput} maxLength={1800} placeholder="Ví dụ: cá, trứng" />{errorFor('allergies')}
        <TouchableOpacity accessibilityRole="button" style={styles.noAllergy} onPress={() => setAllergyText('')}><Text style={styles.noAllergyText}>Tôi không khai báo dị ứng</Text></TouchableOpacity>
        {bmi != null && <Text style={styles.helper}>BMI tham khảo: {bmi}. Chỉ là phép tính từ số liệu đã nhập, không phải chẩn đoán.</Text>}
      </View>}
      {attempted && Object.keys(errors).length > 0 && step === 5 && <Text accessibilityRole="alert" style={styles.errorSummary}>Cần kiểm tra các thông tin hồ sơ trước khi lưu.</Text>}
    </ScrollView>
    <View style={styles.footer}><TouchableOpacity accessibilityRole="button" style={styles.continueButton} onPress={goForward}><Text style={styles.continueText}>{step === STEP_COUNT - 1 ? 'Lưu hồ sơ demo' : 'Tiếp tục'}　›</Text></TouchableOpacity><Text style={styles.footerNote}>Bản demo · chỉ dùng dữ liệu tổng hợp</Text>{onWithdrawConsent && <TouchableOpacity accessibilityRole="button" style={styles.withdrawButton} onPress={onWithdrawConsent}><Text style={styles.withdrawText}>Rút đồng ý và yêu cầu xóa dữ liệu demo</Text></TouchableOpacity>}</View>
  </View>;
}

function GenderCard({ label, icon, value, selected, onPress }) {
  const isFemale = value === 'female';
  return <TouchableOpacity accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected }} style={[styles.genderCard, selected && (isFemale ? styles.genderFemale : styles.genderMale)]} onPress={onPress}><Text style={[styles.genderIcon, selected && styles.whiteText]}>{icon}</Text><Text style={[styles.genderText, selected && styles.whiteText]}>{label}</Text>{selected && <Text style={styles.genderCheck}>✓</Text>}</TouchableOpacity>;
}

function NumericStep({ title, value, unit, label, onChange, onMinus, onPlus, error, keyboardType = 'decimal-pad' }) {
  return <View style={styles.stepBody}><Text style={styles.prompt}>{title}</Text><View style={styles.valueSwitch}><Text style={styles.unitPill}>{unit}</Text></View><View style={styles.valueRow}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Giảm một đơn vị" style={styles.adjust} onPress={onMinus}><Text style={styles.adjustText}>−</Text></TouchableOpacity><TextInput accessibilityLabel={label} value={String(value)} onChangeText={onChange} keyboardType={keyboardType} style={styles.bigInput} placeholder="—" selectTextOnFocus /> <Text style={styles.bigUnit}>{unit}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Tăng một đơn vị" style={styles.adjust} onPress={onPlus}><Text style={styles.adjustText}>+</Text></TouchableOpacity></View><View style={styles.ruler}>{Array.from({ length: 19 }, (_, index) => <View key={index} style={[styles.tick, index % 3 === 0 && styles.tickMajor, index === 9 && styles.tickCurrent]} />)}</View><Text style={styles.rulerHint}>Nhập giá trị tham khảo bằng bàn phím hoặc dùng nút tăng/giảm.</Text>{error}</View>;
}

function Field({ label, value, onChangeText, keyboardType = 'default', placeholder }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} keyboardType={keyboardType} style={styles.input} placeholder={placeholder} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, topBar: { height: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 12 }, topBack: { width: 48, height: 48, justifyContent: 'center' }, backGlyph: { color: colors.primary, fontSize: 29 }, progressTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#E6EAF1', overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.primaryDark }, skipButton: { minHeight: 48, minWidth: 48, alignItems: 'flex-end' }, skipText: { color: colors.text, fontSize: 11, fontWeight: '700' }, skipSpace: { width: 44 },
  content: { paddingHorizontal: 22, paddingTop: 11, paddingBottom: 18, flexGrow: 1 }, stepLabel: { color: colors.primary, letterSpacing: 1, fontSize: 10, fontWeight: '900' }, title: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 7 }, subtitle: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 5 }, demoBanner: { backgroundColor: '#EFF4FF', borderRadius: 11, padding: 10, marginTop: 12 }, demoTitle: { color: colors.primaryDark, fontSize: 10, fontWeight: '900', letterSpacing: 0.4 }, small: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, stepBody: { flex: 1, paddingTop: 22 }, prompt: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center', marginVertical: 13 }, helper: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 11 },
  genderGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 15 }, genderCard: { flex: 1, minWidth: '45%', minHeight: 98, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F4FA', borderRadius: 15, position: 'relative' }, genderFemale: { backgroundColor: '#DE3654' }, genderMale: { backgroundColor: colors.primary }, genderIcon: { color: colors.muted, fontSize: 24, marginBottom: 5 }, genderText: { color: colors.text, fontSize: 12, fontWeight: '800' }, whiteText: { color: 'white' }, genderCheck: { position: 'absolute', top: 8, right: 9, color: 'white', fontSize: 14, fontWeight: '900' },
  valueSwitch: { alignSelf: 'center', minWidth: 100, minHeight: 30, borderRadius: 15, backgroundColor: '#202A3B', alignItems: 'center', justifyContent: 'center', marginTop: 15 }, unitPill: { color: 'white', fontSize: 12, fontWeight: '800' }, valueRow: { minHeight: 84, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }, bigInput: { minHeight: 48, minWidth: 110, maxWidth: 160, color: colors.text, fontSize: 40, fontWeight: '900', textAlign: 'center', padding: 0 }, bigUnit: { color: colors.muted, fontSize: 13, fontWeight: '700' }, adjust: { width: 48, height: 48, borderRadius: 18, backgroundColor: '#EFF3FC', alignItems: 'center', justifyContent: 'center' }, adjustText: { color: colors.primary, fontSize: 23, fontWeight: '800' }, ruler: { height: 41, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, marginTop: 24, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#DCE3EF' }, tick: { width: 1, height: 9, backgroundColor: '#9EABBD' }, tickMajor: { height: 17 }, tickCurrent: { width: 3, height: 32, backgroundColor: colors.primary }, rulerHint: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 11 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 }, modeCard: { flex: 1, minWidth: 136, minHeight: 48, padding: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 11 }, modeSelected: { backgroundColor: colors.softBlue, borderColor: colors.primary }, modeText: { color: colors.text, fontWeight: '700', fontSize: 11, lineHeight: 16, textAlign: 'center' }, modeTextSelected: { color: colors.primaryDark }, label: { color: colors.text, fontWeight: '700', fontSize: 11, marginTop: 12 }, chip: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: colors.softBlue, paddingHorizontal: 12, paddingVertical: 7 }, chipSelected: { backgroundColor: colors.primary }, chipText: { color: colors.primary, fontWeight: '700', fontSize: 11 }, chipTextSelected: { color: 'white' },
  limitCard: { padding: 11, marginTop: 15, borderRadius: 12, backgroundColor: '#F5F8FF' }, heading: { color: colors.text, fontSize: 13, fontWeight: '800' }, inputRow: { flexDirection: 'row', gap: 7 }, field: { flex: 1, minWidth: 90 }, input: { minHeight: 48, backgroundColor: '#F7F9FD', borderColor: colors.border, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, marginTop: 4, color: colors.text, fontSize: 13 }, screening: { padding: 11, marginTop: 15, borderRadius: 12, backgroundColor: '#F5F8FF' }, checkRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', minHeight: 48, paddingVertical: 8 }, checkbox: { width: 22, height: 22, borderWidth: 1.5, borderColor: '#9AA8C3', borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary }, checkmark: { color: 'white', fontWeight: '800', fontSize: 13 }, checkLabel: { flex: 1, color: colors.text, fontSize: 11, lineHeight: 16 }, multiline: { minHeight: 65, textAlignVertical: 'top', paddingTop: 9 },
  allergyIllustration: { height: 132, borderRadius: 17, backgroundColor: '#EAF3FF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', alignSelf: 'stretch', marginVertical: 4 }, allergySymbol: { color: '#37B6D6', fontSize: 57, zIndex: 1 }, bubbleOne: { position: 'absolute', top: 22, left: 36, width: 29, height: 29, borderRadius: 15, backgroundColor: '#C9E3F7' }, bubbleTwo: { position: 'absolute', bottom: 20, right: 44, width: 42, height: 42, borderRadius: 21, backgroundColor: '#CFE0F7' }, bubbleThree: { position: 'absolute', top: 18, right: 63, width: 14, height: 14, borderRadius: 7, backgroundColor: '#C9E3F7' }, allergyInput: { minHeight: 48, borderWidth: 1, borderColor: colors.primary, borderRadius: 11, paddingHorizontal: 12, color: colors.text, backgroundColor: '#F6F8FD', marginTop: 16, fontSize: 13 }, noAllergy: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF0FF', borderRadius: 10, marginTop: 11 }, noAllergyText: { color: colors.primaryDark, fontSize: 11, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 11, lineHeight: 16, marginTop: 6 }, errorSummary: { color: colors.danger, fontSize: 11, lineHeight: 16, marginTop: 9 }, footer: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 8, backgroundColor: 'white' }, continueButton: { minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, continueText: { color: 'white', fontWeight: '800', fontSize: 13 }, footerNote: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 6 }, withdrawButton: { alignItems: 'center', minHeight: 48, justifyContent: 'center' }, withdrawText: { color: colors.danger, fontSize: 10, fontWeight: '800' },
});
