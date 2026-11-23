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
    <Text accessibilityRole="header" style={styles.heading}>{meal.name}</Text>
    <Text style={styles.small}>{meal.slot} · {moneyText(meal.estimatedCostVnd)}</Text>
    {meal.portions.map(item => <Text key={item.foodId} style={styles.small}>• {item.food}: {item.grams} g{item.household ? ` (${item.household})` : ''}</Text>)}
    <View style={styles.nutrientGrid}>
      {NUTRIENTS.map(nutrient => <Text key={nutrient.key} style={styles.nutrientCell}>{nutrient.label}: {meal.nutrients?.[nutrient.key] ?? '—'} {nutrient.unit}</Text>)}
    </View>
    <Text style={styles.explanation}>Lý do chọn: {meal.explanation}</Text>
    {(meal.selectionReasons || []).map((reason, index) => <Text key={`selection-reason-${index}`} style={styles.provenance}>{reason.message}</Text>)}
    <View style={styles.sourceBox}><Text style={styles.sourceHeading}>Nguồn dữ liệu</Text><Text accessibilityRole="text" style={styles.provenance}>{provenanceText(meal, catalogVersion)}</Text></View>
    {(meal.warnings || []).map((warning, index) => <Text key={`meal-warning-${index}`} style={styles.warning}>{warningText(warning)}</Text>)}
  </View>;
}

function PlanResult({ result, onOpenGrocery, onViewRecipe }) {
  const plan = Array.isArray(result.plan) ? result.plan : [];
  return <View>
    <Text accessibilityRole="header" style={styles.heading}>Lịch thực đơn</Text>
    {(result.warnings || []).map((warning, index) => <Text key={`warning-${index}`} style={styles.warning}>{warningText(warning)}</Text>)}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.meals}>
      {plan.map((meal, index) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Xem công thức ${meal.name}`} key={`${meal.slot}-${index}`} style={styles.mealCard} onPress={() => onViewRecipe?.(meal)}>
        <View style={styles.mealIcon}><Text style={styles.mealGlyph}>{['◒', '◉', '◍', '◌'][index] || '◉'}</Text></View>
        <Text style={styles.mealSlot}>{meal.slot}</Text>
        <Text style={styles.mealName} numberOfLines={2}>{meal.name}</Text>
        <Text style={styles.small}>{meal.nutrients?.energyKcal ?? '—'} kcal · {moneyText(meal.estimatedCostVnd)}</Text>
        <Text style={styles.recipeLink}>Xem công thức ›</Text>
      </TouchableOpacity>)}
    </ScrollView>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>Tổng dinh dưỡng mỗi ngày</Text>
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
  const [selectedMeal, setSelectedMeal] = useState(null);

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

  if (selectedMeal) return <RecipeView meal={selectedMeal} onBack={() => setSelectedMeal(null)} />;

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.title}>Lịch ăn hằng ngày</Text>
    <Text style={styles.disclaimer}>Gợi ý prototype từ dữ liệu demo có ghi nguồn; không thay thế chế độ ăn do bác sĩ chỉ định.</Text>
    <TouchableOpacity accessibilityRole="button" style={styles.savedListButton} onPress={() => onOpenGrocery?.()}>
      <Text style={styles.savedListText}>Mở danh sách đi chợ đã lưu</Text>
    </TouchableOpacity>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>Tùy chỉnh thực đơn</Text>
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
        <TouchableOpacity accessibilityRole="button" onPress={onOpenProfile} style={{ minWidth: 48, minHeight: 54, justifyContent: "center", alignItems: "center" }}><Text style={styles.editLink}>Chỉnh sửa hồ sơ ›</Text></TouchableOpacity>
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
    {result?.status === 'feasible' && result.planFeasible && <PlanResult result={result} onOpenGrocery={onOpenGrocery} onViewRecipe={setSelectedMeal} />}
  </ScrollView>;
}

function RecipeView({ meal, onBack }) {
  const portions = Array.isArray(meal.portions) ? meal.portions : [];
  return <ScrollView style={styles.screen} contentContainerStyle={styles.recipeContent}>
    <View style={styles.recipeHeader}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại lịch ăn" style={styles.recipeBack} onPress={onBack}><Text style={styles.recipeBackText}>‹</Text></TouchableOpacity><Text accessibilityRole="header" style={styles.recipeHeaderTitle}>FOOD</Text><View style={styles.recipeBack} /></View>
    <View style={styles.recipeHero}><Text style={styles.recipeHeroGlyph}>🍽</Text></View>
    <Text style={styles.recipeSlot}>{meal.slot} · {meal.nutrients?.energyKcal ?? '—'} kcal</Text>
    <Text accessibilityRole="header" style={styles.recipeTitle}>{meal.name}</Text>
    <View style={styles.recipeFacts}><Text style={styles.recipeFact}>Ước tính dinh dưỡng</Text><Text style={styles.recipeFact}>{portions.length} thành phần</Text></View>
    <Text style={styles.recipeSectionTitle}>Nguyên liệu</Text>
    <View style={styles.recipeIngredients}>{portions.length ? portions.map((portion, index) => <View key={`${portion.foodId}-${index}`} style={styles.recipeIngredient}><View style={styles.ingredientIcon}><Text style={styles.ingredientGlyph}>{['◉', '◌', '⌁'][index % 3]}</Text></View><Text style={styles.ingredientName}>{portion.food}</Text><Text style={styles.ingredientAmount}>{portion.grams} g</Text></View>) : <Text style={styles.helper}>Chưa có thành phần trong dữ liệu bữa ăn.</Text>}</View>
    <Text style={styles.recipeSectionTitle}>Thông tin món ăn</Text>
    <View style={styles.recipeDescription}><Text style={styles.recipeDescriptionText}>{meal.explanation || 'Chưa có mô tả cho món ăn này.'}</Text><Text style={styles.recipeDisclaimer}>Hướng dẫn chế biến chi tiết chưa có trong dữ liệu thực đơn. Gợi ý chỉ mang tính tham khảo, không phải chỉ định dinh dưỡng.</Text></View>
    <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={onBack}><Text style={styles.secondaryText}>Quay lại thực đơn</Text></TouchableOpacity>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, paddingBottom: 124 },
  title: { color: colors.primary, fontWeight: '800', fontSize: 26, marginBottom: 5 },
  nutrientGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 7, marginTop: 10 },
  nutrientCell: { width: '48%', color: colors.text, fontSize: 14, backgroundColor: '#F5F7FB', padding: 9, borderRadius: 9, lineHeight: 17 },
  profileSummary: { backgroundColor: '#F5F7FB', padding: 12, borderRadius: 11, marginTop: 6 },
  profileValue: { color: colors.primaryDark, fontSize: 14, fontWeight: '800' },
  profileHint: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  editLink: { color: colors.primary, fontSize: 13, fontWeight: '800', marginTop: 8 },
  disclaimer: { color: colors.warning, fontSize: 14, lineHeight: 17, backgroundColor: '#FFF7E6', padding: 11, borderRadius: radius.sm, marginVertical: 9 },
  savedListButton: { minHeight: 54, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, marginBottom: 8 },
  savedListText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  card: { padding: 15, borderRadius: radius.md, backgroundColor: colors.surface, marginVertical: 7, borderWidth: 1, borderColor: colors.border },
  heading: { fontSize: 17, color: colors.text, fontWeight: '800', marginBottom: 5 },
  label: { fontSize: 13, color: colors.text, fontWeight: '700', marginTop: 13 },
  input: { minHeight: 54, backgroundColor: '#F5F7FB', borderWidth: 1, borderColor: colors.border, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, marginTop: 6, color: colors.text, fontSize: 14 },
  helper: { color: colors.muted, fontSize: 14, lineHeight: 17, marginTop: 6 },
  button: { minHeight: 54, borderRadius: radius.pill, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  buttonText: { color: 'white', fontWeight: '800' },
  error: { color: colors.danger, marginTop: 10 },
  retryButton: { minHeight: 54, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 10, marginTop: 10 },
  retryText: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  warning: { color: colors.warning, backgroundColor: '#FFF7E6', padding: 11, borderRadius: 9, marginTop: 7, fontSize: 13, lineHeight: 18 },
  meals: { gap: 12, paddingVertical: 12 },
  mealCard: { width: 176, minHeight: 205, alignItems: 'center', backgroundColor: colors.surface, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  mealIcon: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  mealGlyph: { color: colors.primary, fontSize: 31 },
  mealSlot: { fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 8, fontSize: 14 },
  mealName: { color: colors.text, fontSize: 13, textAlign: 'center', marginTop: 4, minHeight: 30 },
  recipeLink: { color: colors.primary, fontSize: 14, fontWeight: '800', marginTop: 8 },
  small: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 5 },
  explanation: { color: colors.primaryDark, fontSize: 14, lineHeight: 20, marginTop: 12 },
  provenance: { color: colors.muted, fontSize: 13, lineHeight: 16, marginTop: 5 },
  sourceBox: { marginTop: 10, padding: 10, backgroundColor: '#F5F7FB', borderRadius: 9 },
  sourceHeading: { color: colors.text, fontWeight: '800', fontSize: 14 },
  secondary: { minHeight: 54, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  secondaryText: { color: 'white', fontWeight: '800' },
  footnote: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 14 },
  emptyState: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.warning, borderRadius: radius.md, padding: 16, marginVertical: 8 },
  emptyHeading: { fontSize: 18, color: colors.text, fontWeight: '800' },
  emptyText: { fontSize: 15, color: colors.text, lineHeight: 22, marginTop: 8 },
  recipeContent: { paddingHorizontal: 16, paddingBottom: 124 }, recipeHeader: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, recipeBack: { width: 54, minHeight: 54, justifyContent: 'center' }, recipeBackText: { color: colors.primary, fontSize: 36 }, recipeHeaderTitle: { color: colors.primary, fontSize: 20, fontWeight: '800' }, recipeHero: { width: 190, height: 190, borderRadius: 95, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF0FF', marginTop: 6, marginBottom: 16 }, recipeHeroGlyph: { fontSize: 84 }, recipeSlot: { color: colors.muted, textAlign: 'center', fontSize: 14, marginTop: 3 }, recipeTitle: { color: colors.text, textAlign: 'center', fontSize: 23, fontWeight: '900', marginTop: 7 }, recipeFacts: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 13 }, recipeFact: { color: colors.primary, fontSize: 14, fontWeight: '700' }, recipeSectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 22, marginBottom: 9 }, recipeIngredients: { gap: 8 }, recipeIngredient: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, backgroundColor: 'white', borderRadius: 13, borderWidth: 1, borderColor: colors.border }, ingredientIcon: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.softBlue }, ingredientGlyph: { color: colors.primary, fontSize: 20 }, ingredientName: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' }, ingredientAmount: { color: colors.primary, fontSize: 14, fontWeight: '800' }, recipeDescription: { backgroundColor: '#F5F7FB', borderRadius: 13, padding: 14 }, recipeDescriptionText: { color: colors.text, fontSize: 14, lineHeight: 21 }, recipeDisclaimer: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 10 }
});
