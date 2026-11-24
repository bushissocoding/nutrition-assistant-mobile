import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { calculateAdultBmi, normalizeProfile } from './profile-model.cjs';

export default function ProfileScreen({ profile, account, consentRecord, onEdit, onDeleted, onWithdrawConsent, onReviewConsent, onNavigate, onExitDemo }) {
  const [busy, setBusy] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const normalized = normalizeProfile(profile);
  const bmi = calculateAdultBmi(normalized);
  useEffect(() => { setBusy(false); }, [profile]);

  async function deleteData() {
    const confirmed = await new Promise(resolve => Alert.alert('Xóa hồ sơ sức khỏe?', 'Hồ sơ sức khỏe của tài khoản sẽ bị xóa khỏi máy chủ. Biên nhận đồng ý và dữ liệu tính năng khác không bị xóa.', [
      { text: 'Hủy', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Xóa hồ sơ sức khỏe', style: 'destructive', onPress: () => resolve(true) },
    ]));
    if (!confirmed) return;
    setBusy(true);
    try { await onDeleted(); }
    catch (error) {
      setBusy(false);
      Alert.alert('Chưa xóa được', error?.message || 'Máy chủ chưa xác nhận xóa hồ sơ. Hãy kiểm tra kết nối rồi thử lại.');
    }
  }

  function exitDemo() {
    setShowExitConfirm(true);
  }

  return <View style={styles.root}><ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.title}>Trang cá nhân</Text>
    <View style={styles.accountCard}>
      <View style={styles.accountAvatar}><Text style={styles.accountAvatarText}>♡</Text></View>
      <View style={{ flex: 1 }}><Text style={styles.accountName}>{account?.username || account?.email || 'Tài khoản'}</Text><Text style={styles.small}>{account?.email || 'Hồ sơ gắn với tài khoản đã đăng nhập'}</Text></View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Chỉnh sửa hồ sơ sức khỏe" onPress={onEdit} style={{ minWidth: 54, minHeight: 54, justifyContent: 'center', alignItems: 'center' }}><Text style={styles.accountEdit}>Sửa</Text></TouchableOpacity>
    </View>
    <View style={styles.menuCard}>
      <ProfileLink icon="♙" label="Thông tin cá nhân" onPress={onEdit} />
      <ProfileLink icon="▣" label="Phương thức thanh toán (demo)" onPress={() => onNavigate?.('payment-methods')} />
      <ProfileLink icon="▢" label="Chính sách và quyền riêng tư" onPress={() => onNavigate?.('settings-privacy')} />
      <ProfileLink icon="⚙" label="Cài đặt tài khoản" onPress={() => onNavigate?.('settings')} />
      <ProfileLink icon="?" label="Hỗ trợ" onPress={() => onNavigate?.('settings-help')} />
      <ProfileLink icon="↪" label="Đăng xuất" onPress={exitDemo} />
    </View>
    <View style={styles.demoBanner}><View style={styles.demoMark}><Text style={styles.demoMarkText}>♡</Text></View><View style={styles.demoCopy}><Text style={styles.demoTitle}>HỒ SƠ TÀI KHOẢN</Text><Text style={styles.small}>Thông tin do bạn tự nhập; chưa được nhân viên y tế xác minh. Bạn có thể xuất hoặc xóa dữ liệu tài khoản theo chức năng đang khả dụng.</Text></View></View>
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
    <View style={styles.menuCard}>
      <ProfileLink icon="▤" label="Hồ sơ y tế" onPress={() => onNavigate?.('medical-record')} />
      <ProfileLink icon="♡" label="Cá nhân hóa sức khỏe" onPress={() => onNavigate?.('personalization')} />
      <ProfileLink icon="♧" label="Thông báo" onPress={() => onNavigate?.('notifications')} />
    </View>
    <View style={styles.card}><Text accessibilityRole="header" style={styles.heading}>Dị ứng / cần tránh</Text><Text style={styles.small}>{normalized.allergies.length ? normalized.allergies.join(', ') : 'Chưa nhập dị ứng.'}</Text></View>
    {normalized.mode === 'patient' && <View style={styles.card}><Text accessibilityRole="header" style={styles.heading}>Chỉ tiêu nhập thủ công</Text><Text style={styles.small}>{normalized.diagnosisNotes || 'Chưa ghi chú chẩn đoán.'}</Text>{Object.entries(normalized.hardLimits).map(([key, range]) => <Text key={key} style={styles.small}>{key}: {range.min ?? '—'} – {range.max ?? '—'}</Text>)}<Text style={styles.small}>{normalized.medicalLimitsConfirmed ? 'Người dùng xác nhận đã đối chiếu với bác sĩ.' : 'Chưa xác nhận.'}</Text></View>}
    {normalized.mode === 'healthy' && <View style={styles.warning}><Text accessibilityRole="header" style={styles.heading}>Sàng lọc, không chẩn đoán</Text><Text style={styles.small}>{normalized.redFlags.length ? 'Có dấu hiệu đã đánh dấu cần được nhân viên y tế đánh giá. Tạo thực đơn bị khóa.' : normalized.symptomNotes || 'Chưa nhập triệu chứng.'}</Text></View>}
    <View style={styles.warning}><Text accessibilityRole="header" style={styles.heading}>Giới hạn sử dụng</Text><Text style={styles.small}>Thông tin sức khỏe do bạn tự nhập và chưa được nhân viên y tế xác minh. Gợi ý dinh dưỡng chỉ tham khảo, không dùng để chẩn đoán hoặc điều trị.</Text></View>
    <View style={styles.card}><Text accessibilityRole="header" style={styles.heading}>Biên nhận đồng ý</Text><Text style={styles.small}>{consentRecord?.version || 'Chưa có biên nhận hiện hành'}{consentRecord?.acceptedAt ? ` · Ghi nhận lúc ${new Date(consentRecord.acceptedAt).toLocaleString('vi-VN')}` : ''}</Text><TouchableOpacity accessibilityRole="button" style={styles.reviewButton} onPress={onReviewConsent}><Text style={styles.reviewLink}>Xem lại nội dung và lựa chọn ›</Text></TouchableOpacity><Text style={styles.small}>Biên nhận này được gắn với tài khoản và thời điểm máy chủ ghi nhận.</Text></View>
    <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={onEdit}><Text style={styles.buttonText}>Chỉnh sửa hồ sơ</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" style={styles.exitButton} onPress={exitDemo}><Text style={styles.exitText}>Thoát về màn chào mừng</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" style={styles.deleteButton} disabled={busy} onPress={deleteData}>{busy ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.deleteText}>Xóa hồ sơ sức khỏe</Text>}</TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" style={styles.withdrawButton} disabled={busy} onPress={onWithdrawConsent}><Text style={styles.deleteText}>Thu hồi quyền xử lý dữ liệu</Text></TouchableOpacity>
  </ScrollView>{showExitConfirm && <View accessibilityRole="alert" style={styles.exitOverlay}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Đóng xác nhận đăng xuất" style={styles.exitBackdrop} onPress={() => setShowExitConfirm(false)} />
    <View style={styles.exitSheet}>
      <Text accessibilityRole="header" style={styles.exitHeading}>Đăng xuất</Text>
      <Text style={styles.exitMessage}>Bạn có chắc chắn muốn đăng xuất không?</Text>
      <Text style={styles.exitHint}>Dữ liệu tài khoản trên máy chủ vẫn được giữ nguyên cho lần đăng nhập sau.</Text>
      <View style={styles.exitActions}>
        <TouchableOpacity accessibilityRole="button" style={styles.stayButton} onPress={() => setShowExitConfirm(false)}><Text style={styles.stayText}>Ở lại</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={styles.confirmExitButton} onPress={() => { setShowExitConfirm(false); onExitDemo?.(); }}><Text style={styles.confirmExitText}>Đăng xuất</Text></TouchableOpacity>
      </View>
    </View>
  </View>}</View>;
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
  root: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, paddingBottom: 124 },
  title: { color: colors.primary, fontSize: 22, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  demoBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.softBlue, borderWidth: 1, borderColor: '#E0E8FF', padding: 13, borderRadius: radius.md, marginVertical: 6 },
  demoMark: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  demoMarkText: { color: colors.primary, fontSize: 22, fontWeight: '800' },
  demoCopy: { flex: 1 },
  demoTitle: { color: colors.primaryDark, fontWeight: '900', fontSize: 13, letterSpacing: 0.5 },
  card: { backgroundColor: colors.surface, padding: 15, borderRadius: radius.md, marginVertical: 7, borderWidth: 1, borderColor: colors.border },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, marginTop: 7, borderRadius: radius.md, backgroundColor: '#F1F5FF' },
  accountAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DCE7FF' },
  accountAvatarText: { color: colors.primary, fontSize: 21 }, accountName: { color: colors.text, fontSize: 13, fontWeight: '800' }, accountEdit: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  menuCard: { backgroundColor: colors.surface, paddingHorizontal: 12, borderRadius: radius.md, marginVertical: 7, borderWidth: 1, borderColor: colors.border },
  profileLink: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderColor: colors.border }, profileLinkIcon: { width: 22, textAlign: 'center', color: colors.primary, fontSize: 17 }, profileLinkLabel: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' }, profileLinkArrow: { color: colors.primary, fontSize: 21 },
  warning: { backgroundColor: '#FFF7E6', padding: 15, borderRadius: radius.md, marginVertical: 7 },
  heading: { color: colors.text, fontWeight: '800', fontSize: 16 },
  value: { color: colors.primaryDark, fontWeight: '700', fontSize: 14, marginTop: 7 },
  measureRow: { flexDirection: 'row', gap: 7, marginTop: 12 },
  measure: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2F5FC', borderRadius: 11, padding: 7 },
  measureLabel: { color: colors.muted, fontSize: 13 },
  measureValue: { color: colors.primaryDark, fontWeight: '800', fontSize: 16, marginTop: 3 },
  measureUnit: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  small: { color: colors.muted, fontSize: 14, lineHeight: 18, marginTop: 7 },
  bmiRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.softBlue, borderRadius: 9, marginTop: 9, paddingHorizontal: 10, paddingVertical: 8 },
  bmiLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  bmiValue: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  reviewButton: { alignSelf: 'flex-start', minHeight: 54, justifyContent: 'center' },
  reviewLink: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  button: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', minHeight: 54, borderRadius: radius.pill, marginTop: 14 },
  buttonText: { color: 'white', fontWeight: '800', fontSize: 14 },
  exitButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', marginTop: 7 }, exitText: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  deleteButton: { borderColor: colors.danger, borderWidth: 1, alignItems: 'center', justifyContent: 'center', minHeight: 54, borderRadius: radius.pill, marginTop: 10 },
  deleteText: { color: colors.danger, fontWeight: '800', fontSize: 13 },
  withdrawButton: { alignItems: 'center', justifyContent: 'center', minHeight: 54, marginTop: 6 },
  exitOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', backgroundColor: 'rgba(45, 103, 226, 0.48)' },
  exitBackdrop: { ...StyleSheet.absoluteFillObject },
  exitSheet: { minHeight: 210, padding: 22, paddingBottom: 30, borderTopLeftRadius: 26, borderTopRightRadius: 26, alignItems: 'center', backgroundColor: 'white' },
  exitHeading: { color: colors.primary, fontSize: 22, fontWeight: '800', marginTop: 4 },
  exitMessage: { color: colors.text, fontSize: 16, textAlign: 'center', marginTop: 10 },
  exitHint: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  exitActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, width: '100%', marginTop: 17 },
  stayButton: { minHeight: 54, minWidth: 90, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: '#EDF3FF' },
  stayText: { color: colors.primary, fontSize: 15, fontWeight: '800' },
  confirmExitButton: { minHeight: 54, minWidth: 130, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.primary },
  confirmExitText: { color: 'white', fontSize: 15, fontWeight: '800' },
});
