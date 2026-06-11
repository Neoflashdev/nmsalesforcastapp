import urllib.request
import json
import math
import os
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score

# Supabase Credentials
import os
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://fnelwyjugldtwtokjysj.supabase.co')
SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SERVICE_ROLE_KEY:
    raise ValueError("Error: SUPABASE_SERVICE_ROLE_KEY environment variable is not set. Please set it before running the script.")

def fetch_all(table, columns='*', filter_str=None):
    all_data = []
    start = 0
    print(f"Fetching table '{table}'...")
    while True:
        url = f"{SUPABASE_URL}/rest/v1/{table}?select={columns}"
        if filter_str:
            url += f"&{filter_str}"
        
        req = urllib.request.Request(url)
        req.add_header('apikey', SERVICE_ROLE_KEY)
        req.add_header('Authorization', f"Bearer {SERVICE_ROLE_KEY}")
        req.add_header('Range-Unit', 'items')
        req.add_header('Range', f"{start}-{start + 1000 - 1}")
        
        try:
            with urllib.request.urlopen(req) as response:
                res_text = response.read().decode('utf-8')
                data = json.loads(res_text)
                if not data:
                    break
                all_data.extend(data)
                if len(data) < 1000:
                    break
                start += 1000
        except Exception as e:
            print(f"Error fetching {table} at range {start}: {e}")
            raise e
    print(f"Loaded {len(all_data)} rows from '{table}'.")
    return all_data

def train():
    # 1. Fetch tables
    headers_raw = fetch_all('sales_header', 'id,date,created_at,sector,route,is_deleted')
    details_raw = fetch_all('sales_details', 'product_id,product_name,quantity,profit,total_price,sales_header_id,customer_id,route_id')
    returns_raw = fetch_all('return_details', 'product_id,return_qty,total_return_value,created_at,sector')
    products_raw = fetch_all('products', 'id,name,selling_price,cost_price')
    routes_raw = fetch_all('routes', 'id,route_name,sector')
    
    # Convert to DataFrames
    df_headers = pd.DataFrame(headers_raw)
    df_details = pd.DataFrame(details_raw)
    df_returns = pd.DataFrame(returns_raw)
    df_products = pd.DataFrame(products_raw)
    df_routes = pd.DataFrame(routes_raw)
    
    # Filter out deleted sales headers
    # Ensure is_deleted column exists, convert to bool
    if 'is_deleted' in df_headers.columns:
        df_headers = df_headers[df_headers['is_deleted'] == False]
    
    # Preprocess Datetimes
    df_headers['date_parsed'] = pd.to_datetime(df_headers['date'].fillna(df_headers['created_at']), utc=True).dt.tz_localize(None)
    df_returns['date_parsed'] = pd.to_datetime(df_returns['created_at'], utc=True).dt.tz_localize(None)
    
    # Lookup dictionaries
    header_dict = df_headers.set_index('id').to_dict('index')
    route_dict = df_routes.set_index('id').to_dict('index')
    product_dict = df_products.set_index('id').to_dict('index')
    
    # Map headers to details
    df_details['date_parsed'] = df_details['sales_header_id'].map(lambda x: header_dict.get(x, {}).get('date_parsed', pd.NaT))
    df_details = df_details.dropna(subset=['date_parsed'])
    
    # Get overall date bounds
    min_date = df_details['date_parsed'].min()
    max_date = df_details['date_parsed'].max()
    print(f"Transaction date range: {min_date} to {max_date}")
    
    if pd.isna(min_date) or pd.isna(max_date):
        print("Error: No valid transaction dates found.")
        return
        
    # We will generate training snapshots for target months.
    # We need at least 3-4 months of history to compute lags and averages.
    # Let's generate target months from 4 months after min_date to max_date
    start_train_month = min_date + pd.DateOffset(months=4)
    target_months = pd.date_range(start=start_train_month, end=max_date, freq='MS') # Month start dates
    
    dataset = []
    
    # Precompute global item/route historical metrics for target encoding
    # We will target encode Item ID and Route ID using historical average monthly quantities.
    # To avoid data leakage, target encoding for a target month M is computed using data prior to M.
    
    for cutoff_date in target_months:
        target_month_str = cutoff_date.strftime('%Y-%m')
        next_month_end = cutoff_date + pd.DateOffset(months=1) - pd.DateOffset(days=1)
        print(f"Generating training features for cutoff: {cutoff_date.strftime('%Y-%m-%d')} (predicting {target_month_str})...")
        
        # Filter history (strictly before cutoff_date)
        hist_details = df_details[df_details['date_parsed'] < cutoff_date]
        hist_headers = df_headers[df_headers['date_parsed'] < cutoff_date]
        hist_returns = df_returns[df_returns['date_parsed'] < cutoff_date]
        
        if len(hist_details) == 0:
            continue
            
        # Target month data (month M)
        target_details = df_details[(df_details['date_parsed'] >= cutoff_date) & (df_details['date_parsed'] <= next_month_end)]
        target_returns = df_returns[(df_returns['date_parsed'] >= cutoff_date) & (df_returns['date_parsed'] <= next_month_end)]
        
        # We model at the (Product, Route) level
        # Active product-route pairs prior to cutoff
        active_pairs = hist_details[['product_id', 'route_id']].drop_duplicates()
        
        # Target month sales per product-route
        target_sales_map = target_details.groupby(['product_id', 'route_id'])['quantity'].sum().to_dict()
        
        # Target returns per product (returns are product level in returns table)
        target_returns_map = target_returns.groupby('product_id')['return_qty'].sum().to_dict()
        
        # Share of product sales in target month by route, to apportion target returns
        target_prod_sales = target_details.groupby('product_id')['quantity'].sum().to_dict()
        
        # Precompute metrics for the history
        total_days = max(1, math.ceil((cutoff_date - min_date).total_seconds() / (24 * 3600)))
        total_months = max(1, math.ceil(total_days / 30))
        
        # Product-level total net sales in history
        hist_prod_gross = hist_details.groupby('product_id')['quantity'].sum().to_dict()
        hist_prod_returns = hist_returns.groupby('product_id')['return_qty'].sum().to_dict()
        
        # Route-level total sales in history
        hist_route_sales = hist_details.groupby('route_id')['quantity'].sum().to_dict()
        
        # Month lists for monthly average
        month_keys = []
        curr = datetime(min_date.year, min_date.month, 1)
        while curr < cutoff_date:
            month_keys.append(curr.strftime('%Y-%m'))
            # Increment month
            if curr.month == 12:
                curr = datetime(curr.year + 1, 1, 1)
            else:
                curr = datetime(curr.year, curr.month + 1, 1)
        
        # Calculate target encodings for this snapshot
        # Item target encoding: average monthly sales of item across all routes in history
        item_encodings = {}
        for pid in hist_prod_gross:
            gross = hist_prod_gross.get(pid, 0)
            ret = hist_prod_returns.get(pid, 0)
            item_encodings[pid] = max(0, gross - ret) / total_months
            
        # Route target encoding: average monthly sales of route across all items in history
        route_encodings = {}
        for rid in hist_route_sales:
            route_encodings[rid] = hist_route_sales.get(rid, 0) / total_months
            
        # Group history details by product and route for fast access
        hist_grouped = hist_details.groupby(['product_id', 'route_id'])
        
        # Iterate over active pairs to compute features
        for _, row in active_pairs.iterrows():
            pid = row['product_id']
            rid = row['route_id']
            
            pair_details = hist_grouped.get_group((pid, rid)) if (pid, rid) in hist_grouped.groups else pd.DataFrame()
            if len(pair_details) == 0:
                continue
                
            # Target Label (Y): Net sales in Month M for (pid, rid)
            gross_target = target_sales_map.get((pid, rid), 0)
            # Apportion returns: if product had returns in target month, allocate by route sales share
            prod_ret_qty = target_returns_map.get(pid, 0)
            prod_tot_sales = target_prod_sales.get(pid, 0)
            ret_share = (gross_target / prod_tot_sales * prod_ret_qty) if prod_tot_sales > 0 else 0
            target_qty = max(0, gross_target - ret_share)
            
            # --- FEATURE ENGINEERING ---
            
            # Lags (using dates relative to cutoff_date)
            last_7d_cutoff = cutoff_date - timedelta(days=7)
            last_30d_cutoff = cutoff_date - timedelta(days=30)
            last_90d_cutoff = cutoff_date - timedelta(days=90)
            
            last7 = pair_details[pair_details['date_parsed'] >= last_7d_cutoff]['quantity'].sum()
            last30 = pair_details[pair_details['date_parsed'] >= last_30d_cutoff]['quantity'].sum()
            last90 = pair_details[pair_details['date_parsed'] >= last_90d_cutoff]['quantity'].sum()
            
            # Subtract returns (returns are product level, so we apportion returns by route sales share)
            # In calculations.ts: returnsInDays(pid, days).qty
            # For simplicity, we apportion based on the last 30/90 days sales share of this route,
            # or just subtract product returns directly apportioned. Let's apportion product-level returns.
            # Let's find product-level returns in last 7, 30, 90 days.
            prod_details_hist = hist_details[hist_details['product_id'] == pid]
            prod_tot_last7 = prod_details_hist[prod_details_hist['date_parsed'] >= last_7d_cutoff]['quantity'].sum()
            prod_tot_last30 = prod_details_hist[prod_details_hist['date_parsed'] >= last_30d_cutoff]['quantity'].sum()
            prod_tot_last90 = prod_details_hist[prod_details_hist['date_parsed'] >= last_90d_cutoff]['quantity'].sum()
            
            ret_last7 = hist_returns[(hist_returns['product_id'] == pid) & (hist_returns['date_parsed'] >= last_7d_cutoff)]['return_qty'].sum()
            ret_last30 = hist_returns[(hist_returns['product_id'] == pid) & (hist_returns['date_parsed'] >= last_30d_cutoff)]['return_qty'].sum()
            ret_last90 = hist_returns[(hist_returns['product_id'] == pid) & (hist_returns['date_parsed'] >= last_90d_cutoff)]['return_qty'].sum()
            
            last7_net = max(0, last7 - (last7 / prod_tot_last7 * ret_last7 if prod_tot_last7 > 0 else 0))
            last30_net = max(0, last30 - (last30 / prod_tot_last30 * ret_last30 if prod_tot_last30 > 0 else 0))
            last90_net = max(0, last90 - (last90 / prod_tot_last90 * ret_last90 if prod_tot_last90 > 0 else 0))
            
            # Route average (average quantity per visit of all items on this route)
            route_all_details = hist_details[hist_details['route_id'] == rid]
            route_all_totals = route_all_details.groupby('product_id').agg(total=('quantity', 'sum'), visits=('quantity', 'count'))
            route_avg_all = (route_all_totals['total'] / route_all_totals['visits']).mean() if len(route_all_totals) > 0 else 0
            
            # Route item average (average quantity per visit of THIS item on THIS route)
            visits = len(pair_details)
            route_item_avg = pair_details['quantity'].sum() / visits if visits > 0 else 0
            
            # Monthly Average (average of gross monthly sales of this item on this route)
            monthly_map = {m: 0.0 for m in month_keys}
            for _, d_row in pair_details.iterrows():
                m_key = d_row['date_parsed'].strftime('%Y-%m')
                if m_key in monthly_map:
                    monthly_map[m_key] += d_row['quantity']
            monthly_values = list(monthly_map.values())
            monthly_avg = sum(monthly_values) / len(monthly_values) if len(monthly_values) > 0 else 0
            
            # Overall Average Monthly (net of returns, product level)
            prod_gross = hist_prod_gross.get(pid, 0)
            prod_ret = hist_prod_returns.get(pid, 0)
            overall_avg_monthly = max(0, prod_gross - prod_ret) / total_months
            
            # Growth Rate (Comparing Month M-1 to Month M-2)
            growth_rate = 0.0
            if len(month_keys) >= 2:
                m_1_key = month_keys[-1]
                m_2_key = month_keys[-2]
                qty_m_1 = monthly_map.get(m_1_key, 0.0)
                qty_m_2 = monthly_map.get(m_2_key, 0.0)
                if qty_m_2 > 0:
                    growth_rate = ((qty_m_1 - qty_m_2) / qty_m_2) * 100
            
            # Sales Frequency (active days sold / total days)
            days_sold = pair_details['date_parsed'].dt.strftime('%Y-%m-%d').nunique()
            frequency = (days_sold / total_days) * 100 # In percentage as in calculations.ts * 1000/10
            
            # Customer Coverage (unique customers on this route for this item)
            customer_coverage = pair_details['customer_id'].nunique()
            
            # Days since last sale
            latest_sale_date = pair_details['date_parsed'].max()
            days_since_last_sale = (cutoff_date - latest_sale_date).days if pd.notna(latest_sale_date) else 999
            
            # Seasonal Index (monthly average / overall average monthly)
            seasonal_index = 1.0
            if monthly_avg > 0 and overall_avg_monthly > 0:
                seasonal_index = monthly_avg / overall_avg_monthly
            
            # Month cyclical encoding
            month_val = cutoff_date.month
            month_sin = math.sin(2 * math.pi * month_val / 12)
            month_cos = math.cos(2 * math.pi * month_val / 12)
            
            # Append training record
            dataset.append({
                # Metadata / Identifiers
                'product_id': pid,
                'route_id': rid,
                'target_month': target_month_str,
                
                # Target
                'target_qty': target_qty,
                
                # Engineered Features
                'item_id_encoded': item_encodings.get(pid, 0.0),
                'route_id_encoded': route_encodings.get(rid, 0.0),
                'month_sin': month_sin,
                'month_cos': month_cos,
                'last7': last7_net,
                'last30': last30_net,
                'last90': last90_net,
                'route_avg_all': route_avg_all,
                'route_item_avg': route_item_avg,
                'monthly_avg': monthly_avg,
                'overall_avg_monthly': overall_avg_monthly,
                'growth_rate': growth_rate,
                'frequency': frequency,
                'customer_coverage': customer_coverage,
                'days_since_last_sale': days_since_last_sale,
                'seasonal_index': seasonal_index
            })
            
    # Convert dataset to DataFrame
    df_train = pd.DataFrame(dataset)
    print(f"Total training samples generated: {len(df_train)}")
    
    if len(df_train) == 0:
        print("Error: No training data generated.")
        return
        
    # Feature columns in exact order
    features = [
        'item_id_encoded', 'route_id_encoded', 'month_sin', 'month_cos',
        'last7', 'last30', 'last90', 'route_avg_all', 'route_item_avg',
        'monthly_avg', 'overall_avg_monthly', 'growth_rate', 'frequency',
        'customer_coverage', 'days_since_last_sale', 'seasonal_index'
    ]
    
    X = df_train[features]
    y = df_train['target_qty']
    
    # Train / Test split
    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.15, random_state=42)
    
    print(f"Training on {len(X_train)} samples, validating on {len(X_val)} samples.")
    
    # Train XGBoost Regressor
    model = xgb.XGBRegressor(
        n_estimators=100,
        max_depth=5,
        learning_rate=0.08,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        base_score=0.5
    )
    
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=False
    )
    
    # Evaluate model
    y_pred = model.predict(X_val)
    # Clip predictions to 0 since sales cannot be negative
    y_pred = np.clip(y_pred, 0, None)
    
    rmse = math.sqrt(mean_squared_error(y_val, y_pred))
    r2 = r2_score(y_val, y_pred)
    print(f"Validation RMSE: {rmse:.4f}")
    print(f"Validation R^2: {r2:.4f}")
    
    # --- EXPORT MODEL AND METADATA ---
    # We will export the model trees in nested JSON format using dump_model
    booster = model.get_booster()
    temp_path = 'temp_dump.json'
    booster.dump_model(temp_path, dump_format='json', with_stats=False)
    with open(temp_path, 'r') as f:
        trees_list = json.load(f)
    if os.path.exists(temp_path):
        os.remove(temp_path)
    
    # Calculate final Target Encodings on the ENTIRE dataset to export to the frontend
    # Item target encoding: average monthly sales of item across all routes in entire history
    # Route target encoding: average monthly sales of route across all items in entire history
    total_days_full = max(1, math.ceil((max_date - min_date).total_seconds() / (24 * 3600)))
    total_months_full = max(1, math.ceil(total_days_full / 30))
    
    full_prod_gross = df_details.groupby('product_id')['quantity'].sum().to_dict()
    full_prod_returns = df_returns.groupby('product_id')['return_qty'].sum().to_dict()
    full_route_sales = df_details.groupby('route_id')['quantity'].sum().to_dict()
    
    item_encodings_final = {}
    for pid in full_prod_gross:
        gross = full_prod_gross.get(pid, 0)
        ret = full_prod_returns.get(pid, 0)
        item_encodings_final[pid] = max(0, gross - ret) / total_months_full
        
    route_encodings_final = {}
    for rid in full_route_sales:
        route_encodings_final[rid] = full_route_sales.get(rid, 0) / total_months_full
        
    # Create metadata JSON
    metadata = {
        "features": features,
        "base_score": float(model.base_score) if model.base_score is not None else 0.5,
        "item_encodings": item_encodings_final,
        "route_encodings": route_encodings_final,
        "last_trained_month": max_date.strftime('%Y-%m') if not pd.isna(max_date) else 'N/A',
        "trained_at": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "global_averages": {
            "item_encoding_fallback": float(np.mean(list(item_encodings_final.values()))) if item_encodings_final else 0.0,
            "route_encoding_fallback": float(np.mean(list(route_encodings_final.values()))) if route_encodings_final else 0.0,
            "route_avg_all_fallback": float(df_train['route_avg_all'].mean()) if not df_train.empty else 0.0
        }
    }
    
    # Write model.json and model_metadata.json to e:/nmsalesforcastapp/src/services/
    out_dir = 'e:/nmsalesforcastapp/src/services'
    os.makedirs(out_dir, exist_ok=True)
    
    with open(os.path.join(out_dir, 'model.json'), 'w') as f:
        json.dump(trees_list, f, indent=2)
    print(f"Model trees written to {os.path.join(out_dir, 'model.json')}")
    
    with open(os.path.join(out_dir, 'model_metadata.json'), 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"Model metadata written to {os.path.join(out_dir, 'model_metadata.json')}")
    
    # Generate test cases to verify the TypeScript predictor
    test_cases = [
        {f: 0.0 for f in features},
        {
            'item_id_encoded': 55.2,
            'route_id_encoded': 120.5,
            'month_sin': 0.5,
            'month_cos': 0.86,
            'last7': 5.0,
            'last30': 25.0,
            'last90': 70.0,
            'route_avg_all': 12.4,
            'route_item_avg': 8.2,
            'monthly_avg': 22.0,
            'overall_avg_monthly': 20.0,
            'growth_rate': 12.5,
            'frequency': 45.0,
            'customer_coverage': 8.0,
            'days_since_last_sale': 3.0,
            'seasonal_index': 1.1
        },
        {
            'item_id_encoded': 350.0,
            'route_id_encoded': 800.0,
            'month_sin': -0.86,
            'month_cos': -0.5,
            'last7': 80.0,
            'last30': 310.0,
            'last90': 950.0,
            'route_avg_all': 45.0,
            'route_item_avg': 35.0,
            'monthly_avg': 320.0,
            'overall_avg_monthly': 300.0,
            'growth_rate': -5.0,
            'frequency': 95.0,
            'customer_coverage': 42.0,
            'days_since_last_sale': 0.0,
            'seasonal_index': 1.07
        },
        {
            'item_id_encoded': 12.0,
            'route_id_encoded': 50.0,
            'month_sin': 0.0,
            'month_cos': -1.0,
            'last7': 0.0,
            'last30': 0.0,
            'last90': 0.0,
            'route_avg_all': 2.0,
            'route_item_avg': 0.0,
            'monthly_avg': 1.0,
            'overall_avg_monthly': 1.2,
            'growth_rate': 0.0,
            'frequency': 1.0,
            'customer_coverage': 0.0,
            'days_since_last_sale': 120.0,
            'seasonal_index': 0.83
        }
    ]
    df_test = pd.DataFrame(test_cases)
    dtest = xgb.DMatrix(df_test[features])
    preds = booster.predict(dtest)
    preds_clipped = np.clip(preds, 0, None)
    
    outputs = []
    for i, test_case in enumerate(test_cases):
        outputs.append({
            "id": i + 1,
            "features": test_case,
            "python_prediction": float(preds_clipped[i]),
            "python_raw_prediction": float(preds[i])
        })
        
    os.makedirs('e:/nmsalesforcastapp/scratch', exist_ok=True)
    with open('e:/nmsalesforcastapp/scratch/test_samples.json', 'w') as f:
        json.dump(outputs, f, indent=2)
    print("Test samples generated in scratch/test_samples.json")

    # Upload files to Supabase Storage Bucket 'ai-models'
    def upload_file(local_path, remote_name):
        url = f"{SUPABASE_URL}/storage/v1/object/ai-models/{remote_name}"
        try:
            with open(local_path, 'rb') as f_in:
                file_bytes = f_in.read()
            
            # Make HTTP POST request to upload the file
            req = urllib.request.Request(url, data=file_bytes, method='POST')
            req.add_header('Authorization', f"Bearer {SERVICE_ROLE_KEY}")
            req.add_header('apikey', SERVICE_ROLE_KEY)
            req.add_header('x-upsert', 'true') # Allow overwriting
            req.add_header('Content-Type', 'application/json')
            
            with urllib.request.urlopen(req) as response:
                print(f"Successfully uploaded {remote_name} to Supabase Storage (Status: {response.getcode()})")
        except Exception as upload_err:
            print(f"Failed to upload {remote_name} to Supabase Storage: {upload_err}")

    print("Uploading models to Supabase Storage bucket 'ai-models'...")
    upload_file(os.path.join(out_dir, 'model.json'), 'model.json')
    upload_file(os.path.join(out_dir, 'model_metadata.json'), 'model_metadata.json')

if __name__ == '__main__':
    train()
