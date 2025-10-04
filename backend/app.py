#!/usr/bin/env python3
"""
Flask API for exoplanet classifier.

Integrates with the train_model.py pipeline for loading, classifying, and retraining.
The /api/train endpoint supports uploading a single CSV file for retraining the model.
"""

import os
import numpy as np
import pandas as pd
import shap
from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
from werkzeug.utils import secure_filename
import traceback
import math
from scipy import sparse  # for sparse matrix checks (if scikit-learn returns sparse arrays)
import datetime
from typing import Tuple
import train_model

# Import all necessary functions/constants from the training script
try:
    import train_model
except ImportError:
    print("FATAL ERROR: Could not import 'train_model.py'. Ensure the file is in the same directory.")
    exit()

app = Flask(__name__)
CORS(app)

# --- Configuration ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# FIX: Define model filenames locally to avoid dependency errors.
MODEL_FILENAME = "exo_model.pkl"
META_FILENAME = "exo_meta.pkl"

MODEL_PATH = os.path.join(BASE_DIR, MODEL_FILENAME)
META_PATH = os.path.join(BASE_DIR, META_FILENAME)
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

# --- Input field definitions (matching the core features of the pipeline) ---
INPUT_FIELD_DEFINITIONS = {
    "orbital_period_days": {"description": "Orbital period in days", "positive": True, "min_temp": None},
    "planet_radius_rearth": {"description": "Planet Radius (Earth radii)", "positive": True, "min_temp": None},
    "insolation_flux_eflux": {"description": "Insolation Flux (Earth flux)", "positive": True, "min_temp": None},
    "equilibrium_temp_K": {"description": "Equilibrium Temp (K)", "positive": True, "min_temp": 1000.0},
    "stellar_teff_K": {"description": "Stellar Effective Temp (K)", "positive": True, "min_temp": 1000.0},
    "stellar_logg_cgs": {"description": "Stellar log(g) (cgs)", "positive": False, "min_temp": None},
    "stellar_radius_rsun": {"description": "Stellar Radius (Solar radii)", "positive": True, "min_temp": None},
    "stellar_mag": {"description": "Stellar Magnitude", "positive": False, "min_temp": None},
    "ra_deg": {"description": "Right Ascension (deg)", "positive": False, "min_temp": None},
    "dec_deg": {"description": "Declination (deg)", "positive": False, "min_temp": None},
}
REQUIRED_INPUT_FIELDS = list(INPUT_FIELD_DEFINITIONS.keys())

# --- Model Mappings (Defined locally to ensure robustness in _prepare_uploaded_data) ---
COLUMN_MAPPING = {
    "orbital_period_days": {"KOI": "koi_period", "TOI": "pl_orbper", "K2": "pl_orbper"},
    "planet_radius_rearth": {"KOI": "koi_prad", "TOI": "pl_rade", "K2": "pl_rade"},
    "insolation_flux_eflux": {"KOI": "koi_insol", "TOI": "pl_insol", "K2": "pl_insol"},
    "equilibrium_temp_K": {"KOI": "koi_teq", "TOI": "pl_eqt", "K2": "pl_eqt"},
    "stellar_teff_K": {"KOI": "koi_steff", "TOI": "st_teff", "K2": "st_teff"},
    "stellar_logg_cgs": {"KOI": "koi_slogg", "TOI": "st_logg", "K2": "st_logg"},
    "stellar_radius_rsun": {"KOI": "koi_srad", "TOI": "st_rad", "K2": "st_rad"},
    "stellar_mag": {"KOI": "koi_kepmag", "TOI": "st_tmag", "K2": "sy_vmag"},
    "ra_deg": {"KOI": "ra", "TOI": "ra", "K2": "ra"},
    "dec_deg": {"KOI": "dec", "TOI": "dec", "K2": "dec"},
}
LABEL_MAPPING = {
    "source_columns": ["koi_disposition", "tfopwg_disp", "disposition", "label"],
    "values": {
        "CONFIRMED": "CONFIRMED", "CANDIDATE": "CANDIDATE", "FALSE POSITIVE": "FALSE POSITIVE",
        "PC": "CANDIDATE", "CP": "CONFIRMED", "KP": "CONFIRMED", "FP": "FALSE POSITIVE"
    }
}


# --- Global artifacts (populated at startup) ---
pipeline = None
metadata = None
explainer = None
preprocessor = None
MODEL_FEATURE_COLS = []
CATEGORIES = []
FEATURE_NAMES_OUT = []


def load_global_artifacts():
    """Loads model, metadata, and SHAP explainer into global variables."""
    global pipeline, metadata, explainer, preprocessor, MODEL_FEATURE_COLS, CATEGORIES, FEATURE_NAMES_OUT

    print("\n🔄 Loading model artifacts...")
    try:
        pipeline = joblib.load(MODEL_PATH)
        metadata = joblib.load(META_PATH)
        print("✅ Model and metadata loaded successfully.")

        MODEL_FEATURE_COLS = metadata.get("feature_cols", [])
        CATEGORIES = metadata.get("categories", ["FALSE POSITIVE", "CANDIDATE", "CONFIRMED"])
        print(f"✅ Model expects {len(MODEL_FEATURE_COLS)} features. Categories: {CATEGORIES}")

        # --- Set up SHAP explainer if possible ---
        explainer = None
        preprocessor = None
        FEATURE_NAMES_OUT = []

        if hasattr(pipeline, "named_steps"):
            preprocessor = pipeline.named_steps.get("preprocessor", None)
            clf = pipeline.named_steps.get("clf", None)

            # Try to find a LightGBM estimator inside a stacking classifier or similar
            lgbm_model = None
            if clf is not None:
                if hasattr(clf, "named_estimators_"):
                    # Use 'lgbm' base estimator for SHAP (as this is typically TreeExplainer compatible)
                    lgbm_model = clf.named_estimators_.get("lgbm")
                elif ("LGBM" in clf.__class__.__name__.upper() or "LIGHTGBM" in clf.__class__.__name__.upper()):
                    # If the final estimator is an LGBM
                    lgbm_model = clf

            # Create SHAP explainer
            if lgbm_model is not None:
                try:
                    explainer = shap.TreeExplainer(lgbm_model)
                    print("✅ SHAP TreeExplainer created for LightGBM model.")
                except Exception as e:
                    print(f"⚠ Could not create SHAP TreeExplainer: {e}")
                    traceback.print_exc()
            else:
                print("⚠ Could not find a LightGBM base estimator for SHAP explanation.")

            # Try to obtain FEATURE_NAMES_OUT from the preprocessor
            if preprocessor is not None and MODEL_FEATURE_COLS:
                try:
                    # Best practice: pass original feature names to get_feature_names_out
                    FEATURE_NAMES_OUT = list(preprocessor.get_feature_names_out(MODEL_FEATURE_COLS))
                except Exception:
                    try:
                        # Some older versions/pipelines accept no args
                        FEATURE_NAMES_OUT = list(preprocessor.get_feature_names_out())
                    except Exception:
                        # Fallback: use a generic f0..fN naming
                        print("⚠ Preprocessor.get_feature_names_out failed. Using fallback feature names.")
                        # Determine feature count by fitting a dummy sample if possible
                        dummy_df = pd.DataFrame(columns=MODEL_FEATURE_COLS, index=[0]).fillna(0)
                        try:
                            dummy_transformed = preprocessor.transform(dummy_df)
                            n_features = dummy_transformed.shape[1]
                            FEATURE_NAMES_OUT = [f"f{i}" for i in range(n_features)]
                        except:
                            FEATURE_NAMES_OUT = [f"f{i}" for i in range(len(MODEL_FEATURE_COLS))]
            
            print(f"✅ Preprocessed feature count for SHAP (len): {len(FEATURE_NAMES_OUT)}")

        else:
            print("⚠ Pipeline does not have named_steps; cannot extract preprocessor/estimator easily.")

    except FileNotFoundError:
        print(f"❌ Error: '{MODEL_PATH}' or '{META_PATH}' not found. Endpoints may fail until model is trained.")
    except Exception as e:
        print(f"❌ An error occurred during artifact loading: {e}")
        traceback.print_exc()


def parse_hyperparameters(form_data):
    """
    Safely parse hyperparameters from form data, converting them to correct numeric types.
    
    Uses defaults defined here since train_model.DEFAULT_HYPERPARAMETERS might not be globally exposed.
    """
    # --- Local Defaults (Matching train_model defaults for safety) ---
    defaults = {
        "train_test_split": 0.8,  # 80% train, 20% test
        "cv_folds": 5,
        "rf_estimators": 400, # Updated RF default to match original pipeline
        "xgb_estimators": 500,
        "lgbm_estimators": 500,
        "xgb_max_depth": 7,
        "lgbm_max_depth": -1, # Updated LGBM default to match original pipeline
        "learning_rate": 0.05,
    }

    hyperparams = {}

    # Floats
    for key in ["train_test_split", "learning_rate"]:
        try:
            value_str = form_data.get(key, None)
            value = float(value_str) if value_str not in (None, "") else defaults[key]
            if math.isnan(value):
                raise ValueError
            hyperparams[key] = value
        except (TypeError, ValueError):
            hyperparams[key] = defaults[key]

    # Integers
    for key in [
        "cv_folds",
        "rf_estimators",
        "xgb_estimators",
        "lgbm_estimators",
        "xgb_max_depth",
        "lgbm_max_depth",
    ]:
        try:
            value_str = form_data.get(key, None)
            hyperparams[key] = int(value_str) if value_str not in (None, "") else defaults[key]
        except (TypeError, ValueError):
            hyperparams[key] = defaults[key]
            
    # Handle lgbm_max_depth=-1 specifically, as the UI might send 0 or None for "unlimited"
    if hyperparams.get("lgbm_max_depth") == 0:
        hyperparams["lgbm_max_depth"] = -1
        
    # Convert training ratio (train_test_split) to test_size (1 - ratio)
    hyperparams["test_size"] = 1.0 - hyperparams["train_test_split"]
    return hyperparams


# --- Internal Data Preparation Function ---

def _prepare_uploaded_data(df_raw: pd.DataFrame) -> pd.DataFrame:
    """
    Performs column mapping, ensures numeric types, standardizes labels, and adds source on a single uploaded DataFrame.
    
    This function uses local MAPPING constants to ensure robustness.
    It relies on train_model.add_features being exposed.
    """
    df = df_raw.copy()
    
    # 1. Normalize feature columns using COLUMN_MAPPING (NOW LOCAL)
    for standard_name, source_map in COLUMN_MAPPING.items(): 
        # Identify possible original column names
        original_cols = [col for col in source_map.values() if col in df.columns and col != standard_name]
        if original_cols:
            # Rename the first matching original column to the standard name
            df = df.rename(columns={original_cols[0]: standard_name})
            
    # 2. FIX: Coerce designated numeric columns to float to handle embedded strings (the ValueError)
    numeric_cols = list(INPUT_FIELD_DEFINITIONS.keys())
    for col in numeric_cols:
        if col in df.columns:
            # Errors='coerce' converts strings like 'K05908.01' to NaN
            df[col] = pd.to_numeric(df[col], errors='coerce')
            
    # 3. Find and standardize the label column using LABEL_MAPPING (NOW LOCAL)
    label_col_found = next((col for col in LABEL_MAPPING["source_columns"] if col in df.columns), None)
    
    if not label_col_found and 'label' not in df.columns:
        raise ValueError(f"No valid label column found in the uploaded file. Expected one of: {LABEL_MAPPING['source_columns']} or 'label'.")

    # Use the found label column or default to 'label' if it exists
    label_series = df.get(label_col_found, df.get('label'))
    
    # Map the labels
    if not label_series.empty:
        df["label"] = label_series.map(LABEL_MAPPING["values"])
        df = df.dropna(subset=["label"])
    else:
        # Should not happen for training, but defensive copy of old logic remains
        pass

    # 4. Add 'source' column for categorical feature
    if "source" not in df.columns:
        df["source"] = "uploaded_retrain" 
        
    # 5. Add engineered features (rely on train_model helper)
    df = train_model.add_features(df)
    
    # Drop any duplicate columns created during renaming
    df = df.loc[:,~df.columns.duplicated(keep='first')]

    return df


# --- API Endpoints ---

@app.route("/classify", methods=["POST"])
def classify():
    """Handles the POST request for classification, including feature engineering."""
    if pipeline is None or metadata is None:
        return jsonify({"error": "Model is not loaded. Please train a model first."}), 503

    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({"error": "No JSON data received."}), 400

        # 1. Validate User Input
        validation_errors = []
        processed_data = {}
        missing_fields = [f for f in REQUIRED_INPUT_FIELDS if f not in data or data.get(f) is None]
        if missing_fields:
            return jsonify({"error": f"Missing required fields: {', '.join(missing_fields)}"}), 400

        for field, rules in INPUT_FIELD_DEFINITIONS.items():
            try:
                # Attempt to convert to float (handles standard input format)
                value = float(data[field])
                if rules.get("positive") and value <= 0:
                    validation_errors.append(f"'{field}' must be positive.")
                min_temp = rules.get("min_temp")
                if min_temp is not None and value < min_temp:
                    validation_errors.append(f"'{field}' must be at least {min_temp}K.")
                processed_data[field] = value
            except (ValueError, TypeError):
                validation_errors.append(f"'{field}' has an invalid numeric value.")

        if validation_errors:
            return jsonify({"error": "Validation failed: " + "; ".join(validation_errors)}), 400

        # 2. Data Preparation
        # Create a single row DataFrame with the raw input data
        df_raw = pd.DataFrame([processed_data])
        
        # Apply Feature Engineering (using the function from train_model.py)
        df_engineered = train_model.add_features(df_raw)
        
        # Add the 'source' column for the categorical preprocessor
        df_engineered["source"] = "uploaded"

        # Reindex to match the columns the preprocessor expects, filling any missing required columns with NaN
        model_features_df = df_engineered.reindex(columns=MODEL_FEATURE_COLS, fill_value=np.nan)

        # --- START: New integrated code ---
        probabilities = pipeline.predict_proba(model_features_df)[0]
        prediction_idx = np.argmax(probabilities)
        prediction = CATEGORIES[prediction_idx]
        confidence = float(probabilities[prediction_idx])

        # --- 4. SHAP Value Calculation (reverted to original, stable logic) ---
        shap_values_for_response = []
        if explainer and preprocessor:
            try:
                # Transform the input using the preprocessor to get the features for the base model
                X_transformed = preprocessor.transform(model_features_df)
                
                # Calculate SHAP values for the transformed data
                shap_values_all_classes = explainer.shap_values(X_transformed)
                
                # Handle SHAP output format (it's a list for multi-class classifiers)
                if isinstance(shap_values_all_classes, list):
                    # Pick the SHAP values for the predicted class
                    shap_values_for_prediction = shap_values_all_classes[prediction_idx]
                else:
                    shap_values_for_prediction = shap_values_all_classes

                # Extract the values for our single instance (shape is (1, n_features))
                if isinstance(shap_values_for_prediction, np.ndarray) and shap_values_for_prediction.ndim > 1:
                    shap_values_for_prediction = shap_values_for_prediction[0]
                
                shap_values_list = shap_values_for_prediction.flatten().tolist()
                
                # Combine feature names with their corresponding SHAP values
                for feature_name, shap_value in zip(FEATURE_NAMES_OUT, shap_values_list):
                    shap_values_for_response.append({
                        "feature": str(feature_name), 
                        "value": float(shap_value)
                    })
            except Exception as e:
                print(f"❌ Error during SHAP calculation: {e}")
                traceback.print_exc()

        # --- 5. Final Response ---
        return jsonify({
            'prediction': prediction,
            'confidence': confidence,
            'probabilities': {cat: float(prob) for cat, prob in zip(CATEGORIES, probabilities)},
            'shap_values': shap_values_for_response,
        })
        # --- END: New integrated code ---
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': f'Internal Server Error: {str(e)}'}), 500


@app.route("/api/train", methods=["POST"])
def train_model_endpoint():
    """Handles file upload and triggers the training pipeline with dynamic hyperparameters."""
    filepath = None

    # 1. Validate file presence
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files["file"]
    if not file or file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    try:
        # 2. Parse Hyperparameters
        hyperparams = parse_hyperparameters(request.form)
        print(f"✅ Training started with hyperparameters: {hyperparams}")

        # 3. Save and Read File
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        file.save(filepath)

        # Read the uploaded file
        df_raw = train_model.read_with_fallback(filepath)
        
        # Remove temp file as soon as possible
        if os.path.exists(filepath):
            os.remove(filepath)
            filepath = None

        # 4. Prepare data for training
        # FIX: Call the local preparation function instead of the missing one from train_model.
        df_prepared = _prepare_uploaded_data(df_raw) 

        if df_prepared.empty:
                 # Check if there are any valid labeled examples left
                 if df_raw.shape[0] > 0:
                      return jsonify({"error": "Training dataset is empty after label mapping and missing value removal. Please ensure your file has valid labels (e.g., CONFIRMED, FP, PC, etc.)."}), 400
                 else:
                      return jsonify({"error": "The uploaded file is empty or could not be read."}), 400


        # 5. Train and Evaluate
        # train_and_evaluate expects a single prepared dataframe that includes the 'label' column
        pipeline_trained, metrics, baseline_stats, feature_cols, metrics_json = train_model.train_and_evaluate(
            df_prepared, # Pass the single prepared DataFrame
            test_size=hyperparams["test_size"],
            cv_folds=hyperparams["cv_folds"],
            rf_estimators=hyperparams["rf_estimators"],
            xgb_estimators=hyperparams["xgb_estimators"],
            lgbm_estimators=hyperparams["lgbm_estimators"],
            xgb_max_depth=hyperparams["xgb_max_depth"],
            lgbm_max_depth=hyperparams["lgbm_max_depth"],
            learning_rate=hyperparams["learning_rate"],
        )
        
        # 6. Create Metadata
        metadata_new = {
            "feature_cols": feature_cols,
            "baseline_stats": baseline_stats,
            "metrics": metrics,
            # Use 'label' column from prepared data
            "categories": sorted(df_prepared["label"].unique()) if "label" in df_prepared.columns else [],
            "hyperparameters_used": hyperparams,
            "training_date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

        # 7. Save artifacts via helper from train_model
        train_model.save_artifacts(pipeline_trained, MODEL_PATH, metadata_new, META_PATH)

        # 8. Reload artifacts into this running app
        load_global_artifacts()

        # Return the saved metrics JSON for immediate display in the frontend
        return jsonify(
            {
                "success": True,
                "message": "Model trained, saved, and reloaded successfully.",
                "metrics_json": metrics_json,
                "hyperparameters_used": hyperparams,
            }
        )

    except Exception as e:
        # Cleanup uploaded file if it still exists
        try:
            if filepath and os.path.exists(filepath):
                os.remove(filepath)
        except Exception:
            pass
        # Log the full traceback for debugging
        traceback.print_exc()
        return jsonify({"error": f"Training error: {str(e)}"}), 500


if __name__ == "__main__":
    load_global_artifacts()
    # Run on port 5000 to match frontend expectations
    app.run(debug=True, port=5000)