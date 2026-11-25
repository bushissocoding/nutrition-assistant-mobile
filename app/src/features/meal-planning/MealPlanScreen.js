import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import CroppedReferenceImage from '../../shared/components/CroppedReferenceImage';
import { NUTRIENTS } from '../profile/profile-model.cjs';
import { colors, radius } from '../../theme/tokens';

const MEAL_SCHEDULE_REFERENCE = require('../../../../assets/design/ui-reference/UI/14. Thực đơn/14.1.png');
const RECIPE_REFERENCE = require('../../../../assets/design/ui-reference/UI/14. Thực đơn/14.2.png');

const SAMPLE_PLAN = {
  status: 'feasible',
  planFeasible: true,
  plan: [
    {
      id: 'reference-breakfast', slot: 'Bữa sáng', name: 'Trứng và bánh mì',
      preparationTimeMinutes: 15,
      instructions: ['Ví dụ minh họa món trứng dùng cùng bánh mì.'],
      portions: [
        { foodId: 'sample-egg', food: 'Trứng gà', grams: 50 },
        { foodId: 'sample-bread', food: 'Bánh mì', grams: 38 },
        { foodId: 'sample-tomato', food: 'Cà chua', grams: 90 },
      ],
      nutrients: { energyKcal: 458 },
      explanation: 'Bữa ăn mẫu lấy từ ảnh tham khảo giao diện.',
    },
    {
      id: 'reference-lunch', slot: 'Bữa trưa', name: 'Tô salad',
      preparationTimeMinutes: 20,
      portions: [],
      nutrients: { energyKcal: 600 },
      explanation: 'Bữa ăn mẫu lấy từ ảnh tham khảo giao diện.',
    },
  ],
  dailyTotals: { energyKcal: 1058, proteinG: 43, carbohydrateG: 136, fatG: 23 },
  metadata: {},
};

function isDisplayablePlan(plan) {
  return plan?.status === 'feasible' && plan.planFeasible === true && Array.isArray(plan.plan) && plan.plan.length > 0;
}

function warningText(warning) {
  return typeof warning === 'string' ? warning : warning?.message || '';
}

function createPlanIntentKey() {
  return `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
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

function mealIllustration(meal) {
  const identity = `${meal?.name || ''} ${meal?.slot || ''}`.toLocaleLowerCase('vi-VN');
  if (/salad|rau|gỏi/.test(identity)) return '🥗';
  if (/trứng|egg|sáng|breakfast/.test(identity)) return '🍳';
  if (/cơm|rice|trưa|lunch/.test(identity)) return '🍚';
  if (/cá|fish|hải sản/.test(identity)) return '🐟';
  return '🍽️';
}

function schedulePhoto(meal) {
  const identity = `${meal?.name || ''} ${meal?.slot || ''}`.toLocaleLowerCase('vi-VN');
  if (/trứng.*bánh mì|bánh mì.*trứng|egg.*toast/.test(identity)) return { source: MEAL_SCHEDULE_REFERENCE, crop: { x: 47, y: 155, width: 120 } };
  if (/salad/.test(identity)) return { source: MEAL_SCHEDULE_REFERENCE, crop: { x: 258, y: 155, width: 102 } };
  return null;
}

function recipePhoto(meal) {
  const identity = `${meal?.name || ''} ${meal?.slot || ''}`.toLocaleLowerCase('vi-VN');
  if (/trứng.*bánh mì|bánh mì.*trứng|egg.*toast/.test(identity)) return { source: RECIPE_REFERENCE, crop: { x: 86, y: 114, width: 180 } };
  return null;
}

function ingredientIllustration(portion) {
  const name = `${portion?.food || ''}`.toLocaleLowerCase('vi-VN');
  if (/trứng|egg/.test(name)) return '🥚';
  if (/bánh mì|bread|wheat/.test(name)) return '🍞';
  if (/cà chua|tomato/.test(name)) return '🍅';
  if (/cơm|gạo|rice/.test(name)) return '🍚';
  if (/cá|fish/.test(name)) return '🐟';
  return '🥣';
}

function NutrientBar({ nutrient, value, maxValue, label }) {
  const percentage = Number.isFinite(value) && maxValue > 0 ? Math.min(100, Math.round((value / maxValue) * 100)) : 0;
  return <View style={styles.trackerRow}>
    <Text style={styles.trackerLabel}>{label || nutrient.label}</Text>
    <View accessibilityRole="progressbar" accessibilityLabel={`${label || nutrient.label}, ước tính minh họa`} accessibilityValue={{ min: 0, max: 100, now: percentage }} style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${percentage}%` }]} />
    </View>
  </View>;
}

const preferenceLabels = { vegetarian: 'ăn chay', low_sugar: 'ít đường', low_salt: 'ít muối', mild: 'không cay', Vietnamese: 'món Việt', easy_cook: 'dễ nấu' };
const varietyLabels = { simple: 'đơn giản', balanced: 'cân bằng', varied: 'đa dạng' };

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

function PlanResult({ result, onOpenGrocery, onViewRecipe, isSample = false }) {
  const plan = Array.isArray(result.plan) ? result.plan : [];
  const macroNutrients = NUTRIENTS.filter(nutrient => ['proteinG', 'carbohydrateG', 'fatG'].includes(nutrient.key));
  const macroDisplayTargets = { proteinG: 60, carbohydrateG: 220, fatG: 60 };
  const macroLabels = { proteinG: 'Proteins', carbohydrateG: 'Carbohydrates', fatG: 'Fats' };
  return <View>
    <Text accessibilityRole="header" style={styles.scheduleHeading}>Meal schedule</Text>
    {!isSample && <>
      <Text style={styles.helper}>Ưu tiên xếp hạng: {varietyLabels[result.metadata?.dietaryVariety] || 'cân bằng'}. Đây chỉ là gợi ý mềm, không bảo đảm thành phần phù hợp.</Text>
      {(result.warnings || []).map((warning, index) => <Text key={`warning-${index}`} style={styles.warning}>{warningText(warning)}</Text>)}
    </>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.meals}>
      {plan.map((meal, index) => {
        const photo = schedulePhoto(meal);
        return <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Xem công thức ${meal.name}`} key={`${meal.slot}-${index}`} style={styles.mealCard} onPress={() => onViewRecipe?.(meal, isSample)}>
          <View style={styles.mealImage}>{photo ? <CroppedReferenceImage source={photo.source} crop={photo.crop} size={120} /> : <Text style={styles.mealGlyph}>{mealIllustration(meal)}</Text>}</View>
          <Text style={styles.mealSlot}>{meal.slot}</Text>
          <Text style={styles.mealName} numberOfLines={2}>{meal.name}</Text>
          <Text style={styles.mealCalories}>Calories　{meal.nutrients?.energyKcal ?? '—'} kcal</Text>
          {(meal.preparationTimeMinutes || meal.cookTimeMinutes) && <Text style={styles.mealTime}>Time　{meal.preparationTimeMinutes || meal.cookTimeMinutes} mins</Text>}
        </TouchableOpacity>;
      })}
    </ScrollView>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.carouselTrack}><View style={styles.carouselThumb} /></View>
    <View style={styles.trackerCard}>
      <Text accessibilityRole="header" style={styles.trackerTitle}>Calories Tracker</Text>
      <Text style={styles.trackerSubtitle}>Total Calories</Text>
      <View accessibilityRole="progressbar" accessibilityLabel="Total Calories, ước tính minh họa" accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.round(((result.dailyTotals?.energyKcal || 0) / 1400) * 100)) }} style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.min(100, Math.round(((result.dailyTotals?.energyKcal || 0) / 1400) * 100))}%` }]} />
      </View>
      <View style={styles.trackerDivider} />
      <Text accessibilityRole="header" style={styles.trackerTitle}>Macronutrient tracking</Text>
      {macroNutrients.map(nutrient => <NutrientBar key={nutrient.key} nutrient={nutrient} label={macroLabels[nutrient.key]} value={result.dailyTotals?.[nutrient.key]} maxValue={macroDisplayTargets[nutrient.key]} />)}
    </View>
    {isSample
      ? <Text style={styles.sampleNotice}>Mẫu minh họa từ ảnh tham khảo. Số liệu không phải kế hoạch cá nhân hay tư vấn dinh dưỡng.</Text>
      : <>
        <Text style={styles.trackerNote}>Các thanh dùng mốc hiển thị tham khảo, không phải mục tiêu dinh dưỡng cá nhân.</Text>
        {plan.map((meal, index) => <MealDetails key={`detail-${meal.slot}-${index}`} meal={meal} catalogVersion={result.metadata?.catalogVersion} />)}
        <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={() => onOpenGrocery?.(result.savedPlan?.id || null)}>
          <Text style={styles.secondaryText}>Tạo danh sách đi chợ</Text>
        </TouchableOpacity>
        {(result.limitations || []).map((limitation, index) => <Text key={`limitation-${index}`} style={styles.footnote}>{limitation}</Text>)}
      </>}
  </View>;
}

export default function MealPlanScreen({ profile, onOpenProfile, onOpenGrocery, onPlanGenerated, initialPlan, onBack }) {
  const [preferences, setPreferences] = useState('');
  const [personalization, setPersonalization] = useState(null);
  const [personalizationLoading, setPersonalizationLoading] = useState(true);
  const [personalizationError, setPersonalizationError] = useState('');
  const [result, setResult] = useState(() => isDisplayablePlan(initialPlan) ? initialPlan : null);
  const [restoreError, setRestoreError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryable, setRetryable] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [foodQuery, setFoodQuery] = useState('');
  const [foodResults, setFoodResults] = useState([]);
  const [selectedFoods, setSelectedFoods] = useState([]);
  const [foodSearchLoading, setFoodSearchLoading] = useState(false);
  const [foodSearchError, setFoodSearchError] = useState('');
  const [nutritionResult, setNutritionResult] = useState(null);
  const [nutritionLoading, setNutritionLoading] = useState(false);
  const [nutritionError, setNutritionError] = useState('');
  const [savedPlans, setSavedPlans] = useState([]);
  const [savedPlansVisible, setSavedPlansVisible] = useState(false);
  const [savedPlansLoading, setSavedPlansLoading] = useState(false);
  const [savedPlansError, setSavedPlansError] = useState('');
  const searchRequest = useRef(0);
  const planIntent = useRef(null);

  async function loadPersonalization() {
    setPersonalizationLoading(true); setPersonalizationError('');
    try {
      const result = await api.getMyPersonalization();
      if (!result?.preferences || !Array.isArray(result.preferences.foodPreferences)) throw new Error('API chưa trả về lựa chọn cá nhân hóa hợp lệ.');
      setPersonalization(result.preferences);
    } catch (requestError) { setPersonalization(null); setPersonalizationError(requestError?.message || 'Không tải được lựa chọn cá nhân hóa.'); }
    finally { setPersonalizationLoading(false); }
  }

  useEffect(() => { loadPersonalization(); }, []);

  useEffect(() => {
    if (isDisplayablePlan(initialPlan)) {
      setResult(initialPlan);
      setRestoreError('');
      return undefined;
    }
    let active = true;
    Promise.resolve().then(() => api.getMyMealPlans({ limit: 20, offset: 0 })).then(data => {
      if (!active) return;
      const saved = (Array.isArray(data?.items) ? data.items : []).find(item => isDisplayablePlan(item?.plan));
      if (saved) {
        setResult({ ...saved.plan, savedPlan: { id: saved.id, createdAt: saved.createdAt, catalogVersion: saved.catalogVersion, profileUpdatedAt: saved.profileUpdatedAt } });
      }
    }).catch(requestError => {
      if (active) setRestoreError(requestError?.message || 'Không tải được thực đơn đã lưu.');
    });
    return () => { active = false; };
  }, [initialPlan]);

  useEffect(() => {
    const query = foodQuery.trim();
    const requestId = ++searchRequest.current;
    if (query.length < 2) {
      setFoodResults([]); setFoodSearchError(''); setFoodSearchLoading(false);
      return undefined;
    }
    setFoodResults([]); setFoodSearchLoading(false); setFoodSearchError('');
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setFoodSearchLoading(true); setFoodSearchError('');
      try {
        const data = await api.searchSourcedFoods(query, { signal: controller.signal });
        if (searchRequest.current === requestId) setFoodResults(Array.isArray(data?.items) ? data.items : []);
      } catch (requestError) {
        if (requestError?.code !== 'API_REQUEST_ABORTED' && searchRequest.current === requestId) {
          setFoodResults([]); setFoodSearchError(requestError?.message || 'Không tìm được thực phẩm từ nguồn USDA.');
        }
      } finally {
        if (searchRequest.current === requestId) setFoodSearchLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer); controller.abort();
      if (searchRequest.current === requestId) searchRequest.current += 1;
    };
  }, [foodQuery]);

  function addSourcedFood(food) {
    setSelectedFoods(current => current.some(item => item.food.id === food.id)
      ? current
      : [...current, { food, grams: '100' }]);
    setNutritionResult(null); setNutritionError('');
  }

  function updateSourcedFood(foodId, updates) {
    setSelectedFoods(current => current.map(item => item.food.id === foodId ? { ...item, ...updates } : item));
    setNutritionResult(null);
  }

  async function calculateSourcedSelection() {
    const items = selectedFoods.map(item => ({ foodId: item.food.id, grams: Number(item.grams) }));
    if (!items.length || items.some(item => !Number.isFinite(item.grams) || item.grams <= 0 || item.grams > 5000)) {
      setNutritionError('Nhập khối lượng mỗi thực phẩm từ trên 0 đến 5.000 g.'); return;
    }
    setNutritionLoading(true); setNutritionError(''); setNutritionResult(null);
    try { setNutritionResult(await api.calculateSourcedNutrition(items)); }
    catch (requestError) { setNutritionError(requestError?.message || 'Không thể tính dinh dưỡng từ nguồn dữ liệu.'); }
    finally { setNutritionLoading(false); }
  }

  async function generatePlan() {
    if (profile?.mode === 'healthy' && profile.redFlags?.length) {
      setResult(null); setRetryable(false); setError('Có dấu hiệu cần được nhân viên y tế đánh giá. Ứng dụng không tạo thực đơn trong trường hợp này.');
      return;
    }
    if (profile?.mode === 'patient' && (!profile.medicalLimitsConfirmed || Object.keys(profile.hardLimits || {}).length === 0)) {
      setResult(null); setRetryable(false); setError('Hồ sơ cần có ít nhất một giới hạn dinh dưỡng đã đối chiếu với bác sĩ. Hãy cập nhật hồ sơ trước.');
      return;
    }
    const request = {
      contractVersion: 1,
      dietaryVariety: personalization?.dietaryVariety || 'balanced',
      preferences: [preferences.trim(), ...(personalization?.foodPreferences || []).map(value => preferenceLabels[value]).filter(Boolean)].filter(Boolean).join('; ').slice(0, 200),
    };
    const signature = `${JSON.stringify(request)}:${profile?.updatedAt || ''}`;
    if (planIntent.current?.signature !== signature) planIntent.current = { signature, key: createPlanIntentKey() };
    setLoading(true); setError(''); setRetryable(false); setResult(null);
    try {
      const data = await api.createMyMealPlan(request, planIntent.current.key);
      setResult(data);
      if (data?.status === 'feasible' && data.planFeasible && data.savedPlan?.id && Array.isArray(data.plan) && data.plan.length > 0) {
        onPlanGenerated?.(data);
        setSavedPlans(current => [data.savedPlan ? { ...data.savedPlan, plan: data } : null, ...current.filter(item => item?.id !== data.savedPlan.id)].filter(Boolean));
      }
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

  async function loadSavedPlans() {
    setSavedPlansLoading(true); setSavedPlansError(''); setSavedPlansVisible(true);
    try {
      const data = await api.getMyMealPlans({ limit: 20, offset: 0 });
      setSavedPlans(Array.isArray(data?.items) ? data.items : []);
    } catch (requestError) { setSavedPlansError(requestError?.message || 'Không tải được kế hoạch đã lưu.'); }
    finally { setSavedPlansLoading(false); }
  }

  function showSavedPlan(saved) {
    if (!saved?.plan) return;
    setResult({ ...saved.plan, savedPlan: { id: saved.id, createdAt: saved.createdAt, catalogVersion: saved.catalogVersion, profileUpdatedAt: saved.profileUpdatedAt } });
    setSavedPlansVisible(false);
  }

  if (selectedMeal) return <RecipeView meal={selectedMeal} isSample={selectedMeal.isSamplePreview} onBack={() => setSelectedMeal(null)} />;

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.screenHeader}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại trang chủ" style={styles.screenBack} onPress={onBack}>
        <Text style={styles.screenBackText}>‹</Text>
      </TouchableOpacity>
      <Text accessibilityRole="header" style={styles.title}>Lịch Ăn Hằng Ngày</Text>
      <View style={styles.screenBack} />
    </View>
    {restoreError ? <Text accessibilityRole="alert" style={styles.restoreError}>Không tải được thực đơn đã lưu: {restoreError}. Đang hiển thị mẫu minh họa.</Text> : null}
    {isDisplayablePlan(result)
      ? <PlanResult result={result} onOpenGrocery={onOpenGrocery} onViewRecipe={(meal, isSample) => setSelectedMeal(isSample ? { ...meal, isSamplePreview: true } : meal)} />
      : !result && <PlanResult result={SAMPLE_PLAN} isSample onViewRecipe={(meal) => setSelectedMeal({ ...meal, isSamplePreview: true })} />}
    <Text style={styles.disclaimer}>Dữ liệu dinh dưỡng từ kế hoạch tạo bằng API được lấy từ nguồn đã ghi nhận khi cấu hình. Mọi giá trị chỉ mang tính tham khảo, không phải chỉ định điều trị.</Text>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>Tra cứu USDA FoodData Central</Text>
      <Text style={styles.helper}>Tìm bản ghi nguồn và tính lại theo khối lượng. USDA không xác nhận nhiễm chéo hoặc khả năng phù hợp cho điều trị.</Text>
      <TextInput accessibilityLabel="Tìm thực phẩm USDA" value={foodQuery} onChangeText={setFoodQuery} placeholder="Nhập tên thực phẩm (ít nhất 2 ký tự)" style={styles.input} maxLength={100} />
      {foodSearchLoading && <View style={styles.loadingRow}><ActivityIndicator accessibilityLabel="Đang tìm thực phẩm" /><Text style={styles.helper}>Đang tìm trong nguồn USDA…</Text></View>}
      {!!foodSearchError && <Text accessibilityRole="alert" style={styles.error}>{foodSearchError}</Text>}
      {!foodSearchLoading && !foodSearchError && foodQuery.trim().length >= 2 && !foodResults.length && <Text style={styles.helper}>Không có kết quả phù hợp từ USDA FoodData Central.</Text>}
      {foodResults.map(food => <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Thêm ${food.name}`} key={food.id} style={styles.searchResult} onPress={() => addSourcedFood(food)}>
        <Text style={styles.heading}>{food.name}</Text>
        <Text style={styles.provenance}>{food.dataType} · USDA FDC #{food.source?.recordId} · {food.source?.edition}</Text>
      </TouchableOpacity>)}
      <Text style={styles.label}>Thực phẩm đã chọn</Text>
      {!selectedFoods.length && <Text style={styles.helper}>Chọn một kết quả để bắt đầu tính dinh dưỡng theo khẩu phần.</Text>}
      {selectedFoods.map(({ food, grams }) => <View key={food.id} style={styles.selectedFood}>
        <View style={styles.selectedFoodCopy}><Text style={styles.profileValue}>{food.name}</Text><Text style={styles.provenance}>USDA FDC #{food.source?.recordId} · {food.dataType}</Text></View>
        <TextInput accessibilityLabel={`Khối lượng ${food.name} (g)`} value={grams} onChangeText={value => updateSourcedFood(food.id, { grams: value })} keyboardType="decimal-pad" maxLength={7} style={styles.gramsInput} />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Bỏ ${food.name}`} onPress={() => { setSelectedFoods(current => current.filter(item => item.food.id !== food.id)); setNutritionResult(null); }}><Text style={styles.editLink}>Bỏ</Text></TouchableOpacity>
      </View>)}
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: nutritionLoading || !selectedFoods.length }} disabled={nutritionLoading || !selectedFoods.length} style={styles.secondary} onPress={calculateSourcedSelection}>
        {nutritionLoading ? <ActivityIndicator color="white" /> : <Text style={styles.secondaryText}>Tính dinh dưỡng theo USDA</Text>}
      </TouchableOpacity>
      {!!nutritionError && <Text accessibilityRole="alert" style={styles.error}>{nutritionError}</Text>}
      {nutritionResult && <View accessibilityLiveRegion="polite" style={styles.sourceBox}>
        <Text accessibilityRole="header" style={styles.sourceHeading}>Kết quả theo khẩu phần</Text>
        {NUTRIENTS.map(nutrient => <Text key={nutrient.key} style={styles.small}>{nutrient.label}: {nutritionResult.totals?.[nutrient.key] ?? 'Chưa có dữ liệu'} {nutrient.unit}</Text>)}
        <Text style={styles.provenance}>Nguồn: {nutritionResult.sources?.map(source => `${source.label} #${source.recordId} (${source.edition})`).join('; ') || 'không rõ'} · {nutritionResult.items?.[0]?.catalogVersion}</Text>
        <Text style={styles.footnote}>{nutritionResult.disclaimer}</Text>
      </View>}
    </View>
    <TouchableOpacity accessibilityRole="button" style={styles.savedListButton} onPress={loadSavedPlans}>
      <Text style={styles.savedListText}>Xem kế hoạch đã lưu</Text>
    </TouchableOpacity>
    {savedPlansVisible && <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>Kế hoạch tài khoản</Text>
      {savedPlansLoading && <ActivityIndicator accessibilityLabel="Đang tải kế hoạch" />}
      {!!savedPlansError && <Text accessibilityRole="alert" style={styles.error}>{savedPlansError}</Text>}
      {!savedPlansLoading && !savedPlansError && !savedPlans.length && <Text style={styles.helper}>Chưa có kế hoạch nào được lưu.</Text>}
      {savedPlans.map(saved => <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Xem kế hoạch ${saved.plan?.plan?.[0]?.name || 'dinh dưỡng'}`} key={saved.id} style={styles.searchResult} onPress={() => showSavedPlan(saved)}>
        <Text style={styles.profileValue}>{saved.plan?.plan?.[0]?.name || 'Kế hoạch dinh dưỡng'}</Text>
        <Text style={styles.provenance}>{saved.createdAt || ''} · {saved.catalogVersion || saved.plan?.metadata?.catalogVersion}</Text>
      </TouchableOpacity>)}
    </View>}
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>Tùy chỉnh thực đơn</Text>
      {personalizationLoading && <View style={styles.loadingRow}><ActivityIndicator accessibilityLabel="Đang tải lựa chọn cá nhân hóa" /><Text style={styles.helper}>Đang tải lựa chọn tài khoản…</Text></View>}
      {!!personalizationError && <View accessibilityRole="alert"><Text style={styles.error}>{personalizationError}</Text><TouchableOpacity accessibilityRole="button" onPress={loadPersonalization}><Text style={styles.retryText}>Tải lại lựa chọn</Text></TouchableOpacity><Text style={styles.helper}>Nếu tiếp tục, các lựa chọn đã lưu chưa tải được sẽ không được gửi; giới hạn và dị ứng của hồ sơ vẫn do API áp dụng.</Text></View>}
      {profile?.allergies?.length > 0 && personalization?.allergyReminder && <View accessibilityRole="alert" style={styles.warning}><Text style={styles.profileHint}>Nhắc dị ứng: {profile.allergies.join(', ')}. Kiểm tra nhãn, thành phần và nguy cơ nhiễm chéo; dữ liệu nguồn không xác nhận độ an toàn.</Text></View>}
      {!personalizationLoading && !personalizationError && personalization && <Text style={styles.helper}>Ưu tiên lưu: độ phong phú {varietyLabels[personalization.dietaryVariety] || 'cân bằng'}{personalization.foodPreferences.length ? ` · ${personalization.foodPreferences.map(value => preferenceLabels[value]).filter(Boolean).join(', ')}` : ''}. Các lựa chọn chỉ xếp hạng gợi ý và không phải bộ lọc an toàn.</Text>}
      <Text style={styles.label}>Món bạn yêu thích</Text>
      <TextInput accessibilityLabel="Món bạn yêu thích" value={preferences} onChangeText={setPreferences} placeholder="Ví dụ: canh bí, món hấp..." style={styles.input} maxLength={120} />
      <Text style={styles.helper}>Giá thực phẩm chưa có nguồn xác minh; kế hoạch hiện không đánh giá chi phí.</Text>
      <Text style={styles.label}>Hồ sơ tài khoản</Text>
      <View style={styles.profileSummary}>
        <Text style={styles.profileValue}>{profile?.mode === 'patient' ? 'Có chỉ tiêu được xác nhận' : 'Tham khảo cơ bản'}</Text>
        <Text style={styles.profileHint}>Dị ứng và giới hạn được API lấy trực tiếp từ hồ sơ đã lưu; app không gửi lại các ràng buộc này khi tạo kế hoạch.</Text>
        <Text style={styles.profileHint}>Dị ứng: {profile?.allergies?.length ? profile.allergies.join(', ') : 'chưa nhập'}</Text>
        {profile?.mode === 'patient' && <Text style={styles.profileHint}>Các hardLimits đã xác nhận được áp dụng bắt buộc.</Text>}
        <TouchableOpacity accessibilityRole="button" onPress={onOpenProfile} style={{ minWidth: 48, minHeight: 54, justifyContent: "center", alignItems: "center" }}><Text style={styles.editLink}>Chỉnh sửa hồ sơ ›</Text></TouchableOpacity>
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={loading ? 'Đang tạo thực đơn' : 'Tạo thực đơn'} style={[styles.button, (loading || personalizationLoading) && styles.disabledButton]} disabled={loading || personalizationLoading} accessibilityState={{ disabled: loading || personalizationLoading }} onPress={generatePlan}>
        {loading ? <View style={styles.loadingRow}><ActivityIndicator accessibilityLabel="Đang tạo thực đơn" color="white" /><Text style={styles.buttonText}>Đang tạo thực đơn</Text></View> : <Text style={styles.buttonText}>{personalizationLoading ? 'Đang tải lựa chọn…' : 'Tạo thực đơn'}</Text>}
      </TouchableOpacity>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {retryable && <TouchableOpacity accessibilityRole="button" style={styles.retryButton} disabled={loading || personalizationLoading} accessibilityState={{ disabled: loading || personalizationLoading }} onPress={generatePlan}>
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
  </ScrollView>;
}

function RecipeView({ meal, onBack, isSample = false }) {
  const portions = Array.isArray(meal.portions) ? meal.portions : [];
  const photo = recipePhoto(meal);
  return <ScrollView style={styles.screen} contentContainerStyle={styles.recipeContent}>
    <View style={styles.recipeHeader}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại lịch ăn" style={styles.recipeBack} onPress={onBack}><Text style={styles.recipeBackText}>‹</Text></TouchableOpacity><Text accessibilityRole="header" style={styles.recipeHeaderTitle}>FOOD</Text><View style={styles.recipeBack} /></View>
    <View style={styles.recipeHero}>{photo ? <CroppedReferenceImage source={photo.source} crop={photo.crop} size={180} /> : <Text style={styles.recipeHeroGlyph}>{mealIllustration(meal)}</Text>}</View>
    {!isSample && <>
      <Text style={styles.recipeSlot}>{meal.slot} · {meal.nutrients?.energyKcal ?? '—'} kcal</Text>
      <Text accessibilityRole="header" style={styles.recipeTitle}>{meal.name}</Text>
    </>}
    <View style={[styles.recipeFacts, isSample && styles.sampleRecipeFacts]}><Text style={styles.recipeFact}>◷　{meal.preparationTimeMinutes || meal.cookTimeMinutes || '—'} Phút</Text><Text style={styles.recipeFact}>ϟ　{meal.nutrients?.energyKcal ?? '—'} kcal</Text><Text style={styles.recipeFact}>♙　{isSample ? '1 người ăn' : `${portions.length} thành phần`}</Text></View>
    <Text style={styles.recipeSectionTitle}>Nguyên liệu</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recipeIngredients}>{portions.length ? portions.map((portion, index) => <View key={`${portion.foodId}-${index}`} style={styles.recipeIngredient}><View style={styles.ingredientIcon}><Text style={styles.ingredientGlyph}>{ingredientIllustration(portion)}</Text></View><Text style={styles.ingredientName}>{portion.food}</Text><Text style={styles.ingredientAmount}>{portion.grams} g</Text></View>) : <Text style={styles.helper}>Chưa có thành phần trong dữ liệu bữa ăn.</Text>}</ScrollView>
    <Text style={styles.recipeSectionTitle}>Mô tả chi tiết</Text>
    <View style={styles.recipeDescription}>
      {isSample
        ? <Text style={styles.recipeDescriptionText}>Món ăn mẫu trong ảnh tham khảo. Thành phần và định lượng chỉ dùng để minh họa giao diện.</Text>
        : Array.isArray(meal.instructions) && meal.instructions.length
          ? meal.instructions.map((step, index) => <Text key={`recipe-step-${index}`} style={styles.recipeDescriptionText}>{index + 1}. {step}</Text>)
          : <Text style={styles.recipeDescriptionText}>{meal.explanation || 'Chưa có mô tả cho món ăn này.'}</Text>}
    </View>
    {!isSample && <Text style={styles.recipeDisclaimer}>Nội dung mẫu, chưa được chuyên gia dinh dưỡng thẩm định; không phải chỉ định điều trị.</Text>}
    <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={onBack}><Text style={styles.secondaryText}>Quay lại thực đơn</Text></TouchableOpacity>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingBottom: 132 },
  screenHeader: { height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  screenBack: { width: 44, minHeight: 38, alignItems: 'flex-start', justifyContent: 'center' },
  screenBackText: { color: colors.primary, fontSize: 36, lineHeight: 40 },
  title: { color: colors.primary, fontWeight: '800', fontSize: 22, textAlign: 'center' },
  scheduleHeading: { fontSize: 16, color: '#302B2B', fontWeight: '800', marginTop: 6, marginHorizontal: 16 },
  restoreError: { color: colors.warning, fontSize: 12, lineHeight: 17, marginHorizontal: 16, marginTop: 5 },
  nutrientGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 7, marginTop: 10 },
  nutrientCell: { width: '48%', color: colors.text, fontSize: 14, backgroundColor: '#F5F7FB', padding: 9, borderRadius: 9, lineHeight: 17 },
  profileSummary: { backgroundColor: '#F5F7FB', padding: 12, borderRadius: 11, marginTop: 6 },
  profileValue: { color: colors.primaryDark, fontSize: 14, fontWeight: '800' },
  profileHint: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  editLink: { color: colors.primary, fontSize: 13, fontWeight: '800', marginTop: 8 },
  disclaimer: { color: colors.muted, fontSize: 12, lineHeight: 17, backgroundColor: '#F5F7FB', padding: 11, borderRadius: radius.sm, marginHorizontal: 16, marginVertical: 9 },
  savedListButton: { minHeight: 54, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, marginBottom: 8 },
  savedListText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  card: { padding: 15, borderRadius: radius.md, backgroundColor: colors.surface, marginVertical: 7, borderWidth: 1, borderColor: colors.border },
  heading: { fontSize: 17, color: colors.text, fontWeight: '800', marginBottom: 5 },
  label: { fontSize: 13, color: colors.text, fontWeight: '700', marginTop: 13 },
  input: { minHeight: 54, backgroundColor: '#F5F7FB', borderWidth: 1, borderColor: colors.border, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, marginTop: 6, color: colors.text, fontSize: 14 },
  helper: { color: colors.muted, fontSize: 14, lineHeight: 17, marginTop: 6 },
  button: { minHeight: 54, borderRadius: radius.pill, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  disabledButton: { opacity: 0.5 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  buttonText: { color: 'white', fontWeight: '800' },
  error: { color: colors.danger, marginTop: 10 },
  retryButton: { minHeight: 54, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 10, marginTop: 10 },
  retryText: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  warning: { color: colors.warning, backgroundColor: '#FFF7E6', padding: 11, borderRadius: 9, marginTop: 7, fontSize: 13, lineHeight: 18 },
  meals: { gap: 30, paddingHorizontal: 16, paddingTop: 51, paddingBottom: 10 },
  mealCard: { width: 180, height: 190, alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 10, paddingTop: 105, paddingBottom: 10, borderRadius: 19, borderWidth: 1, borderColor: '#F0F1F4', shadowColor: '#18243A', shadowOpacity: 0.14, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  mealImage: { position: 'absolute', zIndex: 1, top: -22, width: 120, height: 120, borderRadius: 60, backgroundColor: '#F7E8D8', alignItems: 'center', justifyContent: 'center', shadowColor: '#1D2838', shadowOpacity: 0.19, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  mealGlyph: { color: colors.primary, fontSize: 59 },
  mealSlot: { fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 6, fontSize: 14 },
  mealName: { color: colors.text, fontSize: 12, textAlign: 'center', marginTop: 2, minHeight: 17, lineHeight: 16 },
  mealCalories: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 7 },
  mealTime: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 3 },
  recipeLink: { color: colors.primary, fontSize: 13, fontWeight: '800', marginTop: 7 },
  carouselTrack: { width: 240, height: 5, borderRadius: 4, backgroundColor: '#DDE2EA', alignSelf: 'center', marginBottom: 12, overflow: 'hidden' },
  carouselThumb: { width: 92, height: 5, backgroundColor: colors.primaryDark, borderRadius: 4 },
  trackerCard: { minHeight: 374, padding: 14, borderRadius: 9, backgroundColor: colors.surface, marginTop: 4, marginHorizontal: 19, marginBottom: 8, borderWidth: 1, borderColor: '#D9DDE4', shadowColor: '#172236', shadowOpacity: 0.13, shadowRadius: 4, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  trackerTitle: { color: colors.text, fontWeight: '800', fontSize: 14 },
  trackerSubtitle: { color: colors.text, fontSize: 10, marginTop: 13 },
  trackerDivider: { height: 1, backgroundColor: '#EEF0F4', marginVertical: 13 },
  trackerNote: { color: colors.muted, fontSize: 11, lineHeight: 15, marginTop: 4, marginBottom: 7 },
  sampleNotice: { color: colors.muted, fontSize: 11, lineHeight: 16, marginHorizontal: 19, marginTop: 4 },
  trackerRow: { marginTop: 10 },
  trackerLabel: { color: colors.text, fontSize: 10 },
  progressTrack: { height: 12, backgroundColor: '#D9D9D9', borderRadius: 8, marginTop: 8, marginBottom: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 8 },
  otherNutrients: { color: colors.muted, fontSize: 12, marginTop: 12 },
  small: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 5 },
  explanation: { color: colors.primaryDark, fontSize: 14, lineHeight: 20, marginTop: 12 },
  provenance: { color: colors.muted, fontSize: 13, lineHeight: 16, marginTop: 5 },
  sourceBox: { marginTop: 10, padding: 10, backgroundColor: '#F5F7FB', borderRadius: 9 }, searchResult: { paddingVertical: 11, borderBottomWidth: 1, borderColor: colors.border }, selectedFood: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 62, borderBottomWidth: 1, borderColor: colors.border }, selectedFoodCopy: { flex: 1 }, gramsInput: { width: 70, minHeight: 46, textAlign: 'center', borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: '#F5F7FB', color: colors.text },
  sourceHeading: { color: colors.text, fontWeight: '800', fontSize: 14 },
  secondary: { minHeight: 54, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  secondaryText: { color: 'white', fontWeight: '800' },
  footnote: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 14 },
  emptyState: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.warning, borderRadius: radius.md, padding: 16, marginVertical: 8 },
  emptyHeading: { fontSize: 18, color: colors.text, fontWeight: '800' },
  emptyText: { fontSize: 15, color: colors.text, lineHeight: 22, marginTop: 8 },
  recipeContent: { paddingHorizontal: 10, paddingBottom: 132 }, recipeHeader: { height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, recipeBack: { width: 54, minHeight: 38, justifyContent: 'center' }, recipeBackText: { color: colors.primary, fontSize: 36, opacity: 0 }, recipeHeaderTitle: { color: colors.primary, fontSize: 20, fontWeight: '800' }, recipeHero: { width: 180, height: 180, borderRadius: 90, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8E9D9', marginTop: 16, marginBottom: 16, shadowColor: '#202A3B', shadowOpacity: 0.15, shadowRadius: 9, shadowOffset: { width: 0, height: 5 }, elevation: 5 }, recipeHeroGlyph: { fontSize: 82 }, recipeSlot: { color: colors.muted, textAlign: 'center', fontSize: 14, marginTop: 3 }, recipeTitle: { color: colors.text, textAlign: 'center', fontSize: 23, fontWeight: '900', marginTop: 7 }, recipeFacts: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 16, marginTop: 13 }, sampleRecipeFacts: { marginTop: 48 }, recipeFact: { color: colors.primary, fontSize: 12, fontWeight: '700' }, recipeSectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 22, marginBottom: 9 }, recipeIngredients: { flexDirection: 'row', gap: 10 }, recipeIngredient: { width: 90, minWidth: 90, flexDirection: 'column', alignItems: 'center', gap: 10 }, ingredientIcon: { width: 90, height: 90, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, shadowColor: '#172236', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 2 }, ingredientGlyph: { color: colors.primary, fontSize: 42 }, ingredientName: { color: colors.text, fontSize: 14, fontWeight: '800', textAlign: 'center', marginTop: 2 }, ingredientAmount: { color: colors.text, fontSize: 14 }, recipeDescription: { backgroundColor: 'transparent', paddingVertical: 4 }, recipeDescriptionText: { color: colors.text, fontSize: 13, lineHeight: 19 }, recipeDisclaimer: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 10 }
});
