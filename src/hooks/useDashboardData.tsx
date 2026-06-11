import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchAll } from '../services/supabase';
import { computeAll } from '../services/calculations';
import { loadModelDynamically } from '../services/xgboostPredictor';

export interface OrderItem {
  productId: string;
  productName: string;
  qty: number;
  lastCost: number;
}

interface DashboardData {
  calculations: any[];
  salesTrend: any[];
  monthlyBreakdown: any[];
  routeList: any[];
  kpis: any;
  monthlyKPIs: any;
  topProfitProducts: any[];
  topMarginProducts: any[];
  topRevenueCustomers: any[];
  topProfitCustomers: any[];
  topRevenueRoutes: any[];
  topProfitRoutes: any[];
  lastSynced: string;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  selectedSector: string;
  setSelectedSector: (sector: string) => void;
  orderItems: OrderItem[];
  addToOrder: (product: { productId: string; productName: string; lastPurchaseCost: number }, qty: number) => void;
  updateOrderQty: (productId: string, qty: number) => void;
  updateOrderCost: (productId: string, cost: number) => void;
  removeFromOrder: (productId: string) => void;
  clearOrder: () => void;
}

const DashboardDataContext = createContext<DashboardData | undefined>(undefined);

const getMonthMetricsExact = (
  monthKey: string, 
  headers: any[], 
  details: any[]
) => {
  const mHeaders = headers.filter(h => (h.date || h.created_at).substring(0, 7) === monthKey);
  const headerIds = new Set(mHeaders.map(h => h.id));
  const mDetails = details.filter(d => headerIds.has(d.sales_header_id));

  const sales = mHeaders.reduce((s, h) => s + (h.grand_total || 0), 0);
  const profit = mDetails.reduce((s, d) => s + (d.profit || 0), 0);
  const workingDays = new Set(mHeaders.map(h => (h.date || h.created_at).substring(0, 10))).size;

  return { sales, profit, workingDays };
};

const getMonthMetricsExactMTD = (
  monthKey: string, 
  startDay: number, 
  endDay: number, 
  headers: any[], 
  details: any[]
) => {
  const mHeaders = headers.filter(h => {
    const dateStr = h.date || h.created_at;
    if (dateStr.substring(0, 7) !== monthKey) return false;
    const day = parseInt(dateStr.substring(8, 10), 10);
    return day >= startDay && day <= endDay;
  });
  const headerIds = new Set(mHeaders.map(h => h.id));
  const mDetails = details.filter(d => headerIds.has(d.sales_header_id));

  const sales = mHeaders.reduce((s, h) => s + (h.grand_total || 0), 0);
  const profit = mDetails.reduce((s, d) => s + (d.profit || 0), 0);
  const workingDays = new Set(mHeaders.map(h => (h.date || h.created_at).substring(0, 10))).size;

  return { sales, profit, workingDays };
};

export function DashboardDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<any>({
    calculations: [],
    salesTrend: [],
    monthlyBreakdown: [],
    routeList: [],
    kpis: null,
    monthlyKPIs: null,
    topProfitProducts: [],
    topMarginProducts: [],
    topRevenueCustomers: [],
    topProfitCustomers: [],
    topRevenueRoutes: [],
    topProfitRoutes: [],
    lastSynced: ''
  });
  const [rawData, setRawData] = useState<any>(null);
  const [selectedSector, setSelectedSector] = useState<string>('Pelmadulla');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  const addToOrder = (product: { productId: string; productName: string; lastPurchaseCost: number }, qty: number) => {
    setOrderItems((prev) => {
      const existing = prev.find((item) => item.productId === product.productId);
      if (existing) {
        return prev.map((item) =>
          item.productId === product.productId ? { ...item, qty } : item
        );
      }
      return [
        ...prev,
        {
          productId: product.productId,
          productName: product.productName,
          qty,
          lastCost: product.lastPurchaseCost,
        },
      ];
    });
  };

  const updateOrderQty = (productId: string, qty: number) => {
    setOrderItems((prev) => {
      if (qty <= 0) {
        return prev.filter((item) => item.productId !== productId);
      }
      return prev.map((item) =>
        item.productId === productId ? { ...item, qty } : item
      );
    });
  };

  const updateOrderCost = (productId: string, lastCost: number) => {
    setOrderItems((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, lastCost } : item
      )
    );
  };

  const removeFromOrder = (productId: string) => {
    setOrderItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  const clearOrder = () => {
    setOrderItems([]);
  };

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [
        [salesHeaders, salesDetails, products, stocks, customers, routes, returnDetails],
        _modelLoaded
      ] = await Promise.all([
        Promise.all([
          fetchAll('sales_header', 'id,date,grand_total,subtotal,total_discount,sector,route', 1000, 'is_deleted=eq.false'),
          fetchAll('sales_details', 'product_id,product_name,quantity,profit,total_price,sales_header_id,customer_id,route_id,unit_price,unit_cost'),
          fetchAll('products', 'id,name,product_code,selling_price,cost_price,low_stock_qty,disable'),
          fetchAll('stocks', 'product_id,product_name,quantity_balance,unit_cost,unit_price,batch_number,sector,grn_date,created_at'),
          fetchAll('customers', 'id,name,customer_type'),
          fetchAll('routes', 'id,route_name,sector'),
          fetchAll('return_details', 'product_id,return_qty,total_return_value,created_at,sector'),
        ]),
        loadModelDynamically()
      ]);
  
      setRawData({
        salesHeaders,
        salesDetails,
        products,
        stocks,
        customers,
        routes,
        returnDetails
      });
    } catch (err: any) {
      setError(err.message || 'Failed to sync data');
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!rawData) return;

    try {
      let filteredHeaders = rawData.salesHeaders;
      let filteredRoutes = rawData.routes;
      let filteredStocks = rawData.stocks;
      let filteredReturnDetails = rawData.returnDetails;

      if (selectedSector !== 'All') {
        const sectorLower = selectedSector.toLowerCase();
        filteredHeaders = rawData.salesHeaders.filter((h: any) => h.sector?.toLowerCase() === sectorLower);
        filteredRoutes = rawData.routes.filter((r: any) => r.sector?.toLowerCase() === sectorLower);
        filteredStocks = rawData.stocks.filter((s: any) => s.sector?.toLowerCase() === sectorLower);
        filteredReturnDetails = rawData.returnDetails.filter((r: any) => r.sector?.toLowerCase() === sectorLower);
      }

      const headerIds = new Set(filteredHeaders.map((h: any) => h.id));
      const filteredDetails = rawData.salesDetails.filter((sd: any) => headerIds.has(sd.sales_header_id));

      const result = computeAll(
        filteredHeaders,
        filteredDetails,
        rawData.products,
        filteredStocks,
        rawData.customers,
        filteredRoutes,
        filteredReturnDetails
      );

      const calculations = result.calculations;
      const totalRevenue = calculations.reduce((s, c) => s + c.revenue, 0);
      const urgentCount = calculations.filter((c: any) => c.status === 'urgent' || c.currentStock === 0).length;
      const lowStockCount = calculations.filter((c: any) => c.currentStock > 0 && c.currentStock <= c.lowStockQty).length;
      const deadCount = calculations.filter((c: any) => c.status === 'dead').length;
      const growingCount = calculations.filter((c: any) => c.growthRate > 10 && c.totalQty > 0).length;
      const totalStockValue = calculations.reduce((s, c) => s + c.stockValue, 0);
      const totalDeadValue = calculations.reduce((s, c) => s + c.deadStockValue, 0);
      const totalProfit = calculations.reduce((s, c) => s + c.profit, 0);

      const kpis = {
        urgentCount,
        lowStockCount,
        deadCount,
        growingCount,
        totalRevenue,
        totalProfit,
        totalStockValue,
        totalDeadValue,
        zeroStockCount: calculations.filter((c: any) => c.currentStock === 0).length,
        productCount: calculations.length,
      };

      const routeList = filteredRoutes.map((r: any) => ({ id: r.id, name: r.route_name, sector: r.sector }));

      // Find latest month key in filteredHeaders
      let latestMonthKey = '';
      if (filteredHeaders.length > 0) {
        latestMonthKey = filteredHeaders.reduce((max: string, h: any) => {
          const m = (h.date || h.created_at).substring(0, 7);
          return m > max ? m : max;
        }, '');
      }
      
      const today = new Date();
      const tYear = today.getFullYear();
      const tMonth = String(today.getMonth() + 1).padStart(2, '0');
      const thisMonthCalendarKey = `${tYear}-${tMonth}`;
      
      if (!latestMonthKey) {
        latestMonthKey = thisMonthCalendarKey;
      }

      // Parse latestMonthKey to get date object for previous month
      const parts = latestMonthKey.split('-');
      const latestYear = parseInt(parts[0], 10);
      const latestMonth = parseInt(parts[1], 10);
      const latestMonthDate = new Date(latestYear, latestMonth - 1, 1);
      
      const prevMonthDate = new Date(latestMonthDate.getFullYear(), latestMonthDate.getMonth() - 1, 1);
      const prevYear = prevMonthDate.getFullYear();
      const prevMonth = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
      const prevMonthKey = `${prevYear}-${prevMonth}`;

      const thisMonthMetrics = getMonthMetricsExact(latestMonthKey, filteredHeaders, filteredDetails);
      const prevMonthFullMetrics = getMonthMetricsExact(prevMonthKey, filteredHeaders, filteredDetails);
      
      let prevMonthCompareMetrics = prevMonthFullMetrics;
      
      if (latestMonthKey === thisMonthCalendarKey) {
        const currentDay = today.getDate();
        const daysInPrevMonth = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).getDate();
        const compareDuration = Math.min(currentDay, daysInPrevMonth);
        const startDayOfPrev = daysInPrevMonth - compareDuration + 1;
        
        prevMonthCompareMetrics = getMonthMetricsExactMTD(prevMonthKey, startDayOfPrev, daysInPrevMonth, filteredHeaders, filteredDetails);
      }

      const salesGrowth = prevMonthCompareMetrics.sales > 0 ? ((thisMonthMetrics.sales - prevMonthCompareMetrics.sales) / prevMonthCompareMetrics.sales) * 100 : 0;
      const profitGrowth = prevMonthCompareMetrics.profit > 0 ? ((thisMonthMetrics.profit - prevMonthCompareMetrics.profit) / prevMonthCompareMetrics.profit) * 100 : 0;
      const daysGrowth = prevMonthCompareMetrics.workingDays > 0 ? ((thisMonthMetrics.workingDays - prevMonthCompareMetrics.workingDays) / prevMonthCompareMetrics.workingDays) * 100 : 0;

      const monthlyKPIs = {
        sales: { thisMonth: thisMonthMetrics.sales, prevMonth: prevMonthFullMetrics.sales, growth: salesGrowth },
        profit: { thisMonth: thisMonthMetrics.profit, prevMonth: prevMonthFullMetrics.profit, growth: profitGrowth },
        workingDays: { thisMonth: thisMonthMetrics.workingDays, prevMonth: prevMonthFullMetrics.workingDays, growth: daysGrowth }
      };

      // Top Profit Products & Top Margin Products
      const topProfitProducts = [...calculations]
        .sort((a: any, b: any) => b.profit - a.profit)
        .slice(0, 5);
      
      const topMarginProducts = calculations
        .filter((c: any) => c.revenue > 0)
        .sort((a: any, b: any) => b.profitPercentage - a.profitPercentage)
        .slice(0, 5);

      const headerMap = new Map();
      for (const h of filteredHeaders) headerMap.set(h.id, h);

      const invoiceGrossMap = new Map();
      for (const sd of filteredDetails) {
        invoiceGrossMap.set(sd.sales_header_id, (invoiceGrossMap.get(sd.sales_header_id) || 0) + (sd.total_price || 0));
      }

      // Customer-level metrics
      const customerMap = new Map<string, { id: string; name: string; revenue: number; profit: number }>();
      for (const d of filteredDetails) {
        const cid = d.customer_id;
        if (!cid) continue;
        
        const custObj = rawData.customers.find((c: any) => c.id === cid);
        const custName = custObj ? custObj.name : 'Unknown Customer';
        
        // Exclude "New Shop" and "New Shops"
        if (custName.toLowerCase().includes('new shop')) {
          continue;
        }

        const h = headerMap.get(d.sales_header_id);
        if (!h) continue;
        
        const invItemTotal = invoiceGrossMap.get(h.id) || 1;
        const share = (d.total_price || 0) / invItemTotal;
        const apportionedRev = share * (h.grand_total || 0);
        const detailProfit = d.profit || 0;
        
        if (!customerMap.has(cid)) {
          customerMap.set(cid, {
            id: cid,
            name: custName,
            revenue: 0,
            profit: 0
          });
        }
        
        const entry = customerMap.get(cid)!;
        entry.revenue += apportionedRev;
        entry.profit += detailProfit;
      }
      
      const customerList = Array.from(customerMap.values());
      const topRevenueCustomers = [...customerList].sort((a: any, b: any) => b.revenue - a.revenue).slice(0, 5);
      const topProfitCustomers = [...customerList].sort((a: any, b: any) => b.profit - a.profit).slice(0, 5);

      // Route-level metrics
      const routeMetricsMap = new Map<string, { id: string; name: string; revenue: number; profit: number }>();
      for (const d of filteredDetails) {
        const rid = d.route_id;
        if (!rid) continue;
        const h = headerMap.get(d.sales_header_id);
        if (!h) continue;
        
        const invItemTotal = invoiceGrossMap.get(h.id) || 1;
        const share = (d.total_price || 0) / invItemTotal;
        const apportionedRev = share * (h.grand_total || 0);
        const detailProfit = d.profit || 0;
        
        if (!routeMetricsMap.has(rid)) {
          const rObj = rawData.routes.find((r: any) => r.id === rid);
          routeMetricsMap.set(rid, {
            id: rid,
            name: rObj ? rObj.route_name : 'Unknown Route',
            revenue: 0,
            profit: 0
          });
        }
        
        const entry = routeMetricsMap.get(rid)!;
        entry.revenue += apportionedRev;
        entry.profit += detailProfit;
      }
      
      const routeMetricsList = Array.from(routeMetricsMap.values());
      const topRevenueRoutes = [...routeMetricsList].sort((a: any, b: any) => b.revenue - a.revenue).slice(0, 5);
      const topProfitRoutes = [...routeMetricsList].sort((a: any, b: any) => b.profit - a.profit).slice(0, 5);

      setData({
        calculations,
        salesTrend: result.salesTrend,
        monthlyBreakdown: result.monthlyBreakdown,
        routeList,
        kpis,
        monthlyKPIs,
        topProfitProducts,
        topMarginProducts,
        topRevenueCustomers,
        topProfitCustomers,
        topRevenueRoutes,
        topProfitRoutes,
        lastSynced: new Date().toLocaleString()
      });
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Error computing data');
    } finally {
      setLoading(false);
    }
  }, [rawData, selectedSector]);

  return (
    <DashboardDataContext.Provider value={{ ...data, loading, error, refresh: load, selectedSector, setSelectedSector, orderItems, addToOrder, updateOrderQty, updateOrderCost, removeFromOrder, clearOrder }}>
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData() {
  const context = useContext(DashboardDataContext);
  if (context === undefined) {
    throw new Error('useDashboardData must be used within a DashboardDataProvider');
  }
  return context;
}
