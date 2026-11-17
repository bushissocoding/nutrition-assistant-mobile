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
      timeZone: entry.timeZone,
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
    setEntries([]);
    setTotals(EMPTY_TOTALS);
    setSuccessMessage('');
    setMutationError('');
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.title}>Nhật ký bữa ăn</Text>
    <Text style={styles.disclaimer}>Đây là nhật ký demo lưu trên máy chủ. Chỉ dùng dữ liệu tổng hợp, không nhập thông tin sức khỏe thật. Dinh dưỡng là ước tính, không phải tư vấn y tế.</Text>

    <View style={styles.dayRow}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ngày trước" style={styles.dayButton} onPress={() => changeDate(-1)}><Text style={styles.buttonText}>‹</Text></TouchableOpacity>
      <View style={styles.dayLabel}><Text style={styles.heading}>{selectedDate}</Text><Text style={styles.small}>{timeZone}</Text></View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ngày sau" style={styles.dayButton} onPress={() => changeDate(1)}><Text style={styles.buttonText}>›</Text></TouchableOpacity>
    </View>

    <View style={styles.card}>
      <Text style={styles.heading}>{editingId ? 'Sửa bản ghi' : 'Thêm món ăn'}</Text>
      <View style={styles.searchRow}>
        <TextInput value={query} onChangeText={setQuery} placeholder="Tìm thực phẩm..." style={[styles.input, { flex: 1 }]} onSubmitEditing={searchFoods} returnKeyType="search" />
        <TouchableOpacity style={styles.searchButton} onPress={searchFoods} disabled={searchLoading}><Text style={styles.buttonText}>Tìm</Text></TouchableOpacity>
      </View>
      {searchLoading && <ActivityIndicator accessibilityLabel="Đang tìm thực phẩm" color={colors.primary} style={styles.spinner} />}
      {!!searchError && <View><Text accessibilityRole="alert" style={styles.error}>{searchError}</Text><TouchableOpacity onPress={searchFoods}><Text style={styles.link}>Thử tìm lại</Text></TouchableOpacity></View>}
      {!searchLoading && !searchError && foods.length === 0 && query.trim() !== '' && <Text style={styles.small}>Không tìm thấy thực phẩm phù hợp.</Text>}
      {foods.map(food => <TouchableOpacity key={food.id} style={styles.foodRow} onPress={() => setSelectedFood(food)}><Text style={styles.foodName}>{selectedFood?.id === food.id ? '✓  ' : ''}{food.name}</Text>{Number.isFinite(food.per100g?.energyKcal) && <Text style={styles.small}>Mỗi 100 g · {food.per100g.energyKcal} kcal</Text>}</TouchableOpacity>)}

      {selectedFood && <View style={styles.selected}>
        <Text style={styles.heading}>{selectedFood.name}</Text>
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
      <Text style={styles.summaryValue}>{totals.energyKcal || 0} kcal</Text>
      <Text style={styles.small}>Đạm {totals.proteinG || 0} g · Carb {totals.carbohydrateG || 0} g · Béo {totals.fatG || 0} g</Text>
      <Text style={styles.small}>Chất xơ {totals.fiberG || 0} g · Natri {totals.sodiumMg || 0} mg</Text>
    </View>

    <Text style={styles.heading}>Các món đã ghi ({entries.length})</Text>
    {listLoading && <View accessibilityRole="progressbar" style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.small}>Đang tải nhật ký…</Text></View>}
    {!!listError && <View style={styles.errorCard}><Text accessibilityRole="alert" style={styles.error}>{listError}</Text><TouchableOpacity style={styles.retryButton} onPress={() => setReloadCount(value => value + 1)}><Text style={styles.buttonText}>Thử tải lại</Text></TouchableOpacity></View>}
    {!listLoading && !listError && entries.map(entry => <View key={entry.id} style={styles.card}>
      <View style={styles.entryHeader}><Text style={styles.foodName}>{entry.foodName}</Text><Text style={styles.small}>{formatEntryTime(entry)} · {formatMealType(entry.mealType)}</Text></View>
      <Text style={styles.small}>{entry.portion.amount} g · {entry.nutrients.energyKcal} kcal</Text>
      <Text style={styles.small}>Đạm {entry.nutrients.proteinG} g · Carb {entry.nutrients.carbohydrateG} g · Natri {entry.nutrients.sodiumMg} mg</Text>
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
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 18, paddingBottom: 110 },
  title: { color: colors.primary, fontSize: 23, fontWeight: '800' },
  disclaimer: { backgroundColor: '#FFF5DE', color: colors.warning, padding: 11, borderRadius: 10, fontSize: 11, lineHeight: 16, marginVertical: 10 },
  card: { backgroundColor: 'white', padding: 15, borderRadius: radius.md, marginVertical: 7, elevation: 1 },
  summaryCard: { backgroundColor: 'white', padding: 15, borderRadius: radius.md, marginVertical: 7, borderWidth: 1, borderColor: colors.border },
  heading: { color: colors.text, fontSize: 15, fontWeight: '800' },
  small: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  summaryValue: { color: colors.primary, fontWeight: '800', fontSize: 19, marginTop: 8 },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 },
  dayButton: { backgroundColor: colors.primary, borderRadius: radius.pill, width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  dayLabel: { alignItems: 'center' },
  searchRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 11, backgroundColor: 'white', marginTop: 8, color: colors.text },
  searchButton: { backgroundColor: colors.primary, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 10 },
  buttonText: { color: 'white', fontWeight: '800' },
  foodRow: { paddingVertical: 10, borderBottomColor: colors.border, borderBottomWidth: 1 },
  foodName: { color: colors.text, fontWeight: '700', fontSize: 14 },
  selected: { marginTop: 14 },
  mealRow: { flexDirection: 'row', gap: 7, marginTop: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.softBlue },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  chipTextActive: { color: 'white' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  addButton: { minHeight: 44, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  cancelButton: { paddingHorizontal: 8, paddingVertical: 10 },
  textButton: { padding: 7 },
  link: { color: colors.primary, fontWeight: '700' },
  deleteText: { color: colors.danger, fontWeight: '700' },
  spinner: { marginTop: 12 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18, marginTop: 8 },
  success: { color: colors.primary, fontWeight: '700', fontSize: 12, marginTop: 8 },
  errorCard: { backgroundColor: '#FFF0F0', padding: 12, borderRadius: 12, marginVertical: 8 },
  retryButton: { alignSelf: 'flex-start', backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, marginTop: 8 },
  entryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
