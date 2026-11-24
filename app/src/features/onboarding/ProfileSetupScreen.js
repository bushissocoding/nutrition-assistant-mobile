import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { buildProfileDraft, calculateAdultBmi, createEmptyProfile, isValidProfileName, NUTRIENTS, RED_FLAG_SYMPTOMS, validateProfile } from '../profile/profile-model.cjs';

const ACTIVITIES = [['low', 'Thấp'], ['moderate', 'Vừa'], ['high', 'Cao']];
const CONDITIONS = [
  ['unspecified', 'Không khai báo bệnh lý'],
  ['heart-failure-stage-1-2', 'Suy tim giai đoạn 1 - 2'],
  ['heart-failure-stage-3', 'Suy tim giai đoạn 3'],
  ['heart-failure-stage-4', 'Suy tim giai đoạn 4 (suy tim mất bù)'],
  ['acute-kidney-disease', 'Suy thận cấp'],
  ['chronic-kidney-disease-stage-1-2', 'Suy thận mạn giai đoạn 1 - 2'],
  ['chronic-kidney-disease-stage-3-4', 'Suy thận mạn giai đoạn 3 - 4'],
  ['diabetes', 'Tiểu đường'],
  ['hypertension', 'Tăng huyết áp'],
  ['other', 'Tình trạng khác'],
];
const ALLERGY_OPTIONS = ['Cá', 'Hải sản', 'Đậu phộng', 'Trứng', 'Sữa', 'Đậu nành', 'Lúa mì', 'Mè'];
const STEP_COUNT = 7;

export default function ProfileSetupScreen({ onComplete, initialProfile, onBack, onWithdrawConsent }) {
  const [profile, setProfile] = useState(() => ({ ...createEmptyProfile(), ...(initialProfile || {}) }));
  const [allergyText, setAllergyText] = useState((initialProfile?.allergies || []).join(', '));
  const [limitInputs, setLimitInputs] = useState(() => Object.fromEntries(NUTRIENTS.flatMap(({ key }) => [[`${key}Min`, initialProfile?.hardLimits?.[key]?.min == null ? '' : String(initialProfile.hardLimits[key].min)], [`${key}Max`, initialProfile?.hardLimits?.[key]?.max == null ? '' : String(initialProfile.hardLimits[key].max)]])));
  const [step, setStep] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const errors = useMemo(() => {
    const result = validateProfile(buildProfileDraft(profile, allergyText, limitInputs), limitInputs);
    if (!isValidProfileName(profile.username)) result.username = 'Tên hiển thị gồm 3–30 chữ cái hoặc số; có thể dùng dấu cách, . _ -.';
    return result;
  }, [profile, allergyText, limitInputs]);
  const selectedAllergies = allergyText.split(',').map(value => value.trim()).filter(Boolean);
  const bmi = calculateAdultBmi(profile);
  const isPatient = profile.mode === 'patient';
  const hasRedFlag = profile.mode === 'healthy' && profile.redFlags.length > 0;

  function setField(key, value) { setProfile(current => ({ ...current, [key]: value })); }
  function toggleFlag(key) { setProfile(current => ({ ...current, redFlags: current.redFlags.includes(key) ? current.redFlags.filter(item => item !== key) : [...current.redFlags, key] })); }
  function toggleAllergy(option) {
    const current = allergyText.split(',').map(value => value.trim()).filter(Boolean);
    const exists = current.some(value => value.toLocaleLowerCase() === option.toLocaleLowerCase());
    setAllergyText((exists ? current.filter(value => value.toLocaleLowerCase() !== option.toLocaleLowerCase()) : [...current, option]).join(', '));
  }
  function errorFor(key) { return attempted && errors[key] ? <Text accessibilityRole="alert" style={styles.error}>{errors[key]}</Text> : null; }
  function goForward() {
    setAttempted(true);
    const requiredKey = ({ 1: 'weightKg', 2: 'heightCm', 3: 'age' })[step];
    if (requiredKey && errors[requiredKey]) return;
    if (step === 5 && isPatient && (errors.medicalLimitsConfirmed || NUTRIENTS.some(({ key }) => errors[`${key}Min`] || errors[`${key}Max`]))) return;
    if (step < STEP_COUNT - 1) { setAttempted(false); setStep(value => value + 1); return; }
    const next = buildProfileDraft(profile, allergyText, limitInputs);
    if (Object.keys(errors).length) return;
    onComplete(next);
  }
  function skipStep() {
    if (step === 0) setField('gender', 'unspecified');
    if (step === 4) setField('conditionType', 'unspecified');
    if (step === 6) {
      const next = buildProfileDraft(profile, allergyText, limitInputs);
      const nextErrors = errors;
      if (Object.keys(nextErrors).length) { setAttempted(true); return; }
      onComplete(next); return;
    }
    setAttempted(false); setStep(value => Math.min(STEP_COUNT - 1, value + 1));
  }

  const stepTitles = ['Giới tính', 'Bạn nặng bao nhiêu?', 'Bạn cao bao nhiêu?', 'Bạn bao nhiêu tuổi?', 'Bạn đang bị bệnh gì?', 'Tình trạng sức khỏe', 'Bạn có dị ứng gì không?'];
  const stepSubtitles = ['Hãy chọn giới tính của bạn.', '', '', '', 'Chọn một mục hoặc bỏ qua nếu không muốn trả lời.', 'Chỉ ghi nhận thông tin tham khảo. Không dùng để chẩn đoán hoặc tự đặt chỉ tiêu.', 'Chọn tất cả thực phẩm bạn cần tránh.'];

  return <View style={styles.screen}>
    <View testID="profile-setup-top-bar" style={styles.topBar}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={step ? 'Quay lại bước trước' : 'Quay lại'} style={styles.topBack} onPress={() => step ? (setAttempted(false), setStep(value => value - 1)) : onBack?.()}><Text style={styles.backGlyph}>‹</Text></TouchableOpacity>
      <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityLabel={`Bước ${step + 1} trên ${STEP_COUNT}`} accessibilityValue={{ min: 0, max: STEP_COUNT, now: step + 1 }}><View style={[styles.progressFill, { width: `${((step + 1) / STEP_COUNT) * 100}%` }]} /></View>
      {step === 0 || step === 4 || step === 6 || (step === 5 && !isPatient) ? <TouchableOpacity accessibilityRole="button" style={styles.skipButton} onPress={skipStep}><Text style={styles.skipText}>Bỏ qua</Text></TouchableOpacity> : <View style={styles.skipSpace} />}
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={styles.title}>{stepTitles[step]}</Text>
      {!!stepSubtitles[step] && <Text style={styles.subtitle}>{stepSubtitles[step]}</Text>}

      {step === 0 && <View style={styles.stepBody}>
        <View style={styles.genderGrid}>
          <GenderCard label="Nữ" icon="♀" value="female" selected={profile.gender === 'female'} onPress={() => setField('gender', 'female')} />
          <GenderCard label="Nam" icon="♙" value="male" selected={profile.gender === 'male'} onPress={() => setField('gender', 'male')} />
        </View>
        <TouchableOpacity accessibilityRole="radio" accessibilityLabel="Không muốn trả lời" accessibilityState={{ selected: profile.gender === 'unspecified' }} style={[styles.noAnswer, profile.gender === 'unspecified' && styles.noAnswerSelected]} onPress={() => setField('gender', 'unspecified')}>
          <Text style={[styles.noAnswerText, profile.gender === 'unspecified' && styles.noAnswerTextSelected]}>Không muốn trả lời　＋</Text>
        </TouchableOpacity>
      </View>}

      {step === 1 && <NumericStep title="Bạn nặng bao nhiêu?" value={profile.weightKg} unit="kg" label="Cân nặng tính bằng kilogram" onChange={value => setField('weightKg', value)} onMinus={() => setField('weightKg', String(Math.max(2, (Number(profile.weightKg) || 60) - 1)))} onPlus={() => setField('weightKg', String(Math.min(500, (Number(profile.weightKg) || 60) + 1)))} error={errorFor('weightKg')} />}
      {step === 2 && <NumericStep title="Bạn cao bao nhiêu?" value={profile.heightCm} unit="cm" label="Chiều cao tính bằng centimet" onChange={value => setField('heightCm', value)} onMinus={() => setField('heightCm', String(Math.max(50, (Number(profile.heightCm) || 160) - 1)))} onPlus={() => setField('heightCm', String(Math.min(260, (Number(profile.heightCm) || 160) + 1)))} error={errorFor('heightCm')} />}
      {step === 3 && <AgeStep value={profile.age} onChange={value => setField('age', value)} error={errorFor('age')} />}

      {step === 4 && <View accessibilityRole="radiogroup" accessibilityLabel="Chọn một tình trạng sức khỏe" style={styles.conditionList}>
        {CONDITIONS.map(([key, label]) => <TouchableOpacity
          key={key}
          accessibilityRole="radio"
          accessibilityLabel={label}
          accessibilityState={{ selected: profile.conditionType === key }}
          style={[styles.conditionRow, profile.conditionType === key && styles.conditionSelected]}
          onPress={() => setField('conditionType', key)}
        ><View style={[styles.conditionRadio, profile.conditionType === key && styles.conditionRadioSelected]}><View style={[styles.conditionRadioDot, profile.conditionType === key && styles.conditionDotSelected]} /></View><Text style={[styles.conditionText, profile.conditionType === key && styles.conditionTextSelected]}>{label}</Text></TouchableOpacity>)}
        <Text style={styles.conditionDisclaimer}>Lựa chọn này chỉ được lưu như thông tin bạn tự khai báo. Không suy ra chẩn đoán hay chỉ tiêu dinh dưỡng.</Text>
      </View>}

      {step === 5 && <View style={styles.stepBody}>
        <Text style={styles.prompt}>Bạn muốn dùng loại hồ sơ nào?</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Chọn chế độ hồ sơ" style={styles.modeRow}>{[['healthy', 'Tham khảo cơ bản'], ['patient', 'Theo chỉ tiêu đã được bác sĩ xác nhận']].map(([key, label]) => <TouchableOpacity key={key} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected: profile.mode === key }} style={[styles.modeCard, profile.mode === key && styles.modeSelected]} onPress={() => setField('mode', key)}><Text style={[styles.modeText, profile.mode === key && styles.modeTextSelected]}>{label}</Text></TouchableOpacity>)}</View>
        <Text style={styles.label}>Mức độ vận động</Text><View accessibilityRole="radiogroup" accessibilityLabel="Mức độ vận động" style={styles.modeRow}>{ACTIVITIES.map(([key, label]) => <TouchableOpacity key={key} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected: profile.activityLevel === key }} style={[styles.chip, profile.activityLevel === key && styles.chipSelected]} onPress={() => setField('activityLevel', key)}><Text style={[styles.chipText, profile.activityLevel === key && styles.chipTextSelected]}>{label}</Text></TouchableOpacity>)}</View>
        {isPatient ? <View style={styles.limitCard}><Text style={styles.heading}>Chỉ tiêu đã đối chiếu với bác sĩ</Text><Text style={styles.small}>Chỉ nhập khoảng dinh dưỡng có trong hướng dẫn đã xác nhận. Không tự đặt ngưỡng điều trị.</Text>{NUTRIENTS.map(nutrient => <View key={nutrient.key}><View style={styles.inputRow}><Field label={`${nutrient.label} min (${nutrient.unit})`} value={limitInputs[`${nutrient.key}Min`]} onChangeText={value => setLimitInputs(current => ({ ...current, [`${nutrient.key}Min`]: value }))} keyboardType="decimal-pad" placeholder="Min" /><Field label={`${nutrient.label} max (${nutrient.unit})`} value={limitInputs[`${nutrient.key}Max`]} onChangeText={value => setLimitInputs(current => ({ ...current, [`${nutrient.key}Max`]: value }))} keyboardType="decimal-pad" placeholder="Max" /></View>{attempted && (errors[`${nutrient.key}Min`] || errors[`${nutrient.key}Max`]) && <Text style={styles.error}>{errors[`${nutrient.key}Min`] || errors[`${nutrient.key}Max`]}</Text>}</View>)}
          <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel="Xác nhận đã đối chiếu các giới hạn với bác sĩ" accessibilityState={{ checked: profile.medicalLimitsConfirmed }} style={styles.checkRow} onPress={() => setField('medicalLimitsConfirmed', !profile.medicalLimitsConfirmed)}><View style={[styles.checkbox, profile.medicalLimitsConfirmed && styles.checkboxOn]}><Text style={styles.checkmark}>{profile.medicalLimitsConfirmed ? '✓' : ''}</Text></View><Text style={styles.checkLabel}>Tôi đã đối chiếu chỉ tiêu với hướng dẫn của bác sĩ.</Text></TouchableOpacity>{errorFor('medicalLimitsConfirmed')}</View> : <View style={styles.screening}><Text style={styles.heading}>Dấu hiệu cần lưu ý</Text><Text style={styles.small}>Đây không phải công cụ chẩn đoán. Triệu chứng nghiêm trọng cần được nhân viên y tế đánh giá.</Text>{RED_FLAG_SYMPTOMS.map(item => <TouchableOpacity key={item.key} accessibilityRole="checkbox" accessibilityLabel={item.label} accessibilityState={{ checked: profile.redFlags.includes(item.key) }} style={styles.checkRow} onPress={() => toggleFlag(item.key)}><View style={[styles.checkbox, profile.redFlags.includes(item.key) && styles.checkboxOn]}><Text style={styles.checkmark}>{profile.redFlags.includes(item.key) ? '✓' : ''}</Text></View><Text style={styles.checkLabel}>{item.label}</Text></TouchableOpacity>)}
          <Text style={styles.label}>Ghi chú tùy chọn</Text><TextInput accessibilityLabel="Triệu chứng hoặc ghi chú (tùy chọn)" value={profile.symptomNotes} onChangeText={value => setField('symptomNotes', value)} style={[styles.input, styles.multiline]} multiline maxLength={501} placeholder="Chỉ dùng nội dung tổng hợp" />{errorFor('symptomNotes')}{hasRedFlag && <Text accessibilityRole="alert" style={styles.error}>Đã đánh dấu dấu hiệu cảnh báo. App không tạo thực đơn cho hồ sơ này.</Text>}</View>}
      </View>}

      {step === 6 && <View style={styles.stepBody}>
        <Field label="Tên hiển thị" value={profile.username || ''} onChangeText={value => setField('username', value)} placeholder="Ví dụ: Nguyễn Văn An" />{errorFor('username')}
        <View style={styles.allergyIllustration}><Text style={styles.allergySymbol}>✳</Text><View style={styles.bubbleOne} /><View style={styles.bubbleTwo} /><View style={styles.bubbleThree} /></View>
        <View style={styles.allergyInputBox}>
          <View style={styles.allergyChips}>{ALLERGY_OPTIONS.map(option => {
            const selected = selectedAllergies.some(value => value.toLocaleLowerCase() === option.toLocaleLowerCase());
            return <TouchableOpacity key={option} accessibilityRole="checkbox" accessibilityLabel={option} accessibilityState={{ checked: selected }} style={[styles.allergyChip, selected && styles.allergyChipSelected]} onPress={() => toggleAllergy(option)}><Text style={[styles.allergyChipText, selected && styles.allergyChipTextSelected]}>{option}</Text></TouchableOpacity>;
          })}</View>
          <Text style={styles.allergyCount}>{Math.min(selectedAllergies.length, 20)}/20</Text>
        </View>
        <Text style={styles.helper}>Chọn nhiều mục hoặc nhập tên thực phẩm cần tránh. Luôn kiểm tra thành phần thực tế.</Text>
        <TextInput accessibilityLabel="Dị ứng hoặc thực phẩm cần tránh" value={allergyText} onChangeText={setAllergyText} style={styles.allergyInput} maxLength={1800} placeholder="Thêm mục khác, phân cách bằng dấu phẩy" />{errorFor('allergies')}
        <TouchableOpacity accessibilityRole="button" style={styles.noAllergy} onPress={() => setAllergyText('')}><Text style={styles.noAllergyText}>Tôi không khai báo dị ứng</Text></TouchableOpacity>
        {bmi != null && <Text style={styles.helper}>BMI tham khảo: {bmi}. Chỉ là phép tính từ số liệu đã nhập, không phải chẩn đoán.</Text>}
      </View>}
      {attempted && Object.keys(errors).length > 0 && step === 6 && <Text accessibilityRole="alert" style={styles.errorSummary}>Cần kiểm tra các thông tin hồ sơ trước khi lưu.</Text>}
    </ScrollView>
    <View style={styles.footer}><TouchableOpacity accessibilityRole="button" accessibilityLabel={step === STEP_COUNT - 1 ? 'Lưu hồ sơ' : 'Tiếp tục'} style={styles.continueButton} onPress={goForward}><Text style={styles.continueText}>{step === STEP_COUNT - 1 ? 'Lưu hồ sơ' : 'Tiếp tục'}　→</Text></TouchableOpacity><Text style={styles.footerNote}>Thông tin tham khảo · không phải chẩn đoán hoặc tư vấn y tế</Text>{onWithdrawConsent && <TouchableOpacity accessibilityRole="button" style={styles.withdrawButton} onPress={onWithdrawConsent}><Text style={styles.withdrawText}>Thu hồi quyền xử lý dữ liệu</Text></TouchableOpacity>}</View>
  </View>;
}

function GenderCard({ label, icon, value, selected, onPress }) {
  const isFemale = value === 'female';
  return <TouchableOpacity accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected }} style={[styles.genderCard, selected && (isFemale ? styles.genderFemale : styles.genderMale)]} onPress={onPress}><Text style={[styles.genderIcon, selected && styles.whiteText]}>{icon}</Text><Text style={[styles.genderText, selected && styles.whiteText]}>{label}</Text>{selected && <Text style={styles.genderCheck}>✓</Text>}</TouchableOpacity>;
}

function NumericStep({ value, unit, label, onChange, onMinus, onPlus, error, keyboardType = 'decimal-pad' }) {
  return <View style={styles.stepBody}><View style={styles.valueSwitch}><Text style={styles.unitPill}>{unit}</Text></View><View style={styles.valueRow}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Giảm một đơn vị" style={styles.adjust} onPress={onMinus}><Text style={styles.adjustText}>−</Text></TouchableOpacity><TextInput accessibilityLabel={label} value={String(value)} onChangeText={onChange} keyboardType={keyboardType} style={styles.bigInput} placeholder="—" selectTextOnFocus /> <Text style={styles.bigUnit}>{unit}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Tăng một đơn vị" style={styles.adjust} onPress={onPlus}><Text style={styles.adjustText}>+</Text></TouchableOpacity></View><View style={styles.ruler}>{Array.from({ length: 19 }, (_, index) => <View key={index} style={[styles.tick, index % 3 === 0 && styles.tickMajor, index === 9 && styles.tickCurrent]} />)}</View>{error}</View>;
}

function AgeStep({ value, onChange, error }) {
  const age = Number(value) || 19;
  return <View style={styles.ageStep}>
    <Text style={styles.ageFar}>{Math.max(1, age - 2)}</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Chọn tuổi ${Math.max(1, age - 1)}`} style={styles.ageNeighborButton} onPress={() => onChange(String(Math.max(1, age - 1)))}><Text style={styles.ageNeighbor}>{Math.max(1, age - 1)}</Text></TouchableOpacity>
    <View style={styles.ageSelected}><TextInput accessibilityLabel="Tuổi" value={String(value)} onChangeText={onChange} keyboardType="number-pad" style={styles.ageInput} placeholder="19" selectTextOnFocus /></View>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Chọn tuổi ${age + 1}`} style={styles.ageNeighborButton} onPress={() => onChange(String(Math.min(120, age + 1)))}><Text style={styles.ageNeighbor}>{age + 1}</Text></TouchableOpacity>
    <Text style={styles.ageFar}>{Math.min(120, age + 2)}</Text>
    {error}
  </View>;
}

function Field({ label, value, onChangeText, keyboardType = 'default', placeholder }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} keyboardType={keyboardType} style={styles.input} placeholder={placeholder} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, width: '100%', backgroundColor: colors.surface }, topBar: { height: 96, paddingTop: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 12 }, topBack: { width: 48, height: 48, borderWidth: 1, borderColor: '#9AA8C3', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, backGlyph: { color: colors.primary, fontSize: 29 }, progressTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: '#E6EAF1', overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#26314F' }, skipButton: { minHeight: 48, minWidth: 48, alignItems: 'flex-end', justifyContent: 'center' }, skipText: { color: colors.text, fontSize: 13, fontWeight: '800' }, skipSpace: { width: 44 },
  content: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 18, flexGrow: 1 }, stepLabel: { color: colors.primary, letterSpacing: 1, fontSize: 10, fontWeight: '900' }, title: { color: '#26314F', fontSize: 26, lineHeight: 33, fontWeight: '900' }, subtitle: { color: '#5F6F8D', fontSize: 14, lineHeight: 20, marginTop: 8 }, demoBanner: { backgroundColor: '#EFF4FF', borderRadius: 11, padding: 10, marginTop: 12 }, demoTitle: { color: colors.primaryDark, fontSize: 10, fontWeight: '900', letterSpacing: 0.4 }, small: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, stepBody: { flex: 1, paddingTop: 24 }, prompt: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center', marginVertical: 13 }, helper: { color: '#5F6F8D', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 11 },
  genderGrid: { flexDirection: 'row', gap: 16, marginTop: 37 }, genderCard: { flex: 1, minWidth: 0, minHeight: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F4FA', borderWidth: 1, borderColor: '#D9E1EF', borderRadius: 20, position: 'relative' }, genderFemale: { backgroundColor: '#DE2947', borderColor: '#DE2947' }, genderMale: { backgroundColor: colors.primary, borderColor: colors.primary }, genderIcon: { color: '#62728F', fontSize: 30, marginBottom: 7 }, genderText: { color: '#62728F', fontSize: 15, fontWeight: '800' }, whiteText: { color: 'white' }, genderCheck: { position: 'absolute', top: 10, right: 10, width: 26, height: 26, overflow: 'hidden', borderRadius: 13, backgroundColor: 'white', color: colors.primary, textAlign: 'center', textAlignVertical: 'center', fontSize: 16, fontWeight: '900' },
  noAnswer: { minHeight: 56, borderRadius: 13, backgroundColor: '#D3E5FF', alignItems: 'center', justifyContent: 'center', marginTop: 31 }, noAnswerSelected: { borderWidth: 2, borderColor: colors.primary }, noAnswerText: { color: colors.primaryDark, fontSize: 14, fontWeight: '900' }, noAnswerTextSelected: { color: colors.primary },
  valueSwitch: { alignSelf: 'center', width: 164, minHeight: 54, borderRadius: 16, borderWidth: 4, borderColor: '#C8CCD4', backgroundColor: '#26314F', alignItems: 'center', justifyContent: 'center', marginTop: 13 }, unitPill: { color: 'white', fontSize: 14, fontWeight: '800' }, valueRow: { minHeight: 96, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 27 }, bigInput: { minHeight: 64, minWidth: 112, maxWidth: 160, color: '#26314F', fontSize: 48, fontWeight: '900', textAlign: 'center', padding: 0 }, bigUnit: { color: '#5F6F8D', fontSize: 18, fontWeight: '800' }, adjust: { width: 48, height: 48, borderRadius: 18, backgroundColor: '#EFF3FC', alignItems: 'center', justifyContent: 'center' }, adjustText: { color: colors.primary, fontSize: 23, fontWeight: '800' }, ruler: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 5, marginTop: 27 }, tick: { width: 1.5, height: 21, backgroundColor: '#B9C3D3' }, tickMajor: { height: 34, backgroundColor: '#7383A0' }, tickCurrent: { width: 3, height: 54, backgroundColor: colors.primary }, rulerHint: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 11 },
  ageStep: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingVertical: 24 }, ageFar: { color: '#BBC4D2', fontSize: 27, lineHeight: 37, fontWeight: '800' }, ageNeighborButton: { minHeight: 60, minWidth: 80, alignItems: 'center', justifyContent: 'center' }, ageNeighbor: { color: '#5F6F8D', fontSize: 42, lineHeight: 50, fontWeight: '900' }, ageSelected: { width: 168, height: 174, borderRadius: 27, borderWidth: 5, borderColor: '#C6DDFF', backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginVertical: 1 }, ageInput: { width: 150, height: 150, color: 'white', fontSize: 96, lineHeight: 112, fontWeight: '900', textAlign: 'center', padding: 0 },
  conditionList: { marginTop: 20, gap: 8 }, conditionRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, borderRadius: 14, borderWidth: 1, borderColor: '#F0F2F7', backgroundColor: 'white', shadowColor: '#26314F', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 }, conditionSelected: { backgroundColor: colors.primary, borderWidth: 3, borderColor: '#C7DAFF' }, conditionRadio: { width: 21, height: 21, borderRadius: 11, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, conditionRadioSelected: { borderColor: 'white' }, conditionRadioDot: { width: 9, height: 9, borderRadius: 5 }, conditionDotSelected: { backgroundColor: 'white' }, conditionText: { flex: 1, color: '#536887', fontSize: 14, fontWeight: '700' }, conditionTextSelected: { color: 'white' }, conditionDisclaimer: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 6 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 }, modeCard: { flex: 1, minWidth: 136, minHeight: 48, padding: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 11 }, modeSelected: { backgroundColor: colors.softBlue, borderColor: colors.primary }, modeText: { color: colors.text, fontWeight: '700', fontSize: 11, lineHeight: 16, textAlign: 'center' }, modeTextSelected: { color: colors.primaryDark }, label: { color: colors.text, fontWeight: '700', fontSize: 11, marginTop: 12 }, chip: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: colors.softBlue, paddingHorizontal: 12, paddingVertical: 7 }, chipSelected: { backgroundColor: colors.primary }, chipText: { color: colors.primary, fontWeight: '700', fontSize: 11 }, chipTextSelected: { color: 'white' },
  limitCard: { padding: 11, marginTop: 15, borderRadius: 12, backgroundColor: '#F5F8FF' }, heading: { color: colors.text, fontSize: 13, fontWeight: '800' }, inputRow: { flexDirection: 'row', gap: 7 }, field: { flex: 1, minWidth: 90 }, input: { minHeight: 48, backgroundColor: '#F7F9FD', borderColor: colors.border, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, marginTop: 4, color: colors.text, fontSize: 13 }, screening: { padding: 11, marginTop: 15, borderRadius: 12, backgroundColor: '#F5F8FF' }, checkRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', minHeight: 48, paddingVertical: 8 }, checkbox: { width: 22, height: 22, borderWidth: 1.5, borderColor: '#9AA8C3', borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary }, checkmark: { color: 'white', fontWeight: '800', fontSize: 13 }, checkLabel: { flex: 1, color: colors.text, fontSize: 11, lineHeight: 16 }, multiline: { minHeight: 65, textAlignVertical: 'top', paddingTop: 9 },
  allergyIllustration: { height: 150, borderRadius: 17, backgroundColor: '#EAF3FF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', alignSelf: 'stretch', marginVertical: 4 }, allergySymbol: { color: '#37B6D6', fontSize: 67, zIndex: 1 }, bubbleOne: { position: 'absolute', top: 22, left: 36, width: 29, height: 29, borderRadius: 15, backgroundColor: '#C9E3F7' }, bubbleTwo: { position: 'absolute', bottom: 20, right: 44, width: 42, height: 42, borderRadius: 21, backgroundColor: '#CFE0F7' }, bubbleThree: { position: 'absolute', top: 18, right: 63, width: 14, height: 14, borderRadius: 7, backgroundColor: '#C9E3F7' }, allergyInputBox: { minHeight: 94, borderWidth: 2, borderColor: colors.primary, borderRadius: 16, backgroundColor: 'white', marginTop: 14, padding: 10, paddingBottom: 24 }, allergyChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, allergyChip: { minHeight: 36, borderRadius: 10, backgroundColor: '#EFF5FF', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }, allergyChipSelected: { backgroundColor: '#D8E9FF' }, allergyChipText: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' }, allergyChipTextSelected: { color: colors.primary }, allergyCount: { position: 'absolute', right: 10, bottom: 7, color: colors.muted, fontSize: 10, fontWeight: '800' }, allergyInput: { minHeight: 48, borderWidth: 1, borderColor: '#D6E0F3', borderRadius: 11, paddingHorizontal: 12, color: colors.text, backgroundColor: '#F6F8FD', marginTop: 10, fontSize: 13 }, noAllergy: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D3E5FF', borderRadius: 10, marginTop: 11 }, noAllergyText: { color: colors.primaryDark, fontSize: 13, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 11, lineHeight: 16, marginTop: 6 }, errorSummary: { color: colors.danger, fontSize: 11, lineHeight: 16, marginTop: 9 }, footer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, backgroundColor: 'white' }, continueButton: { minHeight: 56, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, continueText: { color: 'white', fontWeight: '900', fontSize: 15 }, footerNote: { color: colors.muted, fontSize: 9, textAlign: 'center', marginTop: 6 }, withdrawButton: { alignItems: 'center', minHeight: 48, justifyContent: 'center' }, withdrawText: { color: colors.danger, fontSize: 10, fontWeight: '800' },
});
