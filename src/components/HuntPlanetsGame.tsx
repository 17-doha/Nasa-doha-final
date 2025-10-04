import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown } from "lucide-react";

// --- Helper Components (formerly in separate files) ---

// Simple Card component for UI structure
const Card = ({ children, className }) => (
  <div
    className={`bg-slate-800/50 border border-slate-700 rounded-xl shadow-lg p-6 ${
      className || ""
    }`}
  >
    {children}
  </div>
);

// Simple Section component for layout
const Section = ({ children, className }) => (
  <section className={`py-12 px-4 ${className || ""}`}>{children}</section>
);

// --- Mock Supabase Client ---
// This mock simulates the Supabase client to make the component runnable without a real backend.
const FAKE_LEADERBOARD = [
  { username: "CosmicExplorer", score: 1250 },
  { username: "Stargazer_1", score: 1100 },
  { username: "PlanetHunter_X", score: 980 },
];

const supabase = {
  from: () => ({
    select: () => ({
      order: () => ({
        limit: () => {
          // Simulate fetching leaderboard data
          const data = FAKE_LEADERBOARD.sort((a, b) => b.score - a.score).slice(
            0,
            3
          );
          return Promise.resolve({ data, error: null });
        },
      }),
      eq: (column, value) => ({
        order: () => ({
          limit: () => {
            // Simulate fetching a user's high score
            const userScores = FAKE_LEADERBOARD.filter(
              (entry) => entry.username === value
            );
            const topScore =
              userScores.length > 0
                ? Math.max(...userScores.map((u) => u.score))
                : 0;
            return Promise.resolve({
              data: [{ score: topScore }],
              error: null,
            });
          },
        }),
        single: () => {
          // Simulate checking if a user exists
          const user = FAKE_LEADERBOARD.find(
            (entry) => entry.username === value
          );
          return Promise.resolve({
            data: user ? { id: value } : null,
            error: null,
          });
        },
      }),
    }),
    insert: (newData) => {
      // Simulate inserting a new score
      console.log("Inserting new data:", newData);
      const existingUserIndex = FAKE_LEADERBOARD.findIndex(
        (u) => u.username === newData.username
      );
      if (existingUserIndex > -1) {
        if (newData.score > FAKE_LEADERBOARD[existingUserIndex].score) {
          FAKE_LEADERBOARD[existingUserIndex].score = newData.score;
        }
      } else {
        FAKE_LEADERBOARD.push({
          username: newData.username,
          score: newData.score,
        });
      }
      return Promise.resolve({ error: null });
    },
  }),
};

// --- Mock Data (replaces external CSV file) ---
const MOCK_PLANET_DATA = [
  {
    planet_name: "Kepler-186 f",
    disposition: "CONFIRMED",
    orbital_period_days: "129.9",
    ra_deg: "299.1",
    dec_deg: "44.4",
    Question: "What is a key feature of Kepler-186 f?",
    Choice1: "It has rings like Saturn",
    "Choice2(correct)": "It is an Earth-sized planet in the habitable zone",
  },
  {
    planet_name: "TRAPPIST-1 e",
    disposition: "CONFIRMED",
    orbital_period_days: "6.1",
    ra_deg: "346.6",
    dec_deg: "-5.0",
    Question: "How many Earth-sized planets are in the TRAPPIST-1 system?",
    Choice1: "Three",
    "Choice2(correct)": "Seven",
  },
  {
    planet_name: "Proxima Centauri b",
    disposition: "CONFIRMED",
    orbital_period_days: "11.2",
    ra_deg: "217.4",
    dec_deg: "-62.6",
    Question:
      "Proxima Centauri b orbits the closest star to our Sun. What is that star's name?",
    Choice1: "Sirius",
    "Choice2(correct)": "Proxima Centauri",
  },
  {
    planet_name: "55 Cancri e",
    disposition: "CONFIRMED",
    orbital_period_days: "0.7",
    ra_deg: "131.8",
    dec_deg: "28.3",
    Question: "What is the nickname for the exoplanet 55 Cancri e?",
    Choice1: "The Water World",
    "Choice2(correct)": "The Diamond Planet",
  },
];

// --- Type Definitions ---
type PlanetData = {
  planet_name: string;
  disposition: string;
  orbital_period_days: string;
  ra_deg: string;
  dec_deg: string;
  Question: string;
  Choice1: string;
  "Choice2(correct)": string;
};

type LeaderboardEntry = { name: string; score: number };

type PlanetFeature = {
  label: string;
  value: string;
  maxValue: number;
};

// --- Main Game Component ---
const HuntPlanetsGame = () => {
  const [userGuess, setUserGuess] = useState(null);
  const [score, setScore] = useState(0);
  const [username, setUsername] = useState("");
  const [leaderboard, setLeaderboard] = useState([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [planetData, setPlanetData] = useState([]);
  const [currentPlanet, setCurrentPlanet] = useState(null);
  const [shuffledChoices, setShuffledChoices] = useState([]);

  // Load initial data on component mount
  useEffect(() => {
    // Load planet data from the mock constant
    setPlanetData(MOCK_PLANET_DATA);
    setRandomPlanet(MOCK_PLANET_DATA);

    // Load leaderboard
    loadTop3();
  }, []);

  const loadTop3 = async () => {
    const { data, error } = await supabase
      .from("scores")
      .select("username, score")
      .order("score", { ascending: false })
      .limit(3);
    if (!error && data) {
      setLeaderboard(data.map((d) => ({ name: d.username, score: d.score })));
    }
  };

  const handleGuess = (guess) => {
    if (!currentPlanet) return;

    setUserGuess(guess);
    const isCorrect = guess === currentPlanet["Choice2(correct)"];
    const points = isCorrect ? 100 : -50;
    setScore((prev) => prev + points);
  };

  const normalizeValue = (value, max) => {
    const num = parseFloat(value);
    if (isNaN(num) || !isFinite(num)) return 0;
    return Math.min(100, Math.max(0, (num / max) * 100));
  };

  const getPlanetFeatures = (planet) => [
    {
      label: "Orbital Period (days)",
      value: planet.orbital_period_days || "0",
      maxValue: 150,
    },
    {
      label: "Right Ascension (deg)",
      value: planet.ra_deg || "0",
      maxValue: 360,
    },
    {
      label: "Declination (deg)",
      value: planet.dec_deg || "0",
      maxValue: 180,
    },
  ];

  const setRandomPlanet = (planets) => {
    if (planets.length === 0) return;
    const randomIndex = Math.floor(Math.random() * planets.length);
    const planet = planets[randomIndex];
    setCurrentPlanet(planet);
    if (planet) {
      const choices = [planet.Choice1, planet["Choice2(correct)"]].sort(
        () => Math.random() - 0.5
      );
      setShuffledChoices(choices);
    }
  };

  const resetGame = () => {
    setUserGuess(null);
    setRandomPlanet(planetData);
  };

  const saveScore = async () => {
    setSaveMessage("");
    setSaveError("");
    if (!username.trim()) {
      setSaveError("Please enter a username before saving.");
      return;
    }

    try {
      setSaving(true);
      const name = username.trim();

      const { data: existingScores } = await supabase
        .from("scores")
        .select("score")
        .eq("username", name)
        .order("score", { ascending: false })
        .limit(1);

      const currentHighScore = existingScores?.[0]?.score || 0;

      if (score > currentHighScore) {
        const { data: existingUser } = await supabase
          .from("users")
          .select("id")
          .eq("username", name)
          .single();

        let userId = existingUser?.id;

        if (!userId) {
          // In a real app, this would create a new user. Here we just log.
          console.log("Creating new user for score saving.");
          userId = name; // use name as ID for mock
        }

        await supabase.from("scores").insert({
          user_id: userId,
          username: name,
          score,
        });

        setSaveMessage("New high score saved!");
      } else {
        setSaveMessage("Score not saved - not a new high score");
      }

      await loadTop3(); // Refresh leaderboard
    } catch (error) {
      setSaveError("An unexpected error occurred");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section className="bg-gradient-to-b from-slate-900 to-slate-950 text-white min-h-screen">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Game Panel */}
        <div className="lg:col-span-2">
          <h2 className="text-4xl font-bold text-center mb-2">
            Planet Trivia Challenge
          </h2>
          <Card>
            {currentPlanet ? (
              <>
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-cyan-400 mb-4">
                    {currentPlanet.planet_name}
                  </h3>

                  <div className="bg-slate-800 p-4 rounded-lg mb-6 flex justify-center items-center">
                    <img
                      src={`https://placehold.co/400x400/020617/38bdf8?text=${encodeURIComponent(
                        currentPlanet.planet_name
                      )}`}
                      alt={currentPlanet.planet_name}
                      className="object-cover rounded-md shadow-md"
                      style={{ width: 400, height: 400 }}
                    />
                  </div>
                </div>

                {userGuess === null ? (
                  <div>
                    <h3 className="text-xl font-semibold text-center mb-4">
                      {currentPlanet.Question}
                    </h3>

                    <div className="space-y-4 mb-6">
                      {getPlanetFeatures(currentPlanet).map((feature) => (
                        <div
                          key={feature.label}
                          className="bg-slate-800 p-4 rounded-lg"
                        >
                          <div className="flex justify-between text-sm text-slate-300 mb-2">
                            <span>{feature.label}:</span>
                            <span>
                              {isNaN(parseFloat(feature.value))
                                ? "N/A"
                                : parseFloat(feature.value).toFixed(2)}
                            </span>
                          </div>
                          <div className="w-full bg-slate-700 rounded-full h-2.5">
                            <motion.div
                              className="bg-cyan-500 h-2.5 rounded-full"
                              initial={{ width: 0 }}
                              animate={{
                                width: `${normalizeValue(
                                  feature.value,
                                  feature.maxValue
                                )}%`,
                              }}
                              transition={{ duration: 0.8 }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {shuffledChoices.map((choice, index) => (
                        <motion.button
                          key={index}
                          whileHover={{ scale: 1.05 }}
                          onClick={() => handleGuess(choice)}
                          className="w-full flex items-center justify-center p-4 text-lg font-bold bg-slate-700 text-white border-2 border-slate-600 rounded-lg hover:bg-slate-600 transition"
                        >
                          {choice}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <AnimatePresence>
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                    >
                      <h3 className="text-2xl font-bold text-center">
                        Results
                      </h3>
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
                        <div className="p-4 bg-slate-700/50 rounded-lg">
                          <p className="text-sm text-slate-400">Your Answer</p>
                          <p
                            className={`text-xl font-bold ${
                              userGuess === currentPlanet["Choice2(correct)"]
                                ? "text-green-400"
                                : "text-red-400"
                            }`}
                          >
                            {userGuess}
                          </p>
                        </div>
                        <div className="p-4 bg-slate-700/50 rounded-lg">
                          <p className="text-sm text-slate-400">
                            Correct Answer
                          </p>
                          <p className={`text-xl font-bold text-green-400`}>
                            {currentPlanet["Choice2(correct)"]}
                          </p>
                        </div>
                      </div>
                      <div className="text-center mt-8">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          onClick={resetGame}
                          className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition"
                        >
                          Next Question
                        </motion.button>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                )}
              </>
            ) : (
              <div className="text-center p-8">
                <p className="text-slate-400">Loading planet data...</p>
              </div>
            )}
          </Card>
        </div>

        {/* Score and Leaderboard Panel */}
        <div className="space-y-8">
          <Card>
            <h3 className="text-xl font-bold text-center text-cyan-400">
              Your Score
            </h3>
            <p className="text-5xl font-bold text-center mt-2">{score}</p>
            <div className="mt-4 px-4 pb-4">
              <label className="block text-sm text-slate-300 mb-2">
                Username
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-600"
              />
              <motion.button
                whileHover={{ scale: 1.03 }}
                onClick={saveScore}
                disabled={saving || !username.trim()}
                className={`mt-3 w-full px-4 py-2 text-white font-semibold rounded-md ${
                  saving || !username.trim()
                    ? "bg-cyan-600/50 cursor-not-allowed"
                    : "bg-cyan-600 hover:bg-cyan-700"
                }`}
              >
                {saving ? "Saving..." : "Save Score"}
              </motion.button>
              {(saveError || saveMessage) && (
                <p
                  className={`mt-2 text-sm ${
                    saveError ? "text-red-400" : "text-green-400"
                  }`}
                >
                  {saveError || saveMessage}
                </p>
              )}
            </div>
          </Card>

          <Card>
            <h3 className="text-xl font-bold text-center flex items-center justify-center text-cyan-400 mb-4">
              <Crown className="mr-2 text-yellow-400" />
              Leaderboard
            </h3>
            <ul className="space-y-3">
              {(leaderboard.length > 0 ? leaderboard : FAKE_LEADERBOARD).map(
                (player, index) => (
                  <li
                    key={`${player.name}-${index}`}
                    className="flex justify-between items-center p-2 bg-slate-700/50 rounded-md"
                  >
                    <span className="font-semibold">
                      {index + 1}. {player.name}
                    </span>
                    <span className="font-bold text-cyan-300">
                      {player.score}
                    </span>
                  </li>
                )
              )}
            </ul>
          </Card>
        </div>
      </div>
    </Section>
  );
};

export default HuntPlanetsGame;
