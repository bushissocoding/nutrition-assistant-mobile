import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import { NUTRIENTS } from '../profile/profile-model.cjs';
import { colors, radius } from '../../theme/tokens';

const slots = ['Bữa sáng', 'Bữa trưa', 'Bữa tối', 'Bữa phụ'];

export default function MealPlanScreen({ profile, onOpenProfile, onOpenGrocery, onPlanGenerated }) {
  const [preferences, setPreferences] = useState('');
  const [budget, setBudget] = useState('120000');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryable, setRetryable] = useState(false);

  async function generatePlan() {
    if (profile?.mode === 'healthy' && profile.redFlags?.length) {
      setRetryable(false); setError('Có dấu hiệu cần được nhân viên y tế đánh giá. Ứng dụng không tạo thực đơn trong trường hợp này.');
      return;
    }
    if (profile?.mode === 'patient' && (!profile.medicalLimitsConfirmed || Object.keys(profile.hardLimits || {}).length === 0)) {
      setRetryable(false); setError('Hồ sơ cần có ít nhất một giới hạn dinh dưỡng đã đối chiếu với bác sĩ. Hãy cập nhật hồ sơ trước.');
      return;
    }
    const parsedBudget = Number(budget);
    if (!Number.isFinite(parsedBudget) || parsedBudget < 0) {
      setRetryable(false); setError('Nhập ngân sách hợp lệ.');
      return;
    }
    setLoading(true); setError(''); setRetryable(false);
    try {
      const data = await api.generateMealPlan({
        budgetVnd: Number(budget), preferences,
        allergies: profile?.allergies || [],
        hardLimits: profile?.mode === 'patient' ? profile.hardLimits : {},
      });
      setResult(data);
      onPlanGenerated?.(data);
    } catch (requestError) { setError(requestError.message || 'Không kết nối được API.'); setRetryable(true); }
    finally { setLoading(false); }
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.title}>Thực đơn của tôi</Text>
    <Text style={styles.disclaimer}>Bản mẫu tham khảo từ dữ liệu demo; không thay thế chế độ ăn do bác sĩ chỉ định.</Text>
    <TouchableOpacity style={styles.savedListButton} onPress={() => onOpenGrocery?.()}><Text style={styles.savedListText}>Mở danh sách đi chợ đã lưu</Text></TouchableOpacity>
    <View style={styles.card}>
      <Text style={styles.heading}>Tùy chỉnh thực đơn</Text>
      <Text style={styles.label}>Món bạn yêu thích</Text><TextInput value={preferences} onChangeText={setPreferences} placeholder="Ví dụ: món cá, canh bí..." style={styles.input} />
      <Text style={styles.label}>Ngân sách mỗi ngày (VNĐ)</Text><TextInput value={budget} onChangeText={setBudget} keyboardType="numeric" style={styles.input} />
      <Text style={styles.label}>Chế độ hồ sơ demo</Text><View style={styles.profileSummary}><Text style={styles.profileValue}>{profile?.mode === 'patient' ? 'Có chỉ tiêu được xác nhận' : 'Tham khảo cơ bản'}</Text><Text style={styles.profileHint}>Dữ liệu tổng hợp lưu trên thiết bị, chưa gắn với tài khoản.</Text><Text style={styles.profileHint}>Dị ứng: {profile?.allergies?.length ? profile.allergies.join(', ') : 'chưa nhập'}</Text>{profile?.mode === 'patient' && <Text style={styles.profileHint}>Khoảng dinh dưỡng từ hồ sơ đã xác nhận sẽ được áp dụng như ràng buộc cứng.</Text>}<TouchableOpacity onPress={onOpenProfile}><Text style={styles.editLink}>Chỉnh sửa hồ sơ ›</Text></TouchableOpacity></View>
      <TouchableOpacity style={styles.button} disabled={loading} onPress={generatePlan}>{loading ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Tạo thực đơn</Text>}</TouchableOpacity>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {retryable && <TouchableOpacity accessibilityRole="button" style={styles.retryButton} disabled={loading} onPress={generatePlan}><Text style={styles.retryText}>{loading ? 'Đang thử lại…' : 'Thử lại tạo thực đơn'}</Text></TouchableOpacity>}
    </View>
    {result && <>
      <Text style={styles.heading}>Meal schedule</Text>
      {result.warnings.map((warning, index) => <Text key={`warning-${index}`} style={styles.warning}>{warning}</Text>)}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.meals}>
        {result.plan.map((meal, index) => <View key={`${meal.slot}-${index}`} style={styles.mealCard}>
          <Text style={styles.mealEmoji}>{['🍳', '🥗', '🍲', '🍎'][slots.indexOf(meal.slot)] || '🍽️'}</Text>
          <Text style={styles.mealSlot}>{meal.slot}</Text><Text style={styles.mealName}>{meal.name}</Text>
          <Text style={styles.small}>{meal.nutrients.energyKcal} kcal · {meal.estimatedCostVnd.toLocaleString('vi-VN')}đ</Text>
        </View>)}
      </ScrollView>
      <View style={styles.card}><Text style={styles.heading}>Calories Tracker</Text>{NUTRIENTS.map(nutrient => <Text key={nutrient.key} style={styles.small}>{nutrient.label}　{result.dailyTotals[nutrient.key]} {nutrient.unit}</Text>)}<Text style={styles.explanation}>Chi phí ước tính: {result.estimatedCostVnd.toLocaleString('vi-VN')}đ</Text></View>
      {result.plan.map((meal, index) => <View key={`detail-${meal.slot}-${index}`} style={styles.card}><Text style={styles.heading}>{meal.name}</Text>{meal.portions.map(item => <Text key={item.foodId} style={styles.small}>• {item.food}: {item.grams} g ({item.household})</Text>)}<View style={styles.nutrientGrid}>{NUTRIENTS.map(nutrient => <Text key={nutrient.key} style={styles.nutrientCell}>{nutrient.label}: {meal.nutrients[nutrient.key]} {nutrient.unit}</Text>)}</View><Text style={styles.explanation}>Vì sao phù hợp? {meal.explanation}</Text></View>)}
      <TouchableOpacity style={styles.secondary} onPress={() => onOpenGrocery(result.grocery)}><Text style={styles.secondaryText}>Tạo danh sách đi chợ</Text></TouchableOpacity>
      <Text style={styles.footnote}>{result.limitations.join(' ')}</Text>
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 18, paddingBottom: 110 }, title: { color: colors.primary, fontWeight: '800', fontSize: 24, marginBottom: 5 },
  nutrientGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }, nutrientCell: { width: '48%', color: colors.text, fontSize: 10, backgroundColor: '#F5F7FB', padding: 7, borderRadius: 7 }, profileSummary: { backgroundColor: '#F5F7FB', padding: 11, borderRadius: 10, marginTop: 6 }, profileValue: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' }, profileHint: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, editLink: { color: colors.primary, fontSize: 11, fontWeight: '800', marginTop: 8 },
  disclaimer: { color: colors.warning, fontSize: 12, lineHeight: 18, backgroundColor: '#FFF5DE', padding: 12, borderRadius: radius.sm, marginVertical: 9 }, savedListButton: { padding: 12, alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, marginBottom: 8 }, savedListText: { color: colors.primary, fontWeight: '800', fontSize: 12 }, card: { padding: 16, borderRadius: radius.md, backgroundColor: 'white', marginVertical: 7, elevation: 2 }, heading: { fontSize: 16, color: colors.text, fontWeight: '800', marginBottom: 5 }, label: { fontSize: 12, color: colors.text, fontWeight: '700', marginTop: 13 }, input: { backgroundColor: '#F5F7FB', borderRadius: 11, padding: 12, marginTop: 6, color: colors.text }, button: { minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginTop: 18 }, buttonText: { color: 'white', fontWeight: '800' }, error: { color: colors.danger, marginTop: 10 }, retryButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 10, marginTop: 10 }, retryText: { color: colors.primary, fontWeight: '800', fontSize: 12 }, warning: { color: colors.warning, backgroundColor: '#FFF5DE', padding: 10, borderRadius: 9, marginTop: 7, fontSize: 12 }, meals: { gap: 12, paddingVertical: 12 }, mealCard: { width: 165, backgroundColor: 'white', padding: 13, borderRadius: radius.md, elevation: 2 }, mealEmoji: { fontSize: 54, textAlign: 'center', backgroundColor: '#F4F7FF', borderRadius: 14, overflow: 'hidden' }, mealSlot: { fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 8 }, mealName: { color: colors.text, fontSize: 12, textAlign: 'center', marginTop: 4 }, small: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 5 }, explanation: { color: colors.primaryDark, fontSize: 12, lineHeight: 18, marginTop: 12 }, secondary: { backgroundColor: colors.primary, borderRadius: radius.pill, padding: 15, alignItems: 'center', marginTop: 10 }, secondaryText: { color: 'white', fontWeight: '800' }, footnote: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 14 },
});
