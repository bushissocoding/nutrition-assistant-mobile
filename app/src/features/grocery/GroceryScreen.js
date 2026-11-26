import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import { colors, radius } from '../../theme/tokens';

const supportedUnits = new Set(['g', 'kg', 'ml', 'l', 'piece', 'bunch', 'pack']);

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

export default function GroceryScreen({ savedPlanId = null, onBack }) {
  const [pantryItems, setPantryItems] = useState([]);
  const [pantryTotal, setPantryTotal] = useState(0);
  const [pantryOffset, setPantryOffset] = useState(0);
  const [pantryPageLoading, setPantryPageLoading] = useState(false);
  const [pantryDraft, setPantryDraft] = useState('');
  const [pantryError, setPantryError] = useState('');
  const [addingPantryItem, setAddingPantryItem] = useState(false);
  const [pantryResults, setPantryResults] = useState([]);
  const [pantrySearchLoading, setPantrySearchLoading] = useState(false);
  const [pantryLoading, setPantryLoading] = useState(true);
  const [pantryAmount, setPantryAmount] = useState('100');
  const [pantryRetry, setPantryRetry] = useState(null);
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
  const lowStockCount = pantryItems.filter(item => item.amount <= (item.unit === 'g' ? 100 : 1)).length;

  async function changePantryAmount(item, delta) {
    const amount = Math.max(0.001, Number((item.amount + delta).toFixed(3)));
    setPendingItemId(item.id);
    setPantryError('');
    try {
      const result = await api.updateMyPantryItem(item.id, { amount, unit: item.unit });
      if (!result?.item || result.item.id !== item.id) throw new Error('Máy chủ chưa xác nhận thay đổi trong kho.');
      setPantryItems(current => current.map(row => row.id === item.id ? result.item : row));
      setPantryRetry(null);
    } catch (error) { setPantryError(error?.message || 'Không cập nhật được kho nhà.'); setPantryRetry(() => () => changePantryAmount(item, delta)); }
    finally { setPendingItemId(''); }
  }

  async function searchPantryFood() {
    const query = pantryDraft.trim();
    if (query.length < 2) { setPantryError('Nhập ít nhất 2 ký tự để tra cứu.'); return; }
    setPantrySearchLoading(true); setPantryError(''); setPantryResults([]);
    try {
      const result = await api.searchSourcedFoods(query, { page: 1 });
      setPantryResults(Array.isArray(result?.items) ? result.items : []);
    } catch (error) { setPantryError(error?.message || 'Tra cứu đang chờ dữ liệu được cấp quyền sử dụng.'); }
    finally { setPantrySearchLoading(false); }
  }

  async function addPantryItem(food) {
    const amount = Number(pantryAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) { setPantryError('Nhập số lượng từ trên 0 đến 1.000.000 g.'); return; }
    setPantryError(''); setPendingItemId(`new:${food.id}`);
    try {
      const wasFullyLoaded = pantryOffset >= pantryTotal;
      const result = await api.createMyPantryItem({ foodId: food.id, amount, unit: 'g' });
      if (!result?.item || result.item.foodId !== food.id) throw new Error('Máy chủ chưa xác nhận nguyên liệu trong kho.');
      setPantryItems(current => [...current.filter(item => item.foodId !== result.item.foodId), result.item]);
      if (!result.replayed) {
        setPantryTotal(current => current + 1);
        if (wasFullyLoaded) setPantryOffset(current => current + 1);
      }
      setPantryDraft(''); setPantryResults([]); setAddingPantryItem(false); setPantryRetry(null);
    } catch (error) {
      try {
        const latest = await api.getMyPantryItemByFoodId(food.id);
        const saved = latest?.item;
        if (saved) { setPantryItems(current => [...current.filter(item => item.foodId !== food.id), saved]); setPantryResults([]); setAddingPantryItem(false); setPantryRetry(null); return; }
      } catch { /* Keep the original mutation error visible. */ }
      setPantryError(error?.message || 'Không thêm được nguyên liệu vào kho.');
      setPantryRetry(() => () => addPantryItem(food));
    }
    finally { setPendingItemId(''); }
  }

  async function addCustomPantryItem() {
    const customName = pantryDraft.trim().replace(/\s+/g, ' ');
    const amount = Number(pantryAmount);
    if (!customName || customName.length > 100) { setPantryError('Tên nguyên liệu tự nhập phải dài từ 1 đến 100 ký tự.'); return; }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) { setPantryError('Nhập số lượng từ trên 0 đến 1.000.000.'); return; }
    setPantryError(''); setPendingItemId(`custom:${customName}`);
    try {
      const wasFullyLoaded = pantryOffset >= pantryTotal;
      const result = await api.createMyPantryItem({ customName, amount, unit: 'g' });
      if (!result?.item || result.item.name !== customName || result.item.source?.id !== 'USER-ENTERED') {
        throw new Error('Máy chủ chưa xác nhận nguyên liệu tự nhập.');
      }
      setPantryItems(current => [...current.filter(item => item.foodId !== result.item.foodId), result.item]);
      if (!result.replayed) {
        setPantryTotal(current => current + 1);
        if (wasFullyLoaded) setPantryOffset(current => current + 1);
      }
      setPantryDraft(''); setPantryResults([]); setAddingPantryItem(false); setPantryRetry(null);
    } catch (error) {
      setPantryError(error?.message || 'Không thêm được nguyên liệu tự nhập vào kho.');
      setPantryRetry(() => addCustomPantryItem);
    } finally { setPendingItemId(''); }
  }

  async function addShoppingItem(food, reconcileFirst = false) {
    if (!list) { setMutationError('Tạo danh sách từ thực đơn trước khi thêm nguyên liệu.'); return; }
    const amount = Number(pantryAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) { setMutationError('Nhập số lượng từ trên 0 đến 1.000.000 g.'); return; }
    setPendingItemId(`shopping:${food.id}`); clearMutationFeedback();
    try {
      let latest = list;
      if (reconcileFirst) latest = readListResponse(await api.getMyShoppingList());
      const existing = latest?.items?.find(item => item.foodId === food.id);
      if (existing) {
        setList(latest);
        setSuccessMessage(`${food.name} đã có trong danh sách.`);
        return;
      }
      const result = await api.createMyShoppingListItem({ foodId: food.id, amount, unit: 'g' });
      const item = result?.item;
      if (!item || typeof item.id !== 'string' || item.foodId !== food.id) throw new Error('Máy chủ chưa xác nhận nguyên liệu trong danh sách.');
      setList(current => current && ({ ...current, items: [...current.items.filter(row => row.foodId !== food.id), item] }));
      setSuccessMessage('Đã thêm nguyên liệu vào danh sách.');
    } catch (error) {
      setMutationError(error?.message || 'Không thêm được nguyên liệu vào danh sách.');
      setRetryAction(() => () => addShoppingItem(food, true));
    } finally { setPendingItemId(''); }
  }

  async function removePantryItem(item, reconcileFirst = false) {
    setPendingItemId(item.id); setPantryError('');
    try {
      if (reconcileFirst) {
        try {
          const latest = await api.getMyPantryItem(item.id);
          if (latest?.item) setPantryItems(current => current.map(row => row.id === item.id ? latest.item : row));
        } catch (error) {
          if (error?.status !== 404) throw error;
          setPantryItems(current => current.filter(row => row.id !== item.id));
          setPantryTotal(current => Math.max(0, current - 1));
          setPantryRetry(null);
          return;
        }
      }
      await api.deleteMyPantryItem(item.id);
      setPantryItems(current => current.filter(row => row.id !== item.id));
      setPantryTotal(current => Math.max(0, current - 1));
      setPantryRetry(null);
    } catch (error) { setPantryError(error?.message || 'Không xóa được nguyên liệu khỏi kho.'); setPantryRetry(() => () => removePantryItem(item, true)); }
    finally { setPendingItemId(''); }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    Promise.allSettled([api.getMyShoppingList(), api.getMyPantry({ limit: 100, offset: 0 })]).then(([listResult, pantryResult]) => {
      if (!active) return;
      if (listResult.status === 'fulfilled') setList(readListResponse(listResult.value));
      else setLoadError(listResult.reason?.message || 'Không tải được danh sách đi chợ.');
      if (pantryResult.status === 'fulfilled' && Array.isArray(pantryResult.value?.items)) {
        setPantryItems(pantryResult.value.items);
        setPantryOffset(pantryResult.value.items.length);
        setPantryTotal(Number.isSafeInteger(pantryResult.value.pagination?.total) ? pantryResult.value.pagination.total : pantryResult.value.items.length);
      }
      else setPantryError(pantryResult.status === 'rejected' ? pantryResult.reason?.message || 'Không tải được kho nhà.' : 'Máy chủ trả về kho nhà không đúng định dạng.');
    }).finally(() => {
      if (active) { setLoading(false); setPantryLoading(false); }
    });
    return () => { active = false; };
  }, [loadVersion]);

  async function loadMorePantry() {
    if (pantryPageLoading || pantryOffset >= pantryTotal) return;
    setPantryPageLoading(true); setPantryError('');
    try {
      const result = await api.getMyPantry({ limit: 100, offset: pantryOffset });
      if (!Array.isArray(result?.items) || !Number.isSafeInteger(result.pagination?.total)) throw new Error('Máy chủ trả về trang kho nhà không đúng định dạng.');
      setPantryItems(current => [...current, ...result.items.filter(item => !current.some(existing => existing.id === item.id))]);
      setPantryOffset(pantryOffset + result.items.length);
      setPantryTotal(result.pagination.total);
    } catch (error) {
      setPantryError(error?.message || 'Không tải thêm được kho nhà.');
      setPantryRetry(() => loadMorePantry);
    } finally { setPantryPageLoading(false); }
  }

  function clearMutationFeedback() {
    setMutationError('');
    setSuccessMessage('');
    setRetryAction(null);
  }

  async function submitCreate() {
    if (!createIntent.current) createIntent.current = { savedPlanId, key: createIntentKey() };
    const intent = createIntent.current;
    setCreating(true);
    clearMutationFeedback();
    try {
      const result = await api.createMyShoppingList(intent.savedPlanId, intent.key);
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
    if (loading || loadError || !savedPlanId || creating || pendingItemId) return;
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
      const result = await api.updateMyShoppingListItem(itemId, patch);
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
        latestList = readListResponse(await api.getMyShoppingList());
        if (!latestList?.items?.some(item => item.id === itemId)) {
          setList(latestList);
          setSuccessMessage('Mục đã được xóa khỏi danh sách.');
          return;
        }
      }
      await api.deleteMyShoppingListItem(itemId);
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
    <Text style={styles.disclaimer}>Kho nhà và danh sách đi chợ thuộc tài khoản hiện tại. Tra cứu thực phẩm đang tạm dừng trong khi chờ xác nhận quyền sử dụng dữ liệu của Viện Dinh dưỡng; tên tự nhập chỉ dùng để theo dõi kho.</Text>

    <View style={styles.pantrySummary}>
      <View style={styles.pantrySummaryTop}><View><Text style={styles.pantrySummaryTitle}>Tóm tắt kho</Text><Text style={styles.pantrySummaryCopy}>{pantryItems.length}/{pantryTotal} món đã tải · {lowStockCount} món sắp hết trong phần đã tải</Text></View><View style={styles.needBadge}><Text style={styles.needBadgeText}>{lowStockCount} cần mua</Text></View></View>
      <View style={styles.pantryProgress}><View style={[styles.pantryProgressFill, { width: `${pantryItems.length ? Math.max(12, (pantryItems.length - lowStockCount) / pantryItems.length * 100) : 0}%` }]} /></View>
    </View>
    <View style={styles.sectionHeader}><Text accessibilityRole="header" style={styles.section}>Nguyên liệu trong nhà</Text><Text style={styles.sectionCount}>{pantryItems.length}/{pantryTotal}</Text></View>
    {pantryLoading ? <View style={styles.loadingRow}><ActivityIndicator color={colors.primary} /><Text style={styles.stateText}>Đang tải kho nhà…</Text></View> : !pantryItems.length ? <View style={styles.empty}><Text style={styles.small}>Kho nhà chưa có nguyên liệu đã lưu.</Text></View> : <View style={styles.pantryList}>{pantryItems.map(item => <View key={item.id} style={styles.pantryRow}>
      <View style={styles.pantryState}><Text style={styles.pantryStateText}>{item.amount <= 1 ? '!' : '✓'}</Text></View>
      <View style={styles.pantryCopy}><Text style={styles.pantryName}>{item.name}</Text><Text style={styles.pantryHint}>{item.source?.id === 'USER-ENTERED' ? 'Tự nhập · không dùng trong tính toán dinh dưỡng' : `${item.source?.label || item.source?.id || 'Snapshot nguồn'} · ${item.source?.recordId || item.foodId} · Đã lưu trong tài khoản`}</Text></View>
      <View style={styles.amountControls}><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Giảm ${item.name}`} disabled={pendingItemId === item.id} style={styles.amountButton} onPress={() => changePantryAmount(item, item.unit === 'g' ? -100 : -1)}><Text style={styles.amountButtonText}>−</Text></TouchableOpacity><Text accessibilityLabel={`${item.name}, ${item.amount} ${item.unit}`} style={styles.amountValue}>{item.amount} {item.unit}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Tăng ${item.name}`} disabled={pendingItemId === item.id} style={styles.amountButton} onPress={() => changePantryAmount(item, item.unit === 'g' ? 100 : 1)}><Text style={styles.amountButtonText}>＋</Text></TouchableOpacity></View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Xóa ${item.name} khỏi kho`} style={styles.smallButton} disabled={pendingItemId === item.id} onPress={() => Alert.alert('Xóa nguyên liệu?', `Xóa ${item.name} khỏi kho nhà?`, [{ text: 'Hủy', style: 'cancel' }, { text: 'Xóa', style: 'destructive', onPress: () => removePantryItem(item) }])}><Text style={styles.deleteText}>×</Text></TouchableOpacity>
    </View>)}</View>}
    {pantryOffset < pantryTotal && <TouchableOpacity accessibilityRole="button" style={styles.secondary} disabled={pantryPageLoading} onPress={loadMorePantry}>{pantryPageLoading ? <ActivityIndicator color="white" /> : <Text style={styles.secondaryText}>Tải thêm nguyên liệu ({pantryOffset}/{pantryTotal})</Text>}</TouchableOpacity>}
    {addingPantryItem && <View>
      <View style={styles.addPantryRow}><TextInput accessibilityLabel="Tìm nguyên liệu hoặc nhập tên tự do" value={pantryDraft} onChangeText={value => { setPantryDraft(value); setPantryResults([]); }} placeholder="Tra cứu chờ cấp quyền · hoặc nhập tên tự do" style={styles.pantryInput} returnKeyType="search" maxLength={100} /><TouchableOpacity accessibilityRole="button" style={styles.addPantryButton} disabled={pantrySearchLoading} onPress={searchPantryFood}>{pantrySearchLoading ? <ActivityIndicator color="white" /> : <Text style={styles.addPantryButtonText}>Tra cứu</Text>}</TouchableOpacity></View>
      <View style={styles.addPantryRow}><TextInput accessibilityLabel="Số lượng trong kho (g)" value={pantryAmount} onChangeText={setPantryAmount} keyboardType="decimal-pad" placeholder="Số gram" style={styles.pantryInput} /><Text style={styles.small}>g</Text></View>
      <TouchableOpacity accessibilityRole="button" style={styles.smallButton} disabled={!!pendingItemId || !pantryDraft.trim()} onPress={addCustomPantryItem}><Text style={styles.actionText}>Thêm tên tự nhập vào kho</Text></TouchableOpacity>
      <Text style={styles.pantryHint}>Nguyên liệu tự nhập chỉ để theo dõi kho; không được dùng để tính dinh dưỡng.</Text>
      {pantryResults.map(food => <View key={food.id} style={styles.searchResult}><View><Text style={styles.pantryName}>{food.name}</Text><Text style={styles.pantryHint}>{food.source?.label || food.source?.id} #{food.source?.recordId}</Text></View><View style={styles.actions}><TouchableOpacity accessibilityRole="button" style={styles.smallButton} disabled={!!pendingItemId} onPress={() => addPantryItem(food)}><Text style={styles.actionText}>Thêm vào kho</Text></TouchableOpacity>{list && <TouchableOpacity accessibilityRole="button" style={styles.smallButton} disabled={!!pendingItemId} onPress={() => addShoppingItem(food)}><Text style={styles.actionText}>Thêm vào danh sách</Text></TouchableOpacity>}</View></View>)}
    </View>}
    {!!pantryError && <Text accessibilityRole="alert" style={styles.error}>{pantryError}</Text>}
    {!!pantryRetry && <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={pantryRetry}><Text style={styles.secondaryText}>Thử lưu kho lại</Text></TouchableOpacity>}
    <View style={styles.actions}><TouchableOpacity accessibilityRole="button" style={styles.smallButton} onPress={() => { setAddingPantryItem(value => !value); setPantryError(''); }}><Text style={styles.actionText}>{addingPantryItem ? 'Đóng tìm kiếm' : 'Thêm nguyên liệu'}</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" style={styles.smallButton} onPress={() => setLoadVersion(value => value + 1)}><Text style={styles.actionText}>Đồng bộ</Text></TouchableOpacity></View>

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

          {!!savedPlanId && <TouchableOpacity style={styles.primary} disabled={creating || !!pendingItemId} onPress={createFromPlan}>
            {creating ? <ActivityIndicator color="white" /> : <Text style={styles.primaryText}>Tạo danh sách từ thực đơn đã lưu</Text>}
          </TouchableOpacity>}

          <View style={styles.sectionHeader}><Text accessibilityRole="header" style={styles.section}>Danh sách hiện tại</Text>{!!list?.items?.length && <Text style={styles.sectionCount}>{itemCount} món</Text>}</View>
          {!list ? <View style={styles.empty}><View style={styles.emptyIcon}><Text style={styles.emptyGlyph}>＋</Text></View><Text style={styles.heading}>Chưa có danh sách đi chợ đã lưu.</Text>{!!savedPlanId && <Text style={styles.small}>Tạo danh sách từ thực đơn đã lưu trong tài khoản.</Text>}</View>
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
  searchResult: { padding: 12, borderRadius: 12, backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, marginTop: 8 },
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
