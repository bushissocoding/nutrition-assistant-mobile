import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import { colors, radius } from '../../theme/tokens';

const supportedUnits = new Set(['g', 'kg', 'ml', 'l', 'piece', 'bunch', 'pack']);
const initialPantry = [
  { id: 'pantry-chicken', name: 'Ức gà phi lê', amount: 300, unit: 'g' },
  { id: 'pantry-eggs', name: 'Trứng gà ta', amount: 4, unit: 'quả' },
  { id: 'pantry-tomatoes', name: 'Cà chua bi', amount: 200, unit: 'g' },
];

function createIntentKey() {
  return `grocery-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function readListResponse(result) {
  if (!result || !Object.prototype.hasOwnProperty.call(result, 'list')) {
    throw new Error('Máy chủ trả về danh sách không đúng định dạng. Hãy tải lại.');
  }
  if (result.list === null) return null;
  if (!result.list || typeof result.list.id !== 'string' || !Array.isArray(result.list.items)
    || !result.list.items.every(item => item && typeof item.id === 'string' && typeof item.name === 'string'
      && Number.isFinite(item.amount) && typeof item.unit === 'string' && typeof item.purchased === 'boolean')) {
    throw new Error('Máy chủ trả về danh sách không đúng định dạng. Hãy tải lại.');
  }
  return result.list;
}

function readItemResponse(result, expectedId) {
  const item = result?.item;
  if (!item || typeof item.id !== 'string' || item.id !== expectedId || typeof item.name !== 'string'
    || !Number.isFinite(item.amount) || typeof item.unit !== 'string' || typeof item.purchased !== 'boolean') {
    throw new Error('Máy chủ trả về mục chưa lưu đúng định dạng. Hãy thử lại.');
  }
  return item;
}

function createPayloadFromPlan(sourceItems) {
  return {
    items: sourceItems.map(item => ({ foodId: item.foodId, amount: item.grams, unit: 'g' })),
  };
}

export default function GroceryScreen({ sourceItems = [], onBack }) {
  const [pantryItems, setPantryItems] = useState(initialPantry);
  const [pantryDraft, setPantryDraft] = useState('');
  const [pantryError, setPantryError] = useState('');
  const [addingPantryItem, setAddingPantryItem] = useState(false);
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadVersion, setLoadVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [pendingItemId, setPendingItemId] = useState('');
  const [drafts, setDrafts] = useState({});
  const [mutationError, setMutationError] = useState('');
  const [retryAction, setRetryAction] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const createIntent = useRef(null);
  const itemCount = list?.items?.length || 0;
  const purchasedCount = list?.items?.filter(item => item.purchased).length || 0;
  const purchaseProgress = itemCount ? purchasedCount / itemCount * 100 : 0;
  const lowStockCount = pantryItems.filter(item => item.amount <= 1).length;

  function changePantryAmount(itemId, amount) {
    setPantryItems(current => current.map(item => item.id === itemId ? { ...item, amount: Math.max(0, item.amount + amount) } : item));
  }

  function addPantryItem() {
    const name = pantryDraft.trim();
    if (!name) { setPantryError('Nhập tên nguyên liệu trước khi thêm.'); return; }
    if (name.length > 80) { setPantryError('Tên nguyên liệu không vượt quá 80 ký tự.'); return; }
    setPantryItems(current => [...current, { id: `pantry-${Date.now()}`, name, amount: 1, unit: 'phần' }]);
    setPantryDraft('');
    setPantryError('');
    setAddingPantryItem(false);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    api.getCurrentShoppingList().then(result => {
      if (active) setList(readListResponse(result));
    }).catch(error => {
      if (active) setLoadError(error?.message || 'Không tải được danh sách đi chợ.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [loadVersion]);

  function clearMutationFeedback() {
    setMutationError('');
    setSuccessMessage('');
    setRetryAction(null);
  }

  async function submitCreate() {
    if (!createIntent.current) createIntent.current = { payload: createPayloadFromPlan(sourceItems), key: createIntentKey() };
    const intent = createIntent.current;
    setCreating(true);
    clearMutationFeedback();
    try {
      const result = await api.createShoppingList(intent.payload, intent.key);
      setList(readListResponse(result));
      setDrafts({});
      createIntent.current = null;
      setSuccessMessage('Đã lưu danh sách đi chợ.');
    } catch (error) {
      setMutationError(error?.message || 'Không lưu được danh sách. Hãy thử lại.');
      setRetryAction(() => submitCreate);
    } finally {
      setCreating(false);
    }
  }

  function createFromPlan() {
    if (loading || loadError || !sourceItems.length || creating || pendingItemId) return;
    if (!list) {
      submitCreate();
      return;
    }
    Alert.alert(
      'Thay danh sách đi chợ?',
      'Danh sách mới sẽ thay số lượng đã chỉnh và trạng thái đã mua hiện tại.',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Thay danh sách', style: 'destructive', onPress: submitCreate },
      ],
    );
  }

  async function saveItemPatch(itemId, patch) {
    setPendingItemId(itemId);
    clearMutationFeedback();
    try {
      const result = await api.updateShoppingListItem(itemId, patch);
      const updatedItem = readItemResponse(result, itemId);
      setList(current => current && ({
        ...current,
        updatedAt: updatedItem.updatedAt || current.updatedAt,
        items: current.items.map(item => item.id === itemId ? updatedItem : item),
      }));
      setDrafts(current => ({ ...current, [itemId]: { amount: String(updatedItem.amount), unit: updatedItem.unit } }));
      setSuccessMessage('Đã lưu thay đổi.');
    } catch (error) {
      setMutationError(error?.message || 'Không lưu được thay đổi. Hãy thử lại.');
      setRetryAction(() => () => saveItemPatch(itemId, patch));
    } finally {
      setPendingItemId('');
    }
  }

  async function saveDraft(item) {
    const draft = drafts[item.id] || { amount: String(item.amount), unit: item.unit };
    const amount = Number(draft.amount);
    const unit = draft.unit.trim();
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000 || !supportedUnits.has(unit)) {
      setMutationError('Nhập số lượng từ 0 đến 1.000.000 và đơn vị được hỗ trợ.');
      setRetryAction(null);
      return;
    }
    await saveItemPatch(item.id, { amount, unit });
  }

  async function deleteItem(itemId, reconcileFirst = false) {
    setPendingItemId(itemId);
    clearMutationFeedback();
    try {
      let latestList = null;
      if (reconcileFirst) {
        latestList = readListResponse(await api.getCurrentShoppingList());
        if (!latestList?.items?.some(item => item.id === itemId)) {
          setList(latestList);
          setSuccessMessage('Mục đã được xóa khỏi danh sách.');
          return;
        }
      }
      await api.deleteShoppingListItem(itemId);
      setList(current => {
        const source = latestList || current;
        return source && ({ ...source, items: source.items.filter(item => item.id !== itemId) });
      });
      setSuccessMessage('Đã xóa nguyên liệu.');
    } catch (error) {
      setMutationError(error?.message || 'Không xóa được nguyên liệu. Hãy thử lại.');
      setRetryAction(() => () => deleteItem(itemId, true));
    } finally {
      setPendingItemId('');
    }
  }

  function confirmDelete(item) {
    Alert.alert('Xóa nguyên liệu?', `Xóa ${item.name} khỏi danh sách đi chợ?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => deleteItem(item.id) },
    ]);
  }

  function updateDraft(item, field, value) {
    clearMutationFeedback();
    setDrafts(current => ({
      ...current,
      [item.id]: { amount: String(item.amount), unit: item.unit, ...(current[item.id] || {}), [field]: value },
    }));
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.backButton} onPress={() => onBack?.()}><Text style={styles.backGlyph}>‹</Text></TouchableOpacity>
      <View style={styles.headerCopy}><Text accessibilityRole="header" style={styles.title}>Nguyên liệu</Text><Text style={styles.subtitle}>Kho nhà & danh sách đi chợ</Text></View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Thêm nguyên liệu" style={styles.addHeaderButton} onPress={() => { setAddingPantryItem(value => !value); setPantryError(''); }}><Text style={styles.addHeaderText}>{addingPantryItem ? '×' : '+'}</Text></TouchableOpacity>
    </View>
    <Text style={styles.disclaimer}>Kho nhà mẫu chỉ giữ trong phiên này. Danh sách đi chợ được lưu riêng trong API demo.</Text>

    <View style={styles.pantrySummary}>
      <View style={styles.pantrySummaryTop}><View><Text style={styles.pantrySummaryTitle}>Tóm tắt kho</Text><Text style={styles.pantrySummaryCopy}>{pantryItems.length} món có sẵn · {lowStockCount} món sắp hết</Text></View><View style={styles.needBadge}><Text style={styles.needBadgeText}>{lowStockCount} cần mua</Text></View></View>
      <View style={styles.pantryProgress}><View style={[styles.pantryProgressFill, { width: `${pantryItems.length ? Math.max(12, (pantryItems.length - lowStockCount) / pantryItems.length * 100) : 0}%` }]} /></View>
    </View>
    <View style={styles.sectionHeader}><Text accessibilityRole="header" style={styles.section}>Nguyên liệu trong nhà</Text><Text style={styles.sectionCount}>Xem {pantryItems.length} món</Text></View>
    <View style={styles.pantryList}>{pantryItems.map(item => <View key={item.id} style={styles.pantryRow}>
      <View style={styles.pantryState}><Text style={styles.pantryStateText}>{item.amount <= 1 ? '!' : '✓'}</Text></View>
      <View style={styles.pantryCopy}><Text style={styles.pantryName}>{item.name}</Text><Text style={styles.pantryHint}>{item.amount <= 1 ? 'Sắp hết' : 'Có sẵn trong kho'}</Text></View>
      <View style={styles.amountControls}><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Giảm ${item.name}`} style={styles.amountButton} onPress={() => changePantryAmount(item.id, item.unit === 'g' ? -100 : -1)}><Text style={styles.amountButtonText}>−</Text></TouchableOpacity><Text accessibilityLabel={`${item.name}, ${item.amount} ${item.unit}`} style={styles.amountValue}>{item.amount} {item.unit}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Tăng ${item.name}`} style={styles.amountButton} onPress={() => changePantryAmount(item.id, item.unit === 'g' ? 100 : 1)}><Text style={styles.amountButtonText}>＋</Text></TouchableOpacity></View>
    </View>)}</View>
    {addingPantryItem && <View style={styles.addPantryRow}><TextInput accessibilityLabel="Tên nguyên liệu mới" value={pantryDraft} onChangeText={setPantryDraft} onSubmitEditing={addPantryItem} placeholder="Nhập tên nguyên liệu…" style={styles.pantryInput} returnKeyType="done" maxLength={80} /><TouchableOpacity accessibilityRole="button" style={styles.addPantryButton} onPress={addPantryItem}><Text style={styles.addPantryButtonText}>Thêm</Text></TouchableOpacity></View>}
    {!!pantryError && <Text accessibilityRole="alert" style={styles.error}>{pantryError}</Text>}
    <View style={styles.actions}><TouchableOpacity accessibilityRole="button" style={styles.smallButton} onPress={() => setAddingPantryItem(true)}><Text style={styles.actionText}>Thêm nguyên liệu</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" style={styles.smallButton} onPress={() => Alert.alert('Chia sẻ danh sách', 'Chia sẻ chưa được kết nối trong bản demo.')}><Text style={styles.actionText}>Chia sẻ</Text></TouchableOpacity></View>

    <Text style={styles.disclaimer}>Giá trị dinh dưỡng trong thực đơn chỉ là ước tính, không phải tư vấn y tế.</Text>

    {loading ? <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.stateText}>Đang tải danh sách đi chợ…</Text></View>
      : loadError ? <View style={styles.state}><Text style={styles.error}>{loadError}</Text><TouchableOpacity style={styles.secondary} onPress={() => setLoadVersion(value => value + 1)}><Text style={styles.secondaryText}>Thử tải lại</Text></TouchableOpacity></View>
        : <>
          <View style={styles.summary}>
            <View style={styles.summaryHeader}>
              <View><Text style={styles.heading}>Tiến độ đi chợ</Text><Text style={styles.small}>{purchasedCount} / {itemCount} món đã mua</Text></View>
              <View style={styles.countBadge}><Text style={styles.countText}>{itemCount - purchasedCount} còn lại</Text></View>
            </View>
            <View accessibilityRole="progressbar" accessibilityLabel="Tiến độ đi chợ" accessibilityValue={{ min: 0, max: 100, now: Math.round(purchaseProgress) }} style={styles.progressTrack}><View style={[styles.progressFill, { width: `${purchaseProgress}%` }]} /></View>
          </View>

          {!!sourceItems.length && <TouchableOpacity style={styles.primary} disabled={creating || !!pendingItemId} onPress={createFromPlan}>
            {creating ? <ActivityIndicator color="white" /> : <Text style={styles.primaryText}>Tạo danh sách từ thực đơn</Text>}
          </TouchableOpacity>}

          <View style={styles.sectionHeader}><Text accessibilityRole="header" style={styles.section}>Danh sách hiện tại</Text>{!!list?.items?.length && <Text style={styles.sectionCount}>{itemCount} món</Text>}</View>
          {!list ? <View style={styles.empty}><View style={styles.emptyIcon}><Text style={styles.emptyGlyph}>＋</Text></View><Text style={styles.heading}>Chưa có danh sách đi chợ đã lưu.</Text>{!!sourceItems.length && <Text style={styles.small}>Tạo danh sách từ thực đơn hiện tại để lưu các nguyên liệu cần mua.</Text>}</View>
            : list.items.length === 0 ? <View style={styles.empty}><Text style={styles.heading}>Danh sách hiện tại chưa có nguyên liệu.</Text></View>
              : <View style={styles.card}>{list.items.map(item => {
                const draft = drafts[item.id] || { amount: String(item.amount), unit: item.unit };
                const isPending = pendingItemId === item.id;
                return <View key={item.id} style={styles.row}>
                  <TouchableOpacity
                    accessibilityRole="checkbox"
                    accessibilityLabel={`${item.purchased ? 'Đánh dấu chưa mua' : 'Đánh dấu đã mua'} ${item.name}`}
                    accessibilityState={{ checked: item.purchased, disabled: isPending || creating }}
                    style={[styles.check, item.purchased && styles.checked]}
                    disabled={isPending || creating}
                    onPress={() => saveItemPatch(item.id, { purchased: !item.purchased })}
                  ><Text style={styles.checkText}>{item.purchased ? '✓' : ''}</Text></TouchableOpacity>
                  <View style={styles.itemContent}>
                    <Text style={[styles.name, item.purchased && styles.strike]}>{item.name}</Text>
                    <Text accessibilityLabel={`${item.name}, ${item.amount} ${item.unit}`} style={styles.savedAmount}>{item.amount} {item.unit}</Text>
                    <View style={styles.editRow}>
                      <TextInput
                        accessibilityLabel={`Số lượng ${item.name}`}
                        placeholder={`Số lượng ${item.name}`}
                        value={draft.amount}
                        onChangeText={value => updateDraft(item, 'amount', value)}
                        keyboardType="decimal-pad"
                        style={styles.inputAmount}
                        editable={!isPending && !creating}
                      />
                      <TextInput
                        accessibilityLabel={`Đơn vị ${item.name}`}
                        placeholder={`Đơn vị ${item.name}`}
                        value={draft.unit}
                        onChangeText={value => updateDraft(item, 'unit', value)}
                        autoCapitalize="none"
                        style={styles.inputUnit}
                        editable={!isPending && !creating}
                      />
                    </View>
                    <View style={styles.actions}>
                      <TouchableOpacity accessibilityRole="button" style={styles.smallButton} disabled={isPending || creating} onPress={() => saveDraft(item)}>
                        {isPending ? <ActivityIndicator color={colors.primary} /> : <Text accessibilityLabel={`Lưu thay đổi ${item.name}`} style={styles.actionText}>Lưu thay đổi {item.name}</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Xóa ${item.name}`} style={styles.smallButton} disabled={isPending || creating} onPress={() => confirmDelete(item)}>
                        <Text style={styles.deleteText}>Xóa {item.name}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>;
              })}</View>}
        </>}

    {!!mutationError && <Text accessibilityRole="alert" style={styles.error}>{mutationError}</Text>}
    {!!mutationError && !!retryAction && <TouchableOpacity style={styles.secondary} disabled={creating || !!pendingItemId} onPress={() => retryAction()}><Text style={styles.secondaryText}>Thử thao tác lại</Text></TouchableOpacity>}
    {!!successMessage && <Text accessibilityLiveRegion="polite" style={styles.success}>{successMessage}</Text>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 15, paddingTop: 8, paddingBottom: 124 },
  header: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 9 },
  backButton: { width: 37, height: 48, justifyContent: 'center' }, backGlyph: { color: colors.primary, fontSize: 30 },
  headerCopy: { flex: 1 }, title: { color: colors.text, fontWeight: '800', fontSize: 21 },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 1 },
  addHeaderButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, addHeaderText: { color: 'white', fontSize: 27, lineHeight: 29 },
  disclaimer: { color: colors.muted, fontSize: 14, lineHeight: 14, marginTop: 7 },
  pantrySummary: { backgroundColor: 'white', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#EBEEF4', marginTop: 10 }, pantrySummaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, pantrySummaryTitle: { color: colors.text, fontSize: 14, fontWeight: '900' }, pantrySummaryCopy: { color: colors.muted, fontSize: 14, marginTop: 4 }, needBadge: { backgroundColor: '#EEF3FF', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 14 }, needBadgeText: { color: colors.primary, fontSize: 14, fontWeight: '800' }, pantryProgress: { height: 7, borderRadius: 5, overflow: 'hidden', backgroundColor: '#E9EDF5', marginTop: 10 }, pantryProgressFill: { height: '100%', borderRadius: 5, backgroundColor: colors.primary },
  pantryList: { gap: 7 }, pantryRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 9, borderRadius: 13, borderWidth: 1, borderColor: '#EEF0F4', backgroundColor: 'white' }, pantryState: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7EEFF' }, pantryStateText: { color: colors.primary, fontSize: 19, fontWeight: '900' }, pantryCopy: { flex: 1, minWidth: 0 }, pantryName: { color: colors.text, fontSize: 14, fontWeight: '800' }, pantryHint: { color: colors.muted, fontSize: 12, lineHeight: 16, marginTop: 4 }, amountControls: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4, borderWidth: 1, borderColor: '#EAF0FF', borderRadius: 12 }, amountButton: { minWidth: 38, minHeight: 40, borderRadius: 10, backgroundColor: '#F1F5FF', alignItems: 'center', justifyContent: 'center' }, amountButtonText: { color: colors.text, fontSize: 19, fontWeight: '900' }, amountValue: { color: colors.text, fontSize: 12, fontWeight: '800', minWidth: 48, textAlign: 'center' },
  addPantryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }, pantryInput: { flex: 1, minHeight: 54, borderRadius: 12, paddingHorizontal: 12, backgroundColor: '#F1F5FF', color: colors.text, fontSize: 14 }, addPantryButton: { minHeight: 54, minWidth: 66, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.primary }, addPantryButtonText: { color: 'white', fontSize: 14, fontWeight: '800' },
  summary: { backgroundColor: colors.surface, padding: 15, borderRadius: radius.md, marginTop: 14, borderWidth: 1, borderColor: colors.border },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { color: colors.text, fontSize: 16, fontWeight: '800' },
  small: { color: colors.muted, fontSize: 14, lineHeight: 17, marginTop: 5 },
  countBadge: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.softBlue },
  countText: { color: colors.primaryDark, fontSize: 14, fontWeight: '800' },
  progressTrack: { height: 7, borderRadius: 8, backgroundColor: '#E5EBF6', overflow: 'hidden', marginTop: 12 },
  progressFill: { height: '100%', borderRadius: 8, backgroundColor: colors.primary },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 8 },
  section: { fontWeight: '800', color: colors.text, fontSize: 16 },
  sectionCount: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderBottomWidth: 1, borderBottomColor: '#F0F2F6', paddingVertical: 14 },
  check: { width: 48, height: 48, borderRadius: 11, backgroundColor: colors.softBlue, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  checked: { backgroundColor: colors.primary },
  checkText: { color: 'white', fontWeight: '800' },
  itemContent: { flex: 1, minWidth: 0 },
  name: { color: colors.text, fontWeight: '800', fontSize: 14 },
  strike: { textDecorationLine: 'line-through', color: colors.muted },
  savedAmount: { color: colors.primary, fontSize: 14, fontWeight: '700', marginTop: 3 },
  editRow: { flexDirection: 'row', gap: 7, marginTop: 8 },
  inputAmount: { flex: 1, minWidth: 70, minHeight: 54, backgroundColor: '#F5F7FB', borderRadius: 9, paddingHorizontal: 9, color: colors.text, fontSize: 13 },
  inputUnit: { width: 78, minHeight: 54, backgroundColor: '#F5F7FB', borderRadius: 9, paddingHorizontal: 9, color: colors.text, fontSize: 13 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 9 },
  smallButton: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 9, backgroundColor: '#EEF3FF', borderRadius: 12 },
  actionText: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  deleteText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
  state: { padding: 22, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginTop: 14 },
  stateText: { color: colors.muted, marginTop: 8, fontSize: 13 },
  empty: { alignItems: 'center', padding: 22, backgroundColor: '#F8FAFE', borderRadius: radius.md },
  emptyIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  emptyGlyph: { color: colors.primary, fontSize: 22 },
  primary: { minHeight: 54, borderRadius: radius.pill, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginTop: 12, paddingHorizontal: 16 },
  primaryText: { color: 'white', fontWeight: '800', fontSize: 14 },
  secondary: { minHeight: 54, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  secondaryText: { color: 'white', fontWeight: '800', fontSize: 13 },
  error: { color: colors.danger, marginTop: 7, fontSize: 14, lineHeight: 17 },
  success: { color: colors.success, marginTop: 10, fontSize: 13, fontWeight: '700' },
});
