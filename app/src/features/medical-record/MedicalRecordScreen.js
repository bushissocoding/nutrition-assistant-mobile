import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { calculateAdultBmi, NUTRIENTS, normalizeProfile } from '../profile/profile-model.cjs';
import { colors, radius } from '../../theme/tokens';

function numberText(value, unit) { return value === '' || value == null ? 'Chưa nhập' : `${value} ${unit}`; }

export default function MedicalRecordScreen({ profile, onBack, onNavigate }) {
  const [showPreview, setShowPreview] = useState(false);
  const normalized = normalizeProfile(profile);
  const bmi = calculateAdultBmi(normalized);
  const targetRows = NUTRIENTS.filter(item => normalized.hardLimits?.[item.key]).map(item => {
    const limit = normalized.hardLimits[item.key];
    return `${item.label}: ${limit.min ?? '—'}–${limit.max ?? '—'} ${item.unit}`;
  });
  const conditionLabels = {
    unspecified: 'Chưa khai báo',
    'heart-failure-stage-1-2': 'Suy tim giai đoạn 1–2',
    'heart-failure-stage-3': 'Suy tim giai đoạn 3',
    'heart-failure-stage-4': 'Suy tim giai đoạn 4',
    'acute-kidney-disease': 'Suy thận cấp',
    'chronic-kidney-disease-stage-1-2': 'Suy thận mạn giai đoạn 1–2',
    'chronic-kidney-disease-stage-3-4': 'Suy thận mạn giai đoạn 3–4',
    diabetes: 'Tiểu đường',
    hypertension: 'Tăng huyết áp',
    other: 'Tình trạng khác',
  };
  const allergyLabels = normalized.allergies.length ? normalized.allergies.join(', ') : 'Chưa có mục cần tránh được ghi nhận';
  const preview = [
    'HỒ SƠ THAM KHẢO · BẢN DEMO',
    `Tuổi: ${numberText(normalized.age, 'tuổi')}`,
    `Chiều cao: ${numberText(normalized.heightCm, 'cm')}`,
    `Cân nặng: ${numberText(normalized.weightKg, 'kg')}`,
    `BMI tham khảo: ${bmi ?? 'Chưa tính được'}`,
    `Thực phẩm cần tránh: ${allergyLabels}`,
    `Chỉ tiêu đã nhập: ${targetRows.length ? targetRows.join(' · ') : 'Chưa có'}`,
    'Không phải hồ sơ bệnh án hay tư vấn y tế.',
  ].join('\n');

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.header}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.back} onPress={onBack}><Text style={styles.backText}>‹</Text></TouchableOpacity><Text accessibilityRole="header" style={styles.title}>Hồ sơ y tế</Text><View style={styles.headerSpace} /></View>
    <Text style={styles.disclaimer}>BẢN TÓM TẮT DEMO · Dữ liệu do người dùng nhập, chưa được xác minh.</Text>
    <View style={styles.identity}><View style={styles.avatar}><Text style={styles.avatarIcon}>KP</Text></View><View style={{ flex: 1 }}><Text style={styles.personName}>Hồ sơ tham khảo</Text><Text style={styles.personMeta}>Lưu cục bộ trên thiết bị · không có tài khoản</Text></View><TouchableOpacity accessibilityRole="button" onPress={() => onNavigate?.('profile-setup')} style={{ minWidth: 54, minHeight: 54, justifyContent: 'center', alignItems: 'center' }}><Text style={styles.edit}>Sửa</Text></TouchableOpacity></View>
    <Section title="Chỉ số nhân trắc">
      <View style={styles.metricRow}><Metric label="Chiều cao" value={numberText(normalized.heightCm, 'cm')} /><Metric label="Cân nặng" value={numberText(normalized.weightKg, 'kg')} /><Metric label="Tuổi" value={numberText(normalized.age, '')} /></View>
      <View style={styles.bmiRow}><Text style={styles.bmiLabel}>BMI tham khảo</Text><Text style={styles.bmiValue}>{bmi ?? '—'}{bmi != null && <Text style={styles.bmiUnit}> kg/m²</Text>}</Text><View style={styles.bmiTrack}><View style={[styles.bmiFill, { width: `${Math.min(100, Math.max(8, (bmi || 0) / 40 * 100))}%` }]} /></View><Text style={styles.muted}>Chỉ số tham khảo, không phải kết luận sức khỏe.</Text></View>
    </Section>
    <Section title="Bệnh lý / tình trạng đã nhập"><Text style={styles.condition}>{conditionLabels[normalized.conditionType] || 'Chưa khai báo'}</Text><Text style={styles.muted}>Thông tin do người dùng tự khai báo, không phải chẩn đoán.</Text>{targetRows.length ? <View style={styles.targetGrid}>{targetRows.map(line => <Text key={line} style={styles.targetLine}>{line}</Text>)}</View> : <Text style={styles.muted}>Chưa có chỉ tiêu dinh dưỡng được ghi nhận.</Text>}{normalized.mode === 'patient' && <Text style={styles.confirmed}>Đã xác nhận đối chiếu với bác sĩ: {normalized.medicalLimitsConfirmed ? 'Có' : 'Chưa'}</Text>}</Section>
    <Section title="Dị ứng thực phẩm"><View style={styles.allergyRow}>{normalized.allergies.length ? normalized.allergies.map(item => <Text key={item} style={styles.allergyChip}>{item}</Text>) : <Text style={styles.rowText}>Chưa khai báo dị ứng</Text>}</View><Text style={styles.muted}>Luôn kiểm tra nhãn và thành phần thực tế của thực phẩm.</Text></Section>
    <Section title="Xét nghiệm gần nhất"><View style={styles.emptyTest}><Text style={styles.emptyTestIcon}>⌁</Text><Text style={styles.rowText}>Chưa có kết quả xét nghiệm</Text><Text style={styles.muted}>Ứng dụng chưa nhận ảnh hoặc xác minh chỉ số xét nghiệm.</Text></View><TouchableOpacity accessibilityRole="button" style={styles.outlineButton} onPress={() => onNavigate?.('personalization')}><Text style={styles.outlineText}>Thêm kết quả demo</Text></TouchableOpacity></Section>
    <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={() => setShowPreview(value => !value)}><Text style={styles.primaryText}>{showPreview ? 'Đóng bản xem trước' : 'Xem trước bản xuất PDF'}</Text></TouchableOpacity>
    {showPreview && <View accessibilityLiveRegion="polite" style={styles.preview}><Text style={styles.previewHeading}>BẢN XEM TRƯỚC PDF · BẢN DEMO</Text><Text style={styles.previewText}>{preview}</Text><Text style={styles.muted}>Chưa tạo tệp PDF hoặc chia sẻ dữ liệu ra khỏi thiết bị.</Text></View>}
    <Text style={styles.footer}>Không chia sẻ hồ sơ thật. Dữ liệu y tế chưa được máy chủ xác thực.</Text>
  </ScrollView>;
}

function Section({ title, children }) { return <View style={styles.section}><Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>{children}</View>; }
function Metric({ label, value }) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F8FF' }, content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 112 }, header: { flexDirection: 'row', minHeight: 52, alignItems: 'center', justifyContent: 'space-between' }, back: { width: 48, height: 48, justifyContent: 'center' }, backText: { color: colors.primary, fontSize: 34 }, title: { color: colors.primary, fontSize: 20, fontWeight: '800' }, headerSpace: { width: 48 },
  disclaimer: { padding: 10, borderRadius: 11, color: colors.primaryDark, backgroundColor: '#EAF0FF', fontSize: 12, lineHeight: 18, marginTop: 5 }, identity: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: 'white', borderRadius: 14, marginTop: 10 }, avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#DCE7FF', alignItems: 'center', justifyContent: 'center' }, avatarIcon: { color: colors.primary, fontSize: 15, fontWeight: '900' }, personName: { color: colors.text, fontSize: 16, fontWeight: '800' }, personMeta: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 }, edit: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  section: { backgroundColor: 'white', borderRadius: 16, padding: 14, marginTop: 10 }, sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 11 }, metricRow: { flexDirection: 'row', gap: 8 }, metric: { flex: 1, minHeight: 60, padding: 9, backgroundColor: '#EEF3FF', borderRadius: 11 }, metricLabel: { color: colors.muted, fontSize: 12 }, metricValue: { color: colors.primaryDark, fontSize: 15, fontWeight: '800', marginTop: 6 }, bmiRow: { padding: 12, marginTop: 10, backgroundColor: '#F7F9FD', borderRadius: 11 }, bmiLabel: { color: colors.muted, fontSize: 12 }, bmiValue: { color: colors.primaryDark, fontSize: 21, fontWeight: '900', marginTop: 3 }, bmiUnit: { fontSize: 12 }, bmiTrack: { height: 8, backgroundColor: '#DDE5F2', borderRadius: 4, overflow: 'hidden', marginTop: 9 }, bmiFill: { height: '100%', backgroundColor: '#26AA82' },
  rowText: { color: colors.text, fontSize: 14, lineHeight: 21 }, muted: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }, condition: { color: colors.primaryDark, fontSize: 16, fontWeight: '800', backgroundColor: '#EEF3FF', padding: 12, borderRadius: 11 }, targetGrid: { gap: 4, marginTop: 4 }, targetLine: { color: colors.text, fontSize: 13, backgroundColor: '#EEF3FF', padding: 10, borderRadius: 9, marginTop: 6 }, confirmed: { color: colors.primaryDark, fontSize: 13, marginTop: 8, fontWeight: '700' }, allergyRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' }, allergyChip: { color: colors.primaryDark, backgroundColor: '#EEF3FF', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 15, fontSize: 13, fontWeight: '700' }, emptyTest: { alignItems: 'center', padding: 15, borderRadius: 12, backgroundColor: '#F7F9FD' }, emptyTestIcon: { color: colors.primary, fontSize: 28, marginBottom: 5 }, outlineButton: { alignSelf: 'stretch', minHeight: 50, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, borderRadius: 17, borderColor: colors.primary, borderWidth: 1, marginTop: 10 }, outlineText: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  primary: { minHeight: 56, backgroundColor: colors.primary, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: 13 }, primaryText: { color: 'white', fontSize: 16, fontWeight: '800' }, preview: { backgroundColor: '#EAF0FF', borderRadius: 12, padding: 14, marginTop: 10 }, previewHeading: { color: colors.primaryDark, fontSize: 13, fontWeight: '900' }, previewText: { color: colors.text, fontSize: 14, lineHeight: 21, marginTop: 8 }, footer: { color: colors.muted, textAlign: 'center', fontSize: 12, marginTop: 12 },
});
