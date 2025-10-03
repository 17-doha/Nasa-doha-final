import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import {
  BrainCircuit,
  CheckCircle,
  LineChart,
  Target,
  Gauge,
  Activity,
  ChartSpline,
} from "lucide-react";
import Card from "./ui/Card";
import Section from "./ui/Section";

type PerClass = { precision: number; recall: number; f1_score: number; support: number };
type Report = Record<string, PerClass | number | undefined> & {
  accuracy?: number;
  "macro avg"?: PerClass;
  "weighted avg"?: PerClass;
};
type ModelBlock = {
  modelName: string;
  version: string;
  trainingDate: string;
  isActive: boolean;
  metrics: Record<string, number>;
  labels?: string[];
  confusionMatrix?: number[][];
  report?: Report;
};
type Payload = { models: ModelBlock[] };

const ICONS: Record<string, ReactNode> = {
  accuracy: <Target className="w-4 h-4" />,
  precision_macro: <Gauge className="w-4 h-4" />,
  recall_macro: <Activity className="w-4 h-4" />,
  f1_macro: <LineChart className="w-4 h-4" />,
  roc_auc_ovr: <ChartSpline className="w-4 h-4" />,
  roc_auc_ovo: <ChartSpline className="w-4 h-4" />,
};

const nice = (v: number) => (v <= 1 ? `${(v * 100).toFixed(1)}%` : v.toFixed(4));

const StatTile: React.FC<{ name: string; value: number }> = ({ name, value }) => (
  <div className="rounded-2xl bg-gradient-to-b from-slate-800/70 to-slate-900/60 border border-slate-700/70 shadow-lg shadow-slate-900/20 p-5 hover:from-slate-800/90 hover:to-slate-900 transition-colors">
    <div className="flex items-center gap-2 text-slate-400 text-[11px] tracking-wide">
      <span className="text-cyan-300">{ICONS[name.toLowerCase()] ?? <LineChart className="w-4 h-4" />}</span>
      {name.replaceAll("_", " ").toUpperCase()}
    </div>
    <div className="mt-2 text-4xl font-extrabold leading-none text-cyan-300 drop-shadow-sm">{nice(value)}</div>
  </div>
);

function lvl(v: number, max: number) {
  const r = max ? v / max : 0;
  if (r >= 0.90) return "bg-cyan-600/60";
  if (r >= 0.70) return "bg-cyan-700/60";
  if (r >= 0.50) return "bg-cyan-800/60";
  if (r >= 0.30) return "bg-cyan-900/50";
  if (r >= 0.10) return "bg-cyan-950/40";
  return "bg-slate-800/90";
}

const ConfusionMatrixHeatmap: React.FC<{ labels: string[]; mat: number[][] }> = ({ labels, mat }) => (
  <Card className="border border-slate-700/70 rounded-2xl bg-slate-900/70 backdrop-blur-sm">
    <h4 className="font-semibold text-slate-200 mb-3">Confusion Matrix</h4>
    <div className="overflow-x-auto rounded-xl">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-900/70">
          <tr>
            <th className="px-3 py-2 text-left text-slate-400">True \\ Pred</th>
            {labels.map((l) => (
              <th key={l} className="px-3 py-2 text-slate-400">{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {mat.map((row, i) => {
            const m = Math.max(...row);
            return (
              <tr key={i} className="even:bg-slate-900/40">
                <td className="px-3 py-2 text-slate-300 font-medium">{labels[i]}</td>
                {row.map((v, j) => (
                  <td key={j} className={`px-3 py-2 text-center text-white ${lvl(v, m)}`}>{v.toLocaleString()}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </Card>
);

const ReportTable: React.FC<{ report: Report }> = ({ report }) => {
  const rows = Object.entries(report).filter(([k]) => !["accuracy", "macro avg", "weighted avg"].includes(k));
  return (
    <Card className="border border-slate-700/70 rounded-2xl bg-slate-900/70 backdrop-blur-sm">
      <h3 className="text-lg font-semibold mb-3 text-slate-200">Classification Report</h3>
      <div className="overflow-x-auto rounded-xl">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/70">
            <tr>
              <th className="px-3 py-2 text-left text-slate-400">label</th>
              <th className="px-3 py-2 text-slate-400 text-center">precision</th>
              <th className="px-3 py-2 text-slate-400 text-center">recall</th>
              <th className="px-3 py-2 text-slate-400 text-center">f1-score</th>
              <th className="px-3 py-2 text-slate-400 text-center">support</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, v]) => {
              const r = v as PerClass | undefined;
              if (!r) return null;
              return (
                <tr key={label} className="even:bg-slate-900/40">
                  <td className="px-3 py-2 text-slate-300 font-medium whitespace-nowrap">{label}</td>
                  <td className="px-3 py-2 text-center text-white">{(r.precision ?? 0).toFixed(4)}</td>
                  <td className="px-3 py-2 text-center text-white">{(r.recall ?? 0).toFixed(4)}</td>
                  <td className="px-3 py-2 text-center text-white">{(r.f1_score ?? 0).toFixed(4)}</td>
                  <td className="px-3 py-2 text-center text-white">{Number(r.support ?? 0).toLocaleString()}</td>
                </tr>
              );
            })}
            {"accuracy" in report && typeof report.accuracy === "number" && (
              <tr className="bg-slate-900/70">
                <td className="px-3 py-2 text-slate-300 font-semibold">accuracy</td>
                <td colSpan={4} className="px-3 py-2 text-center text-white">{report.accuracy.toFixed(4)}</td>
              </tr>
            )}
            {(["macro avg", "weighted avg"] as const).map((k) =>
              report[k] ? (
                <tr key={k} className="even:bg-slate-900/40">
                  <td className="px-3 py-2 text-slate-300 font-medium">{k}</td>
                  <td className="px-3 py-2 text-center text-white">{(report[k] as PerClass).precision.toFixed(4)}</td>
                  <td className="px-3 py-2 text-center text-white">{(report[k] as PerClass).recall.toFixed(4)}</td>
                  <td className="px-3 py-2 text-center text-white">{(report[k] as PerClass).f1_score.toFixed(4)}</td>
                  <td className="px-3 py-2 text-center text-white">{(report[k] as PerClass).support.toLocaleString?.() ?? ""}</td>
                </tr>
              ) : null
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

const Tabs: React.FC<{
  models: ModelBlock[];
  active: number;
  onChange: (i: number) => void;
}> = ({ models, active, onChange }) => (
  <div className="flex flex-wrap items-center gap-2 mb-6">
    {models.map((m, i) => (
      <button
        key={`${m.modelName}-${i}`}
        onClick={() => onChange(i)}
        className={[
          "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium border transition-colors",
        i === active
          ? "bg-slate-800/80 text-white border-slate-700 hover:bg-slate-800"
          : "bg-slate-900/40 text-slate-300 border-slate-700 hover:bg-slate-800/60"
        ].join(" ")}
        title={`${m.modelName} • ${m.version}`}
      >
        <span>{m.modelName}</span>
        <span className="ml-2 text-xs rounded-full bg-slate-700/80 text-slate-300 px-2 py-0.5">
          v{m.version}
        </span>
      </button>
    ))}
    <a
      href="/metrics.json"
      download
      className="ml-auto px-3 py-1.5 rounded-full text-sm bg-slate-800/60 text-slate-300 hover:bg-slate-700 border border-slate-700"
    >
      Download metrics.json
    </a>
  </div>
);


const Skeleton: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`animate-pulse bg-slate-800/60 rounded-2xl ${className}`} />
);

const ModelPerformancePage: React.FC = () => {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/metrics.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load /metrics.json (HTTP ${res.status})`);
        const j: Payload = await res.json();
        if (!j?.models?.length) throw new Error("metrics.json has no models[]");
        setData(j);
      } catch (e: any) {
        setError(e?.message || "Failed to load metrics.json");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Section className="bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto">
        {/* Hero */}
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="inline-flex items-center justify-center rounded-full bg-cyan-500/10 p-2">
            <BrainCircuit className="w-6 h-6 text-cyan-400" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight">ML Model Performance</h1>
        </div>

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        )}

        {!loading && error && <p className="text-center text-red-400">{error}</p>}

        {!loading && !error && data && (
          <>
            <Tabs models={data.models} active={active} onChange={setActive} />

            {(() => {
              const model = data.models[active];
              return (
                <motion.div
                  key={`${model.modelName}-${active}`}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                >
                  <Card className="border-t-4 border-cyan-500/80 rounded-2xl bg-slate-900/60 backdrop-blur-sm">
                    {/* Title row */}
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-6">
                      <div>
                        <h2 className="text-3xl font-bold">{model.modelName}</h2>
                        <p className="text-slate-400">
                          Version: {model.version} • Trained on: {model.trainingDate}
                        </p>
                      </div>
                      {model.isActive && (
                        <div className="inline-flex items-center bg-green-500/15 text-green-300 px-4 py-2 rounded-full text-sm font-semibold">
                          <CheckCircle className="w-5 h-5 mr-2" />
                          Active Production Model
                        </div>
                      )}
                    </div>

                    {/* Content grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Left: metrics + notes + report */}
                      <div className="lg:col-span-2 space-y-8">
                        {/* Stats */}
                        <div>
                          <h3 className="text-xl font-semibold mb-4 text-cyan-400">Key Metrics</h3>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {Object.entries(model.metrics).map(([k, v]) => (
                              <StatTile key={k} name={k} value={v} />
                            ))}
                          </div>
                        </div>


                        {/* Report */}
                        {model.report && <ReportTable report={model.report} />}
                      </div>

                      {/* Right: confusion matrix */}
                      <div className="space-y-4">
                        {model.confusionMatrix && model.labels && (
                          <ConfusionMatrixHeatmap labels={model.labels} mat={model.confusionMatrix} />
                        )}
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })()}
          </>
        )}
      </div>
    </Section>
  );
};

export default ModelPerformancePage;
