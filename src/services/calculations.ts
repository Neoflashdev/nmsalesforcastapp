import { predictXGBoostDemand } from './xgboostPredictor';

export function computeAll(salesHeaders: any[], salesDetails: any[], products: any[], stocks: any[], customers: any[], routes: any[], returnDetails: any[] = []) {
  const today = new Date();
  const allDates = salesHeaders.map(s => new Date(s.date || s.created_at));
  const minDate = allDates.length ? new Date(Math.min(...allDates.map(d => d.getTime()))) : today;
  const totalDays = Math.max(1, Math.ceil((today.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)));
  const totalMonths = Math.max(1, Math.ceil(totalDays / 30));

  // Generate all month keys from minDate to today
  const allMonths: string[] = [];
  let currentMonth = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const endMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  while (currentMonth <= endMonth) {
    const year = currentMonth.getFullYear();
    const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
    const key = `${year}-${month}`;
    allMonths.push(key);
    currentMonth.setMonth(currentMonth.getMonth() + 1);
  }

  // Build lookup maps
  const headerMap = new Map();
  for (const h of salesHeaders) headerMap.set(h.id, h);

  // invoice item total per header (for proportional split of grand_total)
  const invoiceGrossMap = new Map();
  for (const sd of salesDetails) {
    invoiceGrossMap.set(sd.sales_header_id, (invoiceGrossMap.get(sd.sales_header_id) || 0) + (sd.total_price || 0));
  }

  const routeMap = new Map();
  for (const r of routes) routeMap.set(r.id, r);

  // Returns per product
  const returnByProduct = new Map();
  const returnByMonth = new Map();
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
  // Sort batches by grn_date descending (fallback to created_at) to find last added stock
  for (const [, e] of Array.from(stockByProduct.entries()) as any) {
    e.batches.sort((a: any, b: any) => {
      const dateA = new Date(a.grn_date || a.created_at || 0).getTime();
      const dateB = new Date(b.grn_date || b.created_at || 0).getTime();
      return dateB - dateA;
    });
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
  for (const [, rMap] of Array.from(routeVisitCache.entries())) {
    for (const [, visits] of Array.from((rMap as Map<any, any>).entries())) {
      visits.sort((a: any, b: any) => b.date.getTime() - a.date.getTime());
    }
  }

  function returnsInDays(pid: string, days: number) {
    const rp = returnByProduct.get(pid);
    if (!rp) return { qty: 0, value: 0 };
    let qty = 0, value = 0;
    for (const [dateStr, d] of Array.from(rp.byDate.entries()) as any) {
      const dDate = new Date(dateStr);
      if (!isNaN(dDate.getTime()) && (today.getTime() - dDate.getTime()) / (1000 * 60 * 60 * 24) <= days) {
        qty += d.qty;
        value += d.value;
      }
    }
    return { qty, value };
  }

  const allProductIds = new Set([...salesDetails.map(sd => sd.product_id)]);
  for (const p of products) allProductIds.add(p.id);

  const results = [];

  for (const pid of Array.from(allProductIds)) {
    const details = byProduct.get(pid) || [];
    const prod = products.find(p => p.id === pid);
    const prodName = prod ? prod.name : (details[0]?.product_name || 'Unknown');
    const stockInfo = stockByProduct.get(pid) || { qty: 0, batches: [] };
    const currentStock = stockInfo.qty;
    const batch = stockInfo.batches[0] || {};
    const batchCost = batch.unit_cost || 0;
    const batchPrice = batch.unit_price || 0;

    const ret = returnByProduct.get(pid);
    const retTotalQty = ret ? ret.qty : 0;
    const totalQty = Math.max(0, details.reduce((s: number, d: any) => s + (d.quantity || 0), 0) - retTotalQty);

    const overallAvgMonthly = totalQty / totalMonths;
    const dailyAvg = totalQty / totalDays;

    const monthlyMap = new Map();
    for (const m of allMonths) {
      monthlyMap.set(m, 0);
    }
    for (const d of details) {
      const h = headerMap.get(d.sales_header_id);
      if (!h) continue;
      const key = (h.date || h.created_at).substring(0, 7);
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + (d.quantity || 0));
    }
    const monthlyEntries = [...Array.from(monthlyMap.entries())].sort((a, b) => a[0].localeCompare(b[0]));
    const monthlyValues = [...Array.from(monthlyMap.values())];
    const monthlyAvg = monthlyEntries.length > 0 ? monthlyValues.reduce((s: number, v: number) => s + v, 0) / monthlyEntries.length : 0;

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
      ? [...Array.from(routeTotals.values())].reduce((s: number, r: any) => s + r.total / r.visits, 0) / routeTotals.size
      : 0;

    const last7 = Math.max(0,
      details.filter((d: any) => {
        const h = headerMap.get(d.sales_header_id);
        return h && (today.getTime() - new Date(h.date || h.created_at).getTime()) / (1000 * 60 * 60 * 24) <= 7;
      }).reduce((s: number, d: any) => s + (d.quantity || 0), 0)
      - returnsInDays(pid, 7).qty);

    const last30 = Math.max(0,
      details.filter((d: any) => {
        const h = headerMap.get(d.sales_header_id);
        return h && (today.getTime() - new Date(h.date || h.created_at).getTime()) / (1000 * 60 * 60 * 24) <= 30;
      }).reduce((s: number, d: any) => s + (d.quantity || 0), 0)
      - returnsInDays(pid, 30).qty);

    const last90 = Math.max(0,
      details.filter((d: any) => {
        const h = headerMap.get(d.sales_header_id);
        return h && (today.getTime() - new Date(h.date || h.created_at).getTime()) / (1000 * 60 * 60 * 24) <= 90;
      }).reduce((s: number, d: any) => s + (d.quantity || 0), 0)
      - returnsInDays(pid, 90).qty);

    const allVisits = [...Array.from(routeVisitCache.get(pid)?.values() || [])].flat() as any[];
    allVisits.sort((a, b) => b.date.getTime() - a.date.getTime());
    
    const last3RouteAvg = allVisits.length >= 3
      ? allVisits.slice(0, 3).reduce((s, v) => s + v.qty, 0) / 3
      : allVisits.length > 0 ? allVisits.reduce((s, v) => s + v.qty, 0) / allVisits.length : 0;

    const last5RouteAvg = allVisits.length >= 5
      ? allVisits.slice(0, 5).reduce((s, v) => s + v.qty, 0) / 5
      : allVisits.length > 0 ? allVisits.reduce((s, v) => s + v.qty, 0) / allVisits.length : 0;

    let growthRate = 0;
    if (monthlyEntries.length >= 2) {
      const last2 = monthlyEntries.slice(-2);
      const prevKey = last2[0][0];
      const currKey = last2[1][0];
      const prevQty = last2[0][1] as number;
      const currQty = last2[1][1] as number;

      const tYear = today.getFullYear();
      const tMonth = String(today.getMonth() + 1).padStart(2, '0');
      const todayKey = `${tYear}-${tMonth}`;

      if (currKey === todayKey) {
        // Calculate sales for the last X days of the previous month
        const currentDay = today.getDate();
        const prevMonthObj = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const daysInPrevMonth = new Date(prevMonthObj.getFullYear(), prevMonthObj.getMonth() + 1, 0).getDate();
        
        const compareDuration = Math.min(currentDay, daysInPrevMonth);
        const startDayOfPrev = daysInPrevMonth - compareDuration + 1;
        
        const prevMonthMTDQty = details.filter((d: any) => {
          const h = headerMap.get(d.sales_header_id);
          if (!h) return false;
          const dateStr = h.date || h.created_at;
          if (dateStr.substring(0, 7) !== prevKey) return false;
          const day = parseInt(dateStr.substring(8, 10), 10);
          return day >= startDayOfPrev && day <= daysInPrevMonth;
        }).reduce((sum: number, d: any) => sum + (d.quantity || 0), 0);

        const prevMonthMTDReturnQty = returnDetails.filter((r: any) => {
          const dateStr = r.created_at || '';
          if (dateStr.substring(0, 7) !== prevKey) return false;
          const day = parseInt(dateStr.substring(8, 10), 10);
          return day >= startDayOfPrev && day <= daysInPrevMonth;
        }).reduce((sum: number, r: any) => sum + (r.return_qty || 0), 0);

        const prevMTDQtyNet = Math.max(0, prevMonthMTDQty - prevMonthMTDReturnQty);
        growthRate = prevMTDQtyNet > 0 ? ((currQty - prevMTDQtyNet) / prevMTDQtyNet) * 100 : 0;
      } else {
        growthRate = prevQty > 0 ? ((currQty - prevQty) / prevQty) * 100 : 0;
      }
    }

    let growth3m = 0;
    if (monthlyEntries.length >= 6) {
      const last6 = monthlyEntries.slice(-6);
      const currKey = last6[5][0];
      const tYear = today.getFullYear();
      const tMonth = String(today.getMonth() + 1).padStart(2, '0');
      const todayKey = `${tYear}-${tMonth}`;

      if (currKey === todayKey) {
        // Current month is in progress. Use daily averages for recent vs prior 3 months.
        const currentDay = today.getDate();
        
        // Days in recent 3 months (e.g., June, May, April)
        const prevMonth1Obj = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const prevMonth2Obj = new Date(today.getFullYear(), today.getMonth() - 2, 1);
        
        const daysInPrevMonth1 = new Date(prevMonth1Obj.getFullYear(), prevMonth1Obj.getMonth() + 1, 0).getDate();
        const daysInPrevMonth2 = new Date(prevMonth2Obj.getFullYear(), prevMonth2Obj.getMonth() + 1, 0).getDate();
        
        const recentDays = currentDay + daysInPrevMonth1 + daysInPrevMonth2;
        const recentQtySum = last6.slice(3).reduce((sum, e) => sum + (e[1] as number), 0);
        const recentDailyAvg = recentQtySum / recentDays;

        // Days in prior 3 months (e.g., March, Feb, Jan)
        const pm3 = new Date(today.getFullYear(), today.getMonth() - 3, 1);
        const pm4 = new Date(today.getFullYear(), today.getMonth() - 4, 1);
        const pm5 = new Date(today.getFullYear(), today.getMonth() - 5, 1);
        
        const daysInPM3 = new Date(pm3.getFullYear(), pm3.getMonth() + 1, 0).getDate();
        const daysInPM4 = new Date(pm4.getFullYear(), pm4.getMonth() + 1, 0).getDate();
        const daysInPM5 = new Date(pm5.getFullYear(), pm5.getMonth() + 1, 0).getDate();
        
        const priorDays = daysInPM3 + daysInPM4 + daysInPM5;
        const priorQtySum = last6.slice(0, 3).reduce((sum, e) => sum + (e[1] as number), 0);
        const priorDailyAvg = priorQtySum / priorDays;

        growth3m = priorDailyAvg > 0 ? ((recentDailyAvg - priorDailyAvg) / priorDailyAvg) * 100 : 0;
      } else {
        const r3 = last6.slice(3).reduce((s, e) => s + (e[1] as number), 0) / 3;
        const p3 = last6.slice(0, 3).reduce((s, e) => s + (e[1] as number), 0) / 3;
        growth3m = p3 > 0 ? ((r3 - p3) / p3) * 100 : 0;
      }
    }

    const daysSold = new Set(
      details.map((d: any) => {
        const h = headerMap.get(d.sales_header_id);
        return h ? (h.date || h.created_at).substring(0, 10) : null;
      }).filter(Boolean)
    );
    const frequency = totalDays > 0 ? daysSold.size / totalDays : 0;

    const uniqueCustomers = new Set(details.map((d: any) => d.customer_id).filter(Boolean));
    const customerCoverage = uniqueCustomers.size;

    const uniqueRoutes = new Set();
    for (const d of details) {
      const h = headerMap.get(d.sales_header_id);
      if (h) uniqueRoutes.add(d.route_id || h.route || 'unknown');
    }
    const routeCoverage = uniqueRoutes.size;

    const avgQtyPerCustomer = customerCoverage > 0 ? totalQty / customerCoverage : 0;
    const uniqueBills = new Set(details.map((d: any) => d.sales_header_id));
    const avgQtyPerBill = uniqueBills.size > 0 ? totalQty / uniqueBills.size : 0;

    const lastSaleDate = allVisits.length > 0 ? allVisits[0].date : null;
    const daysSinceLastSale = lastSaleDate
      ? Math.floor((today.getTime() - lastSaleDate.getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    const noSaleDays = daysSinceLastSale;

    const seasonalIndex = monthlyAvg > 0 && overallAvgMonthly > 0 ? monthlyAvg / overallAvgMonthly : 1;

    // --- XGBoost Forecasting ---
    let xgbForecast = 0;
    if (uniqueRoutes.size > 0) {
      for (const rid of Array.from(uniqueRoutes) as string[]) {
        const routeDetails = details.filter((d: any) => {
          const h = headerMap.get(d.sales_header_id);
          return h && (d.route_id || h.route || 'unknown') === rid;
        });

        const rLast7Gross = routeDetails.filter((d: any) => {
          const h = headerMap.get(d.sales_header_id);
          return h && (today.getTime() - new Date(h.date || h.created_at).getTime()) / (1000 * 60 * 60 * 24) <= 7;
        }).reduce((s: number, d: any) => s + (d.quantity || 0), 0);

        const rLast30Gross = routeDetails.filter((d: any) => {
          const h = headerMap.get(d.sales_header_id);
          return h && (today.getTime() - new Date(h.date || h.created_at).getTime()) / (1000 * 60 * 60 * 24) <= 30;
        }).reduce((s: number, d: any) => s + (d.quantity || 0), 0);

        const rLast90Gross = routeDetails.filter((d: any) => {
          const h = headerMap.get(d.sales_header_id);
          return h && (today.getTime() - new Date(h.date || h.created_at).getTime()) / (1000 * 60 * 60 * 24) <= 90;
        }).reduce((s: number, d: any) => s + (d.quantity || 0), 0);

        const ret7 = returnsInDays(pid, 7).qty;
        const ret30 = returnsInDays(pid, 30).qty;
        const ret90 = returnsInDays(pid, 90).qty;

        const rLast7 = Math.max(0, rLast7Gross - (last7 > 0 ? (rLast7Gross / last7) * ret7 : 0));
        const rLast30 = Math.max(0, rLast30Gross - (last30 > 0 ? (rLast30Gross / last30) * ret30 : 0));
        const rLast90 = Math.max(0, rLast90Gross - (last90 > 0 ? (rLast90Gross / last90) * ret90 : 0));

        const rTot = routeTotals.get(rid);
        const routeItemAvg = rTot && rTot.visits > 0 ? rTot.total / rTot.visits : 0;

        const rMonthlyMap = new Map();
        for (const m of allMonths) rMonthlyMap.set(m, 0);
        for (const d of routeDetails) {
          const h = headerMap.get(d.sales_header_id);
          if (!h) continue;
          const key = (h.date || h.created_at).substring(0, 7);
          rMonthlyMap.set(key, (rMonthlyMap.get(key) || 0) + (d.quantity || 0));
        }
        const rMonthlyEntries = [...Array.from(rMonthlyMap.entries())].sort((a, b) => a[0].localeCompare(b[0]));
        const rMonthlyValues = [...Array.from(rMonthlyMap.values())];
        const rMonthlyAvg = rMonthlyEntries.length > 0 ? rMonthlyValues.reduce((s: number, v: number) => s + v, 0) / rMonthlyEntries.length : 0;

        let rGrowthRate = 0;
        if (rMonthlyEntries.length >= 2) {
          const rLast2 = rMonthlyEntries.slice(-2);
          const rPrevQty = rLast2[0][1] as number;
          const rCurrQty = rLast2[1][1] as number;
          rGrowthRate = rPrevQty > 0 ? ((rCurrQty - rPrevQty) / rPrevQty) * 100 : 0;
        }

        const rDaysSold = new Set(
          routeDetails.map((d: any) => {
            const h = headerMap.get(d.sales_header_id);
            return h ? (h.date || h.created_at).substring(0, 10) : null;
          }).filter(Boolean)
        );
        const rFrequency = totalDays > 0 ? (rDaysSold.size / totalDays) * 100 : 0;

        const rCustomerCoverage = new Set(routeDetails.map((d: any) => d.customer_id).filter(Boolean)).size;

        const rAllVisits = routeDetails.map((d: any) => ({ date: new Date(headerMap.get(d.sales_header_id)?.date || headerMap.get(d.sales_header_id)?.created_at) }));
        rAllVisits.sort((a: any, b: any) => b.date.getTime() - a.date.getTime());
        const rLastSaleDate = rAllVisits.length > 0 ? rAllVisits[0].date : null;
        const rDaysSinceLastSale = rLastSaleDate
          ? Math.floor((today.getTime() - rLastSaleDate.getTime()) / (1000 * 60 * 60 * 24))
          : 999;

        const routePrediction = predictXGBoostDemand({
          productId: pid,
          routeId: rid,
          last7: rLast7,
          last30: rLast30,
          last90: rLast90,
          routeAvgAll: routeAvgAll,
          routeItemAvg: routeItemAvg,
          monthlyAvg: rMonthlyAvg,
          overallAvgMonthly: overallAvgMonthly,
          growthRate: rGrowthRate,
          frequency: rFrequency,
          customerCoverage: rCustomerCoverage,
          daysSinceLastSale: rDaysSinceLastSale,
          seasonalIndex: seasonalIndex
        }, today);

        xgbForecast += routePrediction;
      }
    }

    const LEAD_TIME = 7;
    const leadTimeDemand = dailyAvg * LEAD_TIME;
    const safetyStock = Math.round(leadTimeDemand * 0.2);
    const reorderPoint = Math.round(leadTimeDemand + safetyStock);
    
    // Heuristic rule-based calculations (restored)
    const forecastDemand = Math.round(
      0.4 * last30 +
      0.25 * routeAvgAll +
      0.15 * (last3RouteAvg || routeAvgAll) +
      0.1 * monthlyAvg +
      0.1 * overallAvgMonthly
    );
    const orderQty = Math.max(0, forecastDemand + safetyStock - currentStock);

    // AI predicted calculations
    const aiForecastDemand = Math.round(xgbForecast);
    const aiOrderQty = Math.max(0, aiForecastDemand + safetyStock - currentStock);

    const stockCoverage = dailyAvg > 0 ? currentStock / dailyAvg : 999;

    const stockoutRisk = currentStock < reorderPoint ? 1 : 0;

    let trendScore = 'Stable';
    if (monthlyEntries.length >= 3) {
      const r3 = monthlyEntries.slice(-3).map(e => e[1] as number);
      if (r3[2] > r3[1] && r3[1] >= r3[0]) trendScore = 'Increasing';
      else if (r3[2] < r3[1] && r3[1] <= r3[0]) trendScore = 'Decreasing';
    }

    // Apportion grand_total (already net of discount) by item share
    const apportionedRevenue = details.reduce((s: number, d: any) => {
      const h = headerMap.get(d.sales_header_id);
      if (!h) return s;
      const invItemTotal = invoiceGrossMap.get(h.id) || 1;
      const share = (d.total_price || 0) / invItemTotal;
      return s + share * (h.grand_total || 0);
    }, 0);
    const salesReturnVal = ret ? ret.value : 0;
    const returnCost = ret ? ret.qty * batchCost : 0;
    const itemCost = details.reduce((s: number, d: any) => s + ((d.quantity || 0) * (d.unit_cost || batchCost)), 0);

    const revenue = Math.max(0, apportionedRevenue - salesReturnVal);
    const finalItemCost = itemCost - returnCost;
    const profit = revenue - finalItemCost;

    const profitPerRoute = routeCoverage > 0 ? profit / routeCoverage : 0;
    const profitPerCustomer = customerCoverage > 0 ? profit / customerCoverage : 0;

    const stockValue = stockInfo.batches.reduce((s: number, b: any) => s + (b.quantity_balance || 0) * (b.unit_cost || 0), 0);
    const deadStockValue = daysSinceLastSale > 90 ? stockValue : 0;

    const avgStock = totalQty > 0 ? Math.max(currentStock, 1) : 1;
    const stockTurnover = totalQty / avgStock;

    const fastMovingScore = (frequency * 40) + Math.min(growthRate / 5, 20) + Math.min(routeCoverage * 3, 40);
    const slowMovingScore = (Math.min(daysSinceLastSale / 10, 50)) + ((1 - frequency) * 50);

    const routeForecast = routeAvgAll * routeCoverage;

    // Heuristic rule-based calculations (restored)
    const nextMonthForecast = Math.round(
      0.4 * Math.max(last30 / 30 * 30, 0) +
      0.3 * routeAvgAll +
      0.2 * monthlyAvg +
      0.1 * (growthRate > 0 ? 1 : -1) * overallAvgMonthly
    );
    const purchaseRec = Math.max(0, nextMonthForecast + safetyStock - currentStock);

    // AI predicted calculations
    const aiNextMonthForecast = Math.round(xgbForecast);
    const aiPurchaseRec = Math.max(0, aiNextMonthForecast + safetyStock - currentStock);

    let healthScore = 100;
    if (currentStock === 0) healthScore -= 30;
    if (stockCoverage < 7 && stockCoverage !== 999) healthScore -= 15;
    if (daysSinceLastSale > 90) healthScore -= 25;
    else if (daysSinceLastSale > 30) healthScore -= 10;
    if (stockoutRisk) healthScore -= 20;
    healthScore = Math.max(0, healthScore);

    const priorityScore = Math.round(
      Math.min(growthRate, 30) + (routeCoverage * 5) + (frequency * 30) + (stockoutRisk * 35)
    );

    const smartScore = Math.round(
      30 * Math.min((routeAvgAll / Math.max(overallAvgMonthly, 1)) / 2, 1) +
      25 * Math.min((last30 / Math.max(dailyAvg * 30, 1)) / 2, 1) +
      15 * Math.min((last3RouteAvg / Math.max(routeAvgAll, 1)) / 2, 1) +
      10 * Math.min(customerCoverage / 50, 1) +
      10 * Math.min(growthRate / 50, 1) +
      10 * Math.min(seasonalIndex / 2, 1)
    );

    let status = 'healthy';
    let statusLabel = '🟢 Healthy';
    if (orderQty > 50) { status = 'urgent'; statusLabel = '🔴 Urgent'; }
    else if (orderQty > 20) { status = 'soon'; statusLabel = '🟡 Soon'; }
    else if (orderQty > 0) { status = 'soon'; statusLabel = '🟡 Soon'; }
    if (daysSinceLastSale > 90 && currentStock > 0) { status = 'dead'; statusLabel = '🐢 Dead Stock'; }

    // AI status calculations
    let aiStatus = 'healthy';
    let aiStatusLabel = '🟢 Healthy';
    if (aiOrderQty > 50) { aiStatus = 'urgent'; aiStatusLabel = '🔴 Urgent'; }
    else if (aiOrderQty > 20) { aiStatus = 'soon'; aiStatusLabel = '🟡 Soon'; }
    else if (aiOrderQty > 0) { aiStatus = 'soon'; aiStatusLabel = '🟡 Soon'; }
    if (daysSinceLastSale > 90 && currentStock > 0) { aiStatus = 'dead'; aiStatusLabel = '🐢 Dead Stock'; }

    const routeData = [];
    for (const [rid, rd] of Array.from(routeTotals.entries()) as any) {
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
      lastPurchaseCost: batchCost || (prod ? prod.cost_price : 0),
      lowStockQty: prod ? prod.low_stock_qty : 0,
      currentStock,
      totalQty,
      overallAvgMonthly: Math.round(overallAvgMonthly),
      dailyAvg: Math.round(dailyAvg * 100) / 100,
      monthlyValues,
      monthlyHistory: monthlyEntries.map(([month, qty]) => ({ month, qty })),
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
      aiForecastDemand,
      aiOrderQty,
      aiNextMonthForecast,
      aiPurchaseRec,
      aiStatus,
      aiStatusLabel,
      healthScore,
      priorityScore,
      smartScore: Math.round(smartScore),
      status,
      statusLabel,
    });
  }

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

  const monthlyGross = new Map();
  const monthlyReturn = new Map();
  const monthlyWorkingDays = new Map();
  for (const h of salesHeaders) {
    const key = (h.date || h.created_at).substring(0, 7);
    const day = (h.date || h.created_at).substring(0, 10);
    // grand_total is already net of discount — use directly
    monthlyGross.set(key, (monthlyGross.get(key) || 0) + (h.grand_total || 0));
    if (!monthlyWorkingDays.has(key)) monthlyWorkingDays.set(key, new Set());
    monthlyWorkingDays.get(key).add(day);
  }
  for (const [month, retVal] of Array.from(returnByMonth.entries())) {
    monthlyReturn.set(month, retVal);
  }
  
  const salesTrend = [...Array.from(monthlyGross.entries())].sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([month, grossNetDiscount]) => ({
    month,
    sales: parseFloat(grossNetDiscount.toFixed(2)),
    workingDays: monthlyWorkingDays.get(month)?.size || 0
  }));
  
  const monthlyBreakdown = [...new Set([...Array.from(monthlyGross.keys()), ...Array.from(monthlyReturn.keys())])]
    .sort().slice(-12).map(m => {
      const g = (monthlyGross.get(m) || 0);
      const r = (monthlyReturn.get(m) || 0);
      const totalSales = g - r;
      return {
        month: m,
        gross: parseFloat(g.toFixed(2)),
        returnVal: parseFloat(r.toFixed(2)),
        saleAmount: parseFloat(totalSales.toFixed(2)),
        discount: 0,
        totalSales: parseFloat(totalSales.toFixed(2)),
      };
    });

  return { calculations: results, salesTrend, monthlyBreakdown };
}
