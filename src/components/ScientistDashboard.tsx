import React, { lazy, Suspense } from "react";
import Card from "./ui/Card";

// Fallback placeholder (your original under-construction block)
const FallbackExplorer: React.FC = () => (
  <Card>
    <h2 className="text-2xl font-bold text-white">Unified Data Explorer</h2>
    <p className="text-slate-400 mt-2">
      Search, filter, and compare datasets. (Component under construction)
    </p>
    <div className="mt-4 p-8 bg-slate-900 rounded-lg text-center text-slate-500">
      Interactive charts and tables will be displayed here.
    </div>
  </Card>
);

// Try to load UnifiedDataExplorer if it exists; otherwise use fallback
const UnifiedDataExplorer = lazy(() =>
  import("./UnifiedDataExplorer")
    .then((m) => ({ default: m.default }))
    .catch(() => ({ default: FallbackExplorer }))
);

const ScientistDashboard: React.FC = () => (
  <div className="p-8">
    <h1 className="text-3xl font-bold text-white mb-6">Scientist Dashboard</h1>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="text-center">
        <h3 className="text-lg font-semibold text-cyan-400">Confirmed Planets</h3>
        <p className="text-4xl font-bold text-white mt-2">6,007</p>
      </Card>
      <Card className="text-center">
        <h3 className="text-lg font-semibold text-cyan-400">Awaiting Candidates</h3>
        <p className="text-4xl font-bold text-white mt-2">8,000+</p>
      </Card>
      <Card className="text-center">
        <h3 className="text-lg font-semibold text-cyan-400">Integrated Datasets</h3>
        <p className="text-4xl font-bold text-white mt-2">3 (KOI, TOI, K2)</p>
      </Card>
    </div>

    <div className="mt-8">
      <Suspense fallback={<FallbackExplorer />}>
        <UnifiedDataExplorer />
      </Suspense>
    </div>
  </div>
);

export default ScientistDashboard;
