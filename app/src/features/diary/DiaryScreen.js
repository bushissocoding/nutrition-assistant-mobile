import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import { colors, radius } from '../../theme/tokens';

export default function DiaryScreen({ diary, onAddMeal }) {
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState([]);
  const [selected, setSelected] = useState(null);
  const [grams, setGrams] = useState('100');
  const [meal, setMeal] = useState('Bữa trưa');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function search() {
    setLoading(true); setError(''); setSelected(null);
    try { const result = await api.getFoods(query.trim()); setFoods(result.items || []); }
    catch (searchError) { setError(searchError.message || 'Không kết nối được API.'); }
    finally { setLoading(false); }
  }

  async function add() {
    if (!selected || !(Number(grams) > 0)) return;
    setLoading(true); setError('');
    try {
      const result = await api.calculateNutrition([{ foodId: selected.id, grams: Number(grams) }]);
      onAddMeal({ foodId: selected.id, name: selected.name, grams: Number(grams), meal, nutrients: result.items[0].nutrients });
      setSelected(null);
    } catch (addError) { setError(addError.message || 'Không thể tính dinh dưỡng.'); }
    finally { setLoading(false); }
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.title}>Nhật ký bữa ăn</Text><Text style={styles.disclaimer}>Ghi món thủ công; chưa hỗ trợ nhận diện ảnh. Dữ liệu thực phẩm là dữ liệu mẫu tham khảo.</Text>
    <View style={styles.card}><Text style={styles.heading}>Thêm món ăn</Text><View style={styles.searchRow}><TextInput value={query} onChangeText={setQuery} placeholder="Tìm thực phẩm..." style={[styles.input, { flex: 1 }]} onSubmitEditing={search} /><TouchableOpacity style={styles.searchButton} onPress={search}><Text style={styles.buttonText}>Tìm</Text></TouchableOpacity></View>
      {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 10 }} />}
      {foods.map(food => <TouchableOpacity key={food.id} style={styles.foodRow} onPress={() => setSelected(food)}><Text style={styles.foodName}>{selected?.id === food.id ? '✓  ' : ''}{food.name}</Text><Text style={styles.small}>Mỗi 100g · {food.per100g.energyKcal} kcal</Text></TouchableOpacity>)}
      {selected && <View style={styles.selected}><Text style={styles.heading}>{selected.name}</Text><Text style={styles.small}>Khối lượng (gram)</Text><TextInput value={grams} onChangeText={setGrams} keyboardType="numeric" style={styles.input} /><Text style={styles.small}>Bữa ăn</Text><View style={styles.mealRow}>{['Sáng', 'Trưa', 'Tối', 'Phụ'].map((label, index) => <TouchableOpacity key={label} onPress={() => setMeal(['Bữa sáng', 'Bữa trưa', 'Bữa tối', 'Bữa phụ'][index])} style={[styles.chip, meal === ['Bữa sáng', 'Bữa trưa', 'Bữa tối', 'Bữa phụ'][index] && styles.chipActive]}><Text style={[styles.chipText, meal === ['Bữa sáng', 'Bữa trưa', 'Bữa tối', 'Bữa phụ'][index] && { color: 'white' }]}>{label}</Text></TouchableOpacity>)}</View><TouchableOpacity style={styles.addButton} onPress={add}><Text style={styles.buttonText}>Xác nhận thêm vào {meal}</Text></TouchableOpacity></View>}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
    <Text style={styles.heading}>Các món đã ghi ({diary.length})</Text>
    {diary.map((item, index) => <View key={`${item.foodId}-${index}`} style={styles.card}><Text style={styles.foodName}>{item.name}</Text><Text style={styles.small}>{item.meal} · {item.grams} g · {item.nutrients.energyKcal} kcal</Text><Text style={styles.small}>Đạm {item.nutrients.proteinG} g · Carb {item.nutrients.carbohydrateG} g · Natri {item.nutrients.sodiumMg} mg</Text></View>)}
    {!diary.length && <Text style={styles.small}>Chưa có món ăn được ghi.</Text>}
  </ScrollView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.canvas }, content: { padding: 18, paddingBottom: 110 }, title: { color: colors.primary, fontSize: 23, fontWeight: '800' }, disclaimer: { backgroundColor: '#FFF5DE', color: colors.warning, padding: 11, borderRadius: 10, fontSize: 11, lineHeight: 16, marginVertical: 10 }, card: { backgroundColor: 'white', padding: 15, borderRadius: radius.md, marginVertical: 7, elevation: 1 }, heading: { color: colors.text, fontSize: 15, fontWeight: '800', marginVertical: 4 }, searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 }, input: { backgroundColor: '#F5F7FB', borderRadius: 10, padding: 11, marginTop: 5, color: colors.text }, searchButton: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 }, buttonText: { color: 'white', fontWeight: '800', fontSize: 12 }, foodRow: { borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 11 }, foodName: { color: colors.text, fontWeight: '700', fontSize: 13 }, small: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 4 }, selected: { marginTop: 15, paddingTop: 10, borderTopWidth: 1, borderColor: colors.border }, mealRow: { flexDirection: 'row', gap: 6, marginTop: 8 }, chip: { backgroundColor: colors.softBlue, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 }, chipActive: { backgroundColor: colors.primary }, chipText: { color: colors.primary, fontSize: 11, fontWeight: '700' }, addButton: { backgroundColor: colors.primary, padding: 13, alignItems: 'center', borderRadius: 24, marginTop: 14 }, error: { color: colors.danger, marginTop: 10 } });
