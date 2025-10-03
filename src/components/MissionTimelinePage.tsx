// MissionTimelinePage.tsx
import React from "react";
import { motion } from "framer-motion";
import { Calendar, Target, Rocket, Users } from "lucide-react";
import Section from "./ui/Section";
import Card from "./ui/Card";

type Mission = {
  id: number;
  name: string;
  status: "Active" | "Completed";
  launchDate: string;
  endDate: string;
  discoveries: string;
  description: string;
  color: string; // tailwind text-* color for accent
};

const MISSIONS: Mission[] = [
  {
    id: 1,
    name: "Kepler Mission",
    status: "Completed",
    launchDate: "2009",
    endDate: "2018",
    discoveries: "2,662 confirmed planets",
    description:
      "The first mission to find Earth-size planets in or near the habitable zone.",
    color: "text-green-400",
  },
  {
    id: 2,
    name: "K2 Mission",
    status: "Completed",
    launchDate: "2014",
    endDate: "2018",
    discoveries: "500+ confirmed planets",
    description:
      "Extended Kepler mission using two-wheel operation.",
    color: "text-blue-400",
  },
  {
    id: 3,
    name: "TESS Mission",
    status: "Active",
    launchDate: "2018",
    endDate: "Ongoing",
    discoveries: "300+ confirmed planets",
    description:
      "Transiting Exoplanet Survey Satellite — all-sky survey for planets.",
    color: "text-cyan-400",
  },
  {
    id: 4,
    name: "James Webb Space Telescope",
    status: "Active",
    launchDate: "2021",
    endDate: "Ongoing",
    discoveries: "Revolutionary observations",
    description:
      "Next-generation space telescope for detailed exoplanet characterization.",
    color: "text-purple-400",
  },
];

const MissionTimelinePage: React.FC = () => {
  return (
    <Section className="bg-gradient-to-b from-slate-900 to-slate-950 text-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-cyan-400">
            Mission Timeline
          </h1>
          <p className="text-xl text-slate-300 max-w-3xl mx-auto">
            Explore the history and future of exoplanet discovery missions that
            have revolutionized our understanding of the universe.
          </p>
        </div>

        {/* 3-col grid: left | center line | right */}
        <div className="relative grid gap-y-12" style={{ gridTemplateColumns: "1fr 2px 1fr" }}>
          {/* center vertical line */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-gradient-to-b from-cyan-500 to-purple-500 rounded" />

          {MISSIONS.map((m, i) => {
            const toLeft = i % 2 === 0;
            const statusStyles =
              m.status === "Active"
                ? "bg-green-600/20 text-green-400 border border-green-500"
                : "bg-slate-600/20 text-slate-400 border border-slate-500";

            const card = (
              <motion.div
                key={`card-${m.id}`}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.6, delay: i * 0.05 }}
                className="px-4"
              >
                <Card className={`relative border-l-4 ${toLeft ? "border-cyan-500" : "border-indigo-500"}`}>
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-3">
                    <div>
                      <h3 className="text-2xl font-bold text-white mb-1">{m.name}</h3>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-1" />
                          {m.launchDate} – {m.endDate}
                        </div>
                        <div className="flex items-center">
                          <Target className="w-4 h-4 mr-1" />
                          {m.discoveries}
                        </div>
                      </div>
                    </div>
                    <div className={`mt-3 lg:mt-0 px-3 py-1 rounded-full text-sm font-semibold ${statusStyles}`}>
                      {m.status}
                    </div>
                  </div>

                  <p className="text-slate-300 mb-4">{m.description}</p>

                  <div className="flex items-center justify-between">
                    <div className={`flex items-center ${m.color}`}>
                      <Rocket className="w-5 h-5 mr-2" />
                      <span className="font-semibold">Space Mission</span>
                    </div>
                    <div className="flex items-center text-slate-400">
                      <Users className="w-5 h-5 mr-2" />
                      <span>NASA &amp; International Partners</span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );

            return (
              <React.Fragment key={`row-${m.id}`}>
                {/* left cell or empty */}
                {toLeft ? card : <div />}

                {/* center dot */}
                <div className="flex items-center justify-center">
                  <span
                    aria-hidden
                    className={[
                      "block w-4 h-4 rounded-full border-4 border-slate-900 z-10",
                      toLeft ? "bg-cyan-500" : "bg-indigo-500",
                    ].join(" ")}
                  />
                </div>

                {/* right cell or empty */}
                {!toLeft ? card : <div />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Upcoming missions section */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mt-16"
        >
          <Card>
            <h2 className="text-3xl font-bold text-center text-cyan-400 mb-8">
              Upcoming Missions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 bg-slate-800/50 rounded-lg">
                <h3 className="text-xl font-bold text-white mb-2">PLATO Mission</h3>
                <p className="text-slate-300 mb-4">
                  European Space Agency mission to find Earth-like planets around
                  Sun-like stars.
                </p>
                <div className="text-sm text-slate-400">Launch: 2026</div>
              </div>
              <div className="p-6 bg-slate-800/50 rounded-lg">
                <h3 className="text-xl font-bold text-white mb-2">ARIEL Mission</h3>
                <p className="text-slate-300 mb-4">
                  Atmospheric Remote-sensing Infrared Exoplanet Large-survey mission.
                </p>
                <div className="text-sm text-slate-400">Launch: 2029</div>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </Section>
  );
};

export default MissionTimelinePage;
