import { createClient } from '@supabase/supabase-js';

// Use the credentials from mcp.json
// Reminder: This must only be used for read operations. No mutations.
const SUPABASE_URL = 'https://fnelwyjugldtwtokjysj.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZWx3eWp1Z2xkdHd0b2tqeXNqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODQ0ODMwNiwiZXhwIjoyMDY0MDI0MzA2fQ.CcKPqh9knDnXPmyaoC54G3L6fBDQrzll3GsWHX9C84Q';

export const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

export async function fetchAll(table: string, columns: string = '*', pageSize: number = 1000, filter?: string) {
  let all: any[] = [];
  let from = 0;
  let loop = 0;
  while (loop++ < 50) {
    let query = supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (filter) {
      const [col, op, val] = filter.split('=');
      const [operator, value] = op.split('.');
      if (operator === 'eq') (query as any) = (query as any).eq(col, value === 'false' ? false : value === 'true' ? true : value);
    }
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    from += pageSize;
    if (data.length < pageSize) break;
  }
  return all;
}
