import pandas as pd
import numpy as np
import joblib
import logging
import json
import datetime
import os
from typing import List, Dict, Any, Tuple

from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier, StackingClassifier
from sklearn.metrics import (accuracy_score, precision_score, recall_score, f1_score,
                             classification_report, confusion_matrix, roc_auc_score)
import lightgbm as lgb
from xgboost import XGBClassifier

# NEW: Import helper functions from the central processor file
# This makes the code modular and ensures consistency.
from data_processor import apply_mapping, add_features, LABEL_MAPS, LABEL_COLS, COLUMN_MAPPING


# --- Configuration & Logging ---
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("exo_model_pipeline")

# File paths remain the same
KOI_DATA_PATH = "C:\\Users\\Doha\\Nasa2\\Nasa\\backend\\cumulative_2025.09.24_05.23.19.csv"
TOI_DATA_PATH = "C:\\Users\\Doha\\Nasa2\\Nasa\\backend\\TOI_2025.09.24_05.26.33.csv"
K2_DATA_PATH = "C:\\Users\\Doha\\Nasa2\\Nasa\\backend\\k2pandc_2025.09.24_05.26.27.csv"

MODEL_FILENAME = "exo_model.pkl"
META_FILENAME = "exo_meta.pkl"

NUMERIC_FEATURES = [
    'orbital_period_days', 'planet_radius_rearth', 'insolation_flux_eflux',
    'equilibrium_temp_K', 'stellar_teff_K', 'stellar_logg_cgs',
    'stellar_radius_rsun', 'stellar_mag', 'ra_deg', 'dec_deg'
]
CATEGORICAL_FEATURES = ['source']

# --- Utility Functions ---

def read_with_fallback(path: str) -> pd.DataFrame:
    """Reads a CSV file with fallback support for different delimiters."""
    try:
        df = pd.read_csv(path, sep=",", comment="#", low_memory=False)
    except Exception:
        df = pd.read_csv(path, sep="\t", comment="#", low_memory=False)
    if df.shape[1] == 1:
        df = pd.read_csv(path, sep="\t", comment="#", low_memory=False)
    logger.info("Loaded %s with shape %s", path, df.shape)
    return df

# REMOVED: The 'apply_mapping' function is now imported.
# REMOVED: The 'add_features' function is now imported.

def compute_baseline_stats(X: pd.DataFrame) -> Dict[str, Dict[str, float]]:
    """Compute mean/std for each feature for drift checking."""
    stats = {}
    for c in X.columns:
        col = pd.to_numeric(X[c], errors="coerce")
        if col.isnull().all():
            stats[c] = {"mean": None, "std": None, "count": 0}
            continue

        stats[c] = {
            "mean": float(np.nanmean(col)),
            "std": float(np.nanstd(col)),
            "count": int(np.sum(~np.isnan(col)))
        }
    return stats

# ... (The rest of your file from save_metrics_json down to the end remains exactly the same)
# ... (No changes needed for save_metrics_json, save_artifacts, build_pipeline, load_and_prepare_data, etc.)

# --- [PASTE THE REST OF YOUR train_model.py CODE HERE, UNCHANGED] ---
# Starting from the 'save_metrics_json' function all the way to the end.

# For completeness, I'll include the rest of the file here.
# Just make sure your file looks like this.

def save_metrics_json(
    metrics: Dict, y_test: pd.Series, y_pred: np.ndarray, y_proba: np.ndarray, 
    categories: List[str], model_name: str = "Stacking Classifier", version: str = "2.2.0", 
    notes: str = "Holdout evaluation from dynamic training."
):
    """Save model metrics in JSON format."""
    cm = confusion_matrix(y_test, y_pred).tolist()
    report_dict = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
    json_report = {}
    
    for key, value in report_dict.items():
        if key in ['accuracy']:
            continue
        if isinstance(value, dict):
            json_report[key] = {
                "precision": round(value['precision'], 4),
                "recall": round(value['recall'], 4),
                "f1_score": round(value['f1-score'], 4),
                "support": int(value['support'])
            }
            
    metrics_json = {
        "models": [
            {
                "modelName": model_name,
                "version": version,
                "trainingDate": datetime.datetime.now().strftime("%Y-%m-%d"),
                "isActive": True,
                "notes": notes,
                "metrics": {
                    "accuracy": round(metrics["accuracy"], 4),
                    "precision_macro": round(metrics["precision_macro"], 4),
                    "recall_macro": round(metrics["recall_macro"], 4),
                    "f1_macro": round(metrics["f1_macro"], 4),
                    "roc_auc_ovr": round(metrics["roc_auc_ovr"], 4),
                    "roc_auc_ovo": round(metrics["roc_auc_ovo"], 4)
                },
                "labels": categories,
                "confusionMatrix": cm,
                "report": json_report
            }
        ]
    }
    
    metrics_path = os.path.join(os.getcwd(), 'model_metrics.json')
    try:
        metrics_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'model_metrics.json')
    except NameError:
        pass 
        
    with open(metrics_path, 'w') as f:
        json.dump(metrics_json, f, indent=2)
    
    logger.info(f"Metrics saved to {metrics_path}")
    return metrics_json


def save_artifacts(model: Pipeline, model_path: str, metadata: Dict[str, Any], meta_path: str):
    """Saves the trained model (joblib) and metadata (joblib)."""
    joblib.dump(model, model_path)
    joblib.dump(metadata, meta_path)
    logger.info("Artifacts saved to %s and %s", model_path, meta_path)


def build_pipeline(
    numeric_cols: List[str],  
    categorical_cols: List[str],  
    cv_folds: int,  
    rf_estimators: int,  
    xgb_estimators: int,  
    lgbm_estimators: int,  
    xgb_max_depth: int,  
    lgbm_max_depth: int,  
    learning_rate: float,  
    n_jobs: int = -1
) -> Pipeline:
    """Constructs the full pre-processing and stacked classification pipeline."""
    numeric_transformer = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler())
    ])
    
    categorical_transformer = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("encoder", OneHotEncoder(handle_unknown="ignore"))
    ])

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_transformer, numeric_cols),
            ("cat", categorical_transformer, categorical_cols)
        ],
        remainder='passthrough' 
    )
    
    estimators = [
        ("rf", RandomForestClassifier(
            n_estimators=rf_estimators, max_depth=15,
            class_weight="balanced", random_state=42, n_jobs=n_jobs)),
        ("xgb", XGBClassifier(
            n_estimators=xgb_estimators, max_depth=xgb_max_depth,
            learning_rate=learning_rate, subsample=0.8, colsample_bytree=0.8,
            scale_pos_weight=1, eval_metric="mlogloss",
            use_label_encoder=False, random_state=42, n_jobs=n_jobs)),
        ("lgbm", lgb.LGBMClassifier(
            n_estimators=lgbm_estimators, max_depth=lgbm_max_depth, num_leaves=64,
            learning_rate=learning_rate, subsample=0.8, colsample_bytree=0.8,
            class_weight="balanced", random_state=42, n_jobs=n_jobs))
    ]
    
    stacking_clf = StackingClassifier(
        estimators=estimators,
        final_estimator=lgb.LGBMClassifier(
            n_estimators=200, learning_rate=learning_rate,
            num_leaves=32, class_weight="balanced",
            random_state=42
        ),
        cv=cv_folds, 
        n_jobs=n_jobs
    )

    full_pipeline = Pipeline(steps=[
        ("preprocessor", preprocessor),
        ("clf", stacking_clf)
    ])
    
    return full_pipeline


def load_and_prepare_data(paths: Dict[str, str], feature_mapping: dict, label_maps: dict, label_cols: dict) -> pd.DataFrame:
    """Loads, cleans, maps, and combines the three mission datasets."""
    data_frames = {}
    
    for source, path in paths.items():
        try:
            df = read_with_fallback(path)
            
            label_col = label_cols[source]
            df["label"] = df[label_col].map(label_maps[source])
            df = df.dropna(subset=["label"])
            logger.info("%s cleaned up, keeping %s samples.", source, df.shape[0])
            
            df_mapped = apply_mapping(df, source, feature_mapping)
            
            required_features = list(feature_mapping.keys()) + ["source", "label"]
            df_final = df_mapped[required_features].dropna(axis=1, how="all").copy()
            data_frames[source] = df_final
            
        except FileNotFoundError:
            logger.error("Data file not found for %s: %s. Skipping.", source, path)
            
    if not data_frames:
        raise RuntimeError("No data files were successfully loaded.")

    df_combined = pd.concat(list(data_frames.values()), ignore_index=True)
    logger.info("Combined dataset shape: %s", df_combined.shape)
    
    df_combined = add_features(df_combined)
    
    model_feature_names = list(df_combined.drop(columns=["label"]).columns)
    df_combined = df_combined[model_feature_names + ["label"]]
    
    return df_combined


def train_and_evaluate(
    df: pd.DataFrame, 
    test_size: float = 0.2, 
    random_state: int = 42, 
    cv_folds: int = 5,
    rf_estimators: int = 400,  
    xgb_estimators: int = 500, 
    lgbm_estimators: int = 500, 
    xgb_max_depth: int = 7, 
    lgbm_max_depth: int = -1, 
    learning_rate: float = 0.05 
) -> Tuple[Pipeline, Dict, Dict, List[str], Dict]:
    """Trains and evaluates the model."""

    # --- START: EDITED SECTION ---
    # This block filters the DataFrame to prevent errors from unknown columns.
    engineered_features_potential = [
        "log_orbital_period_days", "log_planet_radius_rearth",
        "log_insolation_flux_eflux", "log_equilibrium_temp_K",
        "radius_ratio", "temp_ratio"
    ]
    all_known_features = NUMERIC_FEATURES + CATEGORICAL_FEATURES + engineered_features_potential
    
    # Keep only the label and the columns that are known features.
    valid_cols_in_df = [col for col in all_known_features if col in df.columns]
    df = df[valid_cols_in_df + ['label']]
    # --- END: EDITED SECTION ---

    X = df.drop(columns=["label"])
    y = df["label"]

    class_counts = y.value_counts()
    stratify_param = y if class_counts.min() >= 2 else None
    
    if stratify_param is None:
        logger.warning(f"The least populated class has only {class_counts.min()} member(s). Stratification is disabled.")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, stratify=stratify_param, random_state=random_state
    )
    logger.info(f"Data split: Train shape={X_train.shape}, Test shape={X_test.shape}")

    X_train = X_train.dropna(axis=1, how="all")
    X_test = X_test.dropna(axis=1, how="all")
    nunique = X_train.nunique()
    constant_cols = nunique[nunique <= 1].index.tolist()
    
    if constant_cols:
        logger.warning(f"Dropping constant columns from X_train: {constant_cols}")
        X_train = X_train.drop(columns=constant_cols)
        X_test = X_test.drop(columns=constant_cols, errors="ignore")
    
    engineered_features = [c for c in X_train.columns if c.startswith("log_") or c.endswith("_ratio")]
    
    numeric_cols_final = [c for c in X_train.columns if c in NUMERIC_FEATURES] + engineered_features
    categorical_cols_final = [c for c in X_train.columns if c in CATEGORICAL_FEATURES]

    pipeline = build_pipeline(
        numeric_cols_final,  
        categorical_cols_final,
        cv_folds,
        rf_estimators,
        xgb_estimators,
        lgbm_estimators,
        xgb_max_depth,
        lgbm_max_depth,
        learning_rate
    )
    logger.info("Fitting the Stacking Classifier pipeline...")
    
    train_class_counts = y_train.value_counts()
    if stratify_param is not None and train_class_counts.min() >= cv_folds:
        cv = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=random_state)
        cv_scores = cross_val_score(pipeline, X_train, y_train, cv=cv, scoring="accuracy", n_jobs=-1)
        logger.info(f"CV accuracy: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")
    else:
        logger.warning(f"Skipping cross-validation. Training set is too small/imbalanced for {cv_folds} folds.")
    
    pipeline.fit(X_train, y_train)
    logger.info("Pipeline training complete.")

    y_pred = pipeline.predict(X_test)
    y_proba = pipeline.predict_proba(X_test)
    
    metrics = {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision_macro": precision_score(y_test, y_pred, average="macro", zero_division=0),
        "recall_macro": recall_score(y_test, y_pred, average="macro", zero_division=0),
        "f1_macro": f1_score(y_test, y_pred, average="macro", zero_division=0),
        "roc_auc_ovr": roc_auc_score(y_test, y_proba, multi_class="ovr", average="macro"),
        "roc_auc_ovo": roc_auc_score(y_test, y_proba, multi_class="ovo", average="macro")
    }

    print("\n✅ Holdout Metrics:")
    for k, v in metrics.items(): print(f"{k}: {v:.4f}")
    print("\n📑 Classification Report:\n", classification_report(y_test, y_pred, digits=4, zero_division=0))

    metrics_json = save_metrics_json(metrics, y_test, y_pred, y_proba, sorted(y.unique()))
    baseline_stats = compute_baseline_stats(X_train)
    
    return pipeline, metrics, baseline_stats, X_train.columns.tolist(), metrics_json
def main():
    """Main function to run the exoplanet classification pipeline."""
    DEFAULT_HYPERPARAMETERS = {
        "cv_folds": 5,
        "rf_estimators": 400,
        "xgb_estimators": 500,
        "lgbm_estimators": 500,
        "xgb_max_depth": 7,
        "lgbm_max_depth": -1,
        "learning_rate": 0.05
    }
    
    logger.info("Starting exoplanet classification model training pipeline.")
    
    data_paths = {
        "KOI": KOI_DATA_PATH,
        "TOI": TOI_DATA_PATH,
        "K2": K2_DATA_PATH,
    }

    try:
        # Use the constants imported from the data processor
        df = load_and_prepare_data(data_paths, COLUMN_MAPPING, LABEL_MAPS, LABEL_COLS)

        pipeline, metrics, baseline_stats, feature_cols, metrics_json = train_and_evaluate(
            df, 
            **DEFAULT_HYPERPARAMETERS
        )
        
        metadata = {
            "feature_cols": feature_cols,
            "baseline_stats": baseline_stats,
            "metrics": metrics,
            "categories": sorted(df["label"].unique()),
            "hyperparameters": DEFAULT_HYPERPARAMETERS,
            "training_date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        
        base_dir = os.path.dirname(os.path.abspath(__file__)) if '__file__' in locals() else os.getcwd()
        model_path = os.path.join(base_dir, MODEL_FILENAME)
        meta_path = os.path.join(base_dir, META_FILENAME)
        
        save_artifacts(pipeline, model_path, metadata, meta_path)
        
    except RuntimeError as e:
        logger.error("Pipeline failed due to data issue: %s", e)
    except FileNotFoundError as e:
        logger.error("Missing input data file. Please ensure files are present: %s", e)
    except Exception as e:
        logger.error("An unexpected error occurred during execution: %s", e, exc_info=True)


if __name__ == "__main__":
    main()