import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import CroppedReferenceImage from '../../shared/components/CroppedReferenceImage';
import { NUTRIENTS } from '../profile/profile-model.cjs';
import { colors, radius } from '../../theme/tokens';

const FOOD_SEARCH_REFERENCE = require('../../../../assets/design/ui-reference/UI/18. Nhật kí/18.2.png');

const MEAL_TYPES = [
  { value: 'BREAKFAST', label: 'Sáng' },
  { value: 'LUNCH', label: 'Trưa' },
  { value: 'DINNER', label: 'Tối' },
  { value: 'SNACK', label: 'Phụ' },
];
const FOOD_CATEGORIES = [
  { key: 'all', label: 'Tất cả' },
  { key: 'grain', label: 'Cơm & Tinh bột' },
  { key: 'protein', label: 'Thịt & Hải sản' },
  { key: 'vegetable', label: 'Rau củ' },
];
const FOOD_CATEGORY_PATTERNS = {
  grain: /rice|grain|cereal|bread|oat|wheat|corn|cơm|gạo|bún|miến|phở|bánh|yến mạch/i,
  protein: /meat|chicken|beef|pork|fish|seafood|shrimp|poultry|egg|thịt|cá|tôm|trứng|gà|bò|heo/i,
  vegetable: /vegetable|fruit|lettuce|spinach|carrot|rau|củ|quả|trái|cải/i,
};
const EMPTY_TOTALS = { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0, sodiumMg: 0 };

function pad(value) {
  return String(value).padStart(2, '0');
}

function getDeviceDateTime() {
  const now = new Date();
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

function getDeviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function shiftDate(date, days) {
  const shifted = new Date(`${date}T12:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function localTimestamp(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const local = new Date(`${date}T${time}:00`);
  if (!Number.isFinite(local.getTime())
    || local.getFullYear() !== Number(date.slice(0, 4))
    || local.getMonth() + 1 !== Number(date.slice(5, 7))
    || local.getDate() !== Number(date.slice(8, 10))
    || local.getHours() !== Number(time.slice(0, 2))
    || local.getMinutes() !== Number(time.slice(3, 5))) return null;

  const offsetMinutes = -local.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  return `${date}T${time}:00${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`;
}

function formatMealType(value) {
  return MEAL_TYPES.find(meal => meal.value === value)?.label || 'Bữa ăn';
}

function formatEntryTime(entry) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: entry.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(entry.consumedAt));
}

function createIdempotencyKey() {
  return `diary-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function displayValue(value) {
  return Number.isFinite(value) ? value : '—';
}

function sourceEdition(food) {
  const edition = food.source?.edition;
  if (!edition || /not-recorded|unknown/i.test(edition)) return 'edition không ghi nhận';
  return `edition ${edition}`;
}

function sourceLine(food) {
  const source = food.source || {};
  const name = source.label || source.name || 'Nguồn chưa ghi';
  const recordId = source.recordId || source.sourceRecordId;
  return `Nguồn: ${name}${recordId ? ` · #${recordId}` : ''} · ${sourceEdition(food)}`;
}

function foodIllustration(food) {
  const name = `${food?.name || ''}`.toLocaleLowerCase('vi-VN');
  if (/trứng|egg/.test(name)) return '🥚';
  if (/cơm|gạo|rice|bún|phở|bread|bánh/.test(name)) return '🍚';
  if (/cá|fish|seafood/.test(name)) return '🐟';
  if (/gà|chicken|thịt|beef|pork/.test(name)) return '🍗';
  if (/rau|cải|vegetable|spinach/.test(name)) return '🥬';
  return '🥣';
}

function foodReferenceCrop(food) {
  const name = `${food?.name || ''}`.toLocaleLowerCase('vi-VN');
  if (/gạo|cơm|rice|grain/.test(name)) return { x: 16, y: 334, width: 42 };
  if (/gà|chicken|poultry/.test(name)) return { x: 16, y: 428, width: 42 };
  if (/rau|cải|canh|vegetable/.test(name)) return { x: 16, y: 520, width: 42 };
  if (/trứng|egg/.test(name)) return { x: 16, y: 612, width: 42 };
  return null;
}

function FoodThumbnail({ food, size }) {
  const crop = foodReferenceCrop(food);
  const glyphStyle = size > 48 ? styles.foodThumbLargeGlyph : styles.foodThumbGlyph;
  return crop
    ? <CroppedReferenceImage source={FOOD_SEARCH_REFERENCE} crop={crop} size={size} radius={size * 0.2} />
    : <Text style={[glyphStyle, { fontSize: size * 0.56 }]}>{foodIllustration(food)}</Text>;
}

function MacroSummary({ totals }) {
  const macros = [
    { key: 'proteinG', label: 'Protein', color: '#2E69F8' },
    { key: 'fatG', label: 'Lipid', color: '#F5A000' },
    { key: 'carbohydrateG', label: 'Glucid', color: '#11B8D7' },
  ];
  const largest = Math.max(0, ...macros.map(item => totals?.[item.key]).filter(Number.isFinite));
  return <View style={styles.macroGrid}>{macros.map(item => {
    const value = totals?.[item.key];
    const width = Number.isFinite(value) && largest > 0 ? `${Math.max(4, Math.round(value / largest * 100))}%` : '0%';
    return <View key={item.key} style={styles.macroItem}>
      <Text style={styles.macroName}>{item.label}</Text>
      <Text style={styles.macroValue}>{displayValue(value)}<Text style={styles.macroUnit}> g</Text></Text>
      <View accessibilityRole="progressbar" accessibilityLabel={`${item.label}, tỷ lệ tương đối`} style={styles.macroTrack}><View style={[styles.macroFill, { width, backgroundColor: item.color }]} /></View>
    </View>;
  })}</View>;
}

export default function DiaryScreen({ onTodayDataLoaded, onDiaryMutation }) {
  const [initialDateTime] = useState(getDeviceDateTime);
  const [selectedDate, setSelectedDate] = useState(initialDateTime.date);
  const [time, setTime] = useState(initialDateTime.time);
  const [timeZone] = useState(getDeviceTimeZone);
  const [entries, setEntries] = useState([]);
  const [totals, setTotals] = useState(EMPTY_TOTALS);
  const [hasEntries, setHasEntries] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [reloadCount, setReloadCount] = useState(0);
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState([]);
  const [catalogInfo, setCatalogInfo] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedFood, setSelectedFood] = useState(null);
  const [selectedFoods, setSelectedFoods] = useState([]);
  const [portionIndex, setPortionIndex] = useState(0);
  const [showAddFood, setShowAddFood] = useState(false);
  const [addStep, setAddStep] = useState('search');
  const [foodCategory, setFoodCategory] = useState('all');
  const [grams, setGrams] = useState('100');
  const [mealType, setMealType] = useState('LUNCH');
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [mutationLoading, setMutationLoading] = useState(false);
  const [mutationError, setMutationError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const loadSequence = useRef(0);
  const createIntent = useRef(null);
  const weekDates = Array.from({ length: 7 }, (_, index) => shiftDate(selectedDate, index - 3));

  useEffect(() => {
    const sequence = ++loadSequence.current;
    setListLoading(true);
    setListError('');
    api.getMyMealEntries({ date: selectedDate, timeZone })
      .then(result => {
        if (sequence !== loadSequence.current) return;
        const nextEntries = Array.isArray(result?.items) ? result.items : [];
        const nextTotals = result?.totals || EMPTY_TOTALS;
        setEntries(nextEntries);
        setTotals(nextTotals);
        const nextHasEntries = result?.hasEntries === true || nextEntries.length > 0;
        setHasEntries(nextHasEntries);
        onTodayDataLoaded?.(selectedDate, nextEntries, nextTotals, nextHasEntries);
      })
      .catch(error => {
        if (sequence === loadSequence.current) setListError(error?.message || 'Không tải được nhật ký. Hãy thử lại.');
      })
      .finally(() => {
        if (sequence === loadSequence.current) setListLoading(false);
      });
    return () => { loadSequence.current += 1; };
  }, [selectedDate, timeZone, reloadCount]);

  async function searchFoods() {
    setSearchLoading(true);
    setSearchError('');
    setSuccessMessage('');
    try {
      const result = await api.searchSourcedFoods(query.trim());
      setFoods(Array.isArray(result?.items) ? result.items : []);
      setCatalogInfo(result?.catalogVersion ? { version: result.catalogVersion, status: 'live', notice: 'Kết quả được lấy trực tiếp từ USDA FoodData Central.', limitations: [] } : null);
    } catch (error) {
      setSearchError(error?.message || 'Không tìm được thực phẩm. Hãy kiểm tra kết nối rồi thử lại.');
    } finally {
      setSearchLoading(false);
    }
  }

  function openAddFood() {
    setShowAddFood(true);
    setAddStep('search');
    setFoodCategory('all');
    setSelectedFood(null);
    setSelectedFoods([]);
    setPortionIndex(0);
    setGrams('100');
    setMealType('LUNCH');
    setNotes('');
    setMutationError('');
    setSuccessMessage('');
  }

  function resetForm() {
    setSelectedFood(null);
    setSelectedFoods([]);
    setPortionIndex(0);
    setGrams('100');
    setMealType('LUNCH');
    setNotes('');
    setEditingId(null);
    setShowAddFood(false);
    setAddStep('search');
  }

  function startEditing(entry) {
    const localParts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(entry.consumedAt)).map(part => [part.type, part.value]));
    const entryDate = `${localParts.year}-${localParts.month}-${localParts.day}`;
    if (entryDate !== selectedDate) {
      setEntries([]);
      setTotals(EMPTY_TOTALS);
    }
    setSelectedDate(entryDate);
    setTime(`${localParts.hour}:${localParts.minute}`);
    setSelectedFood({ id: entry.foodId, name: entry.foodName, source: entry.source, nutrition: entry.foodSnapshot?.nutrition, basis: entry.foodSnapshot?.basis });
    setSelectedFoods([]);
    setPortionIndex(0);
    setGrams(String(entry.portion.amount));
    setMealType(entry.mealType);
    setNotes(entry.notes || '');
    setEditingId(entry.id);
    setShowAddFood(true);
    setAddStep('portion');
    setMutationError('');
    setSuccessMessage('');
  }

  async function saveEntry() {
    const amount = Number(grams);
    const consumedAt = localTimestamp(selectedDate, time);
    if (!selectedFood || !Number.isFinite(amount) || amount <= 0 || amount > 5000 || !consumedAt) {
      setMutationError(!consumedAt
        ? 'Ngày hoặc giờ không hợp lệ trong múi giờ thiết bị.'
        : 'Chọn thực phẩm và nhập khẩu phần từ lớn hơn 0 đến 5000 g.');
      setSuccessMessage('');
      return;
    }

    const payload = {
      foodId: selectedFood.id,
      portion: { amount, unit: 'g' },
      mealType,
      consumedAt,
      timeZone,
      notes: notes.trim() || null,
    };
    setMutationLoading(true);
    setMutationError('');
    setSuccessMessage('');
    try {
      if (editingId) {
        await api.updateMyMealEntry(editingId, payload);
      } else {
        const signature = JSON.stringify(payload);
        if (createIntent.current?.signature !== signature) {
          createIntent.current = { signature, key: createIdempotencyKey() };
        }
        await api.createMyMealEntry(payload, createIntent.current.key);
        createIntent.current = null;
      }
      onDiaryMutation?.();
      const nextFoods = editingId ? [] : selectedFoods.filter(food => food.id !== selectedFood.id);
      if (nextFoods.length) {
        const nextFood = nextFoods[0];
        setSelectedFoods(nextFoods);
        setSelectedFood(nextFood);
        setGrams(String(nextFood.grams || (nextFood.basis?.unit === 'g' ? nextFood.basis.amount : 100)));
        setNotes('');
        setPortionIndex(value => value + 1);
        setSuccessMessage('Đã lưu món. Tiếp tục định lượng món còn lại.');
      } else {
        setSuccessMessage(editingId ? 'Đã cập nhật nhật ký.' : 'Đã lưu nhật ký.');
        resetForm();
      }
      setReloadCount(value => value + 1);
    } catch (error) {
      setMutationError(error?.message || 'Chưa lưu được dữ liệu lên máy chủ. Hãy thử lại.');
    } finally {
      setMutationLoading(false);
    }
  }

  function deleteEntry(entry) {
    Alert.alert('Xóa bản ghi?', `Xóa món ${entry.foodName} khỏi nhật ký?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: async () => {
        setMutationLoading(true);
        setMutationError('');
        setSuccessMessage('');
        try {
          await api.deleteMyMealEntry(entry.id);
          onDiaryMutation?.();
          setSuccessMessage('Đã xóa bản ghi.');
          setReloadCount(value => value + 1);
        } catch (error) {
          setMutationError(error?.message || 'Chưa xóa được bản ghi trên máy chủ. Hãy thử lại.');
        } finally {
          setMutationLoading(false);
        }
      } },
    ]);
  }

  function changeDate(days) {
    setSelectedDate(date => shiftDate(date, days));
    clearDateFeedback();
  }

  function selectDate(date) {
    setSelectedDate(date);
    clearDateFeedback();
  }

  function clearDateFeedback() {
    setEntries([]);
    setTotals(EMPTY_TOTALS);
    setHasEntries(false);
    setSuccessMessage('');
    setMutationError('');
  }

  function adjustPortion(amount) {
    setGrams(String(Math.max(1, Math.min(5000, amount))));
    setMutationError('');
  }

  const filteredFoods = foodCategory === 'all'
    ? foods
    : foods.filter(food => FOOD_CATEGORY_PATTERNS[foodCategory]?.test(food.name || ''));

  const mealGroups = MEAL_TYPES.map(meal => ({ meal, items: entries.filter(entry => entry.mealType === meal.value) })).filter(group => group.items.length > 0);

  if (showAddFood) {
    const back = () => {
      if (addStep === 'portion' && !editingId) setAddStep('search');
      else resetForm();
    };
    const sourceAmount = selectedFood?.basis?.unit === 'g' && Number.isFinite(selectedFood.basis.amount) ? selectedFood.basis.amount : 100;
    const nutrientCards = NUTRIENTS.filter(nutrient => ['energyKcal', 'proteinG', 'carbohydrateG', 'fatG'].includes(nutrient.key));
    return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.addHeader}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={addStep === 'portion' ? 'Quay lại kết quả tìm kiếm' : 'Quay lại nhật ký'} onPress={back} style={styles.backButton}><Text style={styles.backArrow}>‹</Text></TouchableOpacity>
        <Text accessibilityRole="header" style={styles.addTitle}>{addStep === 'portion' ? 'Chi tiết món ăn' : 'Ghi nhận bữa ăn'}</Text>
        <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>?</Text></View>
      </View>
      <View style={styles.mealContext}>
        <View style={styles.contextIcon}><Text style={styles.contextGlyph}>♜</Text></View>
        <View style={styles.contextCopy}><Text style={styles.contextTitle}>Bữa {formatMealType(mealType)} <Text style={styles.contextTime}>• {time}</Text></Text><Text style={styles.contextDate}>{selectedDate} · {timeZone}</Text></View>
      </View>

      {addStep === 'search' && <>
        <View style={styles.searchRow}>
          <TextInput accessibilityLabel="Tên thực phẩm" value={query} onChangeText={setQuery} placeholder="Tìm món ăn, cơm, thịt, canh…" style={[styles.searchInput, { flex: 1 }]} onSubmitEditing={searchFoods} returnKeyType="search" />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Tìm thực phẩm" style={styles.searchIconButton} onPress={searchFoods} disabled={searchLoading}><Text style={styles.searchIconText}>⌕</Text></TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {FOOD_CATEGORIES.map(category => <TouchableOpacity key={category.key} accessibilityRole="button" accessibilityState={{ selected: foodCategory === category.key }} onPress={() => setFoodCategory(category.key)} style={[styles.categoryChip, foodCategory === category.key && styles.categoryChipActive]}><Text style={[styles.categoryText, foodCategory === category.key && styles.categoryTextActive]}>{category.label}</Text></TouchableOpacity>)}
        </ScrollView>
        {searchLoading && <ActivityIndicator accessibilityLabel="Đang tìm thực phẩm" color={colors.primary} style={styles.spinner} />}
        {!!searchError && <View><Text accessibilityRole="alert" style={styles.error}>{searchError}</Text><TouchableOpacity onPress={searchFoods} style={styles.retryInline}><Text style={styles.link}>Thử tìm lại</Text></TouchableOpacity></View>}
        {!searchLoading && !searchError && foods.length === 0 && query.trim() !== '' && <Text style={styles.small}>Không tìm thấy thực phẩm phù hợp.</Text>}
        {catalogInfo && <View style={styles.catalogNotice}>
          <Text style={styles.catalogNoticeTitle}>Danh mục {catalogInfo.version} · {catalogInfo.status}</Text>
          <Text style={styles.catalogNoticeText}>{catalogInfo.notice}</Text>
          {catalogInfo.status === 'prototype' && <Text style={styles.catalogNoticeText}>Danh mục mẫu, chưa được chuyên gia rà soát. Không phải bảng dữ liệu chính thức của Viện Dinh dưỡng.</Text>}
          {(catalogInfo.limitations || []).map((limitation, index) => <Text key={`${index}-${limitation}`} style={styles.catalogLimitation}>• {limitation}</Text>)}
        </View>}
        {filteredFoods.map(food => {
          const selected = selectedFoods.some(item => item.id === food.id);
          const defaultGrams = food.basis?.unit === 'g' && Number.isFinite(food.basis.amount) ? food.basis.amount : 100;
          return <TouchableOpacity key={food.id} accessibilityRole="button" accessibilityLabel={`Chọn ${food.name}`} accessibilityState={{ selected }} style={styles.foodResult} onPress={() => {
            setSelectedFoods(current => selected ? current.filter(item => item.id !== food.id) : [...current, { ...food, grams: String(defaultGrams) }]);
            setMutationError('');
          }}>
            <View style={styles.foodThumb}><FoodThumbnail food={food} size={48} /></View>
            <View style={styles.foodResultCopy}><Text style={styles.foodName}>{food.name}</Text>{Number.isFinite(food.nutrition?.values?.energyKcal?.value) && <Text style={styles.small}>{food.nutrition.values.energyKcal.value} kcal · {food.basis?.amount || 100} {food.basis?.unit || 'g'}</Text>}<Text style={styles.sourceText}>{sourceLine(food)}</Text></View>
            <View style={[styles.selectMark, selected && styles.selectMarkActive]}><Text style={[styles.selectCheck, selected && styles.selectCheckActive]}>{selected ? '✓' : '+'}</Text></View>
          </TouchableOpacity>;
        })}
        {!searchLoading && foods.length > 0 && !filteredFoods.length && <Text style={styles.small}>Không có kết quả trong nhóm món này.</Text>}
        {!!selectedFoods.length && <View style={styles.selectionFooter}>
          <View style={styles.selectedCount}><Text style={styles.selectedCountTitle}>Đã chọn: {selectedFoods.length} món</Text><Text style={styles.selectedCountSub} numberOfLines={1}>{selectedFoods.map(food => food.name).join(', ')}</Text></View>
          <TouchableOpacity accessibilityRole="button" style={styles.primaryButton} onPress={() => {
            const firstFood = selectedFoods[0];
            setSelectedFood(firstFood);
            setGrams(String(firstFood.grams || (firstFood.basis?.unit === 'g' ? firstFood.basis.amount : 100)));
            setPortionIndex(0);
            setAddStep('portion');
          }}><Text style={styles.primaryButtonText}>Xem khẩu phần ({selectedFoods.length}) →</Text></TouchableOpacity>
        </View>}
      </>}

      {addStep === 'portion' && selectedFood && <>
        <View style={styles.selectedFoodCard}>
          <View style={styles.foodThumbLarge}><FoodThumbnail food={selectedFood} size={66} /></View>
          <View style={styles.selectedFoodCopy}><View style={styles.tagRow}><Text style={styles.sourceTag}>{selectedFood.source?.label || 'Nguồn chưa ghi'}</Text><Text style={styles.sourceTagMuted}>Dữ liệu nguồn</Text></View><Text style={styles.selectedFoodTitle}>{selectedFood.name}</Text><Text style={styles.sourceText}>{sourceLine(selectedFood)}</Text></View>
        </View>
        {portionIndex > 0 && <Text style={styles.progressCopy}>Món {portionIndex + 1} · các món trước đã được lưu thành công.</Text>}
        <View style={styles.portionCard}>
          <View style={styles.sectionRow}><Text style={styles.heading}>⌛　Định lượng khẩu phần</Text><View style={styles.unitBadge}><Text style={styles.unitBadgeText}>Gram (g)⌄</Text></View></View>
          <View style={styles.portionControl}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Giảm khẩu phần" style={styles.portionAdjust} onPress={() => adjustPortion(Number(grams) - 10)}><Text style={styles.portionAdjustText}>−</Text></TouchableOpacity>
            <TextInput accessibilityLabel="Khối lượng" value={grams} onChangeText={setGrams} keyboardType="decimal-pad" maxLength={7} style={styles.portionInput} placeholder="Khối lượng (g)" />
            <Text style={styles.gramsUnit}>g</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Tăng khẩu phần" style={styles.portionAdjust} onPress={() => adjustPortion(Number(grams) + 10)}><Text style={styles.portionAdjustText}>+</Text></TouchableOpacity>
          </View>
          <View style={styles.presetRow}>{[100, 150, 200, sourceAmount].map((amount, index) => <TouchableOpacity key={`${amount}-${index}`} accessibilityRole="button" accessibilityState={{ selected: grams === String(amount) }} onPress={() => adjustPortion(amount)} style={[styles.presetChip, grams === String(amount) && styles.presetChipActive]}><Text style={[styles.presetText, grams === String(amount) && styles.presetTextActive]}>{index === 3 ? '1 phần' : `${amount}g`}</Text></TouchableOpacity>)}</View>
        </View>
        <View style={styles.sourceNutrientsCard}>
          <Text style={styles.heading}>Dữ liệu nguồn theo {selectedFood.basis?.amount || 100} {selectedFood.basis?.unit || 'g'}</Text>
          <Text style={styles.small}>Giá trị dưới đây lấy từ bản ghi nguồn, không phải tổng đã tính cho khẩu phần.</Text>
          <View style={styles.sourceNutrientGrid}>{nutrientCards.map(nutrient => <View key={nutrient.key} style={styles.sourceNutrientItem}><Text style={styles.sourceNutrientLabel}>{nutrient.label}</Text><Text style={styles.sourceNutrientValue}>{selectedFood.nutrition?.values?.[nutrient.key]?.value ?? '—'} <Text style={styles.sourceNutrientUnit}>{nutrient.unit}</Text></Text></View>)}</View>
        </View>
        <Text style={styles.formSectionTitle}>Phân bổ bữa ăn</Text>
        <View style={styles.mealRow}>{MEAL_TYPES.map(meal => <TouchableOpacity key={meal.value} accessibilityRole="button" accessibilityState={{ selected: mealType === meal.value }} onPress={() => setMealType(meal.value)} style={[styles.chip, mealType === meal.value && styles.chipActive]}><Text style={[styles.chipText, mealType === meal.value && styles.chipTextActive]}>{meal.label}</Text></TouchableOpacity>)}</View>
        <View style={styles.formMetaRow}><View style={styles.formMetaField}><Text style={styles.formLabel}>Ngày dùng</Text><TextInput accessibilityLabel="Ngày dùng" value={selectedDate} onChangeText={setSelectedDate} style={styles.input} placeholder="YYYY-MM-DD" /></View><View style={styles.formMetaField}><Text style={styles.formLabel}>Giờ dùng</Text><TextInput accessibilityLabel="Giờ dùng" value={time} onChangeText={setTime} style={styles.input} placeholder="HH:MM" /></View></View>
        <TextInput accessibilityLabel="Ghi chú" value={notes} onChangeText={setNotes} placeholder="Ghi chú (tùy chọn)" maxLength={500} style={styles.input} />
        <Text style={styles.disclaimer}>Dinh dưỡng là ước tính từ dữ liệu nguồn, không phải tư vấn y tế.</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={editingId ? 'Lưu thay đổi' : mutationError ? 'Thử lưu lại' : 'Lưu bữa ăn'} style={[styles.confirmButton, mutationLoading && styles.buttonDisabled]} onPress={saveEntry} disabled={mutationLoading}><Text style={styles.confirmButtonText}>{mutationLoading ? 'Đang lưu…' : editingId ? 'Lưu thay đổi' : mutationError ? 'Thử lưu lại' : '⊕ Xác nhận thêm vào bữa'}</Text></TouchableOpacity>
        {editingId && <TouchableOpacity style={styles.cancelButton} onPress={resetForm}><Text style={styles.link}>Hủy sửa</Text></TouchableOpacity>}
      </>}
      {!!mutationError && <Text accessibilityRole="alert" style={styles.error}>{mutationError}</Text>}
      {!!successMessage && <Text accessibilityLiveRegion="polite" style={styles.success}>{successMessage}</Text>}
    </ScrollView>;
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.title}>Nhật ký bữa ăn</Text>
    <View style={styles.dayRow}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ngày trước" style={styles.dayButton} onPress={() => changeDate(-1)}><Text style={styles.dayArrow}>‹</Text></TouchableOpacity>
      <View style={styles.dayLabel}><Text style={styles.dayHeading}>{new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${selectedDate}T12:00:00`))}</Text><Text style={styles.small}>{selectedDate} · {timeZone}</Text></View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ngày sau" style={styles.dayButton} onPress={() => changeDate(1)}><Text style={styles.dayArrow}>›</Text></TouchableOpacity>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekStrip}>
      {weekDates.map(date => {
        const selected = date === selectedDate;
        const parsedDate = new Date(`${date}T12:00:00`);
        return <TouchableOpacity key={date} accessibilityRole="button" accessibilityLabel={`Chọn ${new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(parsedDate)}`} accessibilityState={{ selected }} style={[styles.dateChip, selected && styles.dateChipSelected]} onPress={() => selectDate(date)}>
          <Text style={[styles.dateDay, selected && styles.dateTextSelected]}>{new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(parsedDate)}</Text>
          <Text style={[styles.dateNumber, selected && styles.dateTextSelected]}>{parsedDate.getDate()}</Text>
        </TouchableOpacity>;
      })}
    </ScrollView>

    <View style={styles.summaryCard}>
      <View style={styles.summaryHeader}><View style={styles.summaryAccent} /><Text style={styles.summaryTitle}>Chỉ số dinh dưỡng hôm nay</Text><View style={styles.targetBadge}><Text style={styles.targetBadgeText}>Theo dữ liệu đã ghi</Text></View></View>
      <MacroSummary totals={totals} />
      <View style={styles.summaryFooter}><View><Text style={styles.summaryCaption}>Đã nạp năng lượng</Text><Text style={styles.summaryValue}>{displayValue(totals.energyKcal)} kcal</Text></View><View style={styles.summarySeparator} /><View><Text style={styles.summaryCaption}>Chất xơ · Natri</Text><Text style={styles.summarySubValue}>{displayValue(totals.fiberG)} g · {displayValue(totals.sodiumMg)} mg</Text></View></View>
      <Text style={styles.disclaimer}>Nhật ký được lưu trong tài khoản và chỉ hiển thị cho bạn. Dinh dưỡng là ước tính từ dữ liệu nguồn, không phải tư vấn y tế.</Text>
    </View>

    <View style={styles.timelineHeading}><Text style={styles.heading}>Lịch trình bữa ăn</Text><TouchableOpacity accessibilityRole="button" onPress={openAddFood}><Text style={styles.link}>＋ Thêm món</Text></TouchableOpacity></View>
    <Text style={styles.small}>Các món đã ghi ({entries.length})</Text>
    {listLoading && <View accessibilityRole="progressbar" style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.small}>Đang tải nhật ký…</Text></View>}
    {!!listError && <View style={styles.errorCard}><Text accessibilityRole="alert" style={styles.error}>{listError}</Text><TouchableOpacity style={styles.retryButton} onPress={() => setReloadCount(value => value + 1)}><Text style={styles.buttonText}>Thử tải lại</Text></TouchableOpacity></View>}
    {!listLoading && !listError && mealGroups.map(({ meal, items }) => {
      const calories = items.reduce((sum, entry) => sum + (Number.isFinite(entry.nutrients?.energyKcal) ? entry.nutrients.energyKcal : 0), 0);
      return <View key={meal.value} style={[styles.timelineCard, { borderLeftColor: meal.value === 'BREAKFAST' ? '#21B7E8' : meal.value === 'LUNCH' ? colors.primary : '#9373F7' }]}>
        <View style={styles.timelineCardHeader}><View style={styles.timelineIcon}><Text style={styles.timelineIconText}>{meal.value === 'BREAKFAST' ? '☼' : meal.value === 'LUNCH' ? '♜' : meal.value === 'DINNER' ? '☾' : '✦'}</Text></View><View style={styles.timelineMealCopy}><Text style={styles.timelineMealName}>Bữa {meal.label}</Text><Text style={styles.timelineTime}>{items[0] ? formatEntryTime(items[0]) : ''}</Text></View><View style={styles.timelineEnergy}><Text style={styles.timelineCalories}>{displayValue(calories)} kcal</Text><Text style={styles.small}>Tổng: {items.length} món</Text></View></View>
        {items.map(entry => <View key={entry.id} style={styles.timelineEntry}>
          <View style={styles.entryCopy}><Text style={styles.entryFoodName}>{entry.foodName}</Text><Text style={styles.entryMeta}>{entry.portion.amount} {entry.portion.unit || 'g'} · {displayValue(entry.nutrients.energyKcal)} kcal</Text><Text style={styles.entryMacros}>Đạm {displayValue(entry.nutrients.proteinG)} g · Carb {displayValue(entry.nutrients.carbohydrateG)} g · Béo {displayValue(entry.nutrients.fatG)} g</Text>{!!entry.notes && <Text style={styles.entryMacros}>{entry.notes}</Text>}</View>
          <View style={styles.entryActions}><TouchableOpacity accessibilityRole="button" style={styles.textButton} onPress={() => startEditing(entry)} disabled={mutationLoading}><Text style={styles.link}>Sửa</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" style={styles.textButton} onPress={() => deleteEntry(entry)} disabled={mutationLoading}><Text style={styles.deleteText}>Xóa</Text></TouchableOpacity></View>
        </View>)}
      </View>;
    })}
    {!listLoading && !listError && entries.length === 0 && <View style={styles.emptyDiary}><Text style={styles.emptyDiaryIcon}>＋</Text><Text style={styles.emptyDiaryTitle}>Chưa có món nào trong ngày này.</Text><Text style={styles.small}>Tìm một thực phẩm có nguồn và ghi lại khẩu phần của bạn.</Text><TouchableOpacity accessibilityRole="button" style={styles.primaryButton} onPress={openAddFood}><Text style={styles.primaryButtonText}>Thêm món ăn</Text></TouchableOpacity></View>}
    {!!successMessage && <Text accessibilityLiveRegion="polite" style={styles.success}>{successMessage}</Text>}
    {!!mutationError && <Text accessibilityRole="alert" style={styles.error}>{mutationError}</Text>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F9FD' },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 134 },
  title: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 7 },
  disclaimer: { backgroundColor: '#F7F9FD', color: colors.muted, paddingVertical: 7, fontSize: 11, lineHeight: 16, marginTop: 8 },
  catalogNotice: { backgroundColor: '#FFF7E6', padding: 11, borderRadius: radius.sm, marginTop: 10 },
  catalogNoticeTitle: { color: colors.warning, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  catalogNoticeText: { color: colors.warning, fontSize: 13, lineHeight: 17, marginTop: 4 },
  catalogLimitation: { color: colors.warning, fontSize: 13, lineHeight: 17, marginTop: 4 },
  summaryCard: { backgroundColor: colors.surface, padding: 14, borderRadius: 20, marginTop: 7, marginBottom: 12, borderWidth: 1, borderColor: '#E5EDF9', shadowColor: '#153463', shadowOpacity: 0.07, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  summaryAccent: { width: 5, height: 18, borderRadius: 4, backgroundColor: colors.primary, marginRight: 8 },
  summaryTitle: { flex: 1, color: colors.text, fontWeight: '800', fontSize: 14 },
  targetBadge: { maxWidth: 104, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: '#EFF5FF', borderRadius: radius.pill },
  targetBadgeText: { color: colors.primary, fontSize: 10, fontWeight: '700' },
  macroGrid: { flexDirection: 'row', gap: 6, marginTop: 13 },
  macroItem: { flex: 1, minWidth: 0, padding: 8, borderRadius: 12, backgroundColor: '#F7F9FD' },
  macroName: { color: colors.muted, fontSize: 10 },
  macroValue: { color: colors.text, fontWeight: '800', fontSize: 13, marginTop: 4 },
  macroUnit: { color: colors.muted, fontWeight: '500', fontSize: 9 },
  macroTrack: { height: 4, backgroundColor: '#E1E8F4', borderRadius: 4, marginTop: 6, overflow: 'hidden' },
  macroFill: { height: 4, borderRadius: 4 },
  summaryFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 13, padding: 10, backgroundColor: '#F7F9FD', borderRadius: 12 },
  summaryCaption: { color: colors.muted, fontSize: 10 },
  summaryValue: { color: colors.primaryDark, fontWeight: '800', fontSize: 17, marginTop: 3 },
  summaryUnit: { color: colors.muted, fontSize: 10, fontWeight: '500' },
  summarySeparator: { width: 1, height: 30, backgroundColor: '#DDE4EF', marginHorizontal: 12 },
  summarySubValue: { color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 5 },
  heading: { color: colors.text, fontSize: 16, fontWeight: '800' },
  small: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 5 },
  dayButton: { width: 35, height: 40, alignItems: 'center', justifyContent: 'center' },
  dayArrow: { color: colors.text, fontSize: 29, lineHeight: 32 },
  dayLabel: { alignItems: 'center', flex: 1 },
  dayHeading: { color: colors.text, fontWeight: '800', fontSize: 14, textTransform: 'capitalize' },
  weekStrip: { width: '100%', justifyContent: 'space-between', gap: 5, paddingVertical: 5, paddingHorizontal: 4, paddingBottom: 11, backgroundColor: colors.surface, borderRadius: 17, borderWidth: 1, borderColor: '#E7EDF6' },
  dateChip: { width: 39, minHeight: 55, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  dateChipSelected: { backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.24, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  dateDay: { color: colors.muted, fontSize: 10, textTransform: 'capitalize' },
  dateNumber: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 2 },
  dateTextSelected: { color: 'white' },
  timelineHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 1 },
  timelineCard: { backgroundColor: colors.surface, borderRadius: 19, borderWidth: 1, borderColor: '#E7EDF6', borderLeftWidth: 4, padding: 11, marginTop: 11, shadowColor: '#153463', shadowOpacity: 0.04, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  timelineCardHeader: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#F0F3F8' },
  timelineIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  timelineIconText: { color: colors.primary, fontSize: 17, fontWeight: '700' },
  timelineMealCopy: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 9 },
  timelineMealName: { color: colors.text, fontSize: 13, fontWeight: '800' },
  timelineTime: { color: '#7C90AE', fontSize: 10 },
  timelineEnergy: { alignItems: 'flex-end' },
  timelineCalories: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  timelineEntry: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FAFBFE', padding: 7, borderRadius: 12, marginTop: 7 },
  entryCopy: { flex: 1, minWidth: 0 },
  entryFoodName: { color: colors.text, fontSize: 12, fontWeight: '700' },
  entryMeta: { color: colors.primary, fontSize: 11, marginTop: 3 },
  entryMacros: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 3 },
  entryActions: { alignItems: 'center' },
  textButton: { minWidth: 42, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  link: { color: colors.primary, fontWeight: '800', fontSize: 12 },
  deleteText: { color: colors.danger, fontWeight: '700', fontSize: 11 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18, marginTop: 8 },
  success: { color: colors.success, fontWeight: '700', fontSize: 13, marginTop: 8, paddingVertical: 7 },
  errorCard: { backgroundColor: '#FFF1F0', padding: 12, borderRadius: radius.md, marginVertical: 8 },
  retryButton: { minHeight: 44, alignSelf: 'flex-start', backgroundColor: colors.primary, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, marginTop: 8 },
  emptyDiary: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 18, padding: 18, marginTop: 12, borderWidth: 1, borderColor: colors.border },
  emptyDiaryIcon: { width: 42, height: 42, textAlign: 'center', textAlignVertical: 'center', overflow: 'hidden', color: colors.primary, backgroundColor: colors.softBlue, borderRadius: 21, fontSize: 25 },
  emptyDiaryTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 9 },
  primaryButton: { minHeight: 48, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 12, shadowColor: colors.primary, shadowOpacity: 0.2, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  primaryButtonText: { color: 'white', fontSize: 13, fontWeight: '800' },
  addHeader: { minHeight: 53, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 42, height: 44, justifyContent: 'center' },
  backArrow: { color: colors.text, fontSize: 32, lineHeight: 35 },
  addTitle: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' },
  headerBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  headerBadgeText: { color: 'white', fontWeight: '800', fontSize: 16 },
  mealContext: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, backgroundColor: colors.surface, borderRadius: 17, marginTop: 5, marginBottom: 10, borderWidth: 1, borderColor: '#EEF1F6' },
  contextIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  contextGlyph: { color: colors.primary, fontSize: 21 },
  contextCopy: { flex: 1 },
  contextTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  contextTime: { color: colors.muted, fontWeight: '500' },
  contextDate: { color: colors.muted, fontSize: 10, marginTop: 4 },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 2 },
  searchInput: { minHeight: 50, borderRadius: radius.pill, paddingHorizontal: 15, backgroundColor: colors.surface, color: colors.text, fontSize: 13, shadowColor: '#172236', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  searchIconButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#EEF1F6' },
  searchIconText: { color: colors.primary, fontSize: 26 },
  categoryRow: { gap: 8, paddingVertical: 11 },
  categoryChip: { minHeight: 38, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: '#EEF1F6', backgroundColor: colors.surface },
  categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryText: { color: colors.text, fontSize: 12 },
  categoryTextActive: { color: 'white', fontWeight: '700' },
  foodResult: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 8, backgroundColor: colors.surface, borderRadius: 15, borderWidth: 1, borderColor: '#EEF1F6', marginTop: 7 },
  foodThumb: { width: 48, height: 48, borderRadius: 11, backgroundColor: '#F7EDE5', alignItems: 'center', justifyContent: 'center' },
  foodThumbGlyph: { fontSize: 27 },
  foodResultCopy: { flex: 1, minWidth: 0 },
  foodName: { color: colors.text, fontWeight: '800', fontSize: 13 },
  sourceText: { color: colors.muted, fontSize: 9, lineHeight: 13, marginTop: 3 },
  selectMark: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  selectMarkActive: { backgroundColor: colors.primary },
  selectCheck: { color: colors.primary, fontSize: 20, lineHeight: 23 },
  selectCheckActive: { color: 'white', fontSize: 17, fontWeight: '800' },
  selectionFooter: { marginTop: 12, padding: 11, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: '#E7EDF6' },
  selectedCount: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  selectedCountTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  selectedCountSub: { flex: 1, color: colors.muted, fontSize: 10, textAlign: 'right' },
  selectedFoodCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, padding: 12, borderRadius: 16, marginTop: 7, borderWidth: 1, borderColor: '#EEF1F6' },
  progressCopy: { color: colors.success, fontSize: 11, lineHeight: 16, marginTop: 7, marginLeft: 2 },
  foodThumbLarge: { width: 66, height: 66, borderRadius: 13, backgroundColor: '#F7EDE5', alignItems: 'center', justifyContent: 'center' },
  foodThumbLargeGlyph: { fontSize: 36 },
  selectedFoodCopy: { flex: 1, minWidth: 0 },
  tagRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  sourceTag: { color: colors.primaryDark, backgroundColor: '#DCEAFF', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, fontSize: 9, fontWeight: '800' },
  sourceTagMuted: { color: '#177A63', backgroundColor: '#D7F8EA', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, fontSize: 9, fontWeight: '700' },
  selectedFoodTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  portionCard: { backgroundColor: colors.surface, padding: 13, borderRadius: 17, marginTop: 10, borderWidth: 1, borderColor: '#EEF1F6' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  unitBadge: { paddingHorizontal: 9, paddingVertical: 6, backgroundColor: colors.softBlue, borderRadius: radius.pill },
  unitBadgeText: { color: colors.primaryDark, fontSize: 10, fontWeight: '700' },
  portionControl: { minHeight: 57, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 9, backgroundColor: '#EDF3FF', borderRadius: 14, marginTop: 10 },
  portionAdjust: { width: 39, height: 39, borderRadius: 11, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  portionAdjustText: { color: colors.primary, fontSize: 25, lineHeight: 28 },
  portionInput: { width: 80, color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'right', padding: 0 },
  gramsUnit: { color: colors.muted, fontSize: 11, marginLeft: -24 },
  presetRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  presetChip: { flex: 1, minHeight: 34, borderRadius: 10, backgroundColor: '#EFF3FB', alignItems: 'center', justifyContent: 'center' },
  presetChipActive: { backgroundColor: colors.primary },
  presetText: { color: colors.text, fontSize: 10, fontWeight: '700' },
  presetTextActive: { color: 'white' },
  sourceNutrientsCard: { backgroundColor: colors.surface, padding: 13, borderRadius: 16, marginTop: 9, borderWidth: 1, borderColor: '#EEF1F6' },
  sourceNutrientGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 },
  sourceNutrientItem: { width: '48%', minHeight: 53, padding: 9, backgroundColor: '#F7F9FD', borderRadius: 12 },
  sourceNutrientLabel: { color: colors.muted, fontSize: 10 },
  sourceNutrientValue: { color: colors.primaryDark, fontSize: 14, fontWeight: '800', marginTop: 3 },
  sourceNutrientUnit: { color: colors.muted, fontSize: 9, fontWeight: '500' },
  formSectionTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 15, marginBottom: 4 },
  mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 5, marginBottom: 4 },
  chip: { flex: 1, minWidth: 65, paddingHorizontal: 9, minHeight: 39, borderRadius: radius.pill, backgroundColor: '#EFF3FB', alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.primaryDark, fontWeight: '700', fontSize: 11 },
  chipTextActive: { color: 'white' },
  formMetaRow: { flexDirection: 'row', gap: 9 },
  formMetaField: { flex: 1 },
  formLabel: { color: colors.muted, fontSize: 10, marginTop: 8 },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: colors.surface, marginTop: 5, color: colors.text, fontSize: 13 },
  confirmButton: { minHeight: 50, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', marginTop: 11, shadowColor: colors.primary, shadowOpacity: 0.2, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  confirmButtonText: { color: 'white', fontWeight: '800', fontSize: 13 },
  buttonDisabled: { opacity: 0.6 },
  cancelButton: { minHeight: 44, paddingHorizontal: 9, paddingVertical: 10, alignSelf: 'center', justifyContent: 'center' },
  retryInline: { minHeight: 40, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 8 },
  buttonText: { color: 'white', fontWeight: '800', fontSize: 13 },
  spinner: { marginTop: 12 },
});
