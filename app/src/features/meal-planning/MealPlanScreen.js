import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import { NUTRIENTS } from '../profile/profile-model.cjs';
import { buildPlannerPayload, validatePlannerRequest } from './meal-plan-model.cjs';
import { colors, radius } from '../../theme/tokens';

const slots = ['Bữa sáng', 'Bữa trưa', 'Bữa tối', 'Bữa phụ'];
const formatConstraint = key => ({ budgetVnd: 'ngân sách', hardLimits: 'giới hạn dinh dưỡng bắt buộc', safe_recipe_for_each_meal: 'công thức an toàn cho từng bữa' }[key] || key);

export default function MealPlanScreen({ profile, onOpenProfile, onOpenGrocery, onPlanGenerated }) {
  const [preferences, setPreferences] = useState('');
  const [budget, setBudget] = useState('120000');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  async function generatePlan() {
    const validationError = validatePlannerRequest({ profile, budget });
    if (validationError) { setError(validationError); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const data = await api.generateMealPlan(buildPlannerPayload({ profile, budget, preferences }));
      setResult(data);
      setSelectedMeal(null);
      onPlanGenerated?.(data.feasibility?.status === 'feasible' ? data : null);
    } catch (requestError) { setError(requestError.message || 'Không kết nối được API.'); }
    finally { setLoading(false); }
  }

  const nutritionBars = [
    { key: 'energyKcal', label: 'Năng lượng', value: result?.dailyTotals?.energyKcal, unit: 'kcal', max: result?.goals?.energyKcal?.max || 2000 },
    { key: 'proteinG', label: 'Chất đạm', value: result?.dailyTotals?.proteinG, unit: 'g', max: result?.goals?.proteinG?.max || 90 },
    { key: 'carbohydrateG', label: 'Tinh bột', value: result?.dailyTotals?.carbohydrateG, unit: 'g', max: result?.goals?.carbohydrateG?.max || 280 },
    { key: 'fatG', label: 'Chất béo', value: result?.dailyTotals?.fatG, unit: 'g', max: result?.goals?.fatG?.max || 75 },
    { key: 'fiberG', label: 'Chất xơ', value: result?.dailyTotals?.fiberG, unit: 'g', max: result?.goals?.fiberG?.max || 35 },
    { key: 'sodiumMg', label: 'Natri', value: result?.dailyTotals?.sodiumMg, unit: 'mg', max: result?.goals?.sodiumMg?.max || 2000 },
  ];

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.topBar}><Text style={styles.back}>‹</Text><Text style={styles.title}>Lịch ăn hằng ngày</Text><TouchableOpacity accessibilityRole="button" onPress={() => setShowSettings(value => !value)}><Text style={styles.topAction}>ⓘ</Text></TouchableOpacity></View>
    {loading && <View accessibilityRole="progressbar" style={styles.loadingCard}><ActivityIndicator color={colors.primary} /><Text style={styles.profileHint}>Đang tìm phương án đủ bữa, trong ngân sách và giữ nguyên ràng buộc an toàn…</Text></View>}
    {showSettings && <View style={styles.infoCard}><Text style={styles.profileValue}>Về gợi ý thực đơn</Text><Text style={styles.profileHint}>Prototype tham khảo; chưa được chuyên gia dinh dưỡng xác nhận. Dị ứng chỉ lọc thành phần ghi nhận, không bảo đảm tránh nhiễm chéo.</Text></View>}
    <View style={styles.disclaimer}><Text style={styles.disclaimerTitle}>Gợi ý prototype · chưa được chuyên gia xác nhận</Text><Text style={styles.disclaimerCopy}>Ước tính từ dữ liệu mẫu, không thay thế chế độ ăn do bác sĩ chỉ định.</Text></View>
    <Text style={styles.sectionTitle}>Tùy chỉnh thực đơn</Text>
    <View style={styles.card}>
      <Text style={styles.label}>Món bạn yêu thích</Text><TextInput value={preferences} onChangeText={setPreferences} placeholder="Ví dụ: món cá, canh bí..." style={styles.input} />
      <Text style={styles.label}>Ngân sách mỗi ngày (VNĐ)</Text><TextInput value={budget} onChangeText={setBudget} keyboardType="numeric" style={styles.input} />
      <Text style={styles.label}>Ràng buộc an toàn</Text><View style={styles.profileSummary}><Text style={styles.profileValue}>Dị ứng: {profile?.allergies?.length ? profile.allergies.join(', ') : 'Chưa khai báo'}</Text>{profile?.mode === 'patient' && <Text style={styles.profileHint}>Giới hạn cứng từ hồ sơ đã xác nhận sẽ không được tự nới lỏng.</Text>}<TouchableOpacity onPress={onOpenProfile}><Text style={styles.editLink}>Xem / cập nhật hồ sơ ›</Text></TouchableOpacity></View>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: loading }} style={styles.button} disabled={loading} onPress={generatePlan}>{loading ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Tạo thực đơn an toàn</Text>}</TouchableOpacity>
      {!!error && <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.error}>{error}</Text><TouchableOpacity accessibilityRole="button" disabled={loading} onPress={generatePlan}><Text style={styles.editLink}>Thử lại ›</Text></TouchableOpacity></View>}
    </View>
    {result && <>
      {result.feasibility?.status === 'infeasible' ? <View accessibilityRole="alert" style={styles.infeasible}>
        <Text style={styles.heading}>Không có thực đơn khả thi</Text>
        <Text style={styles.small}>{result.feasibility.message}</Text>
        <Text style={styles.small}>Điều kiện chưa đáp ứng: {result.feasibility.unmet.map(formatConstraint).join(', ')}.</Text>
        <Text style={styles.explanation}>Không tự động nới lỏng dị ứng hoặc giới hạn cứng. Chỉ điều chỉnh ngân sách, sở thích hoặc trao đổi với chuyên gia về giới hạn y tế.</Text>
      </View> : <>
        <Text style={styles.sectionTitle}>Meal schedule</Text>
        {result.warnings.map((warning, index) => <Text key={`warning-${index}`} style={styles.warning}>{warning}</Text>)}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.meals}>
          {result.plan.map((meal, index) => <TouchableOpacity accessibilityRole="button" key={`${meal.slot}-${index}`} style={styles.mealCard} onPress={() => setSelectedMeal(meal)}>
            <Text style={styles.mealEmoji}>{['🍳', '🥗', '🍲', '🍎'][slots.indexOf(meal.slot)] || '🍽️'}</Text>
            <Text style={styles.mealSlot}>{meal.slot}</Text><Text style={styles.mealName}>{meal.name}</Text><Text style={styles.mealMeta}>Dữ liệu mẫu · prototype</Text>
            <Text style={styles.small}>{meal.nutrients.energyKcal} kcal · {meal.estimatedCostVnd.toLocaleString('vi-VN')}đ</Text>
          </TouchableOpacity>)}
        </ScrollView>
        <View style={styles.card}><Text style={styles.heading}>Calories Tracker</Text><Text style={styles.profileHint}>Chỉ số ước tính trong ngày · chưa phải mục tiêu điều trị</Text>{nutritionBars.map(item => <View key={item.key} style={styles.metric}><View style={styles.metricLabelRow}><Text style={styles.metricLabel}>{item.label}</Text><Text style={styles.metricValue}>{item.value} {item.unit}</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, Math.max(0, (item.value / item.max) * 100))}%` }]} /></View></View>)}<Text style={styles.explanation}>Chi phí ước tính: {result.estimatedCostVnd.toLocaleString('vi-VN')}đ</Text></View>
        {selectedMeal && <View style={styles.card}><View style={styles.detailHeader}><Text style={styles.heading}>{selectedMeal.name}</Text><TouchableOpacity accessibilityRole="button" onPress={() => setSelectedMeal(null)}><Text style={styles.editLink}>Đóng</Text></TouchableOpacity></View>{selectedMeal.portions.map(item => <View key={item.foodId} style={styles.ingredient}><Text style={styles.ingredientName}>• {item.food}</Text><Text style={styles.ingredientAmount}>{item.grams} g · {item.household}</Text><Text style={styles.sourceNote}>{item.source.name} · {item.source.sourceVersion || 'phiên bản nguồn chưa xác minh'}</Text><Text style={styles.sourceNote}>{item.provenance.reuseRights}</Text></View>)}<View style={styles.nutrientGrid}>{NUTRIENTS.map(nutrient => <Text key={nutrient.key} style={styles.nutrientCell}>{nutrient.label}: {selectedMeal.nutrients[nutrient.key]} {nutrient.unit}</Text>)}</View><Text style={styles.explanation}>Vì sao được chọn? {selectedMeal.explanation}</Text><Text style={styles.sourceNote}>Giá: {selectedMeal.provenance.priceSource} · {selectedMeal.provenance.pricingVersion || 'chưa xác minh phiên bản nguồn giá'}</Text></View>}
        <TouchableOpacity style={styles.secondary} onPress={() => onOpenGrocery(result.grocery)}><Text style={styles.secondaryText}>Tạo danh sách đi chợ</Text></TouchableOpacity>
      </>}
      <Text style={styles.footnote}>{result.limitations.join(' ')}</Text>
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 18, paddingBottom: 110 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, loadingCard: { backgroundColor: 'white', borderRadius: radius.md, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, back: { color: colors.primary, fontSize: 32, width: 28 }, title: { color: colors.primary, fontWeight: '800', fontSize: 20, marginBottom: 5 }, topAction: { color: colors.primary, fontSize: 20, width: 28, textAlign: 'right' }, sectionTitle: { fontSize: 17, color: colors.text, fontWeight: '800', marginTop: 14, marginBottom: 4 },
  nutrientGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }, nutrientCell: { width: '48%', color: colors.text, fontSize: 10, backgroundColor: '#F5F7FB', padding: 7, borderRadius: 7 }, profileSummary: { backgroundColor: '#F5F7FB', padding: 11, borderRadius: 10, marginTop: 6 }, infoCard: { backgroundColor: 'white', padding: 13, borderRadius: radius.md, marginBottom: 7 }, profileValue: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' }, profileHint: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, editLink: { color: colors.primary, fontSize: 11, fontWeight: '800', marginTop: 8 },
  disclaimer: { backgroundColor: colors.softBlue, padding: 13, borderRadius: radius.md, marginVertical: 6 }, disclaimerTitle: { color: colors.primaryDark, fontSize: 12, lineHeight: 18, fontWeight: '800' }, disclaimerCopy: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 }, infeasible: { backgroundColor: '#FFF0F0', borderRadius: radius.md, padding: 16, marginTop: 12 }, card: { padding: 16, borderRadius: radius.md, backgroundColor: 'white', marginVertical: 7, elevation: 3 },  heading: { fontSize: 16, color: colors.text, fontWeight: '800', marginBottom: 5 }, label: { fontSize: 12, color: colors.text, fontWeight: '700', marginTop: 13 }, input: { backgroundColor: '#F5F7FB', borderRadius: 11, padding: 12, marginTop: 6, color: colors.text }, button: { minHeight: 52, borderRadius: radius.pill, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginTop: 18, elevation: 4 },  buttonText: { color: 'white', fontWeight: '800' }, error: { color: colors.danger, marginTop: 10 }, warning: { color: colors.warning, backgroundColor: '#FFF5DE', padding: 10, borderRadius: 9, marginTop: 7, fontSize: 12 }, meals: { gap: 12, paddingVertical: 12 }, mealCard: { width: 190, backgroundColor: 'white', padding: 13, borderRadius: radius.md, elevation: 3 },  mealEmoji: { fontSize: 54, textAlign: 'center', backgroundColor: '#F4F7FF', borderRadius: 14, overflow: 'hidden', paddingVertical: 7 },  mealSlot: { fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 8 }, mealName: { color: colors.text, fontSize: 12, textAlign: 'center', marginTop: 4 }, mealMeta: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 5 }, small: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 5 }, metric: { marginTop: 11 }, metricLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, metricLabel: { color: colors.text, fontSize: 11, fontWeight: '700' }, metricValue: { color: colors.primaryDark, fontSize: 11, fontWeight: '800' }, track: { height: 10, backgroundColor: '#D9D9D9', borderRadius: 8, marginTop: 6, overflow: 'hidden' }, fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 8 }, ingredient: { backgroundColor: '#F7F9FE', borderRadius: 10, padding: 9, marginTop: 6 }, ingredientName: { color: colors.text, fontWeight: '700', fontSize: 12 }, ingredientAmount: { color: colors.muted, fontSize: 11, marginTop: 3 }, sourceNote: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 }, errorBox: { backgroundColor: '#FFF0F0', borderRadius: 10, padding: 10, marginTop: 10 }, detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, explanation: { color: colors.primaryDark, fontSize: 12, lineHeight: 18, marginTop: 12 }, secondary: { backgroundColor: colors.primary, borderRadius: radius.pill, padding: 15, alignItems: 'center', marginTop: 10 }, secondaryText: { color: 'white', fontWeight: '800' }, footnote: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 14 },
});
