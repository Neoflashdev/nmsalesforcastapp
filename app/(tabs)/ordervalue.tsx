import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDashboardData } from '../../src/hooks/useDashboardData';
import { theme } from '../../src/theme';
import { Trash2, Download, Trash, Minus, Plus, ShoppingCart } from 'lucide-react-native';
import { router } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export default function OrderValueScreen() {
  const { orderItems, updateOrderQty, removeFromOrder, clearOrder, calculations, updateOrderCost } = useDashboardData();
  const [editingQty, setEditingQty] = useState<Record<string, string>>({});
  const [editingCosts, setEditingCosts] = useState<Record<string, string>>({});
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null);

  const handleCostChange = (productId: string, text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const formatted = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
    
    setEditingCosts(prev => ({ ...prev, [productId]: formatted }));

    const parsed = parseFloat(formatted);
    if (!isNaN(parsed) && parsed >= 0) {
      updateOrderCost(productId, parsed);
    }
  };

  const handleCostBlur = (productId: string, currentCost: number) => {
    setEditingCostId(null);
    const enteredText = editingCosts[productId];
    if (enteredText === undefined || enteredText.trim() === '') {
      setEditingCosts(prev => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    } else {
      const parsed = parseFloat(enteredText);
      if (isNaN(parsed) || parsed < 0) {
        updateOrderCost(productId, currentCost);
      } else {
        updateOrderCost(productId, parsed);
      }
      setEditingCosts(prev => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    }
  };

  const totalItems = orderItems.length;
  const totalUnits = orderItems.reduce((acc, item) => acc + item.qty, 0);
  const totalCost = orderItems.reduce((acc, item) => acc + (item.qty * item.lastCost), 0);

  const handleQtyChange = (productId: string, text: string) => {
    // Only allow digits
    const cleaned = text.replace(/[^0-9]/g, '');
    setEditingQty(prev => ({ ...prev, [productId]: cleaned }));

    const parsed = parseInt(cleaned, 10);
    if (!isNaN(parsed)) {
      updateOrderQty(productId, parsed);
    }
  };

  const handleIncrement = (productId: string, currentQty: number) => {
    updateOrderQty(productId, currentQty + 1);
    setEditingQty(prev => ({ ...prev, [productId]: String(currentQty + 1) }));
  };

  const handleDecrement = (productId: string, currentQty: number) => {
    if (currentQty > 1) {
      updateOrderQty(productId, currentQty - 1);
      setEditingQty(prev => ({ ...prev, [productId]: String(currentQty - 1) }));
    } else {
      Alert.alert(
        'Remove Item',
        'Do you want to remove this item from the order?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => removeFromOrder(productId) }
        ]
      );
    }
  };

  const handleClearOrder = () => {
    if (orderItems.length === 0) return;
    Alert.alert(
      'Clear Order',
      'Are you sure you want to clear all items in this order?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => {
          clearOrder();
          setEditingQty({});
        }}
      ]
    );
  };

  const downloadCSV = async () => {
    if (orderItems.length === 0) {
      Alert.alert('No items', 'Your order is empty');
      return;
    }

    const csvHeader = 'Product Code,Product Name,Quantity,Unit Cost (Rs.),Total Cost (Rs.)\n';
    const csvRows = orderItems.map(item => {
      const calc = calculations?.find(c => c.productId === item.productId);
      const code = calc?.productCode || item.productId;
      const cleanName = item.productName.replace(/"/g, '""');
      return `"${code}","${cleanName}",${item.qty},${item.lastCost.toFixed(2)},${(item.qty * item.lastCost).toFixed(2)}`;
    }).join('\n');

    const csvTotal = `\nTotal,,,,-,${totalCost.toFixed(2)}`;
    const csvString = csvHeader + csvRows + csvTotal;

    if (Platform.OS === 'web') {
      try {
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `order_value_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        Alert.alert('Error', 'Failed to download CSV on web');
      }
    } else {
      try {
        const fileUri = `${FileSystem.documentDirectory}order_value_${new Date().toISOString().split('T')[0]}.csv`;
        await FileSystem.writeAsStringAsync(fileUri, csvString, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: 'Share Order CSV',
            UTI: 'public.comma-separated-values-text',
          });
        } else {
          Alert.alert('Error', 'Sharing is not available on this device');
        }
      } catch (err: any) {
        Alert.alert('Error', 'Failed to generate and share CSV file: ' + err.message);
      }
    }
  };

  const renderOrderItem = ({ item }: { item: any }) => {
    const qtyText = editingQty[item.productId] !== undefined ? editingQty[item.productId] : String(item.qty);

    return (
      <View style={styles.card}>
        <View style={styles.cardInfo}>
          <Text style={styles.itemName} numberOfLines={2}>{item.productName}</Text>
          <View style={styles.costEditRow}>
            {editingCostId === item.productId ? (
              <TextInput
                style={styles.costInput}
                inputMode="decimal"
                autoFocus={true}
                value={editingCosts[item.productId] !== undefined ? editingCosts[item.productId] : item.lastCost.toFixed(2)}
                onChangeText={(text) => handleCostChange(item.productId, text)}
                onBlur={() => handleCostBlur(item.productId, item.lastCost)}
                onSubmitEditing={() => handleCostBlur(item.productId, item.lastCost)}
              />
            ) : (
              <TouchableOpacity
                style={styles.costValueBtn}
                onPress={() => {
                  setEditingCostId(item.productId);
                  setEditingCosts(prev => ({ ...prev, [item.productId]: '' }));
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.costValueText}>Rs. {item.lastCost.toFixed(2)}</Text>
                <Text style={styles.editHintText}> ✎</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.actionSection}>
          <View style={styles.qtyControl}>
            <TouchableOpacity 
              onPress={() => handleDecrement(item.productId, item.qty)} 
              style={styles.qtyBtn}
              activeOpacity={0.7}
            >
              <Minus size={14} color={theme.colors.text} />
            </TouchableOpacity>

            {editingQtyId === item.productId ? (
              <TextInput
                style={styles.qtyInput}
                inputMode="numeric"
                autoFocus={true}
                value={qtyText}
                onChangeText={(text) => {
                  const cleaned = text.replace(/[^0-9]/g, '');
                  setEditingQty(prev => ({ ...prev, [item.productId]: cleaned }));
                  const parsed = parseInt(cleaned, 10);
                  if (!isNaN(parsed)) {
                    updateOrderQty(item.productId, parsed);
                  }
                }}
                onBlur={() => {
                  setEditingQtyId(null);
                  const enteredText = editingQty[item.productId];
                  if (enteredText === undefined || enteredText.trim() === '') {
                    setEditingQty(prev => {
                      const next = { ...prev };
                      delete next[item.productId];
                      return next;
                    });
                  } else {
                    const parsed = parseInt(enteredText, 10);
                    if (isNaN(parsed) || parsed <= 0) {
                      removeFromOrder(item.productId);
                    }
                  }
                }}
                onSubmitEditing={() => {
                  setEditingQtyId(null);
                  const enteredText = editingQty[item.productId];
                  if (enteredText === undefined || enteredText.trim() === '') {
                    setEditingQty(prev => {
                      const next = { ...prev };
                      delete next[item.productId];
                      return next;
                    });
                  } else {
                    const parsed = parseInt(enteredText, 10);
                    if (isNaN(parsed) || parsed <= 0) {
                      removeFromOrder(item.productId);
                    }
                  }
                }}
              />
            ) : (
              <TouchableOpacity
                style={styles.qtyValueDisplayBtn}
                onPress={() => {
                  setEditingQtyId(item.productId);
                  setEditingQty(prev => ({ ...prev, [item.productId]: '' }));
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.qtyValueDisplayText}>{item.qty}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              onPress={() => handleIncrement(item.productId, item.qty)} 
              style={styles.qtyBtn}
              activeOpacity={0.7}
            >
              <Plus size={14} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.costAndRemove}>
            <Text style={styles.itemTotal}>Rs. {(item.qty * item.lastCost).toFixed(2)}</Text>
            <TouchableOpacity 
              onPress={() => removeFromOrder(item.productId)}
              style={styles.removeBtn}
              activeOpacity={0.7}
            >
              <Trash2 size={16} color={theme.colors.red} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  if (orderItems.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Order Value</Text>
        </View>
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <ShoppingCart size={48} color={theme.colors.textSecondary} />
          </View>
          <Text style={styles.emptyTitle}>Order List is Empty</Text>
          <Text style={styles.emptySub}>Go to the Reorder screen to search for products and add them with custom quantities.</Text>
          <TouchableOpacity 
            style={styles.goBackBtn}
            onPress={() => router.push('/(tabs)/reorder')}
            activeOpacity={0.8}
          >
            <Text style={styles.goBackBtnText}>Go to Reorder Screen</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Order Value</Text>
        <Text style={styles.subtitle}>Review your items, quantities, and cost calculations</Text>
      </View>

      <View style={styles.kpiContainer}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>ITEMS</Text>
          <Text style={styles.kpiValue}>{totalItems}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>TOTAL QTY</Text>
          <Text style={styles.kpiValue}>{totalUnits}</Text>
        </View>
        <View style={[styles.kpiCard, { borderRightWidth: 0 }]}>
          <Text style={styles.kpiLabel}>EST. COST</Text>
          <Text style={[styles.kpiValue, { color: theme.colors.blue }]}>Rs. {(totalCost / 1000).toFixed(1)}k</Text>
        </View>
      </View>

      <FlatList
        data={orderItems}
        keyExtractor={item => item.productId}
        renderItem={renderOrderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.footer}>
        <View style={styles.grandTotalRow}>
          <Text style={styles.grandTotalLabel}>Grand Total Value:</Text>
          <Text style={styles.grandTotalValue}>Rs. {totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        </View>

        <View style={styles.btnRow}>
          <TouchableOpacity 
            style={[styles.footerBtn, styles.clearBtn]}
            onPress={handleClearOrder}
            activeOpacity={0.8}
          >
            <Trash size={16} color={theme.colors.red} />
            <Text style={styles.clearBtnText}>Clear Order</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.footerBtn, styles.downloadBtn]}
            onPress={downloadCSV}
            activeOpacity={0.8}
          >
            <Download size={16} color="#fff" />
            <Text style={styles.downloadBtnText}>Download CSV</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { padding: theme.spacing.md, paddingBottom: theme.spacing.sm },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold', color: theme.colors.text },
  subtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', color: theme.colors.textSecondary, marginTop: 2 },
  
  kpiContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.card,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 12,
    marginVertical: theme.spacing.sm,
  },
  kpiCard: {
    flex: 1,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  kpiLabel: {
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
  },

  list: { padding: theme.spacing.md, paddingBottom: 150 },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  cardInfo: {
    marginBottom: theme.spacing.md,
  },
  itemName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: theme.colors.text,
    lineHeight: 20,
  },
  costEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  costInput: {
    width: 80,
    height: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 4,
    paddingHorizontal: 6,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    textAlign: 'center',
  },
  costValueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: theme.colors.blueBg,
    alignSelf: 'flex-start',
  },
  costValueText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: theme.colors.blue,
  },
  editHintText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: theme.colors.blue,
    opacity: 0.8,
  },

  actionSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.sm,
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    backgroundColor: theme.colors.background,
  },
  qtyBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyInput: {
    width: 48,
    height: 30,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: theme.colors.border,
    textAlign: 'center',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: theme.colors.text,
  },
  qtyValueDisplayBtn: {
    width: 48,
    height: 30,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.blueBg,
  },
  qtyValueDisplayText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: theme.colors.blue,
  },
  costAndRemove: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemTotal: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: theme.colors.text,
    marginRight: 16,
  },
  removeBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: theme.colors.redBg,
  },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.card,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    padding: theme.spacing.md,
    ...theme.shadows.md,
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  grandTotalLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  grandTotalValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: theme.colors.blue,
  },
  btnRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 44,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
  },
  clearBtn: {
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.red,
  },
  clearBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: theme.colors.red,
  },
  downloadBtn: {
    backgroundColor: theme.colors.blue,
    borderColor: theme.colors.blue,
  },
  downloadBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#fff',
  },

  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: theme.colors.text,
    marginBottom: 8,
  },
  emptySub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  goBackBtn: {
    backgroundColor: theme.colors.blue,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    ...theme.shadows.sm,
  },
  goBackBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#fff',
  },
});
