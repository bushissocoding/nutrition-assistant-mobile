import { StyleSheet, View } from 'react-native';
import { colors } from '../../theme/tokens';

export default function ProgressBar({ value = 0, color = colors.primary, label = 'Tiến độ' }) {
  const normalizedValue = Math.min(100, Math.max(0, Number(value) || 0));
  const width = `${normalizedValue}%`;
  return <View
    accessibilityRole="progressbar"
    accessibilityLabel={label}
    accessibilityValue={{ min: 0, max: 100, now: Math.round(normalizedValue) }}
    style={styles.track}
  ><View style={[styles.fill, { width, backgroundColor: color }]} /></View>;
}

const styles = StyleSheet.create({
  track: { height: 9, backgroundColor: '#D9D9D9', borderRadius: 8, overflow: 'hidden', marginTop: 8 },
  fill: { height: '100%', borderRadius: 8 },
});
