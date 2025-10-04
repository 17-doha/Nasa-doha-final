import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, Bot, Crown } from "lucide-react";
import Card from "./ui/Card";
import Section from "./ui/Section";
import { supabase } from "../lib/supabaseClient";

const MOCK_GAME_CANDIDATE = {
  id: "cand_001",
  lightCurveUrl:
    "https://placehold.co/600x300/020617/38bdf8?text=Light+Curve+Data",
  aiPrediction: {
    isPlanet: true,
    confidence: 0.92,
    reasoning: [
      { feature: "Transit Depth", importance: 0.45 },
      { feature: "Orbital Period", importance: 0.3 },
      { feature: "Stellar Radius", importance: 0.15 },
      { feature: "Transit Duration", importance: 0.1 },
    ],
  },
};

// ---------- types ----------
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

// ---------- helpers for feature bars ----------
type FeatureMeta = { label: string; value: string; min: number; max: number; unit?: string };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const toNumber = (s: string) => {
  const n = parseFloat(String(s).replace(/[^0-9.+-eE-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
/** 0..1 -> green→yellow→red */
const pctToHsl = (pct: number) => {
  const hue = 120 - 120 * pct; // 120 green, 0 red
  return `hsl(${hue}, 75%, 55%)`;
};

const featureMetas = (planet: PlanetData): FeatureMeta[] => [
  { label: "Orbital Period (days)", value: planet.orbital_period_days ?? "0", min: 0,   max: 100, unit: "d" },
  { label: "Right Ascension (deg)", value: planet.ra_deg ?? "0",            min: 0,   max: 360, unit: "°" },
  { label: "Declination (deg)",     value: planet.dec_deg ?? "0",           min: -90, max: 90,  unit: "°" },
];

// --- replace ONLY this component ---
const EnhancedFeatureBar: React.FC<FeatureMeta> = ({ label, value, min, max, unit }) => {
  const n = toNumber(value);
  const valid = Number.isFinite(n);

  // 0..1 position within [min,max]
  const pct = valid ? clamp((n - min) / (max - min), 0, 1) : 0;
  const widthPct = `${Math.round(pct * 100)}%`;

  // vivid fill (green -> red)
  const fillColor = pctToHsl(pct);

  // inline styles to avoid any Tailwind override/purge issues
  const trackStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    height: "10px",                                     // thicker so it’s visible
    borderRadius: "9999px",
    backgroundColor: "rgba(148,163,184,0.25)",          // high-contrast track
    boxShadow: "inset 0 0 0 1px rgba(148,163,184,.35)", // subtle border
    overflow: "hidden",
  };

  const fillStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: widthPct,                                    // e.g., "28%"
    backgroundColor: fillColor,                         // vivid fill
    borderRadius: "9999px",
    transition: "width 450ms ease-out",                 // smooth update
  };

  return (
    <div className="bg-slate-800 p-4 rounded-lg">
      <div className="flex justify-between text-sm text-slate-300 mb-2">
        <span>{label}:</span>
        <span>{valid ? `${n.toFixed(2)}${unit ?? ""}` : "N/A"}</span>
      </div>

      {/* Track + Fill */}
      <div style={trackStyle}>
        <div style={fillStyle} />
      </div>

      {/* Percent label */}
      <div className="mt-1 text-right text-xs text-slate-400">
        {Math.round(pct * 100)}%
      </div>
    </div>
  );
};

// ===============================================================
const HuntPlanetsGame = () => {
  const [userGuess, setUserGuess] = useState<null | string>(null);
  const [score, setScore] = useState<number>(0);
  const [username, setUsername] = useState<string>("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [currentRowIndex, setCurrentRowIndex] = useState<number>(-1);
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [saveError, setSaveError] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [csvError, setCsvError] = useState<string>("");
  const [planetData, setPlanetData] = useState<PlanetData[]>([]);
  const [currentPlanet, setCurrentPlanet] = useState<PlanetData | null>(null);
  const [shuffledChoices, setShuffledChoices] = useState<string[]>([]);

  // scoring for trivia
  const handleGuess = (guess: string) => {
    if (!currentPlanet) return;
    setUserGuess(guess);
    const isCorrect = guess === currentPlanet["Choice2(correct)"];
    setScore((prev) => prev + (isCorrect ? 100 : -50));
  };

  const resetGame = () => {
    setUserGuess(null);
    setRandomPlanet(planetData);
  };

  // leaderboard
  useEffect(() => {
    const loadTop3 = async () => {
      if (!supabase) return;
      const { data } = await supabase
        .from("scores")
        .select("username, score")
        .order("score", { ascending: false })
        .limit(3);
      if (data) setLeaderboard(data.map((d: any) => ({ name: d.username, score: d.score })));
    };
    loadTop3();
  }, []);

  // save score
  const saveScore = async () => {
    setSaveMessage("");
    setSaveError("");
    if (!username.trim()) {
      setSaveError("Please enter a username before saving.");
      return;
    }
    try {
      setSaving(true);
      if (!supabase) {
        setSaveError("Supabase client not initialized. Cannot save score.");
        setSaving(false);
        return;
      }
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
          const { data: newUser, error: createError } = await supabase
            .from("users")
            .insert({ username: name })
            .select()
            .single();
          if (createError) {
            setSaveError(`Failed to create user: ${createError.message}`);
            return;
          }
          userId = newUser.id;
        }

        const { error: scoreError } = await supabase
          .from("scores")
          .insert({ user_id: userId, username: name, score });

        if (scoreError) {
          setSaveError(`Save failed: ${scoreError.message}`);
          return;
        }
        setSaveMessage("New high score saved!");
      } else {
        setSaveMessage("Score not saved - not a new high score");
      }

      const { data: lbData } = await supabase
        .from("scores")
        .select("username, score")
        .order("score", { ascending: false })
        .limit(50);

      if (lbData) {
        const uniqueScores = lbData.reduce((acc, curr) => {
          if (!acc.some((i) => i.name === curr.username)) {
            acc.push({ name: curr.username, score: curr.score });
          }
          return acc;
        }, [] as LeaderboardEntry[]);
        setLeaderboard(uniqueScores.slice(0, 3));
      }
    } catch (error) {
      setSaveError("An unexpected error occurred");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  // CSV loading (questions)
  useEffect(() => {
    const fetchCsv = async () => {
      try {
        const baseUrl = (import.meta as any).env?.BASE_URL || "/";
        const candidates = [
          `${baseUrl}data/planetsQuestions.csv`,
          `${baseUrl}planetsQuestions.csv`,
        ];
        let res: Response | null = null;
        for (const url of candidates) {
          const attempt = await fetch(url);
          if (attempt.ok) { res = attempt; break; }
        }
        if (!res) {
          setCsvError("CSV not found. Place planetsQuestions.csv in public/data/ (or public/).");
          return;
        }
        const text = await res.text();
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        const rows = lines.map((line) => {
          const parts: string[] = [];
          let current = "", inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') inQuotes = !inQuotes;
            else if (ch === "," && !inQuotes) { parts.push(current); current = ""; }
            else current += ch;
          }
          parts.push(current);
          return parts;
        });
        setCsvRows(rows);
        if (rows.length > 1) setCurrentRowIndex(1);
      } catch {
        setCsvError("Failed to load CSV. Using mock candidate.");
      }
    };
    fetchCsv();
  }, []);

  // same data from /src for dev
  useEffect(() => {
    const loadPlanetData = async () => {
      try {
        const response = await fetch("/src/data/planetsQuestions.csv");
        const text = await response.text();
        const lines = text.split("\n").filter((line) => line.trim());
        const headers = lines[0].split(",").map((h) => h.trim());
        const planets = lines.slice(1).map((line) => {
          const values = line.split(",").map((v) => v.trim());
          return headers.reduce((obj: any, header, index) => {
            obj[header] = values[index];
            return obj;
          }, {}) as PlanetData;
        });
        setPlanetData(planets);
        setRandomPlanet(planets);
      } catch (error) {
        console.error("Error loading planet data:", error);
        setCsvError("Failed to load planet data");
      }
    };
    loadPlanetData();
  }, []);

  const setRandomPlanet = (planets: PlanetData[]) => {
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

  // CSV helpers (unused in trivia view, kept for compatibility)
  const header = useMemo(() => (csvRows.length > 0 ? csvRows[0] : []), [csvRows]);
  const currentRow = useMemo(
    () => (currentRowIndex > 0 ? csvRows[currentRowIndex] : []),
    [csvRows, currentRowIndex]
  );
  const field = (name: string): string | undefined => {
    const idx = header.indexOf(name);
    if (idx === -1 || !currentRow || currentRow.length <= idx) return undefined;
    return currentRow[idx];
  };

  const derivedCandidate = useMemo(() => {
    if (header.length === 0 || currentRow.length === 0) return MOCK_GAME_CANDIDATE;
    const disposition = (field("disposition") || "").toUpperCase();
    const isPlanet = disposition === "CONFIRMED";
    const pl_orbper = field("pl_orbper");
    const pl_rade = field("pl_rade");
    const st_teff = field("st_teff");
    const st_rad = field("st_rad");
    const pl_eqt = field("pl_eqt");
    const imgFromCsv = field("image");
    const name = field("pl_name") || field("name") || "Unknown Candidate";

    const baseUrl = (import.meta as any).env?.BASE_URL || "/";
    const toSlug = (s: string) => s.trim().replace(/\s+/g, "_");
    const guessImage = `${toSlug(name)}.jpg`;
    const imageUrl = `${baseUrl}${
      imgFromCsv && imgFromCsv.trim().length ? imgFromCsv.trim() : guessImage
    }`;
    const features: { feature: string; importance: number }[] = [];
    if (pl_orbper) features.push({ feature: `Orbital Period: ${pl_orbper} d`, importance: 0.3 });
    if (pl_rade)  features.push({ feature: `Planet Radius (R⊕): ${pl_rade}`, importance: 0.25 });
    if (st_teff)  features.push({ feature: `Stellar Teff (K): ${st_teff}`, importance: 0.2 });
    if (st_rad)   features.push({ feature: `Stellar Radius (R☉): ${st_rad}`, importance: 0.15 });
    if (pl_eqt)   features.push({ feature: `Equilibrium Temp (K): ${pl_eqt}`, importance: 0.1 });

    return {
      id: name || "cand_csv",
      lightCurveUrl: imageUrl,
      aiPrediction: { isPlanet, confidence: 0.9, reasoning: features },
    } as typeof MOCK_GAME_CANDIDATE;
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header, currentRowIndex, csvRows]);

  // images (vite glob)
  const imageModules = import.meta.glob("/src/data/Images/*.{png,jpg}", {
    eager: true,
    as: "url",
  }) as Record<string, string>;
  const imageNameToUrl: Record<string, string> = {};
  Object.entries(imageModules).forEach(([path, url]) => {
    const name = path.split("/").pop()!.toLowerCase();
    imageNameToUrl[name] = url;
  });

  const [planetFeatureImageMap, setPlanetFeatureImageMap] = useState<Record<string, string>>({});

  const makeFeatureKey = (p?: PlanetData | null) => {
    if (!p) return "0|0|0";
    const orb = Math.round((parseFloat(p.orbital_period_days || "0") || 0) * 100);
    const ra  = Math.round((parseFloat(p.ra_deg || "0") || 0) * 100);
    const dec = Math.round((parseFloat(p.dec_deg || "0") || 0) * 100);
    return `${orb}|${ra}|${dec}`;
  };

  useEffect(() => {
    if (!planetData || planetData.length === 0) return;
    const map: Record<string, string> = {};
    const cleanedImageName = (s: string) =>
      s.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const imageUrls = Object.values(imageNameToUrl);

    for (const p of planetData) {
      const key = makeFeatureKey(p);
      if (map[key]) continue;
      const names = [p.planet_name, (p as any).pl_name, (p as any).name].map((x) =>
        (x || "").toLowerCase()
      );
      let foundUrl: string | undefined;
      for (const [fname, url] of Object.entries(imageNameToUrl)) {
        const base = cleanedImageName(fname);
        if (names.some((n) => n && n.replace(/[^a-z0-9]/g, "") === base)) {
          foundUrl = url;
          break;
        }
      }
      if (!foundUrl) {
        foundUrl = imageUrls[Math.floor(Math.random() * imageUrls.length)] || "/favicon.ico";
      }
      map[key] = foundUrl!;
    }
    setPlanetFeatureImageMap(map);
  }, [planetData]);

  const chooseImageByFeatures = (planet?: PlanetData | null): string | null => {
    const urls = Object.values(imageNameToUrl);
    if (!planet || urls.length === 0) return null;
    const orb = parseFloat(planet.orbital_period_days || "0");
    const ra  = parseFloat(planet.ra_deg || "0");
    const dec = parseFloat(planet.dec_deg || "0");
    const norm = (n: number) => (isNaN(n) || !isFinite(n) ? 0 : Math.abs(Math.floor(n)));
    const key = norm(orb) + norm(ra) + norm(dec);
    const idx = key % urls.length;
    return urls[idx] || null;
  };

  const getPlanetImageCandidates = (planet?: PlanetData | null): string[] => {
    const defaultImage =
      imageNameToUrl["k2-168b.png"] || Object.values(imageNameToUrl)[0] || "/favicon.ico";
    const raw = (typeof planet === "string" ? planet : planet?.planet_name || "").trim();
    const featureKey = makeFeatureKey(planet as PlanetData | null);
    const mapped = planetFeatureImageMap[featureKey] || null;
    const chosenByFeatures =
      mapped || (typeof planet === "object" ? chooseImageByFeatures(planet) : null);

    const toUnderscore = (s: string) =>
      s.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_\-.]/g, "");
    const toDash = (s: string) =>
      s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_\-.]/g, "");
    const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const variants = [raw, toUnderscore(raw), toDash(raw), compact(raw)];
    const exts = [".png", ".jpg"];
    let candidates: string[] = [];

    for (const v of variants) {
      for (const ext of exts) {
        const key = `${v}${ext}`.toLowerCase();
        if (imageNameToUrl[key]) candidates.push(imageNameToUrl[key]);
      }
    }
    if (candidates.length === 0) {
      for (const [name, url] of Object.entries(imageNameToUrl)) {
        if (name.includes(raw.toLowerCase().replace(/[^a-z0-9]/g, ""))) candidates.push(url);
      }
    }
    if (chosenByFeatures) {
      if (!candidates.includes(chosenByFeatures)) candidates.unshift(chosenByFeatures);
      else candidates = [chosenByFeatures, ...candidates.filter((c) => c !== chosenByFeatures)];
    }
    if (candidates.length === 0 || candidates[candidates.length - 1] !== defaultImage) {
      candidates.push(defaultImage);
    }
    return candidates;
  };

  const [imageIndex, setImageIndex] = useState<number>(0);
  useEffect(() => { setImageIndex(0); }, [currentPlanet]);
  const imageCandidates = currentPlanet ? getPlanetImageCandidates(currentPlanet) : [];

  return (
    <Section className="bg-gradient-to-b from-slate-900 to-slate-950 text-white min-h-screen">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Game Panel */}
        <div className="lg:col-span-2">
          <h2 className="text-4xl font-bold text-center mb-2">Planet Trivia Challenge</h2>
          <Card>
            {currentPlanet ? (
              <>
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-cyan-400 mb-4">
                    {currentPlanet.planet_name}
                  </h3>

                  {/* Image */}
                  <div className="bg-slate-800 p-4 rounded-lg mb-6 flex justify-center items-center">
                    <img
                      src={imageCandidates[imageIndex]}
                      alt={currentPlanet.planet_name}
                      className="object-cover rounded-md shadow-md flex-none block"
                      style={{ width: 400, height: 400, minWidth: 200, minHeight: 120 }}
                      onError={() =>
                        setImageIndex((i) => {
                          const next = i + 1;
                          return next < imageCandidates.length ? next : i;
                        })
                      }
                    />
                  </div>
                </div>

                {userGuess === null ? (
                  <div>
                    <h3 className="text-xl font-semibold text-center mb-4">
                      {currentPlanet.Question}
                    </h3>

                    {/* Feature Bars (now using EnhancedFeatureBar) */}
                    <div className="space-y-4 mb-6">
                      {featureMetas(currentPlanet).map((f) => (
                        <EnhancedFeatureBar key={f.label} {...f} />
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
                      <h3 className="text-2xl font-bold text-center">Results</h3>
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
                          <p className="text-sm text-slate-400">Correct Answer</p>
                          <p className="text-xl font-bold text-green-400">
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
            <h3 className="text-xl font-bold text-center text-cyan-400">Your Score</h3>
            <p className="text-5xl font-bold text-center mt-2">{score}</p>
            <div className="mt-4 px-4 pb-4">
              <label className="block text-sm text-slate-300 mb-2">Username</label>
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
                className={`mt-3 w-full px-4 py-2 text-white font-semibold ${
                  saving || !username.trim()
                    ? "bg-cyan-600/50 cursor-not-allowed rounded-md"
                    : "bg-cyan-600 hover:bg-cyan-700 rounded-md"
                }`}
              >
                {saving ? "Saving..." : "Save Score"}
              </motion.button>
              {(saveError || saveMessage) && (
                <p className={`mt-2 text-sm ${saveError ? "text-red-400" : "text-green-400"}`}>
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
              {(leaderboard.length
                ? leaderboard
                : [
                    { name: "CosmicExplorer", score: 1250 },
                    { name: "Stargazer_1", score: 1100 },
                    { name: "PlanetHunter_X", score: 980 },
                  ]
              ).map((player, index) => (
                <li
                  key={player.name}
                  className="flex justify-between items-center p-2 bg-slate-700/50 rounded-md"
                >
                  <span className="font-semibold">
                    {index + 1}. {player.name}
                  </span>
                  <span className="font-bold text-cyan-300">{player.score}</span>
                </li>
              ))}
            </ul>
          </Card>

          {csvError && (
            <Card>
              <p className="text-sm text-yellow-400 px-4 py-2">{csvError}</p>
            </Card>
          )}
        </div>
      </div>
    </Section>
  );
};

export default HuntPlanetsGame;