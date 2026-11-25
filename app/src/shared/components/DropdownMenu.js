import { useEffect, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing } from '../../theme/tokens';

const ROW_HEIGHT = 52;
const MAX_VISIBLE_OPTIONS = 5;
const SCREEN_GUTTER = 12;

export function getDropdownPlacement(anchor, windowSize, optionCount) {
  const availableWidth = Math.max(1, windowSize.width - SCREEN_GUTTER * 2);
  const width = Math.min(Math.max(190, anchor?.width || 0), availableWidth);
  const left = anchor
    ? Math.max(SCREEN_GUTTER, Math.min(anchor.x, windowSize.width - width - SCREEN_GUTTER))
    : SCREEN_GUTTER;
  const menuHeight = Math.min(optionCount, MAX_VISIBLE_OPTIONS) * ROW_HEIGHT;
  if (!anchor) return { top: SCREEN_GUTTER, left, width };

  const belowTop = anchor.y + anchor.height + 6;
  const bottomEdge = windowSize.height - SCREEN_GUTTER;
  const top = belowTop + menuHeight <= bottomEdge
    ? belowTop
    : Math.max(SCREEN_GUTTER, anchor.y - menuHeight - 6);
  return { top, left, width };
}

export function getDropdownScrollOffset(selectedIndex) {
  return Math.max(0, selectedIndex - Math.floor(MAX_VISIBLE_OPTIONS / 2)) * ROW_HEIGHT;
}

export default function DropdownMenu({ visible, title, options, selectedValue, anchorRef, onSelect, onClose }) {
  const [placement, setPlacement] = useState(null);
  const optionsRef = useRef(null);

  useEffect(() => {
    if (!visible) {
      setPlacement(null);
      return undefined;
    }

    let active = true;
    const windowSize = Dimensions.get('window');
    const updatePlacement = anchor => {
      if (active) setPlacement(getDropdownPlacement(anchor, windowSize, options.length));
    };
    const measureInWindow = anchorRef?.current?.measureInWindow;
    if (typeof measureInWindow !== 'function') {
      updatePlacement(null);
    } else {
      measureInWindow.call(anchorRef.current, (x, y, width, height) => updatePlacement({ x, y, width, height }));
    }

    return () => { active = false; };
  }, [anchorRef, options.length, visible]);

  function selectOption(value) {
    onSelect?.(value);
    onClose?.();
  }

  function scrollToSelected() {
    const selectedIndex = options.findIndex(option => option.value === selectedValue);
    if (selectedIndex > 0) optionsRef.current?.scrollTo({ y: getDropdownScrollOffset(selectedIndex), animated: false });
  }

  const menuStyle = placement || { top: SCREEN_GUTTER, left: SCREEN_GUTTER, width: 220 };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable testID="dropdown-backdrop" accessibilityRole="button" accessibilityLabel="Đóng danh sách lựa chọn" style={styles.backdrop} onPress={onClose} />
      <View testID="dropdown-menu" accessibilityRole="menu" accessibilityLabel={title} style={[styles.menu, menuStyle]}>
        <ScrollView
          ref={optionsRef}
          testID="dropdown-options"
          style={styles.options}
          showsVerticalScrollIndicator={options.length > MAX_VISIBLE_OPTIONS}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToSelected}
        >
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
  overlay: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  menu: { position: 'absolute', maxHeight: ROW_HEIGHT * MAX_VISIBLE_OPTIONS, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, elevation: 12, shadowColor: '#1D2940', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  options: { flexGrow: 0, maxHeight: ROW_HEIGHT * MAX_VISIBLE_OPTIONS },
  option: { minHeight: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md },
  optionSelected: { backgroundColor: colors.softBlue },
  optionText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  optionTextSelected: { color: colors.primaryDark, fontWeight: '800' },
  check: { color: colors.primary, fontSize: 17, fontWeight: '900' },
});
