import React, { useState } from "react";
import type { HTMLAttributes, ChangeEvent } from "react";
import type { FC } from "react";
import { motion } from "framer-motion";
import { UploadCloud, BrainCircuit } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import Papa from "papaparse";

interface CardProps extends HTMLAttributes<HTMLDivElement> { children: React.ReactNode; }
const Card: FC<CardProps> = ({ children, className = "", ...props }) => (
  <div className={`bg-slate-800/50 p-6 rounded-lg border border-slate-700 shadow-lg ${className}`} {...props}>
    {children}
  </div>
);

interface SectionProps extends HTMLAttributes<HTMLElement> { children: React.ReactNode; }
const Section: FC<SectionProps> = ({ children, className = "", ...props }) => (
  <section className={`py-12 px-4 sm:px-6 lg:px-8 ${className}`} {...props}>
    {children}
  </section>
);

interface ModelMetrics {
  accuracy: number;
  precision_macro: number;
  recall_macro: number;
  f1_macro: number;
  roc_auc_ovr: number;
  roc_auc_ovo: number;
}
interface ClassReport { precision: number; recall: number; f1_score: number; support: number; }
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
interface MetricsJson { models: ModelReport[]; }

const App = () => {
  const [trainTestSplit, setTrainTestSplit] = useState(80);
  const [trainingStatus, setTrainingStatus] = useState<string[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [metricsJson, setMetricsJson] = useState<MetricsJson | null>(null);
  // const fileInputRef = useRef<HTMLInputElement>(null); // removed unused variable

  const appendStatus = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setTrainingStatus((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      appendStatus("Error: Please upload a .csv file");
      return;
    }
    setSelectedFile(file);
    appendStatus(`File selected: ${file.name}`);
  };

  const handleStartTraining: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();

    if (!selectedFile) {
      appendStatus("Error: Please select a file first");
      return;
    }

    setIsTraining(true);
    setTrainingStatus([]);
    setMetricsJson(null);
    appendStatus("Starting training process..."); // --- Parse CSV and upload as table rows ---

    try {
      appendStatus("Parsing CSV file (auto-detecting delimiter)...");
      const text = await selectedFile.text(); // FIX: Added `comments: '#'` to ignore lines starting with '#'
      const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        comments: "#", // <-- THIS IS THE CRITICAL ADDITION // You may also consider adding this for robustness: // dynamicTyping: true,
      });

      if (parsed.errors.length > 0) {
        appendStatus(`❌ CSV parse error: ${parsed.errors[0].message}`);
        setIsTraining(false);
        return;
      }

      const rawRows = parsed.data as Record<string, any>[];

      // --- START OF FIX: Clean Data and Remove Empty Column Keys ---
      const rowsToInsert = rawRows.map((row) => {
        const cleanedRow: Record<string, any> = {};
        for (const key in row) {
          const cleanedKey = key.trim();
          const value = row[key];

          if (cleanedKey !== "") {
            // New logic to handle empty strings for numeric columns:
            if (typeof value === "string" && value.trim() === "") {
              // If the value is an empty or whitespace string, convert it to null
              cleanedRow[cleanedKey] = null;
            } else if (
              cleanedKey.toLowerCase().includes("feature") ||
              cleanedKey.toLowerCase().includes("data")
            ) {
              // OPTIONAL: Try to parse known numeric columns to actual numbers.
              // You will need to customize the condition above based on your actual numeric column names.
              const numberValue = parseFloat(value);
              cleanedRow[cleanedKey] = isNaN(numberValue) ? null : numberValue;
            } else {
              // For all other columns (e.g., strings), use the value as is.
              cleanedRow[cleanedKey] = value;
            }
          }
        }
        return cleanedRow;
      });
      // --- END OF FIX ---

      appendStatus(
        `Parsed ${rowsToInsert.length} rows. Uploading to Supabase table...`
      ); // Insert rows into Supabase table (e.g., 'scientist_datasets') using the cleaned data
      const { error: insertError } = await supabase!
        .from("scientist_datasets")
        .insert(rowsToInsert); // <-- Use the cleaned array

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
    }

    // ... rest of handleStartTraining

    // --- Ensure Supabase bucket exists, then upload file ---
    // (Removed: bucket creation and upload code, as you are now uploading to a table)

    // Create form data for API request
    const formData = new FormData();
    formData.append("file", selectedFile);

    // Add hyperparameters to form data
    const form = e.target as HTMLFormElement;

    const fd = new FormData(form);
    fd.set("train_test_split", (trainTestSplit / 100).toString());
    fd.set("file", selectedFile);


    // 1. Train/Test Split (from state)
    formData.append("train_test_split", (trainTestSplit / 100).toString());

    // 2. Cross-Validation Folds
    formData.append("cv_folds", form.cv_folds.value);

    // 3. Base Model Estimators (Ensuring unique names and gathering values)
    formData.append("rf_estimators", form.rf_estimators.value);
    formData.append("xgb_estimators", form.xgb_estimators.value); // <--- FIXED/ADDED
    formData.append("lgbm_estimators", form.lgbm_estimators.value); // <--- FIXED/ADDED

    // 4. Max Depths (Ensuring unique names and gathering values)
    formData.append("xgb_max_depth", form.xgb_max_depth.value); // <--- FIXED/ADDED
    formData.append("lgbm_max_depth", form.lgbm_max_depth.value); // <--- FIXED/ADDED

    // 5. Learning Rate
    formData.append("learning_rate", form.learning_rate.value);
    try {
      appendStatus("Uploading file and starting model training...");
      const response = await fetch(import.meta.env.VITE_API_BASE?.toString() + "/api/train" || "/api/train", {
        method: "POST",
        body: fd,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      if (data.metrics) {
        appendStatus("✅ Training complete! New model saved successfully.");
        appendStatus(`Accuracy: ${(data.metrics.accuracy * 100).toFixed(2)}%`);
        appendStatus(`F1 Score: ${(data.metrics.f1_macro * 100).toFixed(2)}%`);
        appendStatus(`Precision: ${(data.metrics.precision_macro * 100).toFixed(2)}%`);
        appendStatus(`Recall: ${(data.metrics.recall_macro * 100).toFixed(2)}%`);
      }

      if (data.metrics_json) {
        setMetricsJson(data.metrics_json as MetricsJson);
        appendStatus("📊 Detailed metrics saved in JSON format");
      }
    } catch (error) {
      appendStatus(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsTraining(false);
    }
  };

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
  const HyperparameterInput: FC<HyperparameterInputProps> = ({
    label, name, type, defaultValue, min, max, step, description,
  }) => (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-300">{label}</label>
      <input
        type={type} name={name} id={name} defaultValue={defaultValue}
        min={min} max={max} step={step}
        className="mt-1 block w-full bg-slate-700 border-slate-600 rounded-md p-2 text-white placeholder-slate-400 focus:ring-cyan-500 focus:border-cyan-500"
      />
      <p className="mt-1 text-xs text-slate-500">{description}</p>
    </div>
  );

  return (
    <main className="bg-slate-950 min-h-screen text-white font-sans">
      <Section>
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-center mb-4">Train a New Model</h1>
          <p className="text-slate-400 text-center mb-12">
            Upload a labeled dataset and configure hyperparameters to train a new stacking classifier.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <form onSubmit={handleStartTraining} className="lg:col-span-3 space-y-8">
              <Card>
                <h2 className="text-2xl font-bold text-white mb-4 border-b border-slate-700 pb-3">1. Upload Dataset</h2>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-600 border-dashed rounded-md">
                  <div className="space-y-1 text-center">
                    <UploadCloud className="mx-auto h-12 w-12 text-slate-500" />
                    <div className="flex items-center justify-center text-sm text-slate-400 gap-2">
                      <label
                        htmlFor="file-upload"
                        className="cursor-pointer bg-slate-800 rounded-md font-medium text-cyan-400 hover:text-cyan-500 px-2 py-1"
                      >
                        <span>Upload your labeled CSV file</span>
                        <input
                          id="file-upload"
                          name="file"
                          type="file"
                          className="sr-only"
                          accept=".csv"
                          onChange={handleFileChange}
                          // ref={fileInputRef}
                        />
                      </label>
                      <span className="opacity-70 ml-2">or drag and drop</span>
                    </div>
                    <p className="text-xs text-slate-500">Must contain a label column and feature columns.</p>
                    {selectedFile && <p className="text-sm text-green-400">Selected: {selectedFile.name}</p>}
                  </div>
                </div>
              </Card>

              <Card>
                <h2 className="text-2xl font-bold text-white mb-4 border-b border-slate-700 pb-3">2. Configure Hyperparameters</h2>
                <div className="space-y-6">
                  <div>
                    <label htmlFor="train-test-split" className="block text-sm font-medium text-slate-300">
                      Train/Test Split ({trainTestSplit}% Train)
                    </label>
                    <input
                      id="train-test-split"
                      type="range" min="50" max="90" value={trainTestSplit}
                      onChange={(e) => setTrainTestSplit(parseInt(e.target.value, 10))}
                      className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                      placeholder="Select train/test split"
                    />
                  </div>
                  <HyperparameterInput
                    label="Cross-Validation Folds" name="cv_folds" type="number"
                    defaultValue="5" min="3" max="10" description="Number of folds for cross-validation."
                  />
                  <h3 className="text-lg font-semibold text-cyan-400 pt-2">Base Models</h3>
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

            <div className="lg:col-span-2 space-y-8">
              <Card>
                <h2 className="text-2xl font-bold text-white mb-4 border-b border-slate-700 pb-3">Training Status</h2>
                <div className="bg-slate-900 p-4 rounded-md h-64 overflow-y-auto font-mono text-sm">
                  {trainingStatus.length === 0 ? (
                    <p className="text-slate-500">Training logs will appear here...</p>
                  ) : (
                    trainingStatus.map((status, index) => <div key={index} className="mb-1">{status}</div>)
                  )}
                </div>
              </Card>

              {metricsJson && metricsJson.models?.length > 0 && (
                <Card>
                  <h2 className="text-2xl font-bold text-white mb-4 border-b border-slate-700 pb-3">Latest Metrics (Summary)</h2>
                  <div className="space-y-3">
                    <div className="text-slate-300">
                      <span className="font-semibold">{metricsJson.models[0].modelName}</span>{" "}
                      <span className="text-slate-400">v{metricsJson.models[0].version}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-slate-200">
                      <div>Accuracy: {(metricsJson.models[0].metrics.accuracy * 100).toFixed(1)}%</div>
                      <div>F1 (macro): {(metricsJson.models[0].metrics.f1_macro * 100).toFixed(1)}%</div>
                      <div>Precision (macro): {(metricsJson.models[0].metrics.precision_macro * 100).toFixed(1)}%</div>
                      <div>Recall (macro): {(metricsJson.models[0].metrics.recall_macro * 100).toFixed(1)}%</div>
                    </div>
                    <a
                      href={URL.createObjectURL(new Blob([JSON.stringify(metricsJson, null, 2)], { type: "application/json" }))}
                      download="metrics.json"
                      className="inline-block mt-2 text-cyan-300 hover:text-cyan-200 underline"
                    >
                      Download full metrics.json
                    </a>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
      </Section>
    </main>
  );
};

export const ModelTrainingPage = App;
