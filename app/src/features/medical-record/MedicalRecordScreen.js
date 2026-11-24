import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { calculateAdultBmi, NUTRIENTS, normalizeProfile } from '../profile/profile-model.cjs';
import { colors, radius } from '../../theme/tokens';
import { createAndShareMedicalRecord } from './medical-record-export';
import { api } from '../../services/api';

function numberText(value, unit) { return value === '' || value == null ? 'Chưa nhập' : `${value} ${unit}`; }

export default function MedicalRecordScreen({ profile, account, onBack, onNavigate }) {
  const [showPreview, setShowPreview] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFeedback, setExportFeedback] = useState(null);
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(Boolean(account?.id));
  const [recordsError, setRecordsError] = useState('');
  const [recordsVersion, setRecordsVersion] = useState(0);
  const [sourcePreview, setSourcePreview] = useState(null);
  const [recordActionBusy, setRecordActionBusy] = useState(null);
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
  useEffect(() => {
    if (!account?.id) { setRecordsLoading(false); return undefined; }
    let active = true;
    setRecordsLoading(true); setRecordsError('');
    api.getMyHealthRecords({ limit: 100, offset: 0 }).then(result => {
      if (active) setRecords(Array.isArray(result?.items) ? result.items : []);
    }).catch(error => {
      if (active) setRecordsError(error?.message || 'Không tải được hồ sơ xét nghiệm.');
    }).finally(() => { if (active) setRecordsLoading(false); });
    return () => { active = false; };
  }, [account?.id, recordsVersion]);

  const healthResultLines = records.flatMap(record => [
    `${record.title} · ${record.sourceDate || 'Chưa ghi ngày'}`,
    ...(record.results || []).map(result => `  ${result.name}: ${result.value}${result.unit ? ` ${result.unit}` : ''}${result.referenceRange ? ` · khoảng tham chiếu do người dùng ghi: ${result.referenceRange}` : ''}`),
  ]);
  const preview = [
    'HỒ SƠ SỨC KHỎE DO NGƯỜI DÙNG CUNG CẤP',
    `Tuổi: ${numberText(normalized.age, 'tuổi')}`,
    `Chiều cao: ${numberText(normalized.heightCm, 'cm')}`,
    `Cân nặng: ${numberText(normalized.weightKg, 'kg')}`,
    `BMI tham khảo: ${bmi ?? 'Chưa tính được'}`,
    `Thực phẩm cần tránh: ${allergyLabels}`,
    `Chỉ tiêu đã nhập: ${targetRows.length ? targetRows.join(' · ') : 'Chưa có'}`,
    'Kết quả xét nghiệm đã lưu:',
    ...(healthResultLines.length ? healthResultLines : ['Chưa có kết quả xét nghiệm đã lưu.']),
    'Giá trị là nội dung người dùng xác nhận đã phiên âm, chưa được kiểm tra y tế; không phải chẩn đoán hay điều trị.',
  ].join('\n');

  async function previewSource(recordId) {
    setRecordActionBusy(recordId); setRecordsError('');
    try {
      const result = await api.getMyHealthRecordSource(recordId);
      if (!result?.source?.url) throw new Error('Máy chủ chưa cấp liên kết ảnh tạm thời.');
      setSourcePreview({ recordId, url: result.source.url, mimeType: result.source.mimeType });
    } catch (error) { setRecordsError(error?.message || 'Không tải được ảnh nguồn.'); }
    finally { setRecordActionBusy(null); }
  }

  function confirmDeleteRecord(record) {
    Alert.alert('Xóa hồ sơ xét nghiệm?', 'Ảnh nguồn và các giá trị của hồ sơ này sẽ bị xóa khỏi tài khoản.', [
      { text: 'Giữ lại', style: 'cancel' },
      { text: 'Xóa hồ sơ', style: 'destructive', onPress: async () => {
        setRecordActionBusy(record.id); setRecordsError('');
        try { await api.deleteMyHealthRecord(record.id); setRecords(current => current.filter(item => item.id !== record.id)); if (sourcePreview?.recordId === record.id) setSourcePreview(null); }
        catch (error) { setRecordsError(error?.message || 'Không xóa được hồ sơ.'); }
        finally { setRecordActionBusy(null); }
      } },
    ]);
  }

  async function exportPdf() {
    if (exporting) return;
    setExporting(true);
    setExportFeedback(null);
    try {
      if (Platform.OS === 'web') {
        const error = new Error('Xuất và chia sẻ PDF cục bộ hiện chỉ hỗ trợ trên ứng dụng iOS hoặc Android.');
        error.code = 'SHARING_UNAVAILABLE';
        throw error;
      }
      await createAndShareMedicalRecord(preview, {
        printToFileAsync: Print.printToFileAsync,
        isSharingAvailable: Sharing.isAvailableAsync,
        shareAsync: Sharing.shareAsync,
      });
      setExportFeedback({ type: 'success', message: 'Đã tạo PDF cục bộ và mở bảng chia sẻ.' });
    } catch (error) {
      setExportFeedback({ type: 'error', message: error?.message || 'Không xuất được PDF. Hãy thử lại.' });
    } finally {
      setExporting(false);
    }
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.header}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.back} onPress={onBack}><Text style={styles.backText}>‹</Text></TouchableOpacity><Text accessibilityRole="header" style={styles.title}>Hồ sơ y tế</Text><View style={styles.headerSpace} /></View>
    <Text style={styles.disclaimer}>HỒ SƠ DO NGƯỜI DÙNG CUNG CẤP · Chỉ tài khoản của bạn mới có quyền truy cập.</Text>
    <View style={styles.identity}><View style={styles.avatar}><Text style={styles.avatarIcon}>♡</Text></View><View style={{ flex: 1 }}><Text style={styles.personName}>{normalized.username || account?.email || 'Hồ sơ cá nhân'}</Text><Text style={styles.personMeta}>Thông tin sức khỏe bạn đã nhập</Text></View><TouchableOpacity accessibilityRole="button" onPress={() => onNavigate?.('profile-setup')} style={{ minWidth: 54, minHeight: 54, justifyContent: 'center', alignItems: 'center' }}><Text style={styles.edit}>Sửa</Text></TouchableOpacity></View>
    <Section title="Chỉ số nhân trắc">
      <View style={styles.metricRow}><Metric label="Chiều cao" value={numberText(normalized.heightCm, 'cm')} /><Metric label="Cân nặng" value={numberText(normalized.weightKg, 'kg')} /><Metric label="Tuổi" value={numberText(normalized.age, '')} /></View>
      <View style={styles.bmiRow}><Text style={styles.bmiLabel}>BMI tham khảo</Text><Text style={styles.bmiValue}>{bmi ?? '—'}{bmi != null && <Text style={styles.bmiUnit}> kg/m²</Text>}</Text><View style={styles.bmiTrack}><View style={[styles.bmiFill, { width: `${Math.min(100, Math.max(8, (bmi || 0) / 40 * 100))}%` }]} /></View><Text style={styles.muted}>Chỉ số tham khảo, không phải kết luận sức khỏe.</Text></View>
    </Section>
    <Section title="Bệnh lý / tình trạng đã nhập"><Text style={styles.condition}>{conditionLabels[normalized.conditionType] || 'Chưa khai báo'}</Text><Text style={styles.muted}>Thông tin do người dùng tự khai báo, không phải chẩn đoán.</Text>{targetRows.length ? <View style={styles.targetGrid}>{targetRows.map(line => <Text key={line} style={styles.targetLine}>{line}</Text>)}</View> : <Text style={styles.muted}>Chưa có chỉ tiêu dinh dưỡng được ghi nhận.</Text>}{normalized.mode === 'patient' && <Text style={styles.confirmed}>Đã xác nhận đối chiếu với bác sĩ: {normalized.medicalLimitsConfirmed ? 'Có' : 'Chưa'}</Text>}</Section>
    <Section title="Dị ứng thực phẩm"><View style={styles.allergyRow}>{normalized.allergies.length ? normalized.allergies.map(item => <Text key={item} style={styles.allergyChip}>{item}</Text>) : <Text style={styles.rowText}>Chưa khai báo dị ứng</Text>}</View><Text style={styles.muted}>Luôn kiểm tra nhãn và thành phần thực tế của thực phẩm.</Text></Section>
    <Section title="Hồ sơ xét nghiệm">
      {recordsLoading ? <View style={styles.loadingRow}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Đang tải hồ sơ của bạn…</Text></View>
        : recordsError ? <View><Text accessibilityRole="alert" style={styles.recordError}>{recordsError}</Text><TouchableOpacity accessibilityRole="button" onPress={() => setRecordsVersion(value => value + 1)}><Text style={styles.outlineText}>Tải lại</Text></TouchableOpacity></View>
          : records.length === 0 ? <View style={styles.emptyTest}><Text style={styles.emptyTestIcon}>⌁</Text><Text style={styles.rowText}>Chưa có kết quả xét nghiệm đã lưu</Text><Text style={styles.muted}>Ảnh OCR được xử lý trên thiết bị; chỉ các giá trị bạn xác nhận mới được lưu.</Text></View>
            : records.map(record => <View key={record.id} style={styles.recordCard}>
              <Text style={styles.personName}>{record.title}</Text><Text style={styles.muted}>{record.sourceDate || 'Chưa ghi ngày'} · {record.source?.available ? 'Có ảnh nguồn riêng tư' : 'Chưa có ảnh nguồn'}</Text>
              {record.results.map(result => <Text key={result.id} style={styles.recordResult}>{result.name}: {result.value}{result.unit ? ' ' + result.unit : ''}{result.referenceRange ? ' · khoảng tham chiếu do người dùng ghi: ' + result.referenceRange : ''}</Text>)}
              <View style={styles.recordActions}>
                {record.source?.available && <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Xem ảnh nguồn ' + record.title} disabled={recordActionBusy === record.id} onPress={() => previewSource(record.id)}><Text style={styles.outlineText}>{recordActionBusy === record.id ? 'Đang tải…' : 'Xem ảnh nguồn'}</Text></TouchableOpacity>}
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Xóa hồ sơ ' + record.title} disabled={recordActionBusy === record.id} onPress={() => confirmDeleteRecord(record)}><Text style={styles.recordDelete}>{recordActionBusy === record.id ? 'Đang xóa…' : 'Xóa hồ sơ'}</Text></TouchableOpacity>
              </View>
              {sourcePreview?.recordId === record.id && <View><Image accessibilityLabel={'Ảnh nguồn ' + record.title} source={{ uri: sourcePreview.url }} style={styles.sourcePreview} resizeMode="contain" /><TouchableOpacity accessibilityRole="button" onPress={() => setSourcePreview(null)}><Text style={styles.outlineText}>Đóng ảnh nguồn</Text></TouchableOpacity></View>}
            </View>)}
      <TouchableOpacity accessibilityRole="button" style={styles.outlineButton} onPress={() => onNavigate?.('personalization')}><Text style={styles.outlineText}>Thêm kết quả xét nghiệm</Text></TouchableOpacity>
      <Text style={styles.muted}>Các giá trị được người dùng xác nhận đã phiên âm; chưa được kiểm tra y tế.</Text>
    </Section>
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: exporting }} disabled={exporting} style={styles.primary} onPress={exportPdf}>
      {exporting ? <ActivityIndicator color="white" /> : <Text style={styles.primaryText}>Xuất PDF cục bộ</Text>}
    </TouchableOpacity>
    {!!exportFeedback && <Text accessibilityRole={exportFeedback.type === 'error' ? 'alert' : 'text'} accessibilityLiveRegion="polite" style={[styles.exportFeedback, exportFeedback.type === 'error' ? styles.exportError : styles.exportSuccess]}>{exportFeedback.message}</Text>}
    <TouchableOpacity accessibilityRole="button" style={styles.outlineButton} onPress={() => setShowPreview(value => !value)}><Text style={styles.outlineText}>{showPreview ? 'Đóng bản xem trước' : 'Xem trước nội dung PDF'}</Text></TouchableOpacity>
    {showPreview && <View accessibilityLiveRegion="polite" style={styles.preview}><Text style={styles.previewHeading}>BẢN XEM TRƯỚC PDF</Text><Text style={styles.previewText}>{preview}</Text><Text style={styles.muted}>Tệp chưa được tạo. Dùng nút xuất để mở bảng chia sẻ trên thiết bị.</Text></View>}
    <Text style={styles.footer}>Hồ sơ này không thay thế hồ sơ bệnh án hoặc tư vấn của nhân viên y tế.</Text>
  </ScrollView>;
}

function Section({ title, children }) { return <View style={styles.section}><Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>{children}</View>; }
function Metric({ label, value }) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F8FF' }, content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 112 }, header: { flexDirection: 'row', minHeight: 52, alignItems: 'center', justifyContent: 'space-between' }, back: { width: 48, height: 48, justifyContent: 'center' }, backText: { color: colors.primary, fontSize: 34 }, title: { color: colors.primary, fontSize: 20, fontWeight: '800' }, headerSpace: { width: 48 },
  disclaimer: { padding: 10, borderRadius: 11, color: colors.primaryDark, backgroundColor: '#EAF0FF', fontSize: 12, lineHeight: 18, marginTop: 5 }, identity: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: 'white', borderRadius: 14, marginTop: 10 }, avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#DCE7FF', alignItems: 'center', justifyContent: 'center' }, avatarIcon: { color: colors.primary, fontSize: 15, fontWeight: '900' }, personName: { color: colors.text, fontSize: 16, fontWeight: '800' }, personMeta: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 }, edit: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  section: { backgroundColor: 'white', borderRadius: 16, padding: 14, marginTop: 10 }, sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 11 }, metricRow: { flexDirection: 'row', gap: 8 }, metric: { flex: 1, minHeight: 60, padding: 9, backgroundColor: '#EEF3FF', borderRadius: 11 }, metricLabel: { color: colors.muted, fontSize: 12 }, metricValue: { color: colors.primaryDark, fontSize: 15, fontWeight: '800', marginTop: 6 }, bmiRow: { padding: 12, marginTop: 10, backgroundColor: '#F7F9FD', borderRadius: 11 }, bmiLabel: { color: colors.muted, fontSize: 12 }, bmiValue: { color: colors.primaryDark, fontSize: 21, fontWeight: '900', marginTop: 3 }, bmiUnit: { fontSize: 12 }, bmiTrack: { height: 8, backgroundColor: '#DDE5F2', borderRadius: 4, overflow: 'hidden', marginTop: 9 }, bmiFill: { height: '100%', backgroundColor: '#26AA82' },
  rowText: { color: colors.text, fontSize: 14, lineHeight: 21 }, muted: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }, condition: { color: colors.primaryDark, fontSize: 16, fontWeight: '800', backgroundColor: '#EEF3FF', padding: 12, borderRadius: 11 }, targetGrid: { gap: 4, marginTop: 4 }, targetLine: { color: colors.text, fontSize: 13, backgroundColor: '#EEF3FF', padding: 10, borderRadius: 9, marginTop: 6 }, confirmed: { color: colors.primaryDark, fontSize: 13, marginTop: 8, fontWeight: '700' }, allergyRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' }, allergyChip: { color: colors.primaryDark, backgroundColor: '#EEF3FF', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 15, fontSize: 13, fontWeight: '700' }, emptyTest: { alignItems: 'center', padding: 15, borderRadius: 12, backgroundColor: '#F7F9FD' }, emptyTestIcon: { color: colors.primary, fontSize: 28, marginBottom: 5 }, outlineButton: { alignSelf: 'stretch', minHeight: 50, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, borderRadius: 17, borderColor: colors.primary, borderWidth: 1, marginTop: 10 }, outlineText: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  primary: { minHeight: 56, backgroundColor: colors.primary, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: 13 }, primaryText: { color: 'white', fontSize: 16, fontWeight: '800' }, exportFeedback: { fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: 'center' }, exportError: { color: colors.danger }, exportSuccess: { color: colors.success }, preview: { backgroundColor: '#EAF0FF', borderRadius: 12, padding: 14, marginTop: 10 }, previewHeading: { color: colors.primaryDark, fontSize: 13, fontWeight: '900' }, previewText: { color: colors.text, fontSize: 14, lineHeight: 21, marginTop: 8 }, footer: { color: colors.muted, textAlign: 'center', fontSize: 12, marginTop: 12 }, recordCard: { padding: 12, borderRadius: 12, backgroundColor: '#F7F9FD', marginTop: 9 }, recordResult: { color: colors.text, fontSize: 13, lineHeight: 19, marginTop: 7 }, recordActions: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 44, alignItems: 'center', marginTop: 6 }, recordDelete: { color: colors.danger, fontSize: 13, fontWeight: '800' }, recordError: { color: colors.danger, fontSize: 12, lineHeight: 18, marginTop: 8 }, loadingRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8 }, sourcePreview: { width: '100%', height: 230, backgroundColor: '#EAF0FF', marginTop: 8 },
});
