import React from "react";
import { motion } from "framer-motion";
import { Telescope, ArrowRight } from "lucide-react";
import DynamicBackground from "./ui/DynamicBackground";
import type { Page } from "../types";               // <-- add

type Props = { setPage: (p: Page) => void };        // <-- use Page

const HomePage: React.FC<Props> = ({ setPage }) => {
  return (
    <div className="relative h-screen flex items-center justify-center text-center text-white overflow-hidden">
      <DynamicBackground />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 p-8"
      >
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-cyan-400">
          A World Away
        </h1>
        <p className="mt-4 text-xl md:text-2xl text-slate-300 max-w-3xl mx-auto">
          Join the hunt for exoplanets with the power of AI. Explore distant worlds and contribute to real scientific discovery.
        </p>
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setPage("timeline")}
            className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white bg-cyan-600 border border-transparent rounded-md shadow-lg hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 focus:ring-offset-slate-900 transition-transform"
          >
            Explore Missions <Telescope className="ml-2 h-5 w-5" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setPage("game")}
            className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 text-lg font-semibold text-cyan-300 bg-slate-800/80 border border-slate-600 rounded-md shadow-lg hover:bg-slate-700 transition-transform"
          >
            Hunt Planets <ArrowRight className="ml-2 h-5 w-5" />
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

export default HomePage;
