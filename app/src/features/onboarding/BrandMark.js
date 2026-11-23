import { StyleSheet, View } from 'react-native';

export default function BrandMark({ size = 150, color = '#245CFF', cutout = '#FFFFFF' }) {
  return <View
    accessibilityLabel="Biểu tượng Clinikare"
    accessibilityRole="image"
    style={[styles.mark, { width: size, height: size }]}
  >
    <View style={[styles.vertical, { width: size * 0.34, height: size, borderRadius: size * 0.15, backgroundColor: color }]} />
    <View style={[styles.horizontal, { width: size, height: size * 0.34, borderRadius: size * 0.15, backgroundColor: color }]} />
    {[0.25, 0.42, 0.59].map(left => <View
      key={left}
      style={[styles.ribbon, {
        left: size * left,
        width: size * 0.075,
        height: size * 0.47,
        borderRadius: size * 0.04,
        backgroundColor: cutout,
      }]}
    />)}
  </View>;
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  vertical: { position: 'absolute' },
  horizontal: { position: 'absolute' },
  ribbon: { position: 'absolute', top: '26%', transform: [{ rotate: '-34deg' }] },
});
