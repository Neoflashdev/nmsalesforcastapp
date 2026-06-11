import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useDashboardData } from '../../src/hooks/useDashboardData';
import { theme } from '../../src/theme';
import { MotiView } from 'moti';
import { LineChart } from 'react-native-gifted-charts';
import { RefreshCw } from 'lucide-react-native';

export default function DashboardScreen() {
  const { kpis, salesTrend, loading, error, calculations, lastSynced, refresh, selectedSector, setSelectedSector, monthlyKPIs, modelInfo } = useDashboardData();

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

  const cards = [
    { label: '📦 Items Need Reorder', value: kpis.urgentCount, sub: `${kpis.zeroStockCount} out of stock` },
    { label: '⚠️ Low Stock', value: kpis.lowStockCount, sub: 'Items nearing stockout' },
    { label: '💰 Inventory Value', value: `Rs. ${(kpis.totalStockValue / 1000).toFixed(0)}k`, sub: `Profit Rs.${(kpis.totalProfit / 1000).toFixed(0)}k` },
    { label: '🐢 Dead Stock', value: `${kpis.deadCount} items`, sub: `Rs.${(kpis.totalDeadValue / 1000).toFixed(0)}k` },
    { label: '📈 Fast Growing', value: `${kpis.growingCount} items`, sub: 'Above 10% growth rate' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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

      <View style={styles.sectorContainer}>
        {['All', 'Pelmadulla', 'Balangoda'].map((s) => (
          <TouchableOpacity
            key={s}
            style={[
              styles.sectorChip,
              selectedSector === s && styles.sectorChipActive
            ]}
            onPress={() => setSelectedSector(s)}
          >
            <Text
              style={[
                styles.sectorChipText,
                selectedSector === s && styles.sectorChipTextActive
              ]}
            >
              {s === 'All' ? '🌐 All Sectors' : s === 'Pelmadulla' ? '📍 Pelmadulla' : '📍 Balangoda'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Overview</Text>
      <View style={styles.grid}>
        {cards.map((card, index) => (
          <MotiView
            key={index}
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 300, delay: index * 50 }}
            style={styles.card}
          >
            <Text style={styles.cardLabel}>{card.label}</Text>
            <Text style={styles.cardValue}>{card.value}</Text>
            <Text style={styles.cardSub}>{card.sub}</Text>
          </MotiView>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: theme.spacing.lg }]}>📈 Sales Trend (Last 12 Months)</Text>
      <MotiView
        from={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'timing', duration: 400, delay: 200 }}
        style={[styles.card, { width: '100%', padding: theme.spacing.md, paddingTop: theme.spacing.lg }]}
      >
        <LineChart
          data={kpis && salesTrend ? salesTrend.map((t: any) => {
            const dateObj = new Date(t.month + '-01');
            const monthStr = dateObj.toLocaleString('en-US', { month: 'short' });
            const yearStr = dateObj.getFullYear().toString().substring(2);
            return {
              value: t.sales / 1000,
              label: `${monthStr} '${yearStr}`,
              workingDays: t.workingDays,
              salesAmount: t.sales,
            };
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
                <View style={{
                  height: 70,
                  width: 130,
                  justifyContent: 'center',
                  backgroundColor: theme.colors.card,
                  borderRadius: 8,
                  padding: 8,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  ...theme.shadows.sm,
                  marginLeft: -15
                }}>
                  <Text style={{ color: theme.colors.textSecondary, fontSize: 10, fontFamily: 'Inter_600SemiBold', marginBottom: 4 }}>{item.label}</Text>
                  <Text style={{ color: theme.colors.blue, fontSize: 13, fontFamily: 'Inter_700Bold' }}>Rs. {(item.salesAmount / 1000).toFixed(1)}k</Text>
                  <Text style={{ color: theme.colors.textSecondary, fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 2 }}>Days: {item.workingDays}</Text>
                </View>
              );
            },
          }}
          hideRules
          hideYAxisText={false}
          yAxisTextStyle={{ color: theme.colors.textSecondary, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: theme.colors.textSecondary, fontSize: 10 }}
          yAxisLabelPrefix="Rs."
          yAxisLabelSuffix="k"
          spacing={45}
          width={280}
          height={200}
          curved
          isAnimated
        />
      </MotiView>

      {monthlyKPIs && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: theme.spacing.lg }]}>📊 Monthly Comparison</Text>
          <View style={styles.grid}>
            <MotiView
              from={{ opacity: 0, translateY: 10 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 300, delay: 0 }}
              style={styles.card}
            >
              <Text style={styles.cardLabel}>📊 Sales Performance</Text>
              <Text style={styles.cardValue}>Rs. {(monthlyKPIs.sales.thisMonth / 1000).toFixed(1)}k</Text>
              <Text style={[styles.cardSub, { color: monthlyKPIs.sales.growth >= 0 ? theme.colors.green : theme.colors.red, fontFamily: 'Inter_600SemiBold' }]}>
                Prev: Rs. {(monthlyKPIs.sales.prevMonth / 1000).toFixed(1)}k ({monthlyKPIs.sales.growth >= 0 ? '▲' : '▼'} {Math.abs(monthlyKPIs.sales.growth).toFixed(1)}%)
              </Text>
            </MotiView>

            <MotiView
              from={{ opacity: 0, translateY: 10 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 300, delay: 50 }}
              style={styles.card}
            >
              <Text style={styles.cardLabel}>💸 Profit Performance</Text>
              <Text style={styles.cardValue}>Rs. {(monthlyKPIs.profit.thisMonth / 1000).toFixed(1)}k</Text>
              <Text style={[styles.cardSub, { color: monthlyKPIs.profit.growth >= 0 ? theme.colors.green : theme.colors.red, fontFamily: 'Inter_600SemiBold' }]}>
                Prev: Rs. {(monthlyKPIs.profit.prevMonth / 1000).toFixed(1)}k ({monthlyKPIs.profit.growth >= 0 ? '▲' : '▼'} {Math.abs(monthlyKPIs.profit.growth).toFixed(1)}%)
              </Text>
            </MotiView>

            <MotiView
              from={{ opacity: 0, translateY: 10 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 300, delay: 100 }}
              style={styles.card}
            >
              <Text style={styles.cardLabel}>📅 Working Days</Text>
              <Text style={styles.cardValue}>{monthlyKPIs.workingDays.thisMonth} days</Text>
              <Text style={[styles.cardSub, { color: monthlyKPIs.workingDays.growth >= 0 ? theme.colors.green : theme.colors.red, fontFamily: 'Inter_600SemiBold' }]}>
                Prev: {monthlyKPIs.workingDays.prevMonth} days ({monthlyKPIs.workingDays.growth >= 0 ? '▲' : '▼'} {Math.abs(monthlyKPIs.workingDays.growth).toFixed(1)}%)
              </Text>
            </MotiView>
          </View>
        </>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Top Reorder Items</Text>
        <Text style={styles.sectionSubtitle}>— needs your attention</Text>
      </View>
      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableTh, { flex: 2 }]}>ITEM</Text>
          <Text style={[styles.tableTh, { flex: 1, textAlign: 'center' }]}>STOCK</Text>
          <Text style={[styles.tableTh, { flex: 1, textAlign: 'right' }]}>NEED ORDER</Text>
        </View>
        {calculations?.filter((c: any) => c.orderQty > 0)
          .sort((a: any, b: any) => b.priorityScore - a.priorityScore)
          .slice(0, 8)
          .map((item: any, idx: number) => (
            <View key={item.productId} style={[styles.tableRow, idx > 0 && styles.tableRowBorder]}>
              <Text style={[styles.tableTd, { flex: 2, fontFamily: 'Inter_500Medium' }]} numberOfLines={1}>{item.productName}</Text>
              <Text style={[styles.tableTd, { flex: 1, textAlign: 'center' }]}>{item.currentStock}</Text>
              <Text style={[styles.tableTd, { flex: 1, textAlign: 'right', fontFamily: 'Inter_600SemiBold' }]}>
                {item.orderQty} <Text style={{ fontSize: 10, color: theme.colors.textSecondary, fontFamily: 'Inter_500Medium' }}>(AI: {item.aiOrderQty})</Text>
              </Text>
            </View>
          ))}
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontFamily: 'Inter_500Medium',
    color: theme.colors.textSecondary,
  },
  errorText: {
    color: theme.colors.red,
    fontFamily: 'Inter_500Medium',
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.md,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  card: {
    width: '47%',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  cardLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    textTransform: 'uppercase',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  cardValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: theme.colors.text,
  },
  cardSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  syncContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
  },
  syncBox: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.colors.greenBg,
    borderRadius: theme.radius.full,
  },
  syncText: {
    fontSize: 12,
    color: theme.colors.green,
    fontFamily: 'Inter_500Medium',
  },
  modelText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontFamily: 'Inter_500Medium',
    marginLeft: 4,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.blueBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md,
  },
  sectionSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginLeft: 8,
    marginTop: -8,
  },
  tableCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tableTh: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: theme.colors.textSecondary,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    alignItems: 'center',
  },
  tableRowBorder: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  tableTd: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: theme.colors.text,
  },
  sectorContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: theme.spacing.md,
  },
  sectorChip: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  sectorChipActive: {
    backgroundColor: theme.colors.blue,
    borderColor: theme.colors.blue,
  },
  sectorChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  sectorChipTextActive: {
    color: '#fff',
  },
});
