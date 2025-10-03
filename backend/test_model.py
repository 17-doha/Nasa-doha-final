import joblib
import numpy as np
import pandas as pd
from typing import Dict, Union, List, Tuple, Any

# Assuming train_model.py is in the same directory or accessible
from train_model import add_features

# Define the set of 10 base input fields required from the user
InputFields = [
    "orbital_period_days",
    "planet_radius_rearth",
    "insolation_flux_eflux",
    "equilibrium_temp_K",
    "stellar_teff_K",
    "stellar_logg_cgs",
    "stellar_radius_rsun",
    "stellar_mag",
    "ra_deg",
    "dec_deg",
]
RequiredData = Dict[str, float]

# Define validation rules for each base field
FIELD_VALIDATION_RULES: Dict[str, Dict[str, Union[bool, float]]] = {
    "orbital_period_days": {"must_be_positive": True},
    "planet_radius_rearth": {"must_be_positive": True},
    "insolation_flux_eflux": {"must_be_positive": True},
    "equilibrium_temp_K": {"min_value": 1000.0, "must_be_positive": True},
    "stellar_teff_K": {"min_value": 1000.0, "must_be_positive": True},
    "stellar_logg_cgs": {"must_be_positive": False},
    "stellar_radius_rsun": {"must_be_positive": True},
    "stellar_mag": {"must_be_positive": False},
    "ra_deg": {"must_be_positive": False},
    "dec_deg": {"must_be_positive": False},
}


def load_artifacts(model_path: str, meta_path: str) -> Tuple[Any, Dict]:
    """Loads the model pipeline and metadata from disk."""
    model = joblib.load(model_path)
    metadata = joblib.load(meta_path)
    return model, metadata


def validate_input(data: Dict[str, float]) -> List[str]:
    """Validates the raw user input based on predefined rules."""
    errors = []
    
    # Check for missing required fields
    missing_fields = [field for field in InputFields if field not in data or data[field] is None]
    if missing_fields:
        errors.append(f"Missing required fields: {', '.join(missing_fields)}")
        return errors

    # Validate numeric values and constraints
    for field, value in data.items():
        if field not in FIELD_VALIDATION_RULES:
            continue
            
        rules = FIELD_VALIDATION_RULES[field]

        if not isinstance(value, (int, float)):
            errors.append(f"'{field}' must be a numeric value.")
            continue

        if rules.get("must_be_positive") and value <= 0:
            errors.append(f"'{field}' must be positive (>{0}).")

        if "min_value" in rules and value < rules["min_value"]: # type: ignore
            errors.append(f"'{field}' must be at least {rules['min_value']}K.") # type: ignore

    return errors


def check_data_drift(data: RequiredData, metadata: Dict) -> List[str]:
    """Checks for significant data drift compared to training data stats."""
    warnings = []
    if "baseline_stats" not in metadata:
        return ["Metadata is missing 'baseline_stats' for drift checking."]

    stats = metadata["baseline_stats"]
    for field, value in data.items():
        if field in stats:
            mean = stats[field].get("mean")
            std = stats[field].get("std")

            if mean is not None and std is not None and std > 0:
                if abs(value - mean) > 3 * std:
                    warnings.append(
                        f"'{field}' value {value:.2f} is unusually far from "
                        f"training mean {mean:.2f} (±{3 * std:.2f})."
                    )
    return warnings


def classify_candidate(
    data: RequiredData,
    model_path: str = "exo_model.pkl",
    meta_path: str = "exo_meta.pkl",
) -> Dict[str, Any]:
    """
    Classifies an exoplanet candidate using the trained model and metadata.
    This function now includes the feature engineering step.
    """
    try:
        model, metadata = load_artifacts(model_path, meta_path)

        # 1. Validate the raw input data
        errors = validate_input(data)
        if errors:
            return {"success": False, "error": "; ".join(errors)}

        # 2. Check for potential data drift
        warnings = check_data_drift(data, metadata)

        # 3. Prepare data for the model pipeline
        # Create a DataFrame from the input
        df = pd.DataFrame([data])
        
        # **NEW**: Apply the same feature engineering as in training
        df_engineered = add_features(df)
        
        # Get the feature list the model was trained on
        feature_cols: List[str] = metadata.get("feature_cols", [])
        if not feature_cols:
             return {"success": False, "error": "Could not find 'feature_cols' in metadata."}

        # **NEW**: Ensure columns match the model's training data exactly
        X = df_engineered.reindex(columns=feature_cols, fill_value=np.nan)
        
        # 4. Make predictions
        prediction = model.predict(X)[0]
        probabilities = model.predict_proba(X)[0]
        categories = metadata.get("categories", ["Unknown"])

        return {
            "success": True,
            "prediction": prediction,
            "probabilities": dict(zip(categories, probabilities.tolist())),
            "warnings": warnings,
        }

    except FileNotFoundError:
        return {"success": False, "error": f"Model artifacts not found. Please place '{model_path}' and '{meta_path}' in the correct directory."}
    except Exception as e:
        return {"success": False, "error": f"An unexpected error occurred: {e}"}


def create_test_data(overrides: Dict[str, float] = None) -> RequiredData:
    """Creates a base dictionary of valid test data."""
    base_data: RequiredData = {
        "orbital_period_days": 365.0,
        "planet_radius_rearth": 1.0,
        "insolation_flux_eflux": 1.0,
        "equilibrium_temp_K": 1200.0,
        "stellar_teff_K": 5778.0,
        "stellar_logg_cgs": 4.4,
        "stellar_radius_rsun": 1.0,
        "stellar_mag": 4.83,
        "ra_deg": 180.0,
        "dec_deg": 0.0,
    }
    if overrides:
        data = base_data.copy()
        data.update(overrides)
        return data
    return base_data


def test_model():
    """Runs a series of tests against the classification function."""
    print("\n🧪 Testing with complete, valid parameters:")
    test_data = create_test_data()
    result = classify_candidate(test_data)
    print(f"  -> Result: {result}")

    print("\n🧪 Testing with a negative value ('orbital_period_days'):")
    negative_data = create_test_data({"orbital_period_days": -365.0})
    result = classify_candidate(negative_data)
    print(f"  -> Result: {result}")

    print("\n🧪 Testing with an invalid stellar temperature (<1000K):")
    invalid_temp_data = create_test_data({"stellar_teff_K": 500.0})
    result = classify_candidate(invalid_temp_data)
    print(f"  -> Result: {result}")
    
    print("\n🧪 Testing with a missing field:")
    missing_data = create_test_data()
    del missing_data["stellar_radius_rsun"]
    result = classify_candidate(missing_data)
    print(f"  -> Result: {result}")


if __name__ == "__main__":
    print("--- Starting Model Testing (Requires local artifacts) ---")
    test_model()