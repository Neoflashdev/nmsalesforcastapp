import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useDashboardData } from '../../src/hooks/useDashboardData';
import { theme } from '../../src/theme';
import { MotiView } from 'moti';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ReportsScreen() {
  const { 
    calculations, 
    loading,
    topProfitProducts,
    topMarginProducts,
    topRevenueCustomers,
    topProfitCustomers,
    topRevenueRoutes,
    topProfitRoutes,
    customerRevisitAlerts,
  } = useDashboardData();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.blue} />
      </View>
    );
  }

  const all = calculations;
  const topRev = [...all].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const dead = all.filter((c: any) => c.status === 'dead' || c.daysSinceLastSale > 90).sort((a: any, b: any) => b.stockValue - a.stockValue).slice(0, 5);
  const fast = all.filter((c: any) => c.growthRate > 5 && c.totalQty > 0).sort((a: any, b: any) => b.growthRate - a.growthRate).slice(0, 7);
  const smart = [...all].sort((a: any, b: any) => b.smartScore - a.smartScore).slice(0, 7);
  const turnover = [...all].sort((a: any, b: any) => b.stockTurnover - a.stockTurnover).slice(0, 7);
  
  const abcA = all.filter((c: any) => c.abcClass === 'A').length;
  const abcB = all.filter((c: any) => c.abcClass === 'B').length;
  const abcC = all.filter((c: any) => c.abcClass === 'C').length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Reports & Analysis</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* Product Performance Section Header */}
        <Text style={styles.sectionHeader}>📦 Product Performance</Text>

        {/* Top Revenue */}
        <MotiView
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 300 }}
          style={styles.card}
        >
          <Text style={styles.cardTitle}>🏆 Top Revenue Products</Text>
          {topRev.map((item: any, idx) => (
            <View key={item.productId} style={styles.listItem}>
              <View style={styles.rowBetween}>
                <Text style={styles.itemTitle}>{idx + 1}. {item.productName}</Text>
                <Text style={styles.itemTitleBold}>Rs. {(item.revenue / 1000).toFixed(0)}k</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${(item.revenue / (topRev[0]?.revenue || 1)) * 100}%` }]} />
              </View>
            </View>
          ))}
        </MotiView>

        {/* Top Profit Products */}
        <MotiView
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 300, delay: 50 }}
          style={styles.card}
        >
          <Text style={styles.cardTitle}>💰 Top Profit Products</Text>
          {topProfitProducts.map((item: any, idx) => (
            <View key={item.productId} style={styles.listItem}>
              <View style={styles.rowBetween}>
                <Text style={styles.itemTitle}>{idx + 1}. {item.productName}</Text>
                <Text style={[styles.itemTitleBold, { color: theme.colors.green }]}>Rs. {(item.profit / 1000).toFixed(0)}k</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { backgroundColor: theme.colors.green, width: `${(item.profit / (topProfitProducts[0]?.profit || 1)) * 100}%` }]} />
              </View>
            </View>
          ))}
        </MotiView>

        {/* Top Margin Products */}
        <MotiView
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 300, delay: 100 }}
          style={styles.card}
        >
          <Text style={styles.cardTitle}>💸 Top Profit Margin Products</Text>
          {topMarginProducts.map((item: any, idx) => (
            <View key={item.productId} style={styles.listItem}>
              <View style={styles.rowBetween}>
                <Text style={styles.itemTitle}>{idx + 1}. {item.productName}</Text>
                <Text style={[styles.itemTitleBold, { color: theme.colors.orange }]}>{item.profitPercentage.toFixed(1)}%</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { backgroundColor: theme.colors.orange, width: `${(item.profitPercentage / (topMarginProducts[0]?.profitPercentage || 1)) * 100}%` }]} />
              </View>
            </View>
          ))}
        </MotiView>

        {/* ABC Analysis */}
        <MotiView
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 300, delay: 150 }}
          style={styles.card}
        >
          <Text style={styles.cardTitle}>📊 ABC Analysis</Text>
          <View style={styles.listItem}>
            <View style={styles.rowBetween}><Text style={styles.itemTitle}>A Class (Top 70% Revenue)</Text><Text style={[styles.itemTitleBold, { color: theme.colors.blue }]}>{abcA}</Text></View>
            <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: '70%' }]} /></View>
          </View>
          <View style={styles.listItem}>
            <View style={styles.rowBetween}><Text style={styles.itemTitle}>B Class (Next 20% Revenue)</Text><Text style={[styles.itemTitleBold, { color: theme.colors.green }]}>{abcB}</Text></View>
            <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: '20%', backgroundColor: theme.colors.green }]} /></View>
          </View>
          <View style={styles.listItem}>
            <View style={styles.rowBetween}><Text style={styles.itemTitle}>C Class (Remaining 10% Revenue)</Text><Text style={styles.itemTitleBold}>{abcC}</Text></View>
            <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: '10%', backgroundColor: theme.colors.textSecondary }]} /></View>
          </View>
        </MotiView>

        {/* Customer Performance Section Header */}
        <Text style={[styles.sectionHeader, { marginTop: theme.spacing.md }]}>👥 Customer Performance</Text>

        {/* Top Customers Revenue */}
        <MotiView
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 300, delay: 200 }}
          style={styles.card}
        >
          <Text style={styles.cardTitle}>🏆 Top Customers (Revenue)</Text>
          {topRevenueCustomers.length === 0 ? (
            <Text style={styles.itemTitle}>No customer data available</Text>
          ) : (
            topRevenueCustomers.map((item: any, idx: number) => (
              <View key={item.id} style={styles.listItem}>
                <View style={styles.rowBetween}>
                  <Text style={styles.itemTitle}>{idx + 1}. {item.name}</Text>
                  <Text style={styles.itemTitleBold}>Rs. {(item.revenue / 1000).toFixed(0)}k</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${(item.revenue / (topRevenueCustomers[0]?.revenue || 1)) * 100}%` }]} />
                </View>
              </View>
            ))
          )}
        </MotiView>

        {/* Top Customers Profit */}
        <MotiView
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 300, delay: 250 }}
          style={styles.card}
        >
          <Text style={styles.cardTitle}>💰 Top Customers (Profit)</Text>
          {topProfitCustomers.length === 0 ? (
            <Text style={styles.itemTitle}>No customer data available</Text>
          ) : (
            topProfitCustomers.map((item: any, idx: number) => (
              <View key={item.id} style={styles.listItem}>
                <View style={styles.rowBetween}>
                  <Text style={styles.itemTitle}>{idx + 1}. {item.name}</Text>
                  <Text style={[styles.itemTitleBold, { color: theme.colors.green }]}>Rs. {(item.profit / 1000).toFixed(0)}k</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { backgroundColor: theme.colors.green, width: `${(item.profit / (topProfitCustomers[0]?.profit || 1)) * 100}%` }]} />
                </View>
              </View>
            ))
          )}
        </MotiView>

        {/* Route Performance Section Header */}
        <Text style={[styles.sectionHeader, { marginTop: theme.spacing.md }]}>🚚 Route Performance</Text>

        {/* Top Routes Revenue */}
        <MotiView
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 300, delay: 300 }}
          style={styles.card}
        >
          <Text style={styles.cardTitle}>🏆 Top Routes (Revenue)</Text>
          {topRevenueRoutes.length === 0 ? (
            <Text style={styles.itemTitle}>No route data available</Text>
          ) : (
            topRevenueRoutes.map((item: any, idx: number) => (
              <View key={item.id} style={styles.listItem}>
                <View style={styles.rowBetween}>
                  <Text style={styles.itemTitle}>{idx + 1}. {item.name}</Text>
                  <Text style={styles.itemTitleBold}>Rs. {(item.revenue / 1000).toFixed(0)}k</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${(item.revenue / (topRevenueRoutes[0]?.revenue || 1)) * 100}%` }]} />
                </View>
              </View>
            ))
          )}
        </MotiView>

        {/* Top Routes Profit */}
        <MotiView
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 300, delay: 350 }}
          style={styles.card}
        >
          <Text style={styles.cardTitle}>💰 Top Routes (Profit)</Text>
          {topProfitRoutes.length === 0 ? (
            <Text style={styles.itemTitle}>No route data available</Text>
          ) : (
            topProfitRoutes.map((item: any, idx: number) => (
              <View key={item.id} style={styles.listItem}>
                <View style={styles.rowBetween}>
                  <Text style={styles.itemTitle}>{idx + 1}. {item.name}</Text>
                  <Text style={[styles.itemTitleBold, { color: theme.colors.green }]}>Rs. {(item.profit / 1000).toFixed(0)}k</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { backgroundColor: theme.colors.green, width: `${(item.profit / (topProfitRoutes[0]?.profit || 1)) * 100}%` }]} />
                </View>
              </View>
            ))
          )}
        </MotiView>

        {/* Stock & Movement Section Header */}
        <Text style={[styles.sectionHeader, { marginTop: theme.spacing.md }]}>🔄 Stock & Movement</Text>

        {/* Dead Stock */}
        <MotiView
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 300, delay: 400 }}
          style={styles.card}
        >
          <Text style={styles.cardTitle}>🐢 Dead Stock</Text>
          {dead.length === 0 && <Text style={styles.itemTitle}>✅ None</Text>}
          {dead.map((item: any) => (
            <View key={item.productId} style={styles.listItem}>
              <View style={styles.rowBetween}>
                <Text style={styles.itemTitle}>{item.productName} ({item.daysSinceLastSale}d)</Text>
                <Text style={[styles.itemTitleBold, { color: theme.colors.red }]}>Rs. {(item.stockValue / 1000).toFixed(0)}k</Text>
              </View>
            </View>
          ))}
        </MotiView>

        {/* Fast Movers */}
        <MotiView
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 300, delay: 450 }}
          style={styles.card}
        >
          <Text style={styles.cardTitle}>📈 Fast Movers</Text>
          {fast.map((item: any) => (
            <View key={item.productId} style={styles.listItem}>
              <View style={styles.rowBetween}>
                <Text style={styles.itemTitle}>{item.productName}</Text>
                <Text style={[styles.itemTitleBold, { color: theme.colors.green }]}>+{item.growthRate}%</Text>
              </View>
            </View>
          ))}
        </MotiView>

        {/* Smart Score */}
        <MotiView
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 300, delay: 500 }}
          style={styles.card}
        >
          <Text style={styles.cardTitle}>⚡ Smart NM Score</Text>
          {smart.map((item: any, idx: number) => (
            <View key={item.productId} style={styles.listItem}>
              <View style={styles.rowBetween}>
                <Text style={styles.itemTitle}>{idx + 1}. {item.productName}</Text>
                <Text style={[styles.itemTitleBold, { color: theme.colors.blue }]}>{item.smartScore}</Text>
              </View>
            </View>
          ))}
        </MotiView>

        {/* Stock Turnover */}
        <MotiView
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 300, delay: 550 }}
          style={styles.card}
        >
          <Text style={styles.cardTitle}>🔄 Stock Turnover</Text>
          {turnover.map((item: any) => (
            <View key={item.productId} style={styles.listItem}>
              <View style={styles.rowBetween}>
                <Text style={styles.itemTitle}>{item.productName}</Text>
                <Text style={styles.itemTitleBold}>{item.stockTurnover}x</Text>
              </View>
            </View>
          ))}
        </MotiView>

        {/* Customer Revisit Alerts Section Header */}
        {customerRevisitAlerts.length > 0 && (
          <Text style={[styles.sectionHeader, { marginTop: theme.spacing.md }]}>🔔 Customer Revisit Alerts</Text>
        )}

        {customerRevisitAlerts.length > 0 && (
          <MotiView
            from={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'timing', duration: 300, delay: 600 }}
            style={styles.card}
          >
            <Text style={styles.cardTitle}>⏰ Overdue Customers</Text>
            <Text style={[styles.itemTitle, { marginBottom: 12, color: theme.colors.textSecondary }]}>
              Customers who normally reorder every X days but haven't yet
            </Text>
            {customerRevisitAlerts.slice(0, 10).map((alert: any) => (
              <View key={alert.customerId} style={styles.listItem}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.itemTitle, { flex: 1 }]}>{alert.customerName}</Text>
                  <Text style={[styles.itemTitleBold, { color: theme.colors.red }]}>+{alert.overdueDays}d overdue</Text>
                </View>
                <Text style={[styles.itemTitle, { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 }]}>
                  Avg gap: {alert.avgOrderGapDays}d • Last order: {alert.lastOrderDate} • {alert.daysSinceLastOrder}d ago
                </Text>
              </View>
            ))}
          </MotiView>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { padding: theme.spacing.md, paddingBottom: theme.spacing.sm },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold', color: theme.colors.text },
  content: { padding: theme.spacing.md, paddingBottom: 100, gap: theme.spacing.md },
  sectionHeader: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  cardTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: theme.colors.text, marginBottom: theme.spacing.md },
  listItem: { marginBottom: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  itemTitle: { fontFamily: 'Inter_500Medium', fontSize: 13, color: theme.colors.text, flex: 1, marginRight: 8 },
  itemTitleBold: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: theme.colors.text },
  progressBarBg: { height: 6, backgroundColor: theme.colors.background, borderRadius: 3 },
  progressBarFill: { height: '100%', backgroundColor: theme.colors.blue, borderRadius: 3 },
});
