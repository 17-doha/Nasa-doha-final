import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Telescope } from "lucide-react";

import NavLink from "./components/ui/NavLink";
import HomePage from "./components/HomePage";
import MissionTimelinePage from "./components/MissionTimelinePage";
import HuntPlanetsGame from "./components/HuntPlanetsGame";
import ScientistDashboard from "./components/ScientistDashboard";
import ClassifierTool from "./components/ClassifierTool";
import ModelPerformancePage from "./components/ModelPerformancePage";
import { ModelTrainingPage } from "./components/TrainModel";
import type { Page } from "./types";

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [isScientistMode, setIsScientistMode] = useState(false);

  const navigate = (p: Page) => {
    setPage(p);
    window.scrollTo(0, 0);
  };

  const toggleMode = () => {
    setIsScientistMode((v) => !v);
    navigate(isScientistMode ? "home" : "dashboard");
  };

  const renderPage = () => {
    switch (page) {
      case "home": return <HomePage setPage={navigate} />;
      case "timeline": return <MissionTimelinePage />;
      case "game": return <HuntPlanetsGame />;
      case "dashboard": return <ScientistDashboard />;
      case "classifier": return <ClassifierTool />;
      case "metrics": return <ModelPerformancePage />;
      case "trainmodel": return <ModelTrainingPage />;
      default: return <HomePage setPage={navigate} />;
    }
  };

  return (
    <div className="bg-slate-900 min-h-screen font-sans">
      <header className="bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center cursor-pointer" onClick={() => navigate("home")}>
              <Telescope className="h-8 w-8 text-cyan-400" />
              <span className="ml-3 text-2xl font-bold text-white">
                <span className="text-cyan-400">EXO</span>plorer
              </span>
            </div>

            {!isScientistMode ? (
              <div className="hidden md:flex items-center space-x-2">
                <NavLink onClick={() => navigate("home")} isActive={page === "home"}>Home</NavLink>
                <NavLink onClick={() => navigate("timeline")} isActive={page === "timeline"}>Mission Timeline</NavLink>
                <NavLink onClick={() => navigate("game")} isActive={page === "game"}>Hunt Planets</NavLink>
              </div>
            ) : (
              <div className="hidden md:flex items-center space-x-2">
                <NavLink onClick={() => navigate("dashboard")} isActive={page === "dashboard"}>Dashboard</NavLink>
                <NavLink onClick={() => navigate("classifier")} isActive={page === "classifier"}>Classifier</NavLink>
                <NavLink onClick={() => navigate("metrics")} isActive={page === "metrics"}>Model Performance</NavLink>
                <NavLink onClick={() => navigate("trainmodel")} isActive={page === "trainmodel"}>Train Model</NavLink>
              </div>
            )}

            <div>
              <button
                onClick={toggleMode}
                className="px-4 py-2 text-sm font-medium text-white bg-slate-900 border border-slate-700 rounded-md shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 focus:ring-offset-slate-900"
              >
                {isScientistMode ? "Exit Scientist Mode" : "Scientist Mode"}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main>
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {renderPage()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
