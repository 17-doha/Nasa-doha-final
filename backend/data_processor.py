import pandas as pd
import numpy as np
import logging
from typing import Dict, Optional

# --- Configuration & Logging (Copied from your script) ---
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("exo_data_processor")

# --- Mappings & Constants (Required for processing) ---
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

LABEL_MAPS = {
    "KOI": {"CONFIRMED": "CONFIRMED", "CANDIDATE": "CANDIDATE", "FALSE POSITIVE": "FALSE POSITIVE"},
    "TOI": {"PC": "CANDIDATE", "CP": "CONFIRMED", "KP": "CONFIRMED", "FP": "FALSE POSITIVE"},
    "K2": {"CONFIRMED": "CONFIRMED", "CANDIDATE": "CANDIDATE", "FALSE POSITIVE": "FALSE POSITIVE"},
}

LABEL_COLS = {
    "KOI": "koi_disposition",
    "TOI": "tfopwg_disp",
    "K2": "disposition",
}

# --- Core Processing Functions (Adapted from your script) ---

def apply_mapping(df: pd.DataFrame, source: str, mapping: dict) -> pd.DataFrame:
    """Renames dataset columns based on the mission source and adds a 'source' column."""
    df = df.copy()
    rename_dict = {m[source]: k for k, m in mapping.items() if m.get(source)}
    df = df.rename(columns=rename_dict)
    df["source"] = source
    return df

def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Performs domain-inspired feature engineering."""
    df = df.copy()
    log_cols = [
        "orbital_period_days", "planet_radius_rearth",
        "insolation_flux_eflux", "equilibrium_temp_K"
    ]
    for col in log_cols:
        if col in df.columns and pd.api.types.is_numeric_dtype(df[col]):
            df[f"log_{col}"] = np.log1p(df[col].clip(lower=0))

    if {"planet_radius_rearth", "stellar_radius_rsun"}.issubset(df.columns):
        df["radius_ratio"] = df["planet_radius_rearth"] / (df["stellar_radius_rsun"] + 1e-6)
    
    if {"equilibrium_temp_K", "stellar_teff_K"}.issubset(df.columns):
        df["temp_ratio"] = df["equilibrium_temp_K"] / (df["stellar_teff_K"] + 1e-6)
        
    return df

def infer_source(df: pd.DataFrame) -> Optional[str]:
    """Infers the data source (KOI, TOI, K2) based on unique label column names."""
    if LABEL_COLS["KOI"] in df.columns:
        return "KOI"
    if LABEL_COLS["TOI"] in df.columns:
        return "TOI"
    if LABEL_COLS["K2"] in df.columns:
        return "K2"
    return None

# --- NEW Main Function for Processing Uploaded Files ---

def process_uploaded_file(df_raw: pd.DataFrame) -> pd.DataFrame:
    """
    Takes a raw DataFrame, infers its source, and processes it to match the
    model's expected input format, returning only the necessary features and the label.
    """
    logger.info("Starting processing for uploaded file...")
    
    # 1. Infer the source of the data
    source = infer_source(df_raw)
    if not source:
        error_msg = "Could not determine data source. File must contain one of: 'koi_disposition', 'tfopwg_disp', or 'disposition'."
        logger.error(error_msg)
        raise ValueError(error_msg)
    logger.info(f"Inferred data source: {source}")

    df = df_raw.copy()
    
    # 2. Apply Label Mapping (Harmonize the target variable)
    label_col = LABEL_COLS[source]
    df["label"] = df[label_col].map(LABEL_MAPS[source])
    
    # 3. Apply Feature Mapping (Standardize column names)
    df_mapped = apply_mapping(df, source, COLUMN_MAPPING)
    
    # 4. Select only the harmonized features and the new 'source'/'label' columns
    # These are the columns that would have been created after the initial loading step
    required_features = list(COLUMN_MAPPING.keys()) + ["source", "label"]
    
    # Filter the DataFrame to keep only the columns that exist after mapping
    existing_cols = [col for col in required_features if col in df_mapped.columns]
    df_selected = df_mapped[existing_cols].copy()
    
    # 5. Add engineered features
    df_engineered = add_features(df_selected)
    
    # 6. Final Selection: Get all model features plus the label
    # The final set of features should match what the model was trained on
    model_feature_cols = [
        col for col in df_engineered.columns if col != 'label'
    ]
    final_cols = model_feature_cols + ["label"]
    
    # Ensure all final columns exist, fill missing ones with NaN if needed
    df_final = df_engineered.reindex(columns=final_cols)
    
    logger.info(f"Processing complete. Final shape: {df_final.shape}")
    logger.info(f"Final columns: {df_final.columns.tolist()}")

    return df_final


# --- Example Usage ---
if __name__ == '__main__':
    # This block demonstrates how to use the function.
    # We'll create a dummy KOI csv file to simulate an upload.
    
    # Create a sample DataFrame that looks like a KOI file
    sample_data = {
        'koi_disposition': ['CONFIRMED', 'CANDIDATE', 'FALSE POSITIVE'],
        'koi_period': [10.5, 3.2, 100.1],
        'koi_prad': [2.5, 1.1, 15.6],
        'koi_insol': [90.5, 1200.7, 2.3],
        'koi_teq': [800, 1500, 250],
        'koi_steff': [5500, 6000, 4500],
        'koi_slogg': [4.5, 4.2, 4.7],
        'koi_srad': [0.9, 1.1, 0.8],
        'koi_kepmag': [14.5, 12.1, 15.3],
        'ra': [290.1, 295.6, 288.4],
        'dec': [44.5, 42.1, 49.3],
        'unnecessary_col_1': [1, 2, 3], # This column will be removed
        'unnecessary_col_2': ['a', 'b', 'c'] # This column will also be removed
    }
    sample_df = pd.DataFrame(sample_data)
    
    print("--- Original Sample DataFrame ---")
    print(sample_df)
    print("\n" + "="*50 + "\n")

    # Now, process this DataFrame as if it were an uploaded file
    try:
        processed_df = process_uploaded_file(sample_df)
        
        print("--- Processed DataFrame (Ready for Model) ---")
        print(processed_df)
        
    except ValueError as e:
        print(f"Error: {e}")