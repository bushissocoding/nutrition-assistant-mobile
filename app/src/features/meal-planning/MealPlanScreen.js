import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import { NUTRIENTS } from '../profile/profile-model.cjs';
import { colors, radius } from '../../theme/tokens';

function warningText(warning) {
  return typeof warning === 'string' ? warning : warning?.message || '';
}

function moneyText(value) {
  return Number.isSafeInteger(value) ? `${value.toLocaleString('vi-VN')}đ` : 'Chưa có giá có nguồn';
}

function provenanceText(meal, catalogVersion) {
  const sources = meal.provenance?.foods || [];
  const sourceLabels = [...new Set(sources.map(source => `${source.sourceName || source.sourceId} · ${source.edition || 'chưa rõ phiên bản'}`))];
  const servingSources = [...new Set(sources.map(source => source.servingSource?.sourceName).filter(Boolean))];
  const records = sources.map(source => `${source.foodId} ${source.foodVersion || ''}`.trim()).join(', ');
  const template = meal.provenance?.template;
  return [
    `Dữ liệu: ${sourceLabels.join('; ') || 'không có nguồn thành phần'}`,
    `Nguồn khẩu phần: ${servingSources.join(', ') || 'chưa ghi nhận'}`,
    `Công thức: ${template?.sourceName || template?.sourceId || 'không rõ'} · ${template?.edition || 'chưa rõ phiên bản'} · ${template?.sourceRecordId || 'chưa rõ bản ghi'}`,
    `Phiên bản món: ${template?.templateVersion || 'không rõ'} · bản ghi thực phẩm: ${records || 'không rõ'}`,
    `Catalog: ${catalogVersion || 'không rõ'}`
  ].join('\n');
}

function MealDetails({ meal, catalogVersion }) {
  return <View style={styles.card}>
    <Text style={styles.heading}>{meal.name}</Text>
    <Text style={styles.small}>{meal.slot} · {moneyText(meal.estimatedCostVnd)}</Text>
    {meal.portions.map(item => <Text key={item.foodId} style={styles.small}>• {item.food}: {item.grams} g{item.household ? ` (${item.household})` : ''}</Text>)}
    <View style={styles.nutrientGrid}>
      {NUTRIENTS.map(nutrient => <Text key={nutrient.key} style={styles.nutrientCell}>{nutrient.label}: {meal.nutrients?.[nutrient.key] ?? '—'} {nutrient.unit}</Text>)}
    </View>
    <Text style={styles.explanation}>Lý do chọn: {meal.explanation}</Text>
    {(meal.selectionReasons || []).map((reason, index) => <Text key={`selection-reason-${index}`} style={styles.provenance}>{reason.message}</Text>)}
    <Text accessibilityRole="text" style={styles.provenance}>{provenanceText(meal, catalogVersion)}</Text>
    {(meal.warnings || []).map((warning, index) => <Text key={`meal-warning-${index}`} style={styles.warning}>{warningText(warning)}</Text>)}
  </View>;
}

function PlanResult({ result, onOpenGrocery }) {
  const plan = Array.isArray(result.plan) ? result.plan : [];
  return <View>
    <Text style={styles.heading}>Lịch thực đơn</Text>
    {(result.warnings || []).map((warning, index) => <Text key={`warning-${index}`} style={styles.warning}>{warningText(warning)}</Text>)}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.meals}>
      {plan.map((meal, index) => <View key={`${meal.slot}-${index}`} style={styles.mealCard}>
        <Text style={styles.mealSlot}>{meal.slot}</Text>
        <Text style={styles.mealName}>{meal.name}</Text>
        <Text style={styles.small}>{meal.nutrients?.energyKcal ?? '—'} kcal · {moneyText(meal.estimatedCostVnd)}</Text>
      </View>)}
    </ScrollView>
    <View style={styles.card}>
      <Text style={styles.heading}>Tổng dinh dưỡng mỗi ngày</Text>
      {NUTRIENTS.map(nutrient => <Text key={nutrient.key} style={styles.small}>{nutrient.label}　{result.dailyTotals?.[nutrient.key] ?? '—'} {nutrient.unit}</Text>)}
      <Text style={styles.explanation}>Chi phí ước tính: {moneyText(result.estimatedCostVnd)}</Text>
      <Text style={styles.provenance}>Catalog {result.metadata?.catalogVersion || 'không rõ'} · thuật toán {result.metadata?.algorithmVersion || 'không rõ'}</Text>
    </View>
    {plan.map((meal, index) => <MealDetails key={`detail-${meal.slot}-${index}`} meal={meal} catalogVersion={result.metadata?.catalogVersion} />)}
    <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={() => onOpenGrocery?.(result.grocery || [])}>
      <Text style={styles.secondaryText}>Tạo danh sách đi chợ</Text>
    </TouchableOpacity>
    {(result.limitations || []).map((limitation, index) => <Text key={`limitation-${index}`} style={styles.footnote}>{limitation}</Text>)}
  </View>;
}

export default function MealPlanScreen({ profile, onOpenProfile, onOpenGrocery, onPlanGenerated }) {
  const [preferences, setPreferences] = useState('');
  const [budget, setBudget] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryable, setRetryable] = useState(false);

  async function generatePlan() {
    if (profile?.mode === 'healthy' && profile.redFlags?.length) {
      setResult(null); setRetryable(false); setError('Có dấu hiệu cần được nhân viên y tế đánh giá. Ứng dụng không tạo thực đơn trong trường hợp này.');
      return;
    }
    if (profile?.mode === 'patient' && (!profile.medicalLimitsConfirmed || Object.keys(profile.hardLimits || {}).length === 0)) {
      setResult(null); setRetryable(false); setError('Hồ sơ cần có ít nhất một giới hạn dinh dưỡng đã đối chiếu với bác sĩ. Hãy cập nhật hồ sơ trước.');
      return;
    }
    const budgetText = budget.trim();
    const parsedBudget = budgetText ? Number(budgetText) : undefined;
    if (budgetText && (!Number.isSafeInteger(parsedBudget) || parsedBudget < 0 || parsedBudget > 10000000)) {
      setResult(null); setRetryable(false); setError('Nhập ngân sách là số nguyên từ 0 đến 10.000.000 VNĐ.');
      return;
    }

    const request = {
      contractVersion: 1,
      ...(parsedBudget === undefined ? {} : { budgetVnd: parsedBudget }),
      preferences,
      allergies: profile?.allergies || [],
      excludedFoodIds: [],
      hardLimits: profile?.mode === 'patient' ? profile.hardLimits : {}
    };
    setLoading(true); setError(''); setRetryable(false); setResult(null);
    try {
      const data = await api.generateMealPlan(request);
      setResult(data);
      if (data?.status === 'feasible' && data.planFeasible && Array.isArray(data.plan) && data.plan.length > 0) onPlanGenerated?.(data);
      else if (!['infeasible', 'unavailable'].includes(data?.status)) {
        setResult(null);
        setError('API trả về trạng thái thực đơn không hợp lệ. Hãy thử lại.');
        setRetryable(true);
      }
    } catch (requestError) {
      setError(requestError.message || 'Không kết nối được API.');
      setRetryable(true);
    } finally {
      setLoading(false);
    }
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.title}>Thực đơn của tôi</Text>
    <Text style={styles.disclaimer}>Gợi ý prototype từ dữ liệu demo có ghi nguồn; không thay thế chế độ ăn do bác sĩ chỉ định.</Text>
    <TouchableOpacity accessibilityRole="button" style={styles.savedListButton} onPress={() => onOpenGrocery?.()}>
      <Text style={styles.savedListText}>Mở danh sách đi chợ đã lưu</Text>
    </TouchableOpacity>
    <View style={styles.card}>
      <Text style={styles.heading}>Tùy chỉnh thực đơn</Text>
      <Text style={styles.label}>Món bạn yêu thích</Text>
      <TextInput accessibilityLabel="Món bạn yêu thích" value={preferences} onChangeText={setPreferences} placeholder="Ví dụ: món cá, canh bí..." style={styles.input} maxLength={200} />
      <Text style={styles.label}>Ngân sách mỗi ngày (VNĐ, tùy chọn)</Text>
      <TextInput accessibilityLabel="Ngân sách mỗi ngày (VNĐ)" value={budget} onChangeText={setBudget} keyboardType="numeric" style={styles.input} maxLength={8} />
      <Text style={styles.helper}>Giá hiện chưa có nguồn xác minh. Để trống để xem gợi ý không xét ngân sách.</Text>
      <Text style={styles.label}>Chế độ hồ sơ demo</Text>
      <View style={styles.profileSummary}>
        <Text style={styles.profileValue}>{profile?.mode === 'patient' ? 'Có chỉ tiêu được xác nhận' : 'Tham khảo cơ bản'}</Text>
        <Text style={styles.profileHint}>Dữ liệu tổng hợp lưu trên thiết bị, chưa gắn với tài khoản.</Text>
        <Text style={styles.profileHint}>Dị ứng: {profile?.allergies?.length ? profile.allergies.join(', ') : 'chưa nhập'}</Text>
        {profile?.mode === 'patient' && <Text style={styles.profileHint}>Các hardLimits đã xác nhận được áp dụng bắt buộc.</Text>}
        <TouchableOpacity accessibilityRole="button" onPress={onOpenProfile}><Text style={styles.editLink}>Chỉnh sửa hồ sơ ›</Text></TouchableOpacity>
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={loading ? 'Đang tạo thực đơn' : 'Tạo thực đơn'} style={styles.button} disabled={loading} accessibilityState={{ disabled: loading }} onPress={generatePlan}>
        {loading ? <View style={styles.loadingRow}><ActivityIndicator accessibilityLabel="Đang tạo thực đơn" color="white" /><Text style={styles.buttonText}>Đang tạo thực đơn</Text></View> : <Text style={styles.buttonText}>Tạo thực đơn</Text>}
      </TouchableOpacity>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {retryable && <TouchableOpacity accessibilityRole="button" style={styles.retryButton} disabled={loading} accessibilityState={{ disabled: loading }} onPress={generatePlan}>
        <Text style={styles.retryText}>{loading ? 'Đang thử lại…' : 'Thử lại tạo thực đơn'}</Text>
      </TouchableOpacity>}
    </View>
    {result?.status === 'infeasible' && <View accessibilityRole="alert" style={styles.emptyState}>
      <Text style={styles.emptyHeading}>Chưa có thực đơn khả thi</Text>
      <Text style={styles.emptyText}>{result.infeasibility?.message || 'Không có tổ hợp bữa ăn đáp ứng đồng thời các ràng buộc đã gửi.'}</Text>
      {(result.infeasibility?.details || []).map((detail, index) => <Text key={`infeasible-detail-${index}`} style={styles.small}>{detail.slot || detail.nutrient || detail.budgetVnd || ''}</Text>)}
      <Text style={styles.footnote}>Các dị ứng và hardLimits được giữ nguyên; không có bữa nào bị trả như một kế hoạch thành công.</Text>
    </View>}
    {result?.status === 'unavailable' && <View accessibilityRole="alert" style={styles.emptyState}>
      <Text style={styles.emptyHeading}>Dữ liệu chưa đủ để tạo thực đơn</Text>
      <Text style={styles.emptyText}>{result.unavailability?.message || 'Thiếu dữ liệu có nguồn để đánh giá các điều kiện.'}</Text>
    </View>}
    {result?.status === 'feasible' && result.planFeasible && <PlanResult result={result} onOpenGrocery={onOpenGrocery} />}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 18, paddingBottom: 110 },
  title: { color: colors.primary, fontWeight: '800', fontSize: 24, marginBottom: 5 },
  nutrientGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  nutrientCell: { width: '48%', color: colors.text, fontSize: 10, backgroundColor: '#F5F7FB', padding: 7, borderRadius: 7 },
  profileSummary: { backgroundColor: '#F5F7FB', padding: 11, borderRadius: 10, marginTop: 6 },
  profileValue: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' },
  profileHint: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  editLink: { color: colors.primary, fontSize: 11, fontWeight: '800', marginTop: 8 },
  disclaimer: { color: colors.warning, fontSize: 12, lineHeight: 18, backgroundColor: '#FFF5DE', padding: 12, borderRadius: radius.sm, marginVertical: 9 },
  savedListButton: { padding: 12, alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, marginBottom: 8 },
  savedListText: { color: colors.primary, fontWeight: '800', fontSize: 12 },
  card: { padding: 16, borderRadius: radius.md, backgroundColor: 'white', marginVertical: 7, elevation: 2 },
  heading: { fontSize: 16, color: colors.text, fontWeight: '800', marginBottom: 5 },
  label: { fontSize: 12, color: colors.text, fontWeight: '700', marginTop: 13 },
  input: { backgroundColor: '#F5F7FB', borderRadius: 11, padding: 12, marginTop: 6, color: colors.text },
  helper: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 6 },
  button: { minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  buttonText: { color: 'white', fontWeight: '800' },
  error: { color: colors.danger, marginTop: 10 },
  retryButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 10, marginTop: 10 },
  retryText: { color: colors.primary, fontWeight: '800', fontSize: 12 },
  warning: { color: colors.warning, backgroundColor: '#FFF5DE', padding: 10, borderRadius: 9, marginTop: 7, fontSize: 12 },
  meals: { gap: 12, paddingVertical: 12 },
  mealCard: { width: 165, backgroundColor: 'white', padding: 13, borderRadius: radius.md, elevation: 2 },
  mealSlot: { fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 8 },
  mealName: { color: colors.text, fontSize: 12, textAlign: 'center', marginTop: 4 },
  small: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 5 },
  explanation: { color: colors.primaryDark, fontSize: 12, lineHeight: 18, marginTop: 12 },
  provenance: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 10 },
  secondary: { backgroundColor: colors.primary, borderRadius: radius.pill, padding: 15, alignItems: 'center', marginTop: 10 },
  secondaryText: { color: 'white', fontWeight: '800' },
  footnote: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 14 },
  emptyState: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.warning, borderRadius: radius.md, padding: 16, marginVertical: 8 },
  emptyHeading: { fontSize: 16, color: colors.text, fontWeight: '800' },
  emptyText: { fontSize: 13, color: colors.text, lineHeight: 20, marginTop: 8 }
});
