/**
 * NM Stationaries Dashboard — Backend Proxy + Calculations
 *
 * Fetches raw data from Supabase, computes all 45 metrics server-side,
 * and sends only aggregated results to the browser (~200KB instead of 5MB+).
 *
 * Usage:
 *   npm start
 *   Open http://localhost:3000
 */

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

/* ── Supabase (service_role — server-side only) ── */
const SUPABASE_URL = 'https://fnelwyjugldtwtokjysj.supabase.co';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZWx3eWp1Z2xkdHd0b2tqeXNqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODQ0ODMwNiwiZXhwIjoyMDY0MDI0MzA2fQ.CcKPqh9knDnXPmyaoC54G3L6fBDQrzll3GsWHX9C84Q';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  realtime: { transport: ws },
});

app.use(cors());
app.use(express.json());

/* Don't cache the dashboard HTML so edits appear immediately */
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
  }
  next();
});
app.use(express.static(__dirname));

/* ══════════════════════════════════════════════
   DATA FETCHING (paginated, column-selected)
   ══════════════════════════════════════════════ */
async function fetchAll(table, columns = '*', pageSize = 1000) {
  let all = [];
  let from = 0;
  let loop = 0;
  while (loop++ < 50) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    from += pageSize;
    if (data.length < pageSize) break;
  }
  return all;
}

/* ══════════════════════════════════════════════
   CALCULATIONS ENGINE (All 45 metrics)
   ══════════════════════════════════════════════ */
function computeAll(salesHeaders, salesDetails, products, stocks, customers, routes, returnDetails = []) {
  const today = new Date();
  const allDates = salesHeaders.map(s => new Date(s.date));
  const minDate = allDates.length ? new Date(Math.min(...allDates)) : today;
  const totalDays = Math.max(1, Math.ceil((today - minDate) / (1000 * 60 * 60 * 24)));
  const totalMonths = Math.max(1, Math.ceil(totalDays / 30));

  // Build lookup maps
  const headerMap = new Map();
  for (const h of salesHeaders) headerMap.set(h.id, h);

  const routeMap = new Map();
  for (const r of routes) routeMap.set(r.id, r);

  // Returns per product (for net calculations)
  const returnByProduct = new Map();       // productId -> { qty, value, byDate: { dateStr: {qty,value} } }
  const returnByMonth = new Map();          // YYYY-MM -> total_value
  for (const rd of returnDetails) {
    const pid = rd.product_id;
    if (!returnByProduct.has(pid)) returnByProduct.set(pid, { qty: 0, value: 0, byDate: new Map() });
    const rEntry = returnByProduct.get(pid);
    const rq = rd.return_qty || 0;
    const rv = rd.total_return_value || 0;
    rEntry.qty += rq;
    rEntry.value += rv;
    const dateStr = (rd.created_at || '').substring(0, 10);
    if (dateStr) {
      if (!rEntry.byDate.has(dateStr)) rEntry.byDate.set(dateStr, { qty: 0, value: 0 });
      const dEntry = rEntry.byDate.get(dateStr);
      dEntry.qty += rq;
      dEntry.value += rv;
    }
    // Per month
    const month = (rd.created_at || '').substring(0, 7);
    if (month) returnByMonth.set(month, (returnByMonth.get(month) || 0) + rv);
  }

  // Stock per product
  const stockByProduct = new Map();
  for (const s of stocks) {
    const pid = s.product_id;
    if (!stockByProduct.has(pid)) stockByProduct.set(pid, { qty: 0, batches: [] });
    const e = stockByProduct.get(pid);
    e.qty += s.quantity_balance || 0;
    e.batches.push(s);
  }

  // Group sales_details by product
  const byProduct = new Map();
  for (const sd of salesDetails) {
    const pid = sd.product_id;
    if (!byProduct.has(pid)) byProduct.set(pid, []);
    byProduct.get(pid).push(sd);
  }

  // Route visit cache per product
  const routeVisitCache = new Map();
  for (const sd of salesDetails) {
    const pid = sd.product_id;
    const h = headerMap.get(sd.sales_header_id);
    if (!h) continue;
    const routeId = sd.route_id || h.route || 'unknown';
    if (!routeVisitCache.has(pid)) routeVisitCache.set(pid, new Map());
    const rMap = routeVisitCache.get(pid);
    if (!rMap.has(routeId)) rMap.set(routeId, []);
    rMap.get(routeId).push({ date: new Date(h.date || h.created_at), qty: sd.quantity });
  }
  for (const [, rMap] of routeVisitCache) {
    for (const [, visits] of rMap) {
      visits.sort((a, b) => b.date - a.date); // newest first
    }
  }

  // Helper: compute returns within N days for a product
  function returnsInDays(pid, days) {
    const rp = returnByProduct.get(pid);
    if (!rp) return { qty: 0, value: 0 };
    let qty = 0, value = 0;
    for (const [dateStr, d] of rp.byDate) {
      const dDate = new Date(dateStr);
      if (!isNaN(dDate) && (today - dDate) / (1000 * 60 * 60 * 24) <= days) {
        qty += d.qty;
        value += d.value;
      }
    }
    return { qty, value };
  }
  // Helper: returns in a given month for a product
  function returnsInMonth(pid, monthKey) {
    const rp = returnByProduct.get(pid);
    if (!rp) return { qty: 0, value: 0 };
    let qty = 0, value = 0;
    for (const [dateStr, d] of rp.byDate) {
      if (dateStr.substring(0, 7) === monthKey) {
        qty += d.qty;
        value += d.value;
      }
    }
    return { qty, value };
  }

  // Compute per product
  const allProductIds = new Set(salesDetails.map(sd => sd.product_id));
  for (const p of products) allProductIds.add(p.id);

  const results = [];

  for (const pid of allProductIds) {
    const details = byProduct.get(pid) || [];
    const prod = products.find(p => p.id === pid);
    const prodName = prod ? prod.name : (details[0]?.product_name || 'Unknown');
    const stockInfo = stockByProduct.get(pid) || { qty: 0, batches: [] };
    const currentStock = stockInfo.qty;
    const batch = stockInfo.batches[0] || {};
    const batchCost = batch.unit_cost || 0;
    const batchPrice = batch.unit_price || 0;

    /* 1. Total Sales Qty (net of returns) */
    const ret = returnByProduct.get(pid);
    const retTotalQty = ret ? ret.qty : 0;
    const retTotalValue = ret ? ret.value : 0;
    const totalQty = Math.max(0, details.reduce((s, d) => s + (d.quantity || 0), 0) - retTotalQty);

    /* 2. Overall Monthly Avg */
    const overallAvgMonthly = totalQty / totalMonths;

    /* 3. Daily Avg */
    const dailyAvg = totalQty / totalDays;

    /* 4-5. Monthly Sales */
    const monthlyMap = new Map();
    for (const d of details) {
      const h = headerMap.get(d.sales_header_id);
      if (!h) continue;
      const key = (h.date || h.created_at).substring(0, 7);
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + (d.quantity || 0));
    }
    const monthlyEntries = [...monthlyMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const monthlyValues = [...monthlyMap.values()];
    const monthlyAvg = monthlyEntries.length > 0
      ? monthlyValues.reduce((s, v) => s + v, 0) / monthlyEntries.length
      : 0;

    /* 6-7. Route totals */
    const routeTotals = new Map();
    for (const d of details) {
      const h = headerMap.get(d.sales_header_id);
      if (!h) continue;
      const rid = d.route_id || h.route || 'unknown';
      if (!routeTotals.has(rid)) routeTotals.set(rid, { total: 0, visits: 0 });
      const r = routeTotals.get(rid);
      r.total += d.quantity || 0;
      r.visits++;
    }
    const routeAvgAll = routeTotals.size > 0
      ? [...routeTotals.values()].reduce((s, r) => s + r.total / r.visits, 0) / routeTotals.size
      : 0;

    /* 8-10. Last 7/30/90 (net of returns) */
    const last7 = Math.max(0,
      details.filter(d => {
        const h = headerMap.get(d.sales_header_id);
        return h && (today - new Date(h.date || h.created_at)) / (1000 * 60 * 60 * 24) <= 7;
      }).reduce((s, d) => s + (d.quantity || 0), 0)
      - returnsInDays(pid, 7).qty);

    const last30 = Math.max(0,
      details.filter(d => {
        const h = headerMap.get(d.sales_header_id);
        return h && (today - new Date(h.date || h.created_at)) / (1000 * 60 * 60 * 24) <= 30;
      }).reduce((s, d) => s + (d.quantity || 0), 0)
      - returnsInDays(pid, 30).qty);

    const last90 = Math.max(0,
      details.filter(d => {
        const h = headerMap.get(d.sales_header_id);
        return h && (today - new Date(h.date || h.created_at)) / (1000 * 60 * 60 * 24) <= 90;
      }).reduce((s, d) => s + (d.quantity || 0), 0)
      - returnsInDays(pid, 90).qty);

    /* 11-12. Last 3 / 5 Route Visits Avg */
    const allVisits = [...(routeVisitCache.get(pid)?.values() || [])].flat().sort((a, b) => b.date - a.date);
    const last3RouteAvg = allVisits.length >= 3
      ? allVisits.slice(0, 3).reduce((s, v) => s + v.qty, 0) / 3
      : allVisits.length > 0
        ? allVisits.reduce((s, v) => s + v.qty, 0) / allVisits.length
        : 0;

    const last5RouteAvg = allVisits.length >= 5
      ? allVisits.slice(0, 5).reduce((s, v) => s + v.qty, 0) / 5
      : allVisits.length > 0
        ? allVisits.reduce((s, v) => s + v.qty, 0) / allVisits.length
        : 0;

    /* 13. Growth Rate */
    let growthRate = 0;
    if (monthlyEntries.length >= 2) {
      const last2 = monthlyEntries.slice(-2);
      const prevQty = last2[0][1];
      const currQty = last2[1][1];
      growthRate = prevQty > 0 ? ((currQty - prevQty) / prevQty) * 100 : 0;
    }

    /* 14. 3m Growth */
    let growth3m = 0;
    if (monthlyEntries.length >= 6) {
      const r3 = monthlyEntries.slice(-3).reduce((s, e) => s + e[1], 0) / 3;
      const p3 = monthlyEntries.slice(-6, -3).reduce((s, e) => s + e[1], 0) / 3;
      growth3m = p3 > 0 ? ((r3 - p3) / p3) * 100 : 0;
    }

    /* 15. Frequency */
    const daysSold = new Set(
      details.map(d => {
        const h = headerMap.get(d.sales_header_id);
        return h ? (h.date || h.created_at).substring(0, 10) : null;
      }).filter(Boolean)
    );
    const frequency = totalDays > 0 ? daysSold.size / totalDays : 0;

    /* 16-17. Coverage */
    const uniqueCustomers = new Set(details.map(d => d.customer_id).filter(Boolean));
    const customerCoverage = uniqueCustomers.size;

    const uniqueRoutes = new Set();
    for (const d of details) {
      const h = headerMap.get(d.sales_header_id);
      if (h) uniqueRoutes.add(d.route_id || h.route || 'unknown');
    }
    const routeCoverage = uniqueRoutes.size;

    /* 18-19. Avg per customer / bill */
    const avgQtyPerCustomer = customerCoverage > 0 ? totalQty / customerCoverage : 0;
    const uniqueBills = new Set(details.map(d => d.sales_header_id));
    const avgQtyPerBill = uniqueBills.size > 0 ? totalQty / uniqueBills.size : 0;

    /* 20-21. Days since last sale */
    const lastSaleDate = allVisits.length > 0 ? allVisits[0].date : null;
    const daysSinceLastSale = lastSaleDate
      ? Math.floor((today - lastSaleDate) / (1000 * 60 * 60 * 24))
      : 999;
    const noSaleDays = daysSinceLastSale;

    /* 22-25. Lead time / Safety / Reorder */
    const LEAD_TIME = 7;
    const leadTimeDemand = dailyAvg * LEAD_TIME;
    const safetyStock = Math.round(leadTimeDemand * 0.2);
    const reorderPoint = Math.round(leadTimeDemand + safetyStock);
    const forecastDemand = Math.round(
      0.4 * last30 +
      0.25 * routeAvgAll +
      0.15 * (last3RouteAvg || routeAvgAll) +
      0.1 * monthlyAvg +
      0.1 * overallAvgMonthly
    );
    const orderQty = Math.max(0, forecastDemand + safetyStock - currentStock);

    /* 26. Stock Coverage */
    const stockCoverage = dailyAvg > 0 ? currentStock / dailyAvg : 999;

    /* 27. Stockout Risk */
    const stockoutRisk = currentStock < reorderPoint ? 1 : 0;

    /* 28. Trend */
    let trendScore = 'Stable';
    if (monthlyEntries.length >= 3) {
      const r3 = monthlyEntries.slice(-3).map(e => e[1]);
      if (r3[2] > r3[1] && r3[1] >= r3[0]) trendScore = 'Increasing';
      else if (r3[2] < r3[1] && r3[1] <= r3[0]) trendScore = 'Decreasing';
    }

    /* 29. Seasonal */
    const seasonalIndex = monthlyAvg > 0 && overallAvgMonthly > 0
      ? monthlyAvg / overallAvgMonthly
      : 1;

    /* 30-31. Revenue / Profit */
    // revenue = grand_total equivalent (total_price from details is after discount)
    const revenue = details.reduce((s, d) => s + (d.total_price || 0), 0);
    // profit from sales_details is already correct after cost deduction
    const profit = Math.max(0, details.reduce((s, d) => s + (d.profit || 0), 0) -
      (ret ? ret.qty * (batchCost || 0) : 0));

    /* 32-33. Per route / customer */
    const profitPerRoute = routeCoverage > 0 ? profit / routeCoverage : 0;
    const profitPerCustomer = customerCoverage > 0 ? profit / customerCoverage : 0;

    /* 34-35. Stock Value */
    const stockValue = stockInfo.batches.reduce((s, b) => s + (b.quantity_balance || 0) * (b.unit_cost || 0), 0);
    const deadStockValue = daysSinceLastSale > 90 ? stockValue : 0;

    /* 36. Turnover */
    const avgStock = totalQty > 0 ? Math.max(currentStock, 1) : 1;
    const stockTurnover = totalQty / avgStock;

    /* 37-38. Fast / Slow scores */
    const fastMovingScore = (frequency * 40) + Math.min(growthRate / 5, 20) + Math.min(routeCoverage * 3, 40);
    const slowMovingScore = (Math.min(daysSinceLastSale / 10, 50)) + ((1 - frequency) * 50);

    /* 39. ABC — assigned globally after loop */

    /* 40. Route Forecast */
    const routeForecast = routeAvgAll * routeCoverage;

    /* 41. Next Month Forecast */
    const nextMonthForecast = Math.round(
      0.4 * Math.max(last30 / 30 * 30, 0) +
      0.3 * routeAvgAll +
      0.2 * monthlyAvg +
      0.1 * (growthRate > 0 ? 1 : -1) * overallAvgMonthly
    );

    /* 42. Purchase Rec */
    const purchaseRec = Math.max(0, nextMonthForecast + safetyStock - currentStock);

    /* 43. Health Score */
    let healthScore = 100;
    if (currentStock === 0) healthScore -= 30;
    if (stockCoverage < 7 && stockCoverage !== 999) healthScore -= 15;
    if (daysSinceLastSale > 90) healthScore -= 25;
    else if (daysSinceLastSale > 30) healthScore -= 10;
    if (stockoutRisk) healthScore -= 20;
    healthScore = Math.max(0, healthScore);

    /* 44. Priority Score */
    const priorityScore = Math.round(
      Math.min(growthRate, 30) + (routeCoverage * 5) + (frequency * 30) + (stockoutRisk * 35)
    );

    /* 45. Smart NM Score */
    const smartScore = Math.round(
      30 * Math.min((routeAvgAll / Math.max(overallAvgMonthly, 1)) / 2, 1) +
      25 * Math.min((last30 / Math.max(dailyAvg * 30, 1)) / 2, 1) +
      15 * Math.min((last3RouteAvg / Math.max(routeAvgAll, 1)) / 2, 1) +
      10 * Math.min(customerCoverage / 50, 1) +
      10 * Math.min(growthRate / 50, 1) +
      10 * Math.min(seasonalIndex / 2, 1)
    );

    /* Status */
    let status = 'healthy';
    let statusLabel = '🟢 Healthy';
    if (orderQty > 50) { status = 'urgent'; statusLabel = '🔴 Urgent'; }
    else if (orderQty > 20) { status = 'soon'; statusLabel = '🟡 Soon'; }
    else if (orderQty > 0) { status = 'soon'; statusLabel = '🟡 Soon'; }
    if (daysSinceLastSale > 90 && currentStock > 0) { status = 'dead'; statusLabel = '🐢 Dead Stock'; }

    /* Route-level data for route screen */
    const routeData = [];
    for (const [rid, rd] of routeTotals) {
      const r = routeMap.get(rid);
      routeData.push({
        routeId: rid,
        routeName: r ? r.route_name : rid,
        sector: r ? r.sector : '',
        total: rd.total,
        visits: rd.visits,
        avgPerVisit: Math.round(rd.total / rd.visits),
      });
    }

    results.push({
      productId: pid,
      productName: prodName,
      sellingPrice: prod ? prod.selling_price : batchPrice,
      costPrice: prod ? prod.cost_price : batchCost,
      lowStockQty: prod ? prod.low_stock_qty : 0,
      currentStock,
      totalQty,
      overallAvgMonthly: Math.round(overallAvgMonthly),
      dailyAvg: Math.round(dailyAvg * 100) / 100,
      monthlyValues,
      monthlyAvg: Math.round(monthlyAvg),
      routeAvgAll: Math.round(routeAvgAll),
      routeData,
      last7, last30, last90,
      last3RouteAvg: Math.round(last3RouteAvg),
      last5RouteAvg: Math.round(last5RouteAvg),
      growthRate: Math.round(growthRate * 10) / 10,
      growth3m: Math.round(growth3m * 10) / 10,
      frequency: Math.round(frequency * 1000) / 10,
      customerCoverage,
      routeCoverage,
      avgQtyPerCustomer: Math.round(avgQtyPerCustomer * 10) / 10,
      avgQtyPerBill: Math.round(avgQtyPerBill * 10) / 10,
      daysSinceLastSale,
      noSaleDays,
      leadTimeDemand: Math.round(leadTimeDemand),
      safetyStock,
      reorderPoint,
      orderQty,
      stockCoverage: stockCoverage === 999 ? 999 : Math.round(stockCoverage * 10) / 10,
      stockoutRisk,
      trendScore,
      seasonalIndex: Math.round(seasonalIndex * 100) / 100,
      revenue: parseFloat(revenue.toFixed(2)),
      profit: parseFloat(profit.toFixed(2)),
      profitPerRoute: parseFloat(profitPerRoute.toFixed(2)),
      profitPerCustomer: parseFloat(profitPerCustomer.toFixed(2)),
      profitPercentage: revenue > 0 ? parseFloat(((profit / revenue) * 100).toFixed(2)) : 0,
      stockValue: parseFloat(stockValue.toFixed(2)),
      deadStockValue: parseFloat(deadStockValue.toFixed(2)),
      stockTurnover: Math.round(stockTurnover * 10) / 10,
      fastMovingScore: Math.round(fastMovingScore),
      slowMovingScore: Math.round(slowMovingScore),
      abcClass: 'C',
      routeForecast: Math.round(routeForecast),
      nextMonthForecast,
      purchaseRec,
      healthScore,
      priorityScore,
      smartScore: Math.round(smartScore),
      status,
      statusLabel,
    });
  }

  /* ABC Analysis */
  results.sort((a, b) => b.revenue - a.revenue);
  const totalRevenue = results.reduce((s, c) => s + c.revenue, 0);
  let cumRev = 0;
  for (const c of results) {
    cumRev += c.revenue;
    const pct = totalRevenue > 0 ? cumRev / totalRevenue : 0;
    if (pct <= 0.7) c.abcClass = 'A';
    else if (pct <= 0.9) c.abcClass = 'B';
    else c.abcClass = 'C';
  }

  // Sales trend: Total sales = grand_total (subtotal - discount, already net)
  const monthlySales = new Map();
  const monthlyDiscount = new Map();
  const monthlyReturn = new Map();
  for (const h of salesHeaders) {
    const key = (h.date || h.created_at).substring(0, 7);
    monthlySales.set(key, (monthlySales.get(key) || 0) + (h.grand_total || 0));
    monthlyDiscount.set(key, (monthlyDiscount.get(key) || 0) + (h.total_discount || 0));
  }
  for (const [month, retVal] of returnByMonth) {
    monthlyReturn.set(month, retVal);
  }
  const salesTrend = [...monthlySales.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  // Include gross, discount, returns for detailed breakdown
  const monthlyBreakdown = [...new Set([...monthlySales.keys(), ...monthlyDiscount.keys(), ...monthlyReturn.keys()])]
    .sort().slice(-12).map(m => ({
      month: m,
      gross: parseFloat((monthlySales.get(m) + monthlyDiscount.get(m) + (monthlyReturn.get(m) || 0)).toFixed(2)),
      returnVal: parseFloat((monthlyReturn.get(m) || 0).toFixed(2)),
      saleAmount: parseFloat(((monthlySales.get(m) || 0) + (monthlyDiscount.get(m) || 0)).toFixed(2)),
      discount: parseFloat((monthlyDiscount.get(m) || 0).toFixed(2)),
      totalSales: parseFloat((monthlySales.get(m) || 0).toFixed(2)),
    }));

  return { calculations: results, salesTrend, monthlyBreakdown };
}

/* ══════════════════════════════════════════════
   ROUTES
   ══════════════════════════════════════════════ */

/* API: return computed product data (compact — ~200KB) */
app.get('/api/data', async (req, res) => {
  try {
    const start = Date.now();

    const [salesHeaders, salesDetails, products, stocks, customers, routes, returnDetails] = await Promise.all([
      fetchAll('sales_header', 'id,date,grand_total,sector,route'),
      fetchAll('sales_details', 'product_id,product_name,quantity,profit,total_price,sales_header_id,customer_id,route_id,unit_price,unit_cost'),
      fetchAll('products', 'id,name,product_code,selling_price,cost_price,low_stock_qty,disable'),
      fetchAll('stocks', 'product_id,product_name,quantity_balance,unit_cost,unit_price,batch_number'),
      fetchAll('customers', 'id,name,customer_type'),
      fetchAll('routes', 'id,route_name,sector'),
      fetchAll('return_details', 'product_id,return_qty,total_return_value,created_at'),
    ]);

    const { calculations, salesTrend, monthlyBreakdown } = computeAll(salesHeaders, salesDetails, products, stocks, customers, routes, returnDetails);

    // Aggregate KPI data
    const totalRevenue = parseFloat(calculations.reduce((s, c) => s + c.revenue, 0).toFixed(2));
    const urgentCount = calculations.filter(c => c.status === 'urgent' || c.currentStock === 0).length;
    const lowStockCount = calculations.filter(c => c.currentStock > 0 && c.currentStock <= c.lowStockQty).length;
    const deadCount = calculations.filter(c => c.status === 'dead').length;
    const growingCount = calculations.filter(c => c.growthRate > 10 && c.totalQty > 0).length;
    const totalStockValue = parseFloat(calculations.reduce((s, c) => s + c.stockValue, 0).toFixed(2));
    const totalDeadValue = parseFloat(calculations.reduce((s, c) => s + c.deadStockValue, 0).toFixed(2));
    const totalProfit = parseFloat(calculations.reduce((s, c) => s + c.profit, 0).toFixed(2));

    // Last synced timestamp (Sri Lanka time)
    const lastSynced = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Colombo' });

    // Route list for selector
    const routeList = routes.map(r => ({ id: r.id, name: r.route_name, sector: r.sector }));

    console.log(`Computed in ${Date.now() - start}ms — ${calculations.length} products`);

    res.json({
      calculations,
      salesTrend,
      monthlyBreakdown,
      lastSynced,
      kpis: {
        urgentCount,
        lowStockCount,
        deadCount,
        growingCount,
        totalRevenue,
        totalProfit,
        totalStockValue,
        totalDeadValue,
        zeroStockCount: calculations.filter(c => c.currentStock === 0).length,
        productCount: calculations.length,
      },
      salesTrend,
      routeList,
    });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Refresh: re-fetch from Supabase ── */
app.post('/api/refresh', async (req, res) => {
  try {
    const [salesHeaders, salesDetails, products, stocks, customers, routes, returnDetails] = await Promise.all([
      fetchAll('sales_header', 'id,date,grand_total,sector,route'),
      fetchAll('sales_details', 'product_id,product_name,quantity,profit,total_price,sales_header_id,customer_id,route_id,unit_price,unit_cost'),
      fetchAll('products', 'id,name,product_code,selling_price,cost_price,low_stock_qty,disable'),
      fetchAll('stocks', 'product_id,product_name,quantity_balance,unit_cost,unit_price,batch_number'),
      fetchAll('customers', 'id,name,customer_type'),
      fetchAll('routes', 'id,route_name,sector'),
      fetchAll('return_details', 'product_id,return_qty,total_return_value,created_at'),
    ]);
    const { calculations: calcs } = computeAll(salesHeaders, salesDetails, products, stocks, customers, routes, returnDetails);
    const lastSynced = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Colombo' });
    console.log(`Refreshed — ${calcs.length} products at ${lastSynced}`);
    res.json({ ok: true, lastSynced, count: calcs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Health ── */
app.get('/api/ping', (req, res) => res.json({ ok: true }));

/* ── Start ── */
app.listen(PORT, () => {
  console.log(`\n  🏪 NM Stationaries Dashboard`);
  console.log(`  ───────────────────────────`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`\n  Press Ctrl+C to stop.\n`);
});