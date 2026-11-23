import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import { colors, radius } from '../../theme/tokens';

const MEAL_TYPES = [
  { value: 'BREAKFAST', label: 'Sáng' },
  { value: 'LUNCH', label: 'Trưa' },
  { value: 'DINNER', label: 'Tối' },
  { value: 'SNACK', label: 'Phụ' },
];
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
  const name = food.source?.name || 'Nguồn chưa ghi';
  const license = food.source?.license?.name;
  const rowStatus = food.source?.sourceRecordId ? '' : ' · ID bản ghi cụ thể chưa được lưu';
  return `Nguồn: ${name} · ${sourceEdition(food)}${license ? ` · ${license}` : ''}${rowStatus}`;
}

export default function DiaryScreen({ onTodayDataLoaded, onDiaryMutation }) {
  const [initialDateTime] = useState(getDeviceDateTime);
  const [selectedDate, setSelectedDate] = useState(initialDateTime.date);
  const [time, setTime] = useState(initialDateTime.time);
  const [timeZone] = useState(getDeviceTimeZone);
  const [entries, setEntries] = useState([]);
  const [totals, setTotals] = useState(EMPTY_TOTALS);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [reloadCount, setReloadCount] = useState(0);
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState([]);
  const [catalogInfo, setCatalogInfo] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedFood, setSelectedFood] = useState(null);
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
    api.getMealEntries({ date: selectedDate, timeZone })
      .then(result => {
        if (sequence !== loadSequence.current) return;
        const nextEntries = Array.isArray(result?.items) ? result.items : [];
        const nextTotals = result?.totals || EMPTY_TOTALS;
        setEntries(nextEntries);
        setTotals(nextTotals);
        onTodayDataLoaded?.(selectedDate, nextEntries, nextTotals);
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
      const result = await api.getFoods(query.trim());
      setFoods(Array.isArray(result?.items) ? result.items : []);
      setCatalogInfo(result?.catalog || null);
    } catch (error) {
      setSearchError(error?.message || 'Không tìm được thực phẩm. Hãy kiểm tra kết nối rồi thử lại.');
    } finally {
      setSearchLoading(false);
    }
  }

  function resetForm() {
    setSelectedFood(null);
    setGrams('100');
    setMealType('LUNCH');
    setNotes('');
    setEditingId(null);
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
    setSelectedFood({ id: entry.foodId, name: entry.foodName });
    setGrams(String(entry.portion.amount));
    setMealType(entry.mealType);
    setNotes(entry.notes || '');
    setEditingId(entry.id);
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
        await api.updateMealEntry(editingId, payload);
      } else {
        const signature = JSON.stringify(payload);
        if (createIntent.current?.signature !== signature) {
          createIntent.current = { signature, key: createIdempotencyKey() };
        }
        await api.createMealEntry(payload, createIntent.current.key);
        createIntent.current = null;
      }
      onDiaryMutation?.();
      setSuccessMessage(editingId ? 'Đã cập nhật nhật ký.' : 'Đã lưu nhật ký.');
      resetForm();
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
          await api.deleteMealEntry(entry.id);
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
    setSuccessMessage('');
    setMutationError('');
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.title}>Nhật ký bữa ăn</Text>
    <Text style={styles.disclaimer}>Đây là nhật ký demo lưu trên máy chủ. Chỉ dùng dữ liệu tổng hợp, không nhập thông tin sức khỏe thật. Dinh dưỡng là ước tính, không phải tư vấn y tế.</Text>

    <View style={styles.dayRow}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ngày trước" style={styles.dayButton} onPress={() => changeDate(-1)}><Text style={styles.dayArrow}>‹</Text></TouchableOpacity>
      <View style={styles.dayLabel}><Text style={styles.dayHeading}>{new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${selectedDate}T12:00:00`))}</Text><Text style={styles.small}>{selectedDate} · {timeZone}</Text></View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ngày sau" style={styles.dayButton} onPress={() => changeDate(1)}><Text style={styles.dayArrow}>›</Text></TouchableOpacity>
    </View>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekStrip}>
      {weekDates.map(date => {
        const selected = date === selectedDate;
        const parsedDate = new Date(`${date}T12:00:00`);
        return <TouchableOpacity
          key={date}
          accessibilityRole="button"
          accessibilityLabel={`Chọn ${new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(parsedDate)}`}
          accessibilityState={{ selected }}
          style={[styles.dateChip, selected && styles.dateChipSelected]}
          onPress={() => selectDate(date)}
        >
          <Text style={[styles.dateDay, selected && styles.dateTextSelected]}>{new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(parsedDate)}</Text>
          <Text style={[styles.dateNumber, selected && styles.dateTextSelected]}>{parsedDate.getDate()}</Text>
        </TouchableOpacity>;
      })}
    </ScrollView>

    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>{editingId ? 'Sửa bản ghi' : 'Thêm món ăn'}</Text>
      <View style={styles.searchRow}>
        <TextInput accessibilityLabel="Tìm thực phẩm" value={query} onChangeText={setQuery} placeholder="Tìm món ăn, cơm, thịt, rau…" style={[styles.input, { flex: 1 }]} onSubmitEditing={searchFoods} returnKeyType="search" />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Tìm thực phẩm" style={styles.searchButton} onPress={searchFoods} disabled={searchLoading}><Text style={styles.buttonText}>Tìm</Text></TouchableOpacity>
      </View>
      {searchLoading && <ActivityIndicator accessibilityLabel="Đang tìm thực phẩm" color={colors.primary} style={styles.spinner} />}
      {!!searchError && <View><Text accessibilityRole="alert" style={styles.error}>{searchError}</Text><TouchableOpacity onPress={searchFoods} style={{ minWidth: 48, minHeight: 48, justifyContent: "center", alignItems: "center" }}><Text style={styles.link}>Thử tìm lại</Text></TouchableOpacity></View>}
      {!searchLoading && !searchError && foods.length === 0 && query.trim() !== '' && <Text style={styles.small}>Không tìm thấy thực phẩm phù hợp.</Text>}
      {catalogInfo && <View style={styles.catalogNotice}>
        <Text style={styles.catalogNoticeTitle}>Danh mục {catalogInfo.version} · {catalogInfo.status}</Text>
        <Text style={styles.catalogNoticeText}>{catalogInfo.notice}</Text>
        {catalogInfo.status === 'prototype' && <Text style={styles.catalogNoticeText}>Danh mục mẫu, chưa được chuyên gia rà soát. Không phải bảng dữ liệu chính thức của Viện Dinh dưỡng.</Text>}
        {(catalogInfo.limitations || []).map((limitation, index) => <Text key={`${index}-${limitation}`} style={styles.catalogLimitation}>• {limitation}</Text>)}
      </View>}
      {foods.map(food => <TouchableOpacity key={food.id} accessibilityRole="button" accessibilityState={{ selected: selectedFood?.id === food.id }} style={styles.foodRow} onPress={() => setSelectedFood(food)}><Text style={styles.foodName}>{selectedFood?.id === food.id ? '✓  ' : ''}{food.name}</Text>{Number.isFinite(food.per100g?.energyKcal) && <Text style={styles.small}>Mỗi 100 g · {food.per100g.energyKcal} kcal</Text>}<Text style={styles.sourceText}>{sourceLine(food)}</Text></TouchableOpacity>)}

      {selectedFood && <View style={styles.selected}>
        <Text style={styles.heading}>{selectedFood.name}</Text>
        {selectedFood.serving && <Text style={styles.small}>Khẩu phần tham khảo: {selectedFood.serving.amount} {selectedFood.serving.unit} · {selectedFood.serving.household}. Dinh dưỡng tính trên {selectedFood.nutrition?.basis?.amount || 100} {selectedFood.nutrition?.basis?.unit || 'g'} phần ăn được.</Text>}
        {selectedFood.source && <Text style={styles.small}>{sourceLine(selectedFood)}</Text>}
        <Text style={styles.small}>Khẩu phần (g)</Text>
        <TextInput accessibilityLabel="Khối lượng" value={grams} onChangeText={setGrams} keyboardType="decimal-pad" style={styles.input} placeholder="Khối lượng (g)" />
        <Text style={styles.small}>Ngày và giờ theo múi giờ thiết bị</Text>
        <TextInput accessibilityLabel="Ngày dùng" value={selectedDate} onChangeText={setSelectedDate} style={styles.input} placeholder="YYYY-MM-DD" />
        <TextInput accessibilityLabel="Giờ dùng" value={time} onChangeText={setTime} style={styles.input} placeholder="HH:MM" />
        <Text style={styles.small}>Bữa ăn</Text>
        <View style={styles.mealRow}>{MEAL_TYPES.map(meal => <TouchableOpacity key={meal.value} accessibilityRole="button" accessibilityState={{ selected: mealType === meal.value }} onPress={() => setMealType(meal.value)} style={[styles.chip, mealType === meal.value && styles.chipActive]}><Text style={[styles.chipText, mealType === meal.value && styles.chipTextActive]}>{meal.label}</Text></TouchableOpacity>)}</View>
        <TextInput accessibilityLabel="Ghi chú" value={notes} onChangeText={setNotes} placeholder="Ghi chú (tùy chọn)" maxLength={500} style={styles.input} />
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.addButton} onPress={saveEntry} disabled={mutationLoading}><Text style={styles.buttonText}>{mutationLoading ? 'Đang lưu…' : mutationError && !editingId ? 'Thử lưu lại' : editingId ? 'Lưu thay đổi' : 'Lưu bữa ăn'}</Text></TouchableOpacity>
          {editingId && <TouchableOpacity style={styles.cancelButton} onPress={resetForm}><Text style={styles.link}>Hủy sửa</Text></TouchableOpacity>}
        </View>
      </View>}
      {!!mutationError && <Text accessibilityRole="alert" style={styles.error}>{mutationError}</Text>}
      {!!successMessage && <Text accessibilityLiveRegion="polite" style={styles.success}>{successMessage}</Text>}
    </View>

    <View style={styles.summaryCard}>
      <Text style={styles.heading}>Tổng dinh dưỡng trong ngày</Text>
      <Text style={styles.summaryValue}>{displayValue(totals.energyKcal)} kcal</Text>
      <Text style={styles.small}>Đạm {displayValue(totals.proteinG)} g · Carb {displayValue(totals.carbohydrateG)} g · Béo {displayValue(totals.fatG)} g</Text>
      <Text style={styles.small}>Chất xơ {displayValue(totals.fiberG)} g · Natri {displayValue(totals.sodiumMg)} mg</Text>
    </View>

    <Text style={styles.heading}>Các món đã ghi ({entries.length})</Text>
    {listLoading && <View accessibilityRole="progressbar" style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.small}>Đang tải nhật ký…</Text></View>}
    {!!listError && <View style={styles.errorCard}><Text accessibilityRole="alert" style={styles.error}>{listError}</Text><TouchableOpacity style={styles.retryButton} onPress={() => setReloadCount(value => value + 1)}><Text style={styles.buttonText}>Thử tải lại</Text></TouchableOpacity></View>}
    {!listLoading && !listError && entries.map(entry => <View key={entry.id} style={styles.card}>
      <View style={styles.entryHeader}><Text style={styles.foodName}>{entry.foodName}</Text><Text style={styles.small}>{formatEntryTime(entry)} · {formatMealType(entry.mealType)}</Text></View>
      <Text style={styles.small}>{entry.portion.amount} {entry.portion.unit || 'g'} · {displayValue(entry.nutrients.energyKcal)} kcal</Text>
      <Text style={styles.small}>Đạm {displayValue(entry.nutrients.proteinG)} g · Carb {displayValue(entry.nutrients.carbohydrateG)} g · Natri {displayValue(entry.nutrients.sodiumMg)} mg</Text>
      {!!entry.notes && <Text style={styles.small}>{entry.notes}</Text>}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.textButton} onPress={() => startEditing(entry)} disabled={mutationLoading}><Text style={styles.link}>Sửa</Text></TouchableOpacity>
        <TouchableOpacity style={styles.textButton} onPress={() => deleteEntry(entry)} disabled={mutationLoading}><Text style={styles.deleteText}>Xóa</Text></TouchableOpacity>
      </View>
    </View>)}
    {!listLoading && !listError && entries.length === 0 && <Text style={styles.small}>Chưa có món nào trong ngày này.</Text>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 122 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  disclaimer: { backgroundColor: '#FFF7E6', color: colors.warning, padding: 11, borderRadius: radius.sm, fontSize: 12, lineHeight: 17, marginTop: 9, marginBottom: 11 },
  catalogNotice: { backgroundColor: '#FFF7E6', padding: 11, borderRadius: radius.sm, marginTop: 10 },
  catalogNoticeTitle: { color: colors.warning, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  catalogNoticeText: { color: colors.warning, fontSize: 12, lineHeight: 17, marginTop: 4 },
  catalogLimitation: { color: colors.warning, fontSize: 12, lineHeight: 17, marginTop: 4 },
  card: { backgroundColor: colors.surface, padding: 15, borderRadius: radius.md, marginVertical: 7, borderWidth: 1, borderColor: colors.border },
  summaryCard: { backgroundColor: '#F5F8FF', padding: 15, borderRadius: radius.md, marginVertical: 8, borderWidth: 1, borderColor: '#E1E9FF' },
  heading: { color: colors.text, fontSize: 17, fontWeight: '800' },
  small: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  summaryValue: { color: colors.primary, fontWeight: '800', fontSize: 25, marginTop: 8 },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 },
  dayButton: { backgroundColor: colors.softBlue, borderRadius: radius.pill, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  dayArrow: { color: colors.primary, fontSize: 26, lineHeight: 29 },
  dayLabel: { alignItems: 'center', flex: 1 },
  dayHeading: { color: colors.text, fontWeight: '800', fontSize: 15, textTransform: 'capitalize' },
  weekStrip: { gap: 7, paddingVertical: 7, paddingBottom: 12 },
  dateChip: { width: 48, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  dateChipSelected: { backgroundColor: '#DDEAFF', borderColor: colors.primary },
  dateDay: { color: colors.muted, fontSize: 11, textTransform: 'capitalize' },
  dateNumber: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 2 },
  dateTextSelected: { color: colors.primaryDark },
  searchRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: colors.surface, marginTop: 8, color: colors.text, fontSize: 14 },
  searchButton: { minHeight: 48, minWidth: 52, backgroundColor: colors.primary, paddingHorizontal: 13, justifyContent: 'center', alignItems: 'center', borderRadius: 11, marginTop: 8 },
  buttonText: { color: 'white', fontWeight: '800', fontSize: 14 },
  foodRow: { minHeight: 48, paddingVertical: 11, borderBottomColor: colors.border, borderBottomWidth: 1 },
  foodName: { color: colors.text, fontWeight: '800', fontSize: 15 },
  sourceText: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  selected: { marginTop: 14, paddingTop: 13, borderTopWidth: 1, borderTopColor: colors.border },
  mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.primaryDark, fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: 'white' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' },
  addButton: { minHeight: 48, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  cancelButton: { minHeight: 48, paddingHorizontal: 9, paddingVertical: 10, justifyContent: 'center' },
  textButton: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  link: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  deleteText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
  spinner: { marginTop: 12 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18, marginTop: 8 },
  success: { color: colors.success, fontWeight: '700', fontSize: 13, marginTop: 8 },
  errorCard: { backgroundColor: '#FFF1F0', padding: 12, borderRadius: radius.md, marginVertical: 8 },
  retryButton: { minHeight: 48, alignSelf: 'flex-start', backgroundColor: colors.primary, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, marginTop: 8 },
  entryHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
});
