import json
import xgboost as xgb
import pandas as pd
import numpy as np

def generate():
    # Load model
    model = xgb.XGBRegressor()
    # We can load the booster from the model.json directly using load_model
    # since it was exported as booster json
    booster = xgb.Booster()
    booster.load_model('e:/nmsalesforcastapp/src/services/model.json')
    model._Booster = booster
    model.base_score = 0.5 # Default base score
    
    # Load metadata to get feature list
    with open('e:/nmsalesforcastapp/src/services/model_metadata.json', 'r') as f:
        meta = json.load(f)
        
    features_list = meta['features']
    base_score = meta['base_score']
    
    # Create a few test feature vectors
    test_cases = [
        # Test Case 1: All zeros (empty baseline)
        {f: 0.0 for f in features_list},
        
        # Test Case 2: Standard typical sales
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
        
        # Test Case 3: High volume, high frequency
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
        
        # Test Case 4: Long inactive product (should predict 0 or close to 0)
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
    
    # Run predictions in python
    df_test = pd.DataFrame(test_cases)
    dtest = xgb.DMatrix(df_test[features_list])
    # booster.predict outputs raw leaf scores before base_score? No, booster.predict includes base_score in regression.
    preds = booster.predict(dtest)
    # Clip predictions to 0
    preds_clipped = np.clip(preds, 0, None)
    
    outputs = []
    for i, test_case in enumerate(test_cases):
        outputs.append({
            "id": i + 1,
            "features": test_case,
            "python_prediction": float(preds_clipped[i]),
            "python_raw_prediction": float(preds[i])
        })
        
    with open('e:/nmsalesforcastapp/scratch/test_samples.json', 'w') as f:
        json.dump(outputs, f, indent=2)
        
    print(f"Generated 4 test cases in scratch/test_samples.json.")

if __name__ == '__main__':
    generate()
