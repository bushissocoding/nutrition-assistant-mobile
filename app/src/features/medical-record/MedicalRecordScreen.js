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
    <View style={styles.header}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.back} onPress={onBack}><Text style={styles.backText}>‹</Text></TouchableOpacity><Text accessibilityRole="header" style={styles.title}>Hồ sơ y tế demo</Text><Text style={styles.headerBadge}>▣</Text></View>
    <Text style={styles.disclaimer}>Hồ sơ tham khảo tổng hợp từ thông tin đã nhập trên thiết bị. Không phải bệnh án, không có xét nghiệm đã xác minh và không dùng để chẩn đoán.</Text>
    <View style={styles.identity}><View style={styles.avatar}><Text style={styles.avatarIcon}>♡</Text></View><View style={{ flex: 1 }}><Text style={styles.personName}>Hồ sơ tham khảo</Text><Text style={styles.personMeta}>Chế độ {normalized.mode === 'patient' ? 'chỉ tiêu đã xác nhận' : 'cơ bản'} · chỉ lưu trên thiết bị</Text></View><TouchableOpacity accessibilityRole="button" onPress={() => onNavigate?.('profile-setup')} style={{ minWidth: 48, minHeight: 48, justifyContent: "center", alignItems: "center" }}><Text style={styles.edit}>Sửa</Text></TouchableOpacity></View>
    <Section title="Chỉ số nhân trắc">
      <View style={styles.metricRow}><Metric label="Chiều cao" value={numberText(normalized.heightCm, 'cm')} /><Metric label="Cân nặng" value={numberText(normalized.weightKg, 'kg')} /><Metric label="Tuổi" value={numberText(normalized.age, '')} /></View>
      <View style={styles.bmiRow}><Text style={styles.bmiLabel}>BMI tham khảo</Text><Text style={styles.bmiValue}>{bmi ?? '—'}{bmi != null && <Text style={styles.bmiUnit}> kg/m²</Text>}</Text><View style={styles.bmiTrack}><View style={[styles.bmiFill, { width: `${Math.min(100, Math.max(8, (bmi || 0) / 40 * 100))}%` }]} /></View><Text style={styles.muted}>Chỉ số tham khảo, không phải kết luận sức khỏe.</Text></View>
    </Section>
    <Section title="Bệnh lý và mục tiêu dinh dưỡng"><Text style={styles.rowText}>{normalized.mode === 'patient' ? 'Chế độ hồ sơ theo chỉ tiêu do người dùng nhập' : 'Chưa khai báo mục tiêu y tế'}</Text>{targetRows.length ? targetRows.map(line => <Text key={line} style={styles.targetLine}>• {line}</Text>) : <Text style={styles.muted}>Chưa có giới hạn dinh dưỡng được ghi nhận.</Text>}{normalized.mode === 'patient' && <Text style={styles.confirmed}>Đã xác nhận đối chiếu với bác sĩ: {normalized.medicalLimitsConfirmed ? 'Có' : 'Chưa'}</Text>}</Section>
    <Section title="Dị ứng / thực phẩm cần tránh"><Text style={styles.rowText}>{allergyLabels}</Text><Text style={styles.muted}>Danh sách demo không thay thế việc kiểm tra thành phần thực tế.</Text></Section>
    <Section title="Lịch sử xét nghiệm"><Text style={styles.rowText}>Chưa có kết quả xét nghiệm trong bản demo</Text><Text style={styles.muted}>Tải ảnh và trích xuất OCR chưa được kết nối.</Text><TouchableOpacity accessibilityRole="button" style={styles.outlineButton} onPress={() => onNavigate?.('personalization')}><Text style={styles.outlineText}>Mở cá nhân hóa</Text></TouchableOpacity></Section>
    <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={() => setShowPreview(value => !value)}><Text style={styles.primaryText}>{showPreview ? 'Đóng bản xem trước' : 'Xem trước bản tóm tắt demo'}</Text></TouchableOpacity>
    {showPreview && <View accessibilityLiveRegion="polite" style={styles.preview}><Text style={styles.previewHeading}>BẢN XEM TRƯỚC · CHƯA XUẤT FILE</Text><Text style={styles.previewText}>{preview}</Text></View>}
    <Text style={styles.footer}>Không chia sẻ hồ sơ thật. Dữ liệu y tế chưa được máy chủ xác thực.</Text>
  </ScrollView>;
}

function Section({ title, children }) { return <View style={styles.section}><Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>{children}</View>; }
function Metric({ label, value }) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F8FF' }, content: { paddingHorizontal: 15, paddingTop: 10, paddingBottom: 112 }, header: { flexDirection: 'row', minHeight: 42, alignItems: 'center', justifyContent: 'space-between' }, back: { width: 48, height: 48, justifyContent: 'center' }, backText: { color: colors.primary, fontSize: 31 }, title: { color: colors.primary, fontSize: 16, fontWeight: '800' }, headerBadge: { color: colors.primary, fontSize: 18 },
  disclaimer: { padding: 11, borderRadius: 11, color: colors.warning, backgroundColor: '#FFF7E6', fontSize: 11, lineHeight: 16, marginTop: 8 }, identity: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: 'white', borderRadius: 14, marginTop: 11 }, avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E4ECFF', alignItems: 'center', justifyContent: 'center' }, avatarIcon: { color: colors.primary, fontSize: 23 }, personName: { color: colors.text, fontSize: 13, fontWeight: '800' }, personMeta: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 4 }, edit: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  section: { backgroundColor: 'white', borderRadius: 14, padding: 13, marginTop: 9 }, sectionTitle: { color: colors.text, fontSize: 13, fontWeight: '800', marginBottom: 10 }, metricRow: { flexDirection: 'row', gap: 6 }, metric: { flex: 1, padding: 8, backgroundColor: '#EEF3FF', borderRadius: 9 }, metricLabel: { color: colors.muted, fontSize: 10 }, metricValue: { color: colors.primaryDark, fontSize: 12, fontWeight: '800', marginTop: 5 }, bmiRow: { padding: 10, marginTop: 9, backgroundColor: '#F7F9FD', borderRadius: 9 }, bmiLabel: { color: colors.muted, fontSize: 10 }, bmiValue: { color: colors.primaryDark, fontSize: 18, fontWeight: '900', marginTop: 3 }, bmiUnit: { fontSize: 10 }, bmiTrack: { height: 6, backgroundColor: '#DDE5F2', borderRadius: 4, overflow: 'hidden', marginTop: 8 }, bmiFill: { height: '100%', backgroundColor: '#26AA82' },
  rowText: { color: colors.text, fontSize: 12, lineHeight: 18 }, muted: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 5 }, targetLine: { color: colors.text, fontSize: 11, marginTop: 7 }, confirmed: { color: colors.primaryDark, fontSize: 11, marginTop: 7, fontWeight: '700' }, outlineButton: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 17, borderColor: colors.primary, borderWidth: 1, marginTop: 10 }, outlineText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  primary: { minHeight: 48, backgroundColor: colors.primary, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: 12 }, primaryText: { color: 'white', fontSize: 12, fontWeight: '800' }, preview: { backgroundColor: '#EAF0FF', borderRadius: 12, padding: 12, marginTop: 10 }, previewHeading: { color: colors.primaryDark, fontSize: 10, fontWeight: '900' }, previewText: { color: colors.text, fontSize: 11, lineHeight: 18, marginTop: 7 }, footer: { color: colors.muted, textAlign: 'center', fontSize: 10, marginTop: 11 },
});
