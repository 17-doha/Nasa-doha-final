// ClassifierTool.tsx
import React, { useState, useCallback, type ChangeEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, Bot, BarChart, AlertCircle, FileText, Eye, X, CheckCircle } from "lucide-react";
import Card from "./ui/Card";

import { Bar, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

// Register once
ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Title, Tooltip, Legend);

type InputFields =
  | "orbital_period_days"
  | "planet_radius_rearth"
  | "insolation_flux_eflux"
  | "equilibrium_temp_K"
  | "stellar_teff_K"
  | "stellar_logg_cgs"
  | "stellar_radius_rsun"
  | "stellar_mag"
  | "ra_deg"
  | "dec_deg";

type ClassificationData = Record<InputFields, string>;

type ClassificationResult = {
  prediction: "CONFIRMED" | "FALSE POSITIVE" | "CANDIDATE";
  confidence: number; // 0..1
  shap_values: { feature: string; value: number }[];
};

type Errors = Partial<Record<InputFields, string>> & {
  file?: string;
  submit?: string;
};

type CsvRow = { [key: string]: string };

const FIELD_DEFINITIONS: {
  [key in InputFields]: {
    label: string;
    placeholder: string;
    isPositiveOrZero: boolean;
    isTemperature: boolean;
  };
} = {
  orbital_period_days: { label: "Orbital Period", placeholder: "Orbital Period (days)", isPositiveOrZero: true, isTemperature: false },
  planet_radius_rearth: { label: "Planet Radius", placeholder: "Planet Radius (Earth radii)", isPositiveOrZero: true, isTemperature: false },
  insolation_flux_eflux: { label: "Insolation Flux", placeholder: "Insolation Flux (Earth flux)", isPositiveOrZero: true, isTemperature: false },
  equilibrium_temp_K: { label: "Equilibrium Temp", placeholder: "Equilibrium Temp (K)", isPositiveOrZero: true, isTemperature: true },
  stellar_teff_K: { label: "Stellar Effective Temp", placeholder: "Stellar Effective Temp (K)", isPositiveOrZero: true, isTemperature: true },
  stellar_logg_cgs: { label: "Stellar log(g)", placeholder: "Stellar log(g) (cgs)", isPositiveOrZero: false, isTemperature: false },
  stellar_radius_rsun: { label: "Stellar Radius", placeholder: "Stellar Radius (Solar radii)", isPositiveOrZero: true, isTemperature: false },
  stellar_mag: { label: "Stellar Magnitude", placeholder: "Stellar Magnitude", isPositiveOrZero: false, isTemperature: false },
  ra_deg: { label: "Right Ascension", placeholder: "Right Ascension (deg)", isPositiveOrZero: false, isTemperature: false },
  dec_deg: { label: "Declination", placeholder: "Declination (deg)", isPositiveOrZero: false, isTemperature: false },
};

const ClassifierTool: React.FC = () => {
  const [classificationResult, setClassificationResult] = useState<ClassificationResult | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvRow[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showFormatInfo, setShowFormatInfo] = useState(false);

  const requiredHeaders: InputFields[] = Object.keys(FIELD_DEFINITIONS) as InputFields[];

  const initialFormData: ClassificationData = requiredHeaders.reduce((acc, key) => {
    acc[key] = "";
    return acc;
  }, {} as ClassificationData);

  const [formData, setFormData] = useState<ClassificationData>(initialFormData);

  const clearUpload = useCallback(() => {
    const fileInput = document.getElementById("file-upload") as HTMLInputElement | null;
    if (fileInput) fileInput.value = "";
    setUploadedFile(null);
    setCsvPreview([]);
    setShowPreview(false);
    setErrors({});
    setFormData(initialFormData);
  }, [initialFormData]);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setErrors({ file: "Only CSV files are allowed." });
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = (event.target?.result as string) ?? "";
        const rows = text.trim().split(/\r?\n/);
        if (rows.length < 2) throw new Error("CSV must have a header and at least one data row.");

        const headers = rows[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
        const headerIndex = new Map<string, number>();
        headers.forEach((h, i) => headerIndex.set(h, i));

        const missing = requiredHeaders.filter((h) => !headerIndex.has(h));
        if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}`);

        const first = rows[1].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
        const nextForm = { ...initialFormData };
        requiredHeaders.forEach((h) => {
          const idx = headerIndex.get(h);
          nextForm[h] = idx !== undefined ? first[idx] ?? "" : "";
        });

        const preview = rows.slice(1).map((row) => {
          const values = row.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
          const obj: CsvRow = {};
          headers.forEach((h, i) => (obj[h] = values[i] ?? ""));
          return obj;
        });

        setUploadedFile(file);
        setFormData(nextForm);
        setCsvPreview(preview);
        setErrors({});
      } catch (err) {
        setErrors({ file: (err as Error).message });
        setUploadedFile(null);
        setCsvPreview([]);
        if (e.target) e.target.value = "";
      }
    };
    reader.onerror = () => {
      setErrors({ file: "An error occurred while reading the file." });
      if (e.target) e.target.value = "";
    };
    reader.readAsText(file);
  };

  const validateData = (data: ClassificationData) => {
    const next: Errors = {};
    for (const key of requiredHeaders) {
      const val = data[key];
      const num = parseFloat(val);
      const def = FIELD_DEFINITIONS[key];
      if (val === "" || val == null) next[key] = "Required";
      else if (Number.isNaN(num)) next[key] = "Must be a number";
      else if (def.isPositiveOrZero && num <= 0) next[key] = "Must be positive";
      else if (def.isTemperature && num < 1000) next[key] = "Minimum 1000K";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (uploadedFile) clearUpload();
    const { name, value } = e.target;
    if (value === "" || /^-?\d*(\.\d*)?$/.test(value)) {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
    if (errors[name as keyof Errors]) {
      setErrors((prev) => {
        const n = { ...prev };
        delete n[name as keyof Errors];
        delete n.submit;
        return n;
      });
    }
  };

  const runClassification = async () => {
    setClassificationResult(null);
    if (!validateData(formData)) {
      setErrors((prev) => ({ ...prev, submit: "Please correct errors before submitting." }));
      return;
    }

    const payload = Object.fromEntries(Object.entries(formData).map(([k, v]) => [k, Number(v)]));

    setIsLoading(true);
    try {
      const response = await fetch("http://localhost:5000/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
      if (!data.prediction || !data.shap_values) throw new Error("Invalid response format from server.");
      setClassificationResult(data as ClassificationResult);
    } catch (err) {
      setErrors({ submit: (err as Error).message });
    } finally {
      setIsLoading(false);
    }
  };

  // --- NEW: chart data helpers (computed once when we have a result) ---
  const confidencePieData =
    classificationResult && {
      labels: ["Confidence", "Uncertainty"],
      datasets: [
        {
          data: [
            Math.max(0, Math.min(1, classificationResult.confidence)) * 100,
            100 - Math.max(0, Math.min(1, classificationResult.confidence)) * 100,
          ],
          backgroundColor: ["rgba(34,197,94,0.85)", "rgba(148,163,184,0.25)"], // green + muted slate
          borderWidth: 0,
        },
      ],
    };

  const shapTop5 = (classificationResult?.shap_values ?? [])
    .map((d) => ({ feature: d.feature, value: Number(d.value) || 0 }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 5);

  const shapBarData =
    shapTop5.length > 0 && {
      labels: shapTop5.map((d) => d.feature),
      datasets: [
        {
          label: "SHAP value",
          data: shapTop5.map((d) => d.value),
          backgroundColor: shapTop5.map((d) => (d.value >= 0 ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)")), // green for +, red for -
          borderWidth: 0,
        },
      ],
    };

  // commonGrid removed (unused)

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <h1 className="text-3xl font-bold text-white mb-8">Exoplanet Candidate Classifier Tool 🚀</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <h2 className="text-2xl font-bold text-white mb-6">Submit Candidate Data</h2>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-300">Upload CSV Dataset (Classifies first row)</label>
              <button
                onClick={() => setShowFormatInfo((v) => !v)}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <FileText className="w-3 h-3" /> Format Info
              </button>
            </div>

            <AnimatePresence>
              {showFormatInfo && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-3 p-3 bg-slate-900 rounded-md text-xs"
                >
                  <div className="text-slate-400 space-y-1">
                    <p className="text-white font-medium mb-2">Required Columns:</p>
                    {requiredHeaders.map((key) => (
                      <div key={key}>
                        <span className="text-cyan-400">{key}</span>: {FIELD_DEFINITIONS[key].label}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {errors.file && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-3 p-3 bg-red-900/50 border border-red-700 rounded-md"
              >
                <div className="flex items-center gap-2 text-red-400">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{errors.file}</span>
                </div>
              </motion.div>
            )}

            {!uploadedFile ? (
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-600 border-dashed rounded-md hover:border-slate-500 transition-colors">
                <div className="space-y-1 text-center">
                  <UploadCloud className="mx-auto h-12 w-12 text-slate-500" />
                  <div className="flex text-sm text-slate-400 items-center justify-center gap-2">
                    <label
                      htmlFor="file-upload"
                      className="inline-flex items-center justify-center cursor-pointer bg-slate-800 rounded-md px-3 py-1 font-medium text-cyan-400 hover:text-cyan-300"
                    >
                      Upload a file
                      <input id="file-upload" name="file-upload" type="file" accept=".csv" className="sr-only" onChange={handleFileUpload} />
                    </label>
                    <span className="opacity-70 ml-2">or drag and drop</span>
                  </div>
                  <p className="text-xs text-slate-500">CSV files only</p>
                </div>
              </div>
            ) : (
              <div className="bg-slate-700 rounded-md p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-white text-sm font-medium">{uploadedFile.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {csvPreview.length > 0 && (
                      <button
                        onClick={() => setShowPreview((v) => !v)}
                        className="text-xs px-2 py-1 bg-slate-600 text-white rounded hover:bg-slate-500"
                      >
                        <Eye className="w-3 h-3 inline mr-1" />
                        {showPreview ? "Hide" : "Preview"}
                      </button>
                    )}
                    <button onClick={clearUpload} className="text-slate-300 hover:text-white" aria-label="Remove file">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {showPreview && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 bg-slate-800 rounded p-3"
                    >
                      <div className="text-xs text-slate-300 mb-2">Preview (first {Math.min(3, csvPreview.length)} rows):</div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs table-auto">
                          <thead>
                            <tr className="border-b border-slate-600">
                              {Object.keys(csvPreview[0] || {}).map((key) => (
                                <th key={key} className="text-left py-1 px-2 text-slate-300 font-medium whitespace-nowrap">
                                  {key}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {csvPreview.slice(0, 3).map((row, i) => (
                              <tr key={i} className="border-b border-slate-700">
                                {Object.values(row).map((val, j) => (
                                  <td key={j} className="py-1 px-2 text-slate-400 whitespace-nowrap">
                                    {val}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div className="text-center my-4">
            <span className="text-slate-500 font-semibold">OR</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">Enter Single Data Entry</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {requiredHeaders.map((key) => {
                const def = FIELD_DEFINITIONS[key];
                return (
                  <div key={key}>
                    <input
                      type="text"
                      name={key}
                      value={formData[key]}
                      onChange={handleInputChange}
                      placeholder={`${def.placeholder}*`}
                      className={`w-full bg-slate-700 rounded-md p-2 text-white placeholder-slate-400 text-sm focus:ring-1 focus:ring-cyan-500 focus:outline-none ${
                        errors[key] ? "border border-red-500" : "border border-slate-600"
                      }`}
                      inputMode={def.isPositiveOrZero || def.isTemperature ? "decimal" : "text"}
                    />
                    {errors[key] && (
                      <div className="flex items-center gap-1 mt-1 text-red-400 text-xs">
                        <AlertCircle className="w-3 h-3" />
                        {errors[key]}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {errors.submit && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-md">
                <div className="flex items-center gap-2 text-red-400">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{errors.submit}</span>
                </div>
              </motion.div>
            )}

            <button
              onClick={runClassification}
              disabled={isLoading}
              className={`mt-6 w-full flex items-center justify-center gap-2 px-6 py-3 font-bold rounded-lg transition ${
                isLoading ? "bg-slate-600 cursor-not-allowed text-slate-400" : "bg-cyan-600 hover:bg-cyan-700 text-white"
              }`}
            >
              {isLoading ? (
                <>
                  <Bot className="w-5 h-5 animate-spin" /> Analyzing...
                </>
              ) : (
                <>
                  <Bot className="w-5 h-5" /> Run Classification
                </>
              )}
            </button>
          </div>
        </Card>

        <Card>
          <h2 className="text-2xl font-bold text-white mb-4">Classification Results</h2>
          <AnimatePresence mode="wait">
            {isLoading && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center h-full">
                <Bot className="w-16 h-16 text-cyan-500 animate-pulse" />
                <p className="mt-4 text-slate-300">AI is analyzing the data...</p>
              </motion.div>
            )}

            {classificationResult && !isLoading && (
              <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left: textual summary */}
                  <div className="text-center bg-slate-900 p-6 rounded-lg">
                    <p className="text-sm text-slate-400">AI PREDICTION</p>
                    <p
                      className={`text-4xl font-bold mt-1 ${
                        classificationResult.prediction === "CONFIRMED"
                          ? "text-green-400"
                          : classificationResult.prediction === "CANDIDATE"
                          ? "text-amber-400"
                          : "text-red-400"
                      }`}
                    >
                      {classificationResult.prediction}
                    </p>
                    <p className="text-sm text-slate-300 mt-2">
                      Confidence: <span className="font-bold text-white">{(classificationResult.confidence * 100).toFixed(1)}%</span>
                    </p>
                  </div>

                  {/* Right: confidence donut */}
                  <div className="bg-slate-900 p-4 rounded-lg h-56">
                    {confidencePieData && (
                      <Pie
                        data={confidencePieData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: { display: false },
                            title: { display: true, text: "Confidence" },
                            tooltip: { enabled: true },
                          },
                        }}
                      />
                    )}
                  </div>
                </div>

                <div className="mt-8">
                  <h3 className="font-semibold text-cyan-400 mb-3">AI Transparency Dashboard (Top 5 Features)</h3>
                  <p className="text-sm text-slate-400 mb-4">
                    How the top 5 most impactful features contributed to the prediction. Green values increase confidence, red values decrease it.
                  </p>

                  {/* Existing animated bars */}
                  {classificationResult?.shap_values?.length ? (
                    <>
                      <div className="space-y-3">
                        {(() => {
                          const items = [...classificationResult.shap_values]
                            .map((it) => ({ feature: it.feature, value: Number(it.value) || 0 }))
                            .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
                            .slice(0, 5);

                          const maxAbs = Math.max(1e-6, ...items.map((v) => Math.abs(v.value)));

                          return items.map((item) => {
                            const frac = Math.abs(item.value) / maxAbs;
                            const isPos = item.value > 0;

                            return (
                              <div key={item.feature} className="flex items-center gap-2">
                                <span className="text-xs w-1/4 text-slate-300 truncate pr-2" title={item.feature}>
                                  {item.feature}
                                </span>

                                <div className="w-3/4 bg-slate-700 rounded-full h-4 overflow-hidden relative ring-1 ring-slate-600/60">
                                  <motion.div
                                    initial={{ scaleX: 0 }}
                                    animate={{ scaleX: Math.max(0.06, frac) }}
                                    transition={{ duration: 0.6, ease: "easeOut" }}
                                    className={`h-full origin-left rounded-full ${isPos ? "bg-green-500" : "bg-red-500"}`}
                                    style={{ width: "100%" }}
                                  />
                                  <div className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] text-white/90 font-mono">
                                    {item.value.toFixed(4)}
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>

                      {/* NEW: Chart.js bar for same Top-5 features */}
                      {shapBarData && (
                        <div className="mt-8 h-72 bg-slate-900 rounded-lg p-4">
                          <Bar
                            data={{
                              labels: shapTop5.map((d) => d.feature),
                                  datasets: [
                                {
                                  label: "SHAP value",
                                  data: shapTop5.map((d) => d.value),
                                  backgroundColor: shapTop5.map((d) =>
                                    d.value >= 0 ? "rgba(34,197,94,0.75)" : "rgba(239,68,68,0.75)"
                                  ),
                                  borderWidth: 0,
                                  barThickness: 12,
                                  maxBarThickness: 16,
                                  barPercentage: 0.9,
                                  categoryPercentage: 0.8,
                                  borderRadius: 6,
                                },
                              ],
                            }}
                            options={{
                              indexAxis: "y",
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: { display: false },
                                title: { display: true, text: "Top-5 Feature Impact (SHAP)" },
                                tooltip: {
                                  mode: "nearest",
                                  intersect: false,
                                  callbacks: {
                                    label: (ctx) => `SHAP: ${Number(ctx.raw).toFixed(3)}`,
                                  },
                                },
                              },
                              interaction: { mode: "nearest", axis: "y", intersect: false },
                              scales: {
                                x: {
                                  grid: { color: "rgba(148,163,184,0.15)" },
                                  ticks: { color: "#e2e8f0" },
                                  suggestedMin: -Math.max(0.5, ...shapTop5.map((d) => Math.abs(d.value))),
                                  suggestedMax:  Math.max(0.5, ...shapTop5.map((d) => Math.abs(d.value))),
                                },
                                y: {
                                  grid: { color: "rgba(148,163,184,0.08)" },
                                  ticks: { color: "#e2e8f0" },
                                },
                              },
                            }}
                          />
                        </div>
                      )}

                    </>
                  ) : (
                    <div className="text-slate-500 text-sm">No SHAP values to display.</div>
                  )}
                </div>
              </motion.div>
            )}

            {!classificationResult && !isLoading && (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center h-full text-center">
                <BarChart className="w-16 h-16 text-slate-600 mb-4" />
                <p className="text-slate-500">Submit data to see the AI's classification and transparency report.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </div>
    </div>
  );
};

export default ClassifierTool;
