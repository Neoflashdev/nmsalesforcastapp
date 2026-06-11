import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useDashboardData } from '../../src/hooks/useDashboardData';
import { theme } from '../../src/theme';
import { MotiView } from 'moti';
import { LineChart } from 'react-native-gifted-charts';
import { RefreshCw } from 'lucide-react-native';

export default function DashboardScreen() {
  const {
    kpis, salesTrend, loading, error, calculations, lastSynced, refresh,
    selectedSector, setSelectedSector, monthlyKPIs, modelInfo,
    topRevenueRoutes, topProfitRoutes, routeVisitForecasts,
  } = useDashboardData();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.blue} />
        <Text style={styles.loadingText}>Loading Dashboard Data...</Text>
      </View>
    );
  }

  if (error || !kpis) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load: {error}</Text>
      </View>
    );
  }

  // Derived values for new sections
  const stockoutSoonItems = calculations.filter(
    (c: any) => c.stockoutDate && c.stockCoverage !== 999 && c.stockCoverage <= 14 && c.currentStock > 0
  );
  const totalStockoutSoon = stockoutSoonItems.length;
  const urgentLowStock = calculations
    .filter((c: any) => c.currentStock > 0 && c.currentStock <= (c.lowStockQty || 0))
    .sort((a: any, b: any) => a.currentStock - b.currentStock)
    .slice(0, 5);
  const deadStockTop = calculations
    .filter((c: any) => c.status === 'dead')
    .sort((a: any, b: any) => b.stockValue - a.stockValue)
    .slice(0, 5);
  const fastGrowing = calculations
    .filter((c: any) => c.growthRate > 10 && c.totalQty > 0)
    .sort((a: any, b: any) => b.growthRate - a.growthRate)
    .slice(0, 3);
  const decliningItems = calculations
    .filter((c: any) => c.growthRate < -10 && c.totalQty > 0)
    .sort((a: any, b: any) => a.growthRate - b.growthRate)
    .slice(0, 3);
  const recommendedPurchaseValue = calculations
    .filter((c: any) => c.orderQty > 0)
    .reduce((sum: number, c: any) => sum + c.orderQty * (c.lastPurchaseCost || 0), 0);
  const bestRoute = routeVisitForecasts[0] || null;
  const worstRoute = routeVisitForecasts[routeVisitForecasts.length - 1] || null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Header ── */}
      <View style={styles.headerRow}>
        <View style={styles.syncContainer}>
          <View style={styles.syncBox}>
            <Text style={styles.syncText}>Last synced: {lastSynced}</Text>
          </View>
          <Text style={styles.modelText}>🤖 AI Model: {modelInfo?.lastTrainedMonth || 'N/A'}</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={refresh}>
          <RefreshCw size={20} color={theme.colors.blue} />
        </TouchableOpacity>
      </View>

      {/* ── Sector Filter ── */}
      <View style={styles.sectorContainer}>
        {['All', 'Pelmadulla', 'Balangoda'].map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.sectorChip, selectedSector === s && styles.sectorChipActive]}
            onPress={() => setSelectedSector(s)}
          >
            <Text style={[styles.sectorChipText, selectedSector === s && styles.sectorChipTextActive]}>
              {s === 'All' ? '🌐 All Sectors' : s === 'Pelmadulla' ? '📍 Pelmadulla' : '📍 Balangoda'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ══════════════════════════════════════
          SECTION 1: TODAY'S PULSE
      ══════════════════════════════════════ */}
      <Text style={styles.sectionTitle}>📊 Today's Pulse</Text>
      <View style={styles.grid}>
        {[
          { label: '💰 Inventory Value', value: `Rs. ${(kpis.totalStockValue / 1000).toFixed(0)}k`, sub: `Profit Rs.${(kpis.totalProfit / 1000).toFixed(0)}k`, color: theme.colors.blue },
          { label: '🐢 Dead Stock', value: `${kpis.deadCount} items`, sub: `Rs.${(kpis.totalDeadValue / 1000).toFixed(0)}k locked`, color: theme.colors.red },
          { label: '📦 Need Reorder', value: kpis.urgentCount, sub: `${kpis.zeroStockCount} out of stock`, color: theme.colors.orange },
          { label: '⚡ Stockout ≤14d', value: totalStockoutSoon, sub: 'items running out soon', color: totalStockoutSoon > 0 ? theme.colors.red : theme.colors.green },
        ].map((card, index) => (
          <MotiView
            key={index}
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 300, delay: index * 50 }}
            style={styles.card}
          >
            <Text style={styles.cardLabel}>{card.label}</Text>
            <Text style={[styles.cardValue, { color: card.color }]}>{card.value}</Text>
            <Text style={styles.cardSub}>{card.sub}</Text>
          </MotiView>
        ))}
      </View>

      {/* ══════════════════════════════════════
          SECTION 2: NEEDS ATTENTION
      ══════════════════════════════════════ */}
      <Text style={[styles.sectionTitle, { marginTop: theme.spacing.lg }]}>🚨 Needs Attention</Text>

      {/* Stockout soon */}
      {stockoutSoonItems.length > 0 && (
        <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 300 }} style={styles.tableCard}>
          <Text style={styles.tableCardTitle}>⚡ Stocking Out Soon</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableTh, { flex: 2 }]}>ITEM</Text>
            <Text style={[styles.tableTh, { flex: 1, textAlign: 'center' }]}>STOCK</Text>
            <Text style={[styles.tableTh, { flex: 1.5, textAlign: 'right' }]}>STOCKOUT DATE</Text>
          </View>
          {stockoutSoonItems.slice(0, 6).map((item: any, idx: number) => (
            <View key={item.productId} style={[styles.tableRow, idx > 0 && styles.tableRowBorder]}>
              <Text style={[styles.tableTd, { flex: 2 }]} numberOfLines={1}>{item.productName}</Text>
              <Text style={[styles.tableTd, { flex: 1, textAlign: 'center', color: theme.colors.red, fontFamily: 'Inter_600SemiBold' }]}>{item.currentStock}</Text>
              <Text style={[styles.tableTd, { flex: 1.5, textAlign: 'right', color: theme.colors.orange, fontFamily: 'Inter_600SemiBold', fontSize: 11 }]}>
                {item.stockoutDate} ({Math.round(item.stockCoverage)}d)
              </Text>
            </View>
          ))}
        </MotiView>
      )}

      {/* Low Stock */}
      {urgentLowStock.length > 0 && (
        <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 300, delay: 50 }} style={[styles.tableCard, { marginTop: theme.spacing.md }]}>
          <Text style={styles.tableCardTitle}>⚠️ Low Stock Items</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableTh, { flex: 2 }]}>ITEM</Text>
            <Text style={[styles.tableTh, { flex: 1, textAlign: 'center' }]}>STOCK</Text>
            <Text style={[styles.tableTh, { flex: 1, textAlign: 'right' }]}>NEED ORDER</Text>
          </View>
          {urgentLowStock.map((item: any, idx: number) => (
            <View key={item.productId} style={[styles.tableRow, idx > 0 && styles.tableRowBorder]}>
              <Text style={[styles.tableTd, { flex: 2 }]} numberOfLines={1}>{item.productName}</Text>
              <Text style={[styles.tableTd, { flex: 1, textAlign: 'center', color: theme.colors.yellow, fontFamily: 'Inter_600SemiBold' }]}>{item.currentStock}</Text>
              <Text style={[styles.tableTd, { flex: 1, textAlign: 'right', fontFamily: 'Inter_600SemiBold' }]}>{item.orderQty}</Text>
            </View>
          ))}
        </MotiView>
      )}

      {/* Fast Growing + Declining */}
      <View style={[styles.grid, { marginTop: theme.spacing.md }]}>
        <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 300, delay: 100 }} style={[styles.card, { width: '100%' }]}>
          <Text style={styles.cardLabel}>📈 Fast Growing</Text>
          {fastGrowing.length === 0 ? <Text style={styles.cardSub}>None detected</Text> : fastGrowing.map((item: any) => (
            <View key={item.productId} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={[styles.tableTd, { flex: 2 }]} numberOfLines={1}>{item.productName}</Text>
              <Text style={{ color: theme.colors.green, fontFamily: 'Inter_700Bold', fontSize: 13 }}>+{item.growthRate}%</Text>
            </View>
          ))}
          {decliningItems.length > 0 && (
            <>
              <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, marginTop: 10, marginBottom: 4 }} />
              <Text style={styles.cardLabel}>📉 Declining</Text>
              {decliningItems.map((item: any) => (
                <View key={item.productId} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                  <Text style={[styles.tableTd, { flex: 2 }]} numberOfLines={1}>{item.productName}</Text>
                  <Text style={{ color: theme.colors.red, fontFamily: 'Inter_700Bold', fontSize: 13 }}>{item.growthRate}%</Text>
                </View>
              ))}
            </>
          )}
        </MotiView>
      </View>

      {/* ══════════════════════════════════════
          SECTION 3: SALES PERFORMANCE
      ══════════════════════════════════════ */}
      <Text style={[styles.sectionTitle, { marginTop: theme.spacing.lg }]}>📈 Sales Performance</Text>

      {monthlyKPIs && (
        <View style={styles.grid}>
          <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300 }} style={styles.card}>
            <Text style={styles.cardLabel}>📊 Sales</Text>
            <Text style={styles.cardValue}>Rs. {(monthlyKPIs.sales.thisMonth / 1000).toFixed(1)}k</Text>
            <Text style={[styles.cardSub, { color: monthlyKPIs.sales.growth >= 0 ? theme.colors.green : theme.colors.red, fontFamily: 'Inter_600SemiBold' }]}>
              Prev: Rs. {(monthlyKPIs.sales.prevMonth / 1000).toFixed(1)}k ({monthlyKPIs.sales.growth >= 0 ? '▲' : '▼'} {Math.abs(monthlyKPIs.sales.growth).toFixed(1)}%)
            </Text>
          </MotiView>
          <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300, delay: 50 }} style={styles.card}>
            <Text style={styles.cardLabel}>💸 Profit</Text>
            <Text style={styles.cardValue}>Rs. {(monthlyKPIs.profit.thisMonth / 1000).toFixed(1)}k</Text>
            <Text style={[styles.cardSub, { color: monthlyKPIs.profit.growth >= 0 ? theme.colors.green : theme.colors.red, fontFamily: 'Inter_600SemiBold' }]}>
              Prev: Rs. {(monthlyKPIs.profit.prevMonth / 1000).toFixed(1)}k ({monthlyKPIs.profit.growth >= 0 ? '▲' : '▼'} {Math.abs(monthlyKPIs.profit.growth).toFixed(1)}%)
            </Text>
          </MotiView>
          <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300, delay: 100 }} style={styles.card}>
            <Text style={styles.cardLabel}>📅 Working Days</Text>
            <Text style={styles.cardValue}>{monthlyKPIs.workingDays.thisMonth}d</Text>
            <Text style={[styles.cardSub, { color: monthlyKPIs.workingDays.growth >= 0 ? theme.colors.green : theme.colors.red, fontFamily: 'Inter_600SemiBold' }]}>
              Prev: {monthlyKPIs.workingDays.prevMonth}d ({monthlyKPIs.workingDays.growth >= 0 ? '▲' : '▼'} {Math.abs(monthlyKPIs.workingDays.growth).toFixed(1)}%)
            </Text>
          </MotiView>
          <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300, delay: 150 }} style={styles.card}>
            <Text style={styles.cardLabel}>📦 Products</Text>
            <Text style={styles.cardValue}>{kpis.productCount}</Text>
            <Text style={styles.cardSub}>A:{calculations.filter((c: any) => c.abcClass === 'A').length} B:{calculations.filter((c: any) => c.abcClass === 'B').length} C:{calculations.filter((c: any) => c.abcClass === 'C').length}</Text>
          </MotiView>
        </View>
      )}

      <MotiView
        from={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'timing', duration: 400, delay: 200 }}
        style={[styles.card, { width: '100%', padding: theme.spacing.md, paddingTop: theme.spacing.lg, marginTop: theme.spacing.md }]}
      >
        <Text style={styles.cardLabel}>📈 SALES TREND (LAST 12 MONTHS)</Text>
        <LineChart
          data={kpis && salesTrend ? salesTrend.map((t: any) => {
            const dateObj = new Date(t.month + '-01');
            const monthStr = dateObj.toLocaleString('en-US', { month: 'short' });
            const yearStr = dateObj.getFullYear().toString().substring(2);
            return { value: t.sales / 1000, label: `${monthStr} '${yearStr}`, workingDays: t.workingDays, salesAmount: t.sales };
          }) : []}
          color={theme.colors.blue}
          thickness={3}
          dataPointsColor={theme.colors.blue}
          pointerConfig={{
            pointerStripColor: 'rgba(37, 99, 235, 0.2)',
            pointerStripWidth: 2,
            pointerColor: theme.colors.blue,
            radius: 8,
            pointerLabelWidth: 120,
            pointerLabelHeight: 80,
            activatePointersOnLongPress: true,
            activatePointersDelay: 50,
            autoAdjustPointerLabelPosition: true,
            pointerLabelComponent: (items: any) => {
              const item = items[0];
              return (
                <View style={{ height: 70, width: 130, justifyContent: 'center', backgroundColor: theme.colors.card, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: theme.colors.border, ...theme.shadows.sm, marginLeft: -15 }}>
                  <Text style={{ color: theme.colors.textSecondary, fontSize: 10, fontFamily: 'Inter_600SemiBold', marginBottom: 4 }}>{item.label}</Text>
                  <Text style={{ color: theme.colors.blue, fontSize: 13, fontFamily: 'Inter_700Bold' }}>Rs. {(item.salesAmount / 1000).toFixed(1)}k</Text>
                  <Text style={{ color: theme.colors.textSecondary, fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 2 }}>Days: {item.workingDays}</Text>
                </View>
              );
            },
          }}
          hideRules hideYAxisText={false}
          yAxisTextStyle={{ color: theme.colors.textSecondary, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: theme.colors.textSecondary, fontSize: 10 }}
          yAxisLabelPrefix="Rs." yAxisLabelSuffix="k"
          spacing={45} width={280} height={200} curved isAnimated
        />
      </MotiView>

      {/* ══════════════════════════════════════
          SECTION 4: AI INSIGHTS
      ══════════════════════════════════════ */}
      <Text style={[styles.sectionTitle, { marginTop: theme.spacing.lg }]}>🤖 AI Insights</Text>
      <View style={styles.grid}>
        <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300 }} style={styles.card}>
          <Text style={styles.cardLabel}>🤖 AI Model</Text>
          <Text style={[styles.cardValue, { fontSize: 14 }]}>{modelInfo?.lastTrainedMonth || 'N/A'}</Text>
          <Text style={styles.cardSub}>Trained month</Text>
        </MotiView>
        <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300, delay: 50 }} style={styles.card}>
          <Text style={styles.cardLabel}>💸 Purchase Value</Text>
          <Text style={[styles.cardValue, { fontSize: 15, color: theme.colors.blue }]}>Rs. {(recommendedPurchaseValue / 1000).toFixed(0)}k</Text>
          <Text style={styles.cardSub}>Recommended order</Text>
        </MotiView>
        <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300, delay: 100 }} style={styles.card}>
          <Text style={styles.cardLabel}>📈 Fast Growing</Text>
          <Text style={styles.cardValue}>{kpis.growingCount}</Text>
          <Text style={styles.cardSub}>Items above 10% growth</Text>
        </MotiView>
        <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300, delay: 150 }} style={styles.card}>
          <Text style={styles.cardLabel}>⚡ Lost Sales Risk</Text>
          <Text style={[styles.cardValue, { color: theme.colors.red }]}>
            {calculations.filter((c: any) => c.lostSalesEstimate > 0).length}
          </Text>
          <Text style={styles.cardSub}>Products with 0 stock</Text>
        </MotiView>
      </View>

      {/* Top Reorder Items */}
      <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 300 }} style={[styles.tableCard, { marginTop: theme.spacing.md }]}>
        <Text style={styles.tableCardTitle}>📦 Top Reorder Items</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableTh, { flex: 2 }]}>ITEM</Text>
          <Text style={[styles.tableTh, { flex: 1, textAlign: 'center' }]}>STOCK</Text>
          <Text style={[styles.tableTh, { flex: 1.5, textAlign: 'right' }]}>NEED / AI</Text>
        </View>
        {calculations?.filter((c: any) => c.orderQty > 0)
          .sort((a: any, b: any) => b.priorityScore - a.priorityScore)
          .slice(0, 8)
          .map((item: any, idx: number) => (
            <View key={item.productId} style={[styles.tableRow, idx > 0 && styles.tableRowBorder]}>
              <Text style={[styles.tableTd, { flex: 2, fontFamily: 'Inter_500Medium' }]} numberOfLines={1}>{item.productName}</Text>
              <Text style={[styles.tableTd, { flex: 1, textAlign: 'center' }]}>{item.currentStock}</Text>
              <Text style={[styles.tableTd, { flex: 1.5, textAlign: 'right', fontFamily: 'Inter_600SemiBold' }]}>
                {item.orderQty} <Text style={{ fontSize: 10, color: theme.colors.blue }}>AI:{item.aiOrderQty}</Text>
              </Text>
            </View>
          ))}
      </MotiView>

      {/* ══════════════════════════════════════
          SECTION 5: ROUTE SUMMARY
      ══════════════════════════════════════ */}
      <Text style={[styles.sectionTitle, { marginTop: theme.spacing.lg }]}>🚚 Route Summary</Text>
      <View style={styles.grid}>
        {bestRoute && (
          <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300 }} style={styles.card}>
            <Text style={styles.cardLabel}>🏆 Best Route</Text>
            <Text style={[styles.cardValue, { fontSize: 14 }]} numberOfLines={1}>{bestRoute.routeName}</Text>
            <Text style={styles.cardSub}>Rs. {(bestRoute.expectedRevenue / 1000).toFixed(0)}k expected</Text>
          </MotiView>
        )}
        {worstRoute && worstRoute.routeId !== bestRoute?.routeId && (
          <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300, delay: 50 }} style={styles.card}>
            <Text style={styles.cardLabel}>📉 Lowest Route</Text>
            <Text style={[styles.cardValue, { fontSize: 14 }]} numberOfLines={1}>{worstRoute.routeName}</Text>
            <Text style={styles.cardSub}>Rs. {(worstRoute.expectedRevenue / 1000).toFixed(0)}k expected</Text>
          </MotiView>
        )}
      </View>

      {routeVisitForecasts.slice(0, 5).length > 0 && (
        <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 300, delay: 100 }} style={[styles.tableCard, { marginTop: theme.spacing.md, marginBottom: theme.spacing.xl }]}>
          <Text style={styles.tableCardTitle}>📋 Pre-Visit Route Forecast</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableTh, { flex: 2 }]}>ROUTE</Text>
            <Text style={[styles.tableTh, { flex: 1, textAlign: 'center' }]}>UNITS</Text>
            <Text style={[styles.tableTh, { flex: 1.2, textAlign: 'right' }]}>EXP. REV</Text>
          </View>
          {routeVisitForecasts.slice(0, 5).map((r: any, idx: number) => (
            <View key={r.routeId} style={[styles.tableRow, idx > 0 && styles.tableRowBorder]}>
              <Text style={[styles.tableTd, { flex: 2 }]} numberOfLines={1}>{r.routeName}</Text>
              <Text style={[styles.tableTd, { flex: 1, textAlign: 'center', fontFamily: 'Inter_600SemiBold' }]}>{r.expectedUnits}</Text>
              <Text style={[styles.tableTd, { flex: 1.2, textAlign: 'right', color: theme.colors.blue, fontFamily: 'Inter_600SemiBold' }]}>Rs.{(r.expectedRevenue / 1000).toFixed(0)}k</Text>
            </View>
          ))}
        </MotiView>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background },
  loadingText: { marginTop: theme.spacing.md, fontFamily: 'Inter_500Medium', color: theme.colors.textSecondary },
  errorText: { color: theme.colors.red, fontFamily: 'Inter_500Medium' },
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.md, paddingBottom: 100 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: theme.colors.text, marginBottom: theme.spacing.md, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
  card: { width: '47%', backgroundColor: theme.colors.card, borderRadius: theme.radius.md, padding: theme.spacing.md, ...theme.shadows.sm },
  cardLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, textTransform: 'uppercase', color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
  cardValue: { fontFamily: 'Inter_700Bold', fontSize: 20, color: theme.colors.text },
  cardSub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg },
  syncContainer: { flexDirection: 'column', alignItems: 'flex-start', gap: 4 },
  syncBox: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.colors.greenBg, borderRadius: theme.radius.full },
  syncText: { fontSize: 12, color: theme.colors.green, fontFamily: 'Inter_500Medium' },
  modelText: { fontSize: 11, color: theme.colors.textSecondary, fontFamily: 'Inter_500Medium', marginLeft: 4 },
  refreshBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.blueBg, alignItems: 'center', justifyContent: 'center' },
  sectorContainer: { flexDirection: 'row', gap: 8, marginBottom: theme.spacing.md },
  sectorChip: { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.card, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, ...theme.shadows.sm },
  sectorChipActive: { backgroundColor: theme.colors.blue, borderColor: theme.colors.blue },
  sectorChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: theme.colors.textSecondary },
  sectorChipTextActive: { color: '#fff' },
  tableCard: { backgroundColor: theme.colors.card, borderRadius: theme.radius.md, padding: theme.spacing.md, ...theme.shadows.sm },
  tableCardTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: theme.colors.text, marginBottom: theme.spacing.sm },
  tableHeader: { flexDirection: 'row', paddingBottom: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  tableTh: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: theme.colors.textSecondary },
  tableRow: { flexDirection: 'row', paddingVertical: 10, alignItems: 'center' },
  tableRowBorder: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  tableTd: { fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.colors.text },
});
