import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { calculateAdultBmi, normalizeProfile } from './profile-model.cjs';

export default function ProfileScreen({ profile, consentRecord, onEdit, onDeleted, onWithdrawConsent, onReviewConsent }) {
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

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.title}>Hồ sơ sức khỏe</Text>
    <View style={styles.demoBanner}><Text style={styles.demoTitle}>HỒ SƠ DEMO</Text><Text style={styles.small}>Chỉ dùng dữ liệu tổng hợp. Nội dung lưu trên thiết bị này, không phải dữ liệu tài khoản và không được xác thực.</Text></View>
    <View style={styles.card}><Text style={styles.heading}>Chế độ</Text><Text style={styles.value}>{normalized.mode === 'patient' ? 'Theo chỉ tiêu đã được bác sĩ xác nhận' : 'Tham khảo cơ bản'}</Text><Text style={styles.small}>Tuổi {normalized.age} · {normalized.heightCm} cm · {normalized.weightKg} kg</Text><Text style={styles.small}>Vận động: {normalized.activityLevel === 'low' ? 'Thấp' : normalized.activityLevel === 'high' ? 'Cao' : 'Vừa'}</Text>{bmi != null && <Text style={styles.small}>BMI tham khảo: {bmi}</Text>}</View>
    <View style={styles.card}><Text style={styles.heading}>Dị ứng / cần tránh</Text><Text style={styles.small}>{normalized.allergies.length ? normalized.allergies.join(', ') : 'Chưa nhập dị ứng.'}</Text></View>
    {normalized.mode === 'patient' && <View style={styles.card}><Text style={styles.heading}>Chỉ tiêu nhập thủ công</Text><Text style={styles.small}>{normalized.diagnosisNotes || 'Chưa ghi chú chẩn đoán.'}</Text>{Object.entries(normalized.hardLimits).map(([key, range]) => <Text key={key} style={styles.small}>{key}: {range.min ?? '—'} – {range.max ?? '—'}</Text>)}<Text style={styles.small}>{normalized.medicalLimitsConfirmed ? 'Người dùng xác nhận đã đối chiếu với bác sĩ.' : 'Chưa xác nhận.'}</Text></View>}
    {normalized.mode === 'healthy' && <View style={styles.warning}><Text style={styles.heading}>Sàng lọc, không chẩn đoán</Text><Text style={styles.small}>{normalized.redFlags.length ? 'Có dấu hiệu đã đánh dấu cần được nhân viên y tế đánh giá. Tạo thực đơn bị khóa.' : normalized.symptomNotes || 'Chưa nhập triệu chứng.'}</Text></View>}
    <View style={styles.warning}><Text style={styles.heading}>Giới hạn an toàn</Text><Text style={styles.small}>Hồ sơ này lưu trên thiết bị. Nhật ký bữa ăn demo được lưu trên máy chủ theo namespace do ứng dụng gửi, chưa có xác thực hoặc quyền sở hữu an toàn. Chỉ dùng dữ liệu tổng hợp, không nhập thông tin sức khỏe thật.</Text></View>
    <View style={styles.card}><Text style={styles.heading}>Lựa chọn consent trên thiết bị</Text><Text style={styles.small}>{consentRecord?.version || 'Chưa có biên nhận hiện hành'}{consentRecord?.acceptedAt ? ` · Ghi nhận lúc ${new Date(consentRecord.acceptedAt).toLocaleString('vi-VN')}` : ''}</Text><TouchableOpacity accessibilityRole="button" onPress={onReviewConsent}><Text style={styles.reviewLink}>Xem lại nội dung và lựa chọn</Text></TouchableOpacity><Text style={styles.small}>Đây là biên nhận cục bộ, chưa gắn với tài khoản hay được xác minh bởi máy chủ.</Text></View>
    <TouchableOpacity style={styles.button} onPress={onEdit}><Text style={styles.buttonText}>Chỉnh sửa hồ sơ</Text></TouchableOpacity>
    <TouchableOpacity style={styles.deleteButton} disabled={busy} onPress={deleteData}>{busy ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.deleteText}>Xóa hồ sơ khỏi thiết bị</Text>}</TouchableOpacity>
    <TouchableOpacity style={styles.withdrawButton} disabled={busy} onPress={onWithdrawConsent}><Text style={styles.deleteText}>Thu hồi đồng ý và xóa toàn bộ dữ liệu</Text></TouchableOpacity>
  </ScrollView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 18, paddingBottom: 110 }, title: { color: colors.primary, fontSize: 24, fontWeight: '800', marginBottom: 12 }, demoBanner: { backgroundColor: colors.softBlue, borderWidth: 1, borderColor: colors.primary, padding: 15, borderRadius: radius.md, marginVertical: 7 }, demoTitle: { color: colors.primary, fontWeight: '900', fontSize: 13, letterSpacing: 1 }, card: { backgroundColor: 'white', padding: 16, borderRadius: radius.md, marginVertical: 7 }, warning: { backgroundColor: '#FFF5DE', padding: 16, borderRadius: radius.md, marginVertical: 7 }, heading: { color: colors.text, fontWeight: '800', fontSize: 15 }, value: { color: colors.primary, fontWeight: '700', marginTop: 9 }, small: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 7 }, reviewLink: { color: colors.primary, fontWeight: '800', fontSize: 12, marginTop: 11 }, button: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: radius.pill, marginTop: 14 }, buttonText: { color: 'white', fontWeight: '800' }, deleteButton: { borderColor: colors.danger, borderWidth: 1, alignItems: 'center', justifyContent: 'center', minHeight: 46, borderRadius: radius.pill, marginTop: 10 }, deleteText: { color: colors.danger, fontWeight: '800', fontSize: 12 }, withdrawButton: { alignItems: 'center', justifyContent: 'center', minHeight: 46, marginTop: 6 } });
