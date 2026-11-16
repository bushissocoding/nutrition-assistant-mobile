import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';

const demoItems = [
  { foodId: 'rice-steamed', name: 'Cơm trắng', grams: 300 },
  { foodId: 'egg-boiled', name: 'Trứng gà luộc', grams: 100 },
  { foodId: 'cabbage', name: 'Bắp cải', grams: 200 },
];

export default function GroceryScreen({ items }) {
  const [checked, setChecked] = useState({});
  const grocery = items?.length ? items : demoItems;
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.title}>Nguyên liệu</Text><Text style={styles.subtitle}>Kho nhà & danh sách đi chợ</Text>
    <View style={styles.summary}><Text style={styles.heading}>Tóm tắt danh sách</Text><Text style={styles.small}>{grocery.length} nguyên liệu trong thực đơn hiện tại</Text></View>
    <Text style={styles.section}>Danh sách đi chợ</Text>
    <View style={styles.card}>{grocery.map((item, index) => <TouchableOpacity key={`${item.foodId || item.name}-${index}`} style={styles.row} onPress={() => setChecked({ ...checked, [index]: !checked[index] })}>
      <View style={[styles.check, checked[index] && styles.checked]}><Text style={styles.checkText}>{checked[index] ? '✓' : ''}</Text></View>
      <View style={{ flex: 1 }}><Text style={[styles.name, checked[index] && styles.strike]}>{item.name}</Text><Text style={styles.small}>Cần mua khoảng {item.grams} g</Text></View>
      <Text style={styles.amount}>{item.grams}g</Text>
    </TouchableOpacity>)}</View>
    {!items?.length && <Text style={styles.note}>Danh sách minh họa. Tạo thực đơn để nhận danh sách mua sắm được tính từ món ăn thực tế.</Text>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F9FD' }, content: { padding: 18, paddingBottom: 100 }, title: { color: colors.text, fontWeight: '800', fontSize: 22 }, subtitle: { color: colors.muted, fontSize: 12, marginTop: 4 }, summary: { backgroundColor: 'white', padding: 16, borderRadius: radius.md, marginTop: 18, elevation: 1 }, heading: { color: colors.text, fontSize: 15, fontWeight: '800' }, small: { color: colors.muted, fontSize: 11, marginTop: 5 }, section: { fontWeight: '800', color: colors.text, marginTop: 22, marginBottom: 8 }, card: { backgroundColor: 'white', borderRadius: radius.md, paddingHorizontal: 12 }, row: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#F0F2F6' }, check: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.softBlue, justifyContent: 'center', alignItems: 'center' }, checked: { backgroundColor: colors.primary }, checkText: { color: 'white', fontWeight: '800' }, name: { color: colors.text, fontWeight: '700', fontSize: 13 }, strike: { textDecorationLine: 'line-through', color: colors.muted }, amount: { color: colors.primary, fontSize: 12, fontWeight: '800' }, note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 14 },
});
