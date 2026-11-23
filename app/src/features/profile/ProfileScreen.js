import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { calculateAdultBmi, normalizeProfile } from './profile-model.cjs';

export default function ProfileScreen({ profile, consentRecord, onEdit, onDeleted, onWithdrawConsent, onReviewConsent, onNavigate, onExitDemo }) {
  const [busy, setBusy] = useState(false);
  const normalized = normalizeProfile(profile);
  const bmi = calculateAdultBmi(normalized);
  useEffect(() => { setBusy(false); }, [profile]);

  async function deleteData() {
    const confirmed = await new Promise(resolve => Alert.alert('Xóa hồ sơ trên thiết bị?', 'Nhật ký demo trên máy chủ sẽ được xóa trước, sau đó hồ sơ trên thiết bị và dữ liệu demo trong bộ nhớ sẽ được xóa. Trạng thái đồng ý được giữ lại.', [
      { text: 'Hủy', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Xóa hồ sơ', style: 'destructive', onPress: () => resolve(true) },
    ]));
    if (!confirmed) return;
    setBusy(true);
    try { await onDeleted(); }
    catch (error) {
      setBusy(false);
      Alert.alert('Chưa xóa được', error?.message || 'Không thể xóa nhật ký trên máy chủ hoặc dữ liệu cục bộ. Hãy kiểm tra kết nối rồi thử lại.');
    }
  }

  function exitDemo() {
    Alert.alert('Thoát bản demo?', 'Bạn sẽ quay về màn chào mừng. Hồ sơ demo và biên nhận đồng ý trên thiết bị vẫn được giữ nguyên.', [
      { text: 'Ở lại', style: 'cancel' },
      { text: 'Thoát', onPress: onExitDemo },
    ]);
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.title}>Hồ sơ sức khỏe</Text>
    <View style={styles.demoBanner}><View style={styles.demoMark}><Text style={styles.demoMarkText}>♡</Text></View><View style={styles.demoCopy}><Text style={styles.demoTitle}>HỒ SƠ DEMO</Text><Text style={styles.small}>Chỉ dùng dữ liệu tổng hợp. Nội dung lưu trên thiết bị này, không phải dữ liệu tài khoản và không được xác thực.</Text></View></View>
    <View style={styles.card}>
      <Text style={styles.heading}>Thông tin tham khảo</Text>
      <Text style={styles.value}>{normalized.mode === 'patient' ? 'Theo chỉ tiêu đã được bác sĩ xác nhận' : 'Tham khảo cơ bản'}</Text>
      <View style={styles.measureRow}>
        <Measure label="Tuổi" value={normalized.age || '—'} unit="năm" />
        <Measure label="Chiều cao" value={normalized.heightCm || '—'} unit="cm" />
        <Measure label="Cân nặng" value={normalized.weightKg || '—'} unit="kg" />
      </View>
      <Text style={styles.small}>Vận động: {normalized.activityLevel === 'low' ? 'Thấp' : normalized.activityLevel === 'high' ? 'Cao' : 'Vừa'}</Text>
      {bmi != null && <View style={styles.bmiRow}><Text style={styles.bmiLabel}>BMI tham khảo</Text><Text style={styles.bmiValue}>{bmi}</Text></View>}
    </View>
    <View style={styles.accountCard}>
      <View style={styles.accountAvatar}><Text style={styles.accountAvatarText}>♡</Text></View>
      <View style={{ flex: 1 }}><Text style={styles.accountName}>Người dùng demo</Text><Text style={styles.small}>Hồ sơ cục bộ · không có tài khoản</Text></View>
      <TouchableOpacity accessibilityRole="button" onPress={onEdit} style={{ minWidth: 48, minHeight: 48, justifyContent: "center", alignItems: "center" }}><Text style={styles.accountEdit}>Sửa ›</Text></TouchableOpacity>
    </View>
    <View style={styles.menuCard}>
      <ProfileLink icon="▤" label="Hồ sơ y tế demo" onPress={() => onNavigate?.('medical-record')} />
      <ProfileLink icon="♡" label="Cá nhân hóa" onPress={() => onNavigate?.('personalization')} />
      <ProfileLink icon="▣" label="Phương thức thanh toán (demo)" onPress={() => onNavigate?.('payment-methods')} />
      <ProfileLink icon="⚙" label="Cài đặt tài khoản" onPress={() => onNavigate?.('settings')} />
      <ProfileLink icon="?" label="Trung tâm hỗ trợ" onPress={() => onNavigate?.('settings-help')} />
      <ProfileLink icon="♧" label="Thông báo" onPress={() => onNavigate?.('notifications')} />
    </View>
    <View style={styles.card}><Text accessibilityRole="header" style={styles.heading}>Dị ứng / cần tránh</Text><Text style={styles.small}>{normalized.allergies.length ? normalized.allergies.join(', ') : 'Chưa nhập dị ứng.'}</Text></View>
    {normalized.mode === 'patient' && <View style={styles.card}><Text accessibilityRole="header" style={styles.heading}>Chỉ tiêu nhập thủ công</Text><Text style={styles.small}>{normalized.diagnosisNotes || 'Chưa ghi chú chẩn đoán.'}</Text>{Object.entries(normalized.hardLimits).map(([key, range]) => <Text key={key} style={styles.small}>{key}: {range.min ?? '—'} – {range.max ?? '—'}</Text>)}<Text style={styles.small}>{normalized.medicalLimitsConfirmed ? 'Người dùng xác nhận đã đối chiếu với bác sĩ.' : 'Chưa xác nhận.'}</Text></View>}
    {normalized.mode === 'healthy' && <View style={styles.warning}><Text accessibilityRole="header" style={styles.heading}>Sàng lọc, không chẩn đoán</Text><Text style={styles.small}>{normalized.redFlags.length ? 'Có dấu hiệu đã đánh dấu cần được nhân viên y tế đánh giá. Tạo thực đơn bị khóa.' : normalized.symptomNotes || 'Chưa nhập triệu chứng.'}</Text></View>}
    <View style={styles.warning}><Text accessibilityRole="header" style={styles.heading}>Giới hạn an toàn</Text><Text style={styles.small}>Hồ sơ này lưu trên thiết bị. Nhật ký bữa ăn demo được lưu trên máy chủ theo namespace do ứng dụng gửi, chưa có xác thực hoặc quyền sở hữu an toàn. Chỉ dùng dữ liệu tổng hợp, không nhập thông tin sức khỏe thật.</Text></View>
    <View style={styles.card}><Text accessibilityRole="header" style={styles.heading}>Lựa chọn đồng ý trên thiết bị</Text><Text style={styles.small}>{consentRecord?.version || 'Chưa có biên nhận hiện hành'}{consentRecord?.acceptedAt ? ` · Ghi nhận lúc ${new Date(consentRecord.acceptedAt).toLocaleString('vi-VN')}` : ''}</Text><TouchableOpacity accessibilityRole="button" style={styles.reviewButton} onPress={onReviewConsent}><Text style={styles.reviewLink}>Xem lại nội dung và lựa chọn ›</Text></TouchableOpacity><Text style={styles.small}>Đây là biên nhận cục bộ, chưa gắn với tài khoản hay được xác minh bởi máy chủ.</Text></View>
    <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={onEdit}><Text style={styles.buttonText}>Chỉnh sửa hồ sơ</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" style={styles.exitButton} onPress={exitDemo}><Text style={styles.exitText}>Thoát về màn chào mừng</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" style={styles.deleteButton} disabled={busy} onPress={deleteData}>{busy ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.deleteText}>Xóa hồ sơ khỏi thiết bị</Text>}</TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" style={styles.withdrawButton} disabled={busy} onPress={onWithdrawConsent}><Text style={styles.deleteText}>Thu hồi đồng ý và xóa toàn bộ dữ liệu</Text></TouchableOpacity>
  </ScrollView>;
}

function Measure({ label, value, unit }) {
  return <View style={styles.measure}>
    <Text style={styles.measureLabel}>{label}</Text>
    <Text style={styles.measureValue}>{value}<Text style={styles.measureUnit}> {unit}</Text></Text>
  </View>;
}

function ProfileLink({ icon, label, onPress }) {
  return <TouchableOpacity accessibilityRole="button" style={styles.profileLink} onPress={onPress}>
    <Text style={styles.profileLinkIcon}>{icon}</Text><Text style={styles.profileLinkLabel}>{label}</Text><Text style={styles.profileLinkArrow}>›</Text>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, paddingBottom: 124 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', marginBottom: 10 },
  demoBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.softBlue, borderWidth: 1, borderColor: '#E0E8FF', padding: 13, borderRadius: radius.md, marginVertical: 6 },
  demoMark: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  demoMarkText: { color: colors.primary, fontSize: 22, fontWeight: '800' },
  demoCopy: { flex: 1 },
  demoTitle: { color: colors.primaryDark, fontWeight: '900', fontSize: 13, letterSpacing: 0.5 },
  card: { backgroundColor: colors.surface, padding: 15, borderRadius: radius.md, marginVertical: 7, borderWidth: 1, borderColor: colors.border },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, marginTop: 7, borderRadius: radius.md, backgroundColor: '#F1F5FF' },
  accountAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DCE7FF' },
  accountAvatarText: { color: colors.primary, fontSize: 21 }, accountName: { color: colors.text, fontSize: 13, fontWeight: '800' }, accountEdit: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  menuCard: { backgroundColor: colors.surface, paddingHorizontal: 12, borderRadius: radius.md, marginVertical: 7, borderWidth: 1, borderColor: colors.border },
  profileLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderColor: colors.border }, profileLinkIcon: { width: 22, textAlign: 'center', color: colors.primary, fontSize: 17 }, profileLinkLabel: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' }, profileLinkArrow: { color: colors.primary, fontSize: 21 },
  warning: { backgroundColor: '#FFF7E6', padding: 15, borderRadius: radius.md, marginVertical: 7 },
  heading: { color: colors.text, fontWeight: '800', fontSize: 16 },
  value: { color: colors.primaryDark, fontWeight: '700', fontSize: 14, marginTop: 7 },
  measureRow: { flexDirection: 'row', gap: 7, marginTop: 12 },
  measure: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2F5FC', borderRadius: 11, padding: 7 },
  measureLabel: { color: colors.muted, fontSize: 11 },
  measureValue: { color: colors.primaryDark, fontWeight: '800', fontSize: 16, marginTop: 3 },
  measureUnit: { color: colors.muted, fontSize: 10, fontWeight: '600' },
  small: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 7 },
  bmiRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.softBlue, borderRadius: 9, marginTop: 9, paddingHorizontal: 10, paddingVertical: 8 },
  bmiLabel: { color: colors.text, fontSize: 12, fontWeight: '700' },
  bmiValue: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  reviewButton: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center' },
  reviewLink: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  button: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: radius.pill, marginTop: 14 },
  buttonText: { color: 'white', fontWeight: '800', fontSize: 14 },
  exitButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 7 }, exitText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  deleteButton: { borderColor: colors.danger, borderWidth: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: radius.pill, marginTop: 10 },
  deleteText: { color: colors.danger, fontWeight: '800', fontSize: 13 },
  withdrawButton: { alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 6 },
});
