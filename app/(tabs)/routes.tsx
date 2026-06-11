import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { useDashboardData } from '../../src/hooks/useDashboardData';
import { theme } from '../../src/theme';
import { MotiView } from 'moti';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-gifted-charts';
import { X } from 'lucide-react-native';

export default function RoutesScreen() {
  const { calculations, routeList, loading, routeVisitForecasts } = useDashboardData();
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [selectedChartRoute, setSelectedChartRoute] = useState<any>(null);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.blue} />
      </View>
    );
  }

  const activeRoute = selectedRoute || (routeList.length > 0 ? routeList[0].id : null);
  const routeDetail = routeList.find((r: any) => r.id === activeRoute);
  
  let items = calculations.filter((c: any) => c.routeData.some((r: any) => r.routeId === activeRoute));
  items.sort((a: any, b: any) => {
    const aVal = a.routeData.find((r: any) => r.routeId === activeRoute)?.total || 0;
    const bVal = b.routeData.find((r: any) => r.routeId === activeRoute)?.total || 0;
    return bVal - aVal;
  });

  const expectedTotal = items.reduce((sum: number, c: any) => {
    const rd = c.routeData.find((r: any) => r.routeId === activeRoute);
    return sum + (rd ? (rd.aiVisitForecast !== undefined ? Math.round(rd.aiVisitForecast) : rd.avgPerVisit) : 0);
  }, 0);

  const renderItem = ({ item, index }: { item: any, index: number }) => {
    const rd = item.routeData.find((r: any) => r.routeId === activeRoute);
    if (!rd) return null;

    const aiForecast = rd.aiVisitForecast !== undefined ? rd.aiVisitForecast : rd.avgPerVisit;
    const needOrder = Math.max(0, Math.round(aiForecast - item.currentStock));

    return (
      <MotiView
        from={{ opacity: 0, translateY: 10 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 250, delay: Math.min(index * 20, 200) }}
        style={styles.itemCard}
      >
        <Text style={styles.itemName}>{item.productName}</Text>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Route Total</Text>
            <Text style={styles.statValue}>{rd.total}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Visits</Text>
            <Text style={styles.statValue}>{rd.visits}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Avg / Visit</Text>
            <Text style={styles.statValue}>{rd.avgPerVisit}</Text>
          </View>
        </View>
        <View style={[styles.statsRow, { borderTopWidth: 0, paddingTop: 4 }]}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>AI Forecast</Text>
            <Text style={[styles.statValue, { color: theme.colors.blue }]}>{Math.round(aiForecast)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Stock</Text>
            <Text style={styles.statValue}>{item.currentStock}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Need Order</Text>
            <Text style={[styles.statValue, { color: needOrder > 0 ? theme.colors.red : theme.colors.green }]}>
              {needOrder}
            </Text>
          </View>
        </View>
      </MotiView>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Routes</Text>
      </View>

      <View style={styles.routeSelector}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.routeScroll}>
          {routeList.map((r: any) => (
            <TouchableOpacity
              key={r.id}
              style={[styles.routeChip, activeRoute === r.id && styles.routeChipActive]}
              onPress={() => setSelectedRoute(r.id)}
            >
              <Text style={[styles.routeText, activeRoute === r.id && styles.routeTextActive]}>{r.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {routeDetail && (
        <View style={styles.summaryBar}>
          <Text style={styles.summaryText}>✅ {routeDetail.name} • {routeDetail.sector}</Text>
          <Text style={styles.summaryTextBold}>Expected: {expectedTotal} units</Text>
        </View>
      )}

      {/* Pre-Visit Route Forecast Card */}
      {activeRoute && (() => {
        const forecast = routeVisitForecasts.find((r: any) => r.routeId === activeRoute);
        if (!forecast) return null;
        return (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setSelectedChartRoute(forecast)}
          >
            <MotiView
              from={{ opacity: 0, translateY: -6 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 300 }}
              style={styles.forecastCard}
            >
              <Text style={styles.forecastTitle}>📋 Pre-Visit Forecast (Tap for chart)</Text>
              <View style={styles.forecastRow}>
                <View style={styles.forecastBox}>
                  <Text style={styles.forecastLabel}>AI EXP. REVENUE</Text>
                  <Text style={[styles.forecastValue, { color: theme.colors.blue }]}>Rs. {(forecast.expectedRevenue / 1000).toFixed(1)}k</Text>
                </View>
                <View style={styles.forecastBox}>
                  <Text style={styles.forecastLabel}>RULE EXP. REVENUE</Text>
                  <Text style={[styles.forecastValue, { color: theme.colors.orange }]}>Rs. {(forecast.ruleExpectedRevenue / 1000).toFixed(1)}k</Text>
                </View>
              </View>
              <View style={[styles.forecastRow, { marginTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm }]}>
                <View style={styles.forecastBox}>
                  <Text style={styles.forecastLabel}>EXP. PROFIT</Text>
                  <Text style={[styles.forecastValue, { color: theme.colors.green, fontSize: 13 }]}>Rs. {(forecast.expectedProfit / 1000).toFixed(1)}k</Text>
                </View>
                <View style={styles.forecastBox}>
                  <Text style={styles.forecastLabel}>EXP. UNITS</Text>
                  <Text style={[styles.forecastValue, { fontSize: 13 }]}>{forecast.expectedUnits}</Text>
                </View>
                <View style={styles.forecastBox}>
                  <Text style={styles.forecastLabel}>PRODUCTS</Text>
                  <Text style={[styles.forecastValue, { fontSize: 13 }]}>{forecast.productCount}</Text>
                </View>
              </View>
            </MotiView>
          </TouchableOpacity>
        );
      })()}

      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No sales for this route</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.productId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}

      {/* Chart Modal */}
      <Modal visible={!!selectedChartRoute} transparent animationType="slide">
        {selectedChartRoute && (
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { height: '75%' }]}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setSelectedChartRoute(null)} style={[styles.closeBtn, { marginRight: 12 }]}>
                  <X size={24} color={theme.colors.textSecondary} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle} numberOfLines={1}>{selectedChartRoute.routeName}</Text>
                  <Text style={styles.modalSubtitle}>📈 Route Revenue Trend (Last 12 Months)</Text>
                </View>
              </View>

              <ScrollView style={{ padding: 20 }}>
                {selectedChartRoute.monthlyRevenueHistory && selectedChartRoute.monthlyRevenueHistory.some((h: any) => h.rev > 0) ? (
                  <View style={styles.chartWrapper}>
                    <LineChart
                      data={selectedChartRoute.monthlyRevenueHistory.map((h: any) => {
                        const dateObj = new Date(h.month + '-01');
                        const monthStr = dateObj.toLocaleString('en-US', { month: 'short' });
                        const yearStr = dateObj.getFullYear().toString().substring(2);
                        return {
                          value: Math.round(h.rev / 1000), // Scale to thousands (k)
                          label: `${monthStr} '${yearStr}`,
                          rev: h.rev,
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
                        pointerLabelWidth: 140,
                        pointerLabelHeight: 60,
                        activatePointersOnLongPress: true,
                        activatePointersDelay: 50,
                        autoAdjustPointerLabelPosition: true,
                        pointerLabelComponent: (items: any) => {
                          const item = items[0];
                          return (
                            <View style={{
                              height: 50,
                              width: 140,
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
                              <Text style={{ color: theme.colors.blue, fontSize: 12, fontFamily: 'Inter_700Bold' }}>Rs. {Math.round(item.rev).toLocaleString()}</Text>
                            </View>
                          );
                        },
                      }}
                      hideRules
                      hideYAxisText={false}
                      yAxisTextStyle={{ color: theme.colors.textSecondary, fontSize: 10 }}
                      xAxisLabelTextStyle={{ color: theme.colors.textSecondary, fontSize: 10 }}
                      yAxisLabelSuffix="k"
                      spacing={32}
                      width={280}
                      height={180}
                      curved
                      isAnimated
                    />
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No revenue history available for this route</Text>
                  </View>
                )}

                <View style={styles.historyTable}>
                  <Text style={styles.tableTitle}>Visit Sales History Breakdown</Text>
                  <View style={styles.historyTableHeader}>
                    <Text style={[styles.historyTh, { flex: 1.5 }]}>Visit Date</Text>
                    <Text style={[styles.historyTh, { flex: 0.8 }]}>Bills</Text>
                    <Text style={[styles.historyTh, { flex: 1.2, textAlign: 'right' }]}>Total Revenue</Text>
                  </View>
                  {selectedChartRoute.dailyRevenueHistory && [...selectedChartRoute.dailyRevenueHistory]
                    .reverse()
                    .filter((v: any) => v.totalRevenue > 0)
                    .map((v: any, idx: number) => {
                      const dateObj = new Date(v.date);
                      const formattedDate = dateObj.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      });
                      const isValidVisit = v.billsCount >= 3;
                      return (
                        <View key={v.date} style={[styles.historyRow, idx > 0 && styles.historyRowBorder]}>
                          <View style={{ flex: 1.5 }}>
                            <Text style={styles.historyTd}>{formattedDate}</Text>
                            {!isValidVisit && (
                              <Text style={{ fontSize: 9, color: theme.colors.textSecondary, fontFamily: 'Inter_500Medium' }}>{"(< 3 bills visit)"}</Text>
                            )}
                          </View>
                          <Text style={[styles.historyTd, { flex: 0.8, color: isValidVisit ? theme.colors.green : theme.colors.textSecondary }]}>
                            {v.billsCount} bills
                          </Text>
                          <Text style={[styles.historyTd, { flex: 1.2, textAlign: 'right', fontFamily: 'Inter_600SemiBold' }]}>
                            Rs. {Math.round(v.totalRevenue).toLocaleString()}
                          </Text>
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
  routeSelector: { borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.card },
  routeScroll: { padding: theme.spacing.md, gap: theme.spacing.sm },
  routeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  routeChipActive: { backgroundColor: theme.colors.blue, borderColor: theme.colors.blue },
  routeText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: theme.colors.textSecondary },
  routeTextActive: { color: '#fff' },
  summaryBar: { padding: theme.spacing.md, backgroundColor: theme.colors.blueBg, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  summaryText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: theme.colors.text },
  summaryTextBold: { fontFamily: 'Inter_700Bold', fontSize: 12, color: theme.colors.text },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: 'Inter_500Medium', color: theme.colors.textSecondary },
  list: { padding: theme.spacing.md, paddingBottom: 100 },
  itemCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  itemName: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: theme.colors.text, marginBottom: theme.spacing.sm },
  statsRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm },
  statBox: { flex: 1 },
  statLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, color: theme.colors.textSecondary, marginBottom: 2 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 14, color: theme.colors.text },
  forecastCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  forecastTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  forecastRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  forecastBox: {
    flex: 1,
    alignItems: 'center',
  },
  forecastLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  forecastValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: theme.colors.text,
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: theme.colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  modalTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: theme.colors.text },
  modalSubtitle: { fontSize: 12, fontFamily: 'Inter_500Medium', color: theme.colors.textSecondary, marginTop: 4 },
  closeBtn: { padding: 4 },
});
