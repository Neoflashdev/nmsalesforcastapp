const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fnelwyjugldtwtokjysj.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZWx3eWp1Z2xkdHd0b2tqeXNqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODQ0ODMwNiwiZXhwIjoyMDY0MDI0MzA2fQ.CcKPqh9knDnXPmyaoC54G3L6fBDQrzll3GsWHX9C84Q';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function fetchAll(table, columns = '*') {
  let all = [];
  let from = 0;
  let loop = 0;
  while (loop++ < 50) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    from += 1000;
    if (data.length < 1000) break;
  }
  return all;
}

async function run() {
  const [salesHeaders, salesDetails, returnDetails] = await Promise.all([
    fetchAll('sales_header', 'id,date,grand_total,total_discount'),
    fetchAll('sales_details', 'sales_header_id,total_price'),
    fetchAll('return_details', 'total_return_value,created_at'),
  ]);

  let sumGrandTotal = 0;
  let sumDiscount = 0;
  let sumTotalPrice = 0;
  let sumReturn = 0;

  for (const h of salesHeaders) {
    if ((h.date || '').startsWith('2026-06') || (h.created_at || '').startsWith('2026-06')) {
      sumGrandTotal += h.grand_total || 0;
      sumDiscount += h.total_discount || 0;
    }
  }

  for (const h of salesHeaders) {
    if ((h.date || '').startsWith('2026-06') || (h.created_at || '').startsWith('2026-06')) {
      // Find matching items
      for (const d of salesDetails) {
        if (d.sales_header_id === h.id) {
          sumTotalPrice += d.total_price || 0;
        }
      }
    }
  }

  for (const rd of returnDetails) {
    if ((rd.created_at || '').startsWith('2026-06')) {
      sumReturn += rd.total_return_value || 0;
    }
  }

  console.log('Grand Total Sum for June 2026:', sumGrandTotal);
  console.log('Total Price Sum for June 2026 (Gross from Items?):', sumTotalPrice);
  console.log('Total Discount Sum for June 2026:', sumDiscount);
  console.log('Total Return Value Sum for June 2026:', sumReturn);

  // Using formulas:
  // Option A: gross = sumTotalPrice.
  const grossA = sumTotalPrice;
  const salesAmtA = grossA - sumReturn;
  const totalSalesA = salesAmtA - sumDiscount;

  // Option B: gross = sumGrandTotal
  const grossB = sumGrandTotal;
  const salesAmtB = grossB - sumReturn;
  const totalSalesB = salesAmtB - sumDiscount;

  console.log('Formula Option A Total Sales:', totalSalesA);
  console.log('Formula Option B Total Sales:', totalSalesB);
}

run();
