import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, ScrollView, TextInput, Modal, Alert } from 'react-native';
import { useDashboardData } from '../../src/hooks/useDashboardData';
import { theme } from '../../src/theme';
import { MotiView } from 'moti';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, X, TrendingUp, Plus, Check } from 'lucide-react-native';
import { LineChart } from 'react-native-gifted-charts';
import { router } from 'expo-router';

const filters = [
  { id: 'all', label: 'All Items' },
  { id: 'urgent', label: '🔴 Urgent' },
  { id: 'soon', label: '🟡 Soon' },
  { id: 'healthy', label: '🟢 Healthy' },
  { id: 'dead', label: '🐢 Dead Stock' },
  { id: 'growing', label: '📈 Growing' },
];

export default function ReorderScreen() {
  const { calculations, loading, addToOrder, orderItems } = useDashboardData();
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedChartItem, setSelectedChartItem] = useState<any>(null);
  const [orderQuantities, setOrderQuantities] = useState<Record<string, string>>({});
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.blue} />
      </View>
    );
  }

  let items = calculations;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter((c: any) => c.productName.toLowerCase().includes(q));
  }
  switch (filter) {
    case 'urgent': items = items.filter((c: any) => c.status === 'urgent' || c.currentStock === 0); break;
    case 'soon': items = items.filter((c: any) => c.status === 'soon'); break;
    case 'healthy': items = items.filter((c: any) => c.status === 'healthy'); break;
    case 'dead': items = items.filter((c: any) => c.status === 'dead'); break;
    case 'growing': items = items.filter((c: any) => c.growthRate > 10 && c.totalQty > 0); break;
  }
  
  items = items.sort((a: any, b: any) => {
    const o: any = { urgent: 0, soon: 1, dead: 2, healthy: 3 };
    return (o[a.status] ?? 9) - (o[b.status] ?? 9) || b.priorityScore - a.priorityScore;
  });

  const renderItem = ({ item, index }: { item: any, index: number }) => {
    const whyText = item.growthRate > 10 ? '📈 Demand ↑' : item.daysSinceLastSale > 90 ? '🐢 Dead' : (item.stockoutRisk && item.growthRate <= 10) ? '⚠️ Risk' : (item.orderQty > 0 && item.growthRate <= 10 && item.daysSinceLastSale <= 90) ? '📦 Restock' : '';
    const isAdded = orderItems.some((oi) => oi.productId === item.productId);
    const confidenceColor = item.confidenceLevel === 'High' ? theme.colors.green : item.confidenceLevel === 'Medium' ? theme.colors.yellow : theme.colors.textSecondary;
    const confidenceBg = item.confidenceLevel === 'High' ? theme.colors.greenBg : item.confidenceLevel === 'Medium' ? theme.colors.yellowBg : theme.colors.border;

    return (
      <TouchableOpacity onPress={() => setSelectedItem(item)} activeOpacity={0.8}>
        <MotiView
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 250, delay: Math.min(index * 30, 300) }}
          style={styles.itemCard}
        >
          <View style={styles.itemHeader}>
            <Text style={styles.itemName}>{item.productName}</Text>
            <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
              <View style={[styles.statusBadge, { backgroundColor: confidenceBg }]}>
                <Text style={[styles.statusText, { color: confidenceColor }]}>
                  {item.confidenceLevel === 'High' ? '🟢' : item.confidenceLevel === 'Medium' ? '🟡' : '⚪'} {item.confidenceLevel}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: item.status === 'urgent' ? theme.colors.redBg : item.status === 'soon' ? theme.colors.yellowBg : theme.colors.greenBg }]}>
                <Text style={[styles.statusText, { color: item.status === 'urgent' ? theme.colors.red : item.status === 'soon' ? theme.colors.yellow : theme.colors.green }]}>{item.statusLabel}</Text>
              </View>
            </View>
          </View>

          {/* Stockout date warning */}
          {item.stockoutDate && item.stockCoverage !== 999 && item.stockCoverage <= 14 && item.currentStock > 0 && (
            <View style={styles.stockoutWarningRow}>
              <Text style={styles.stockoutWarningText}>⚡ Stockout on {item.stockoutDate} ({Math.round(item.stockCoverage)}d left)</Text>
            </View>
          )}

          {/* Lost sales warning */}
          {item.lostSalesEstimate > 0 && (
            <View style={styles.lostSalesRow}>
              <Text style={styles.lostSalesText}>🚨 Lost Sales Est: ~{item.lostSalesEstimate} units (stock = 0)</Text>
            </View>
          )}
          
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Stock</Text>
              <Text style={[styles.statValue, { color: item.currentStock === 0 ? theme.colors.red : theme.colors.text }]}>
                {item.currentStock} {item.currentStock === 0 ? '🚫' : ''}
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Last 30d</Text>
              <Text style={styles.statValue}>{item.last30}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Need Order</Text>
              <Text style={[styles.statValue, { color: item.orderQty > 50 ? theme.colors.red : item.orderQty > 20 ? theme.colors.yellow : theme.colors.green }]}>
                {item.orderQty} <Text style={{ fontSize: 10, color: theme.colors.textSecondary, fontFamily: 'Inter_500Medium' }}>(AI: {item.aiOrderQty})</Text>
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Why</Text>
              <Text style={[styles.statValue, { fontSize: 13, color: theme.colors.textSecondary }]}>
                {whyText || '-'}
              </Text>
            </View>
          </View>

          <View style={styles.salesRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Total Revenue</Text>
              <Text style={[styles.salesValue, { color: theme.colors.blue }]}>Rs. {(item.revenue / 1000).toFixed(1)}k</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Total Profit</Text>
              <Text style={[styles.salesValue, { color: theme.colors.green }]}>Rs. {(item.profit / 1000).toFixed(1)}k</Text>
            </View>
          </View>

          <View style={styles.orderActionRow}>
            <Text style={styles.orderActionLabel}>Order Qty:</Text>
            {editingQtyId === item.productId ? (
              <TextInput
                style={styles.orderInput}
                inputMode="numeric"
                autoFocus={true}
                placeholder={String(item.orderQty > 0 ? item.orderQty : 0)}
                placeholderTextColor={theme.colors.textSecondary}
                value={orderQuantities[item.productId] !== undefined ? orderQuantities[item.productId] : String(item.orderQty > 0 ? item.orderQty : '')}
                onChangeText={(text) => {
                  const cleaned = text.replace(/[^0-9]/g, '');
                  setOrderQuantities(prev => ({ ...prev, [item.productId]: cleaned }));
                }}
                onBlur={() => {
                  setEditingQtyId(null);
                  if (orderQuantities[item.productId] === '') {
                    setOrderQuantities(prev => {
                      const next = { ...prev };
                      delete next[item.productId];
                      return next;
                    });
                  }
                }}
                onSubmitEditing={() => {
                  setEditingQtyId(null);
                  if (orderQuantities[item.productId] === '') {
                    setOrderQuantities(prev => {
                      const next = { ...prev };
                      delete next[item.productId];
                      return next;
                    });
                  }
                }}
              />
            ) : (
              <TouchableOpacity
                style={styles.qtyValueBtn}
                onPress={() => {
                  setEditingQtyId(item.productId);
                  setOrderQuantities(prev => ({ ...prev, [item.productId]: '' }));
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.qtyValueText}>
                  {orderQuantities[item.productId] !== undefined ? (orderQuantities[item.productId] || '0') : String(item.orderQty > 0 ? item.orderQty : '0')}
                </Text>
                <Text style={styles.qtyEditHintText}> ✎</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.plusBtn,
                isAdded && { backgroundColor: theme.colors.green }
              ]}
              activeOpacity={0.7}
              onPress={() => {
                const enteredText = orderQuantities[item.productId];
                const defaultQty = item.orderQty > 0 ? item.orderQty : 0;
                const qty = enteredText !== undefined ? (parseInt(enteredText, 10) || 0) : defaultQty;
                if (qty <= 0) {
                  Alert.alert('Invalid Quantity', 'Please enter a quantity greater than 0');
                  return;
                }
                addToOrder(item, qty);
              }}
            >
              {isAdded ? (
                <Check size={16} color="#fff" />
              ) : (
                <Plus size={16} color="#fff" />
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.chartIconBtn} 
              onPress={() => setSelectedChartItem(item)}
              activeOpacity={0.7}
            >
              <TrendingUp size={16} color={theme.colors.blue} />
            </TouchableOpacity>
          </View>
        </MotiView>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Reorder <Text style={styles.countText}>— {items.length} items</Text></Text>
      </View>

      <View style={styles.searchContainer}>
        <Search size={18} color={theme.colors.textSecondary} />
        <TextInput 
          style={styles.searchInput}
          placeholder="Search item..."
          placeholderTextColor={theme.colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View style={styles.filtersWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {filters.map(f => (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterChip, filter === f.id && styles.filterChipActive]}
              onPress={() => setFilter(f.id)}
            >
              <Text style={[styles.filterText, filter === f.id && styles.filterTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={items}
        keyExtractor={item => item.productId}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />

      <Modal visible={!!selectedItem} transparent animationType="slide">
        {selectedItem && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setSelectedItem(null)} style={[styles.closeBtn, { marginRight: 12 }]}>
                  <X size={24} color={theme.colors.textSecondary} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>{selectedItem.productName}</Text>
                  <Text style={styles.modalSubtitle}>ABC: {selectedItem.abcClass} ● Sold: {selectedItem.totalQty} ● Rev: Rs.{(selectedItem.revenue / 1000).toFixed(0)}k ● Last Cost: Rs.{selectedItem.lastPurchaseCost.toFixed(2)}</Text>
                </View>
              </View>

              <ScrollView style={styles.modalScroll}>
                <View style={styles.recBox}>
                  <View style={styles.recItem}>
                    <Text style={styles.recLabel}>Stock</Text>
                    <Text style={[styles.recVal, { color: selectedItem.currentStock === 0 ? theme.colors.red : selectedItem.currentStock <= selectedItem.lowStockQty ? theme.colors.yellow : theme.colors.green }]}>{selectedItem.currentStock}</Text>
                  </View>
                  <View style={styles.recItem}>
                    <Text style={styles.recLabel}>Need Order</Text>
                    <Text style={[styles.recVal, { color: theme.colors.blue, fontSize: 22 }]}>{selectedItem.orderQty}</Text>
                  </View>
                  <View style={styles.recItem}>
                    <Text style={styles.recLabel}>AI Need Order</Text>
                    <Text style={[styles.recVal, { color: theme.colors.green, fontSize: 22 }]}>{selectedItem.aiOrderQty}</Text>
                  </View>
                  <View style={styles.recItem}>
                    <Text style={styles.recLabel}>Status</Text>
                    <Text style={[styles.recVal, { fontSize: 14, color: theme.colors.text }]}>{selectedItem.statusLabel}</Text>
                  </View>
                  <View style={{ width: '100%', marginTop: 8 }}>
                    <Text style={styles.recDetails}>Last 30d: {selectedItem.last30} · Route avg: {selectedItem.routeAvgAll} · {selectedItem.growthRate>0?'+':''}{selectedItem.growthRate}% · {selectedItem.routeCoverage} routes · {selectedItem.trendScore}</Text>
                  </View>
                </View>

                <View style={styles.metricGrid}>
                  {[
                    ['Total Qty', selectedItem.totalQty, 'all time'], 
                    ['Daily Avg', selectedItem.dailyAvg.toFixed(1), 'per day'], 
                    ['Monthly Avg', selectedItem.monthlyAvg, 'last months'],
                    ['Last 7 Days', selectedItem.last7, 'recent'], 
                    ['Last 30 Days', selectedItem.last30, ''], 
                    ['Last 90 Days', selectedItem.last90, ''],
                    ['Route Avg', selectedItem.routeAvgAll, selectedItem.routeCoverage+' routes'], 
                    ['Last 3 Visits', selectedItem.last3RouteAvg, 'avg'],
                    ['Growth Rate', selectedItem.growthRate+'%', selectedItem.growthRate>0?'📈 Rising':selectedItem.growthRate<0?'📉':'→ Stable'],
                    ['Frequency', selectedItem.frequency+'%', ''], 
                    ['Customer Coverage', selectedItem.customerCoverage, ''], 
                    ['Route Coverage', selectedItem.routeCoverage, 'routes'],
                    ['Days Since Sale', selectedItem.daysSinceLastSale+'d', selectedItem.daysSinceLastSale>90?'🐢':selectedItem.daysSinceLastSale>30?'⚠️':'✅'],
                    ['Lead Time Demand', selectedItem.leadTimeDemand, '7 days'], 
                    ['Safety Stock', selectedItem.safetyStock, '20%'], 
                    ['Reorder Point', selectedItem.reorderPoint, ''],
                    ['Stock Coverage', selectedItem.stockCoverage===999?'∞':selectedItem.stockCoverage+'d', ''], 
                    ['Revenue', 'Rs.'+(selectedItem.revenue/1000).toFixed(1)+'k', ''],
                    ['Last Purchase Cost', 'Rs.'+selectedItem.lastPurchaseCost.toFixed(2), 'per unit'],
                    ['Profit', 'Rs.'+(selectedItem.profit/1000).toFixed(1)+'k', selectedItem.revenue?'Margin '+((selectedItem.profit/selectedItem.revenue)*100).toFixed(1)+'%':''],
                    ['Stock Value', 'Rs.'+(selectedItem.stockValue/1000).toFixed(1)+'k', ''], 
                    ['Turnover', selectedItem.stockTurnover+'x', ''],
                    ['Seasonal Index', selectedItem.seasonalIndex.toFixed(2), selectedItem.seasonalIndex>1.2?'📈':selectedItem.seasonalIndex<0.8?'📉':'Normal'],
                    ['Next Month', selectedItem.nextMonthForecast, 'forecast'], 
                    ['AI Next Month', selectedItem.aiNextMonthForecast, 'AI forecast'],
                    ['NM Score', selectedItem.smartScore+'/100', selectedItem.smartScore>70?'🌟':selectedItem.smartScore>40?'⭐':''],
                    ['Health', selectedItem.healthScore+'/100', selectedItem.healthScore>70?'✅':selectedItem.healthScore>40?'⚠️':'🔴'],
                    ['Priority', selectedItem.priorityScore, 'rank'], 
                    ['Purchase Rec', selectedItem.purchaseRec, 'forecast+safety-stock'],
                    ['AI Purchase Rec', selectedItem.aiPurchaseRec, 'AI forecast+safety'],
                    ['Confidence', selectedItem.confidenceLevel, selectedItem.confidenceLevel === 'High' ? '🟢 High' : selectedItem.confidenceLevel === 'Medium' ? '🟡 Medium' : '⚪ Low'],
                    ['Stockout Date', selectedItem.stockoutDate || 'N/A', selectedItem.stockCoverage !== 999 ? Math.round(selectedItem.stockCoverage)+'d left' : 'Infinite'],
                    ['Lost Sales Est', selectedItem.lostSalesEstimate > 0 ? '~'+selectedItem.lostSalesEstimate : '0', selectedItem.lostSalesEstimate > 0 ? '🚨 Est. missed units' : 'OK'],
                  ].map((m: any, i) => (
                    <View key={i} style={styles.metricItem}>
                      <Text style={styles.metricLabel}>{m[0]}</Text>
                      <Text style={styles.metricVal}>{m[1]}</Text>
                      <Text style={styles.metricSub}>{m[2]}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>

      <Modal visible={!!selectedChartItem} transparent animationType="slide">
        {selectedChartItem && (
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { height: '65%' }]}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setSelectedChartItem(null)} style={[styles.closeBtn, { marginRight: 12 }]}>
                  <X size={24} color={theme.colors.textSecondary} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle} numberOfLines={1}>{selectedChartItem.productName}</Text>
                  <Text style={styles.modalSubtitle}>📊 Monthly Sales Qty (Last 12 Months)</Text>
                </View>
              </View>

              <ScrollView style={{ padding: 20 }}>
                {selectedChartItem.monthlyHistory && selectedChartItem.monthlyHistory.some((h: any) => h.qty > 0) ? (
                  <View style={styles.chartWrapper}>
                    <LineChart
                      data={selectedChartItem.monthlyHistory.map((h: any) => {
                        const dateObj = new Date(h.month + '-01');
                        const monthStr = dateObj.toLocaleString('en-US', { month: 'short' });
                        const yearStr = dateObj.getFullYear().toString().substring(2);
                        return {
                          value: h.qty,
                          label: `${monthStr} '${yearStr}`,
                          qty: h.qty,
                        };
                      })}
                      color={theme.colors.blue}
                      thickness={3}
                      dataPointsColor={theme.colors.blue}
                      pointerConfig={{
                        pointerStripColor: 'rgba(37, 99, 235, 0.2)',
                        pointerStripWidth: 2,
                        pointerColor: theme.colors.blue,
                        radius: 8,
                        pointerLabelWidth: 120,
                        pointerLabelHeight: 60,
                        activatePointersOnLongPress: true,
                        activatePointersDelay: 50,
                        autoAdjustPointerLabelPosition: true,
                        pointerLabelComponent: (items: any) => {
                          const item = items[0];
                          return (
                            <View style={{
                              height: 50,
                              width: 120,
                              justifyContent: 'center',
                              backgroundColor: theme.colors.card,
                              borderRadius: 8,
                              padding: 8,
                              borderWidth: 1,
                              borderColor: theme.colors.border,
                              ...theme.shadows.sm,
                              marginLeft: -15
                            }}>
                              <Text style={{ color: theme.colors.textSecondary, fontSize: 10, fontFamily: 'Inter_600SemiBold', marginBottom: 2 }}>{item.label}</Text>
                              <Text style={{ color: theme.colors.blue, fontSize: 13, fontFamily: 'Inter_700Bold' }}>{item.qty} units</Text>
                            </View>
                          );
                        },
                      }}
                      hideRules
                      hideYAxisText={false}
                      yAxisTextStyle={{ color: theme.colors.textSecondary, fontSize: 10 }}
                      xAxisLabelTextStyle={{ color: theme.colors.textSecondary, fontSize: 10 }}
                      yAxisLabelSuffix=" u"
                      spacing={32}
                      width={280}
                      height={180}
                      curved
                      isAnimated
                    />
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No sales history available for this product</Text>
                  </View>
                )}
                
                <View style={styles.historyTable}>
                  <Text style={styles.tableTitle}>Sales History Breakdown</Text>
                  <View style={styles.historyTableHeader}>
                    <Text style={styles.historyTh}>Month</Text>
                    <Text style={[styles.historyTh, { textAlign: 'right' }]}>Qty Sold</Text>
                  </View>
                  {selectedChartItem.monthlyHistory && [...selectedChartItem.monthlyHistory]
                    .reverse()
                    .filter((h: any) => h.qty > 0)
                    .map((h: any, idx: number) => {
                      const dateObj = new Date(h.month + '-01');
                      const monthName = dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });
                      return (
                        <View key={h.month} style={[styles.historyRow, idx > 0 && styles.historyRowBorder]}>
                          <Text style={styles.historyTd}>{monthName}</Text>
                          <Text style={[styles.historyTd, { textAlign: 'right', fontFamily: 'Inter_600SemiBold' }]}>{h.qty} units</Text>
                        </View>
                      );
                    })}
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { padding: theme.spacing.md, paddingBottom: theme.spacing.sm },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold', color: theme.colors.text },
  countText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: theme.colors.textSecondary },
  filtersWrapper: { borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.card },
  filters: { padding: theme.spacing.md, gap: theme.spacing.sm },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.blue,
    borderColor: theme.colors.blue,
  },
  filterText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  filterTextActive: {
    color: '#fff',
  },
  list: { padding: theme.spacing.md, paddingBottom: 100 },
  itemCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.md },
  itemName: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: theme.colors.text, flex: 1, marginRight: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.sm },
  statusText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  statsRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm },
  salesRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm, marginTop: theme.spacing.sm },
  statBox: { flex: 1 },
  statLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, color: theme.colors.textSecondary, marginBottom: 2 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 15, color: theme.colors.text },
  salesValue: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: theme.colors.text },
  orderActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  orderActionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginRight: 8,
  },
  orderInput: {
    flex: 1,
    height: 32,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    paddingHorizontal: 4,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    textAlign: 'center',
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
  },
  qtyValueBtn: {
    flex: 1,
    height: 32,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    backgroundColor: theme.colors.blueBg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValueText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: theme.colors.blue,
  },
  qtyEditHintText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: theme.colors.blue,
    opacity: 0.8,
  },
  plusBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
    ...theme.shadows.sm,
  },
  chartIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.blueBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginLeft: 12,
    ...theme.shadows.sm,
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.xl,
    ...theme.shadows.sm,
  },
  historyTable: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 40,
  },
  tableTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  historyTableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  historyTh: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
  },
  historyRowBorder: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  historyTd: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: theme.colors.text,
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: theme.colors.textSecondary,
  },

  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.full, marginHorizontal: theme.spacing.md, marginBottom: theme.spacing.md, paddingHorizontal: 12, height: 40 },
  searchInput: { flex: 1, marginLeft: 8, fontFamily: 'Inter_500Medium', fontSize: 13, color: theme.colors.text },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: theme.colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  modalTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: theme.colors.text },
  modalSubtitle: { fontSize: 12, fontFamily: 'Inter_500Medium', color: theme.colors.textSecondary, marginTop: 4 },
  closeBtn: { padding: 4 },
  modalScroll: { padding: 20 },
  recBox: { backgroundColor: theme.colors.blueBg, borderRadius: theme.radius.md, padding: 16, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  recItem: { },
  recLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', color: theme.colors.textSecondary, marginBottom: 4 },
  recVal: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  recDetails: { fontSize: 11, fontFamily: 'Inter_500Medium', color: theme.colors.textSecondary },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingBottom: 40 },
  metricItem: { width: '31%', backgroundColor: theme.colors.card, borderRadius: theme.radius.sm, padding: 10, marginBottom: 10 },
  metricLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', color: theme.colors.textSecondary, marginBottom: 4 },
  metricVal: { fontSize: 14, fontFamily: 'Inter_700Bold', color: theme.colors.text },
  metricSub: { fontSize: 10, fontFamily: 'Inter_400Regular', color: theme.colors.textSecondary, marginTop: 2 },
  stockoutWarningRow: {
    backgroundColor: theme.colors.orangeBg,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.orange,
  },
  stockoutWarningText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: theme.colors.orange,
  },
  lostSalesRow: {
    backgroundColor: theme.colors.redBg,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.red,
  },
  lostSalesText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: theme.colors.red,
  },
});
