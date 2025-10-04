import React, { useState } from "react";
import type { HTMLAttributes, ChangeEvent } from "react";
import type { FC } from "react";
import { motion } from "framer-motion";
import { UploadCloud, BrainCircuit } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import Papa from "papaparse";

// --- Helper UI Components (Previously Missing) ---

// A simple Card component that acts as a styled container.
// It accepts children to render inside it and any standard div attributes like className.
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const Card: FC<CardProps> = ({ children, className = "", ...props }) => {
  return (
    <div
      className={`bg-slate-800/50 p-6 rounded-lg border border-slate-700 shadow-lg ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

// A simple Section component for semantic layout.
// It accepts children and any standard section attributes.
interface SectionProps extends HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

const Section: FC<SectionProps> = ({ children, className = "", ...props }) => {
  return (
    <section className={`py-12 px-4 sm:px-6 lg:px-8 ${className}`} {...props}>
      {children}
    </section>
  );
};

// --- Types for metrics JSON ---
interface ModelMetrics {
  accuracy: number;
  precision_macro: number;
  recall_macro: number;
  f1_macro: number;
  roc_auc_ovr: number;
  roc_auc_ovo: number;
}

interface ClassReport {
  precision: number;
  recall: number;
  f1_score: number;
  support: number;
}

interface ModelReport {
  modelName: string;
  version: string;
  trainingDate: string;
  isActive: boolean;
  notes: string;
  metrics: ModelMetrics;
  labels: string[];
  confusionMatrix: number[][];
  report: Record<string, ClassReport>;
}

interface MetricsJson {
  models: ModelReport[];
}

// --- Main Application Component ---

const App = () => {
  const [trainTestSplit, setTrainTestSplit] = useState(80);
  const [trainingStatus, setTrainingStatus] = useState<string[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [metricsJson, setMetricsJson] = useState<MetricsJson | null>(null);
  // const fileInputRef = useRef<HTMLInputElement>(null); // removed unused variable

  // Appends a new message with a timestamp to the training log
  const appendStatus = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setTrainingStatus((prev) => [...prev, `[${timestamp}] ${message}`]);
  }; // Handles the form submission to start the training process // Handles the form submission to start the training process

  // Handle file selection
  const handleStartTraining = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile) {
      appendStatus("Error: Please select a file first");
      return;
    }

    setIsTraining(true);
    setTrainingStatus([]);
    setMetricsJson(null);
    appendStatus("Starting training process...");

    try {
      appendStatus("Parsing CSV file...");
      const text = await selectedFile.text();
      const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        comments: "#",
      });

      if (parsed.errors.length > 0) {
        appendStatus(`❌ CSV parse error: ${parsed.errors[0].message}`);
        setIsTraining(false);
        return;
      }

      const rawRows = parsed.data as Record<string, any>[];

      // --- ✅ START OF THE NEW, MORE ROBUST FIX ---
      // This new map uses normalized keys (lowercase, no special characters)
      // to ensure we catch any variation from the CSV file.
      const NORMALIZED_COLUMN_MAP: Record<string, string> = {
        orbitalperioddays: "orbital_period_days",
        planetradiusrearth: "planet_radius_rearth",
        insolationfluxeflux: "insolation_flux_eflux",
        equilibriumtempk: "equilibrium_temp_K", // Catches 'equilibrium_temp_K', 'equilibrium_temp_k', etc.
        stellarteffk: "stellar_teff_K",
        stellarloggcgs: "stellar_logg_cgs",
        stellarradiusrsun: "stellar_radius_rsun",
        stellarmag: "stellar_mag",
        radeg: "ra_deg",
        decdeg: "dec_deg",
        label: "label",
        source: "source",
        koiperiod: "orbital_period_days",
        koiprad: "planet_radius_rearth",
        koiinsol: "insolation_flux_eflux",
        koiteq: "equilibrium_temp_K",
        koisteff: "stellar_teff_K",
        koislogg: "stellar_logg_cgs",
        koisrad: "stellar_radius_rsun",
        koikepmag: "stellar_mag",
        koidisposition: "label",
        plorbper: "orbital_period_days",
        plrade: "planet_radius_rearth",
        plinsol: "insolation_flux_eflux",
        pleqt: "equilibrium_temp_K",
        stteff: "stellar_teff_K",
        stlogg: "stellar_logg_cgs",
        strad: "stellar_radius_rsun",
        sttmag: "stellar_mag",
        syvmag: "stellar_mag",
        tfopwgdisp: "label",
        disposition: "label",
        ra: "ra_deg",
        dec: "dec_deg",
      };

      // --- NEW: Pre-flight Check and Debugging Logic ---
      appendStatus("Running pre-flight check on CSV headers...");
      const csvHeaders = parsed.meta.fields || [];
      const mappedHeaders = new Set<string>();
      const unmappedHeaders: string[] = [];

      csvHeaders.forEach((header) => {
        if (!header) return; // Skip empty headers
        const normalizedKey = header
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
        const dbKey = NORMALIZED_COLUMN_MAP[normalizedKey];
        if (dbKey) {
          mappedHeaders.add(dbKey);
        } else {
          unmappedHeaders.push(header);
        }
      });

      appendStatus(
        `Found ${csvHeaders.length} columns. Mapped ${mappedHeaders.size}.`
      );
      if (unmappedHeaders.length > 0) {
        appendStatus(`⚠️ Unmapped columns: [${unmappedHeaders.join(", ")}]`);
      }

      // Check if the critical column is present after mapping
      if (!mappedHeaders.has("equilibrium_temp_K")) {
        appendStatus(
          "❌ CRITICAL ERROR: The CSV file does not contain a recognizable column for 'equilibrium_temp_K'."
        );
        appendStatus(
          "Please check the 'Unmapped columns' list above and ensure your file has a column like 'equilibrium_temp_k', 'koi_teq', or 'pl_eqt'."
        );
        setIsTraining(false);
        return; // Stop execution
      }
      appendStatus("✅ Pre-flight check passed. All critical columns found.");
      // --- END: Pre-flight Check ---

      const rowsToInsert = rawRows.map((row) => {
        const mappedRow: Record<string, any> = {};
        for (const rawKey in row) {
          // Normalize the key from the CSV file:
          // 1. Trim whitespace. 2. Convert to lowercase. 3. Remove all non-alphanumeric characters.
          const normalizedKey = rawKey
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");

          // Find the correct database key using the normalized key
          const dbKey = NORMALIZED_COLUMN_MAP[normalizedKey];

          // Only include columns that are successfully mapped
          if (dbKey) {
            const value = row[rawKey];
            // Convert empty strings to null for the database
            mappedRow[dbKey] =
              typeof value === "string" && value.trim() === "" ? null : value;
          }
        }
        // Add a source if it's not present in the CSV
        if (!mappedRow.source) {
          mappedRow.source = "uploaded_csv";
        }
        return mappedRow;
      });
      // --- END OF THE NEW, MORE ROBUST FIX ---

      appendStatus(
        `Mapped ${rowsToInsert.length} rows. Uploading to Supabase...`
      );

      // I am keeping this console.log here. If the error still happens,
      // please check the developer console (F12) and share the output.
      console.log("Data being sent to Supabase:", rowsToInsert);

      const { error: insertError } = await supabase!
        .from("exoplanet_datasets")
        .insert(rowsToInsert);

      if (insertError) {
        appendStatus(`❌ Supabase table insert error: ${insertError.message}`);
        setIsTraining(false);
        return;
      }

      appendStatus("✅ Data uploaded to Supabase table.");
    } catch (err) {
      appendStatus(
        `❌ Supabase table upload error: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      setIsTraining(false);
      return;
    } // --- The rest of your function remains the same ---

    const formData = new FormData();
    formData.append("file", selectedFile!);
    const form = e.target as HTMLFormElement;
    formData.append("train_test_split", (trainTestSplit / 100).toString());
    formData.append("cv_folds", form.cv_folds.value);
    formData.append("rf_estimators", form.rf_estimators.value);
    formData.append("xgb_estimators", form.xgb_estimators.value);
    formData.append("lgbm_estimators", form.lgbm_estimators.value);
    formData.append("xgb_max_depth", form.xgb_max_depth.value);
    formData.append("lgbm_max_depth", form.lgbm_max_depth.value);
    formData.append("learning_rate", form.learning_rate.value);

    try {
      appendStatus("Uploading file and starting model training...");

      const response = await fetch("http://localhost:5000/api/train", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unknown error occurred");
      }
      appendStatus("✅ Training complete! New model saved successfully.");
      if (data.metrics_json) {
        setMetricsJson(data.metrics_json);
        appendStatus("📊 Detailed metrics loaded.");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      if (errorMessage !== "Failed to fetch") {
        appendStatus(`❌ Error: ${errorMessage}`);
      }
    } finally {
      setIsTraining(false);
    }
  };

  // --- Sub-Components for Form Inputs ---
  interface HyperparameterInputProps {
    label: string;
    name: string;
    type: string;
    defaultValue: string;
    min?: string;
    max?: string;
    step?: string;
    description: string;
  }

  const HyperparameterInput = ({
    label,
    name,
    type,
    defaultValue,
    min,
    max,
    step,
    description,
  }: HyperparameterInputProps) => (
    <div>
      <label
        htmlFor={name}
        className="block text-sm font-medium text-slate-300"
      >
        {label}
      </label>
      <input
        type={type}
        name={name}
        id={name}
        defaultValue={defaultValue}
        min={min}
        max={max}
        step={step}
        className="mt-1 block w-full bg-slate-700 border-slate-600 rounded-md p-2 text-white placeholder-slate-400 focus:ring-cyan-500 focus:border-cyan-500"
      />
      <p className="mt-1 text-xs text-slate-500">{description}</p>
    </div>
  );

  return (
    <main className="bg-slate-950 min-h-screen text-white font-sans">
      <Section>
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-center mb-4">
            Train a New Model
          </h1>
          <p className="text-slate-400 text-center mb-12">
            Upload a labeled dataset and configure hyperparameters to train a
            new stacking classifier.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* Form Section */}
            <form
              onSubmit={handleStartTraining}
              className="lg:col-span-3 space-y-8"
            >
              <Card>
                <h2 className="text-2xl font-bold text-white mb-4 border-b border-slate-700 pb-3">
                  1. Upload Dataset
                </h2>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-600 border-dashed rounded-md">
                  <div className="space-y-1 text-center">
                    <UploadCloud className="mx-auto h-12 w-12 text-slate-500" />
                    <div className="flex text-sm text-slate-400">
                      <label
                        htmlFor="file-upload"
                        className="relative cursor-pointer bg-slate-800 rounded-md font-medium text-cyan-400 hover:text-cyan-500 focus-within:outline-none p-1"
                      >
                        <span>Upload your labeled CSV file</span>
                        <input
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          className="sr-only"
                          accept=".csv"
                          onChange={(e: ChangeEvent<HTMLInputElement>) => {
                            const file = e.target.files?.[0] || null;
                            setSelectedFile(file);
                          }}
                          // ref={fileInputRef}
                        />
                      </label>
                    </div>
                    <p className="text-xs text-slate-500">
                      Must contain a label (e.g., 'disposition') and feature
                      columns.
                    </p>

                    {selectedFile && (
                      <p className="text-sm text-green-400">
                        Selected: {selectedFile.name}
                      </p>
                    )}
                  </div>
                </div>
              </Card>

              <Card>
                <h2 className="text-2xl font-bold text-white mb-4 border-b border-slate-700 pb-3">
                  2. Configure Hyperparameters
                </h2>
                <div className="space-y-6">
                  <div>
                    <label
                      htmlFor="train-test-split"
                      className="block text-sm font-medium text-slate-300"
                    >
                      Train/Test Split ({trainTestSplit}% Train)
                    </label>
                    {/* FIXED: Parsed the event target value to an integer */}
                    <input
                      type="range"
                      min="50"
                      max="90"
                      value={trainTestSplit}
                      onChange={(e) =>
                        setTrainTestSplit(parseInt(e.target.value, 10))
                      }
                      className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                      placeholder="Select train/test split"
                    />
                  </div>
                  <HyperparameterInput
                    label="Cross-Validation Folds"
                    name="cv_folds"
                    type="number"
                    defaultValue="5"
                    min="3"
                    max="10"
                    description="Number of folds for cross-validation."
                  />
                  <h3 className="text-lg font-semibold text-cyan-400 pt-2">
                    Base Models
                  </h3>
                  <HyperparameterInput
                    label="Random Forest: N-Estimators"
                    name="rf_estimators"
                    type="number"
                    defaultValue="100"
                    min="1"
                    max="500"
                    step="1"
                    description="Number of trees in the forest."
                  />
                  <HyperparameterInput
                    label="XGB Classifier: N-Estimators"
                    name="xgb_estimators"
                    type="number"
                    defaultValue="100"
                    min="1"
                    max="500"
                    step="1"
                    description="Number of trees in the forest."
                  />
                  <HyperparameterInput
                    label="LGBM Classifier: N-Estimators"
                    name="lgbm_estimators"
                    type="number"
                    defaultValue="100"
                    min="1"
                    max="500"
                    step="1"
                    description="Number of trees in the forest."
                  />
                  <HyperparameterInput
                    label="XGB Classifier: Max Depth"
                    name="xgb_max_depth"
                    type="number"
                    defaultValue="15"
                    min="1"
                    max="500"
                    step="1"
                    description="Number of Splits in the Forest"
                  />
                  <HyperparameterInput
                    label="LGBM Classifier: Max Depth"
                    name="lgbm_max_depth"
                    type="number"
                    defaultValue="7"
                    min="1"
                    max="500"
                    step="1"
                    description="Number of Splits in the Forest"
                  />
                  <HyperparameterInput
                    label="Learning Rate"
                    name="learning_rate"
                    type="number"
                    defaultValue="0.05"
                    min="0"
                    max="0.5"
                    step="0.01"
                    description="The rate of model learning"
                  />
                </div>
              </Card>

              <motion.button
                whileHover={{ scale: 1.02 }}
                type="submit"
                disabled={isTraining}
                className="w-full flex items-center justify-center gap-3 text-lg font-bold px-8 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:bg-slate-600 disabled:cursor-not-allowed"
              >
                <BrainCircuit />
                {isTraining ? "Training in Progress..." : "Start Training"}
              </motion.button>
            </form>

            {/* Status and Results Section */}
            <div className="lg:col-span-2 space-y-8">
              <Card>
                <h2 className="text-2xl font-bold text-white mb-4 border-b border-slate-700 pb-3">
                  Training Status
                </h2>
                <div className="bg-slate-900 p-4 rounded-md h-64 overflow-y-auto font-mono text-sm">
                  {trainingStatus.length === 0 ? (
                    <p className="text-slate-500">
                      Training logs will appear here...
                    </p>
                  ) : (
                    trainingStatus.map((status, index) => (
                      <div key={index} className="mb-1">
                        {status}
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </Section>
    </main>
  );
};

export const ModelTrainingPage = App;
