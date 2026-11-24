import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing } from '../../theme/tokens';

export default function OptionListModal({ visible, title, options, selectedValue, onSelect, onClose }) {
  function selectOption(value) {
    onSelect?.(value);
    onClose?.();
  }

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Đóng danh sách lựa chọn" style={styles.backdrop} onPress={onClose} />
      <View accessibilityViewIsModal style={styles.sheet}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Đóng" style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>×</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.options} keyboardShouldPersistTaps="handled">
          {options.map(option => {
            const selected = option.value === selectedValue;
            return <TouchableOpacity
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={option.accessibilityLabel || option.label}
              accessibilityState={{ selected }}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => selectOption(option.value)}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
              {selected && <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.check}>✓</Text>}
            </TouchableOpacity>;
          })}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(24,32,49,0.38)' },
  sheet: { maxHeight: '72%', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  heading: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '800' },
  closeButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.muted, fontSize: 30, lineHeight: 34 },
  options: { flexGrow: 0 },
  option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, borderRadius: radius.sm },
  optionSelected: { backgroundColor: colors.softBlue },
  optionText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  optionTextSelected: { color: colors.primaryDark, fontWeight: '800' },
  check: { color: colors.primary, fontSize: 17, fontWeight: '900' },
});
