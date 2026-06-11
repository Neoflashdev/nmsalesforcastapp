import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useDashboardData } from '../../src/hooks/useDashboardData';
import { theme } from '../../src/theme';
import { MotiView } from 'moti';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RoutesScreen() {
  const { calculations, routeList, loading, routeVisitForecasts } = useDashboardData();
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);

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
          <MotiView
            from={{ opacity: 0, translateY: -6 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 300 }}
            style={styles.forecastCard}
          >
            <Text style={styles.forecastTitle}>📋 Pre-Visit Forecast</Text>
            <View style={styles.forecastRow}>
              <View style={styles.forecastBox}>
                <Text style={styles.forecastLabel}>EXP. REVENUE</Text>
                <Text style={[styles.forecastValue, { color: theme.colors.blue }]}>Rs. {(forecast.expectedRevenue / 1000).toFixed(0)}k</Text>
              </View>
              <View style={styles.forecastBox}>
                <Text style={styles.forecastLabel}>EXP. PROFIT</Text>
                <Text style={[styles.forecastValue, { color: theme.colors.green }]}>Rs. {(forecast.expectedProfit / 1000).toFixed(0)}k</Text>
              </View>
              <View style={styles.forecastBox}>
                <Text style={styles.forecastLabel}>EXP. UNITS</Text>
                <Text style={styles.forecastValue}>{forecast.expectedUnits}</Text>
              </View>
              <View style={styles.forecastBox}>
                <Text style={styles.forecastLabel}>PRODUCTS</Text>
                <Text style={styles.forecastValue}>{forecast.productCount}</Text>
              </View>
            </View>
          </MotiView>
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
});
