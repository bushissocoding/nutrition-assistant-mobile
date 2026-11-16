import { ScrollView, StyleSheet, Text, View } from 'react-native';
import ProgressBar from '../../shared/components/ProgressBar';
import { colors, radius } from '../../theme/tokens';

export default function DashboardScreen({ diary = [], plan }) {
  const totals = diary.reduce((sum, item) => {
    for (const key of Object.keys(sum)) sum[key] += Number(item.nutrients?.[key] || 0);
    return sum;
  }, { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0, sodiumMg: 0 });
  const goals = { energyKcal: 1800, proteinG: 90, carbohydrateG: 220, fatG: 65, fiberG: 25 };
  const metrics = [
    { label: 'Proteins', amount: `${Math.round(totals.proteinG)} / ${goals.proteinG} g`, progress: totals.proteinG / goals.proteinG * 100 },
    { label: 'Carbohydrates', amount: `${Math.round(totals.carbohydrateG)} / ${goals.carbohydrateG} g`, progress: totals.carbohydrateG / goals.carbohydrateG * 100 },
    { label: 'Fats', amount: `${Math.round(totals.fatG)} / ${goals.fatG} g`, progress: totals.fatG / goals.fatG * 100 },
    { label: 'Fiber', amount: `${Math.round(totals.fiberG)} / ${goals.fiberG} g`, progress: totals.fiberG / goals.fiberG * 100 },
    { label: 'Sodium', amount: `${Math.round(totals.sodiumMg)} / 2,000 mg`, progress: totals.sodiumMg / 2000 * 100 },
  ];
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.title}>Lịch Ăn Hằng Ngày</Text>
    <Text style={styles.heading}>Meal schedule</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mealRow}>
      {(plan?.plan || []).map((meal, index) =>
        <View key={`${meal.slot}-${index}`} style={styles.mealCard}>
          <Text style={styles.mealImage}>{['🍳', '🥗', '🍲', '🍎'][index] || '🍽️'}</Text><Text style={styles.mealTitle}>{meal.slot}</Text>
          <Text style={styles.caption}>{meal.name}</Text><Text style={styles.detail}>Calories　　{meal.nutrients.energyKcal} kcal</Text><Text style={styles.detail}>Chi phí　　 {meal.estimatedCostVnd.toLocaleString('vi-VN')}đ</Text>
        </View>)}
    </ScrollView>
    {!plan?.plan?.length && <Text style={styles.empty}>Chưa có thực đơn. Tạo thực đơn để xem lịch ăn trong ngày.</Text>}
    <View style={styles.card}><Text style={styles.cardTitle}>Calories Tracker</Text><Text style={styles.label}>Total Calories · {Math.round(totals.energyKcal)} / {goals.energyKcal} kcal</Text><ProgressBar value={totals.energyKcal / goals.energyKcal * 100} />
      <Text style={[styles.cardTitle, { marginTop: 18 }]}>Macronutrient tracking</Text>
      {metrics.slice(1).map(metric => <View key={metric.label} style={styles.metric}><Text style={styles.label}>{metric.label} · {metric.amount}</Text><ProgressBar value={metric.progress} /></View>)}
      <Text style={styles.note}>{diary.length ? `Tổng hợp từ ${diary.length} món đã ghi. Mục tiêu chỉ để minh họa, chưa phải chỉ định y tế.` : 'Chưa có dữ liệu nhật ký. Hãy ghi nhận bữa ăn để bắt đầu theo dõi. Mục tiêu chỉ để minh họa.'}</Text>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, content: { paddingTop: 26, paddingBottom: 110 },
  title: { color: colors.primary, textAlign: 'center', fontSize: 22, fontWeight: '800', marginBottom: 18 },
  heading: { marginHorizontal: 18, color: '#302323', fontSize: 17, fontWeight: '800' },
  mealRow: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 20, gap: 16 },
  empty: { color: colors.muted, fontSize: 12, marginHorizontal: 18, marginBottom: 12 },
  mealCard: { width: 180, minHeight: 210, alignItems: 'center', padding: 12, borderRadius: radius.md, backgroundColor: colors.surface, elevation: 3, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 5 },
  mealImage: { width: 116, height: 116, textAlign: 'center', textAlignVertical: 'center', overflow: 'hidden', borderRadius: 58, backgroundColor: '#F3EDE6', fontSize: 62, marginBottom: 6 },
  mealTitle: { fontWeight: '800', color: '#302323', marginTop: 2 }, caption: { color: colors.muted, fontSize: 11, marginTop: 5 }, detail: { alignSelf: 'stretch', fontSize: 10, color: '#514B4B', marginTop: 7 },
  card: { marginHorizontal: 19, marginTop: 4, padding: 15, minHeight: 370, borderWidth: 1, borderColor: '#C9C9C9', borderRadius: 11, backgroundColor: colors.surface, elevation: 2 },
  cardTitle: { color: '#302323', fontSize: 13, fontWeight: '800' }, label: { color: '#514B4B', fontSize: 10, marginTop: 14 }, metric: { marginTop: 2 }, note: { color: colors.muted, fontSize: 11, marginTop: 24, lineHeight: 16 },
});
