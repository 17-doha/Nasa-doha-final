import React, { useEffect, useState } from "react";
import { Bar, Pie, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);
import Card from "./ui/Card";

// Utility to load and parse CSV files
type Dataset = {
  name: string;
  data: any[];
};

const csvFiles = [
  { name: "KOI", file: "/data/cumulative_2025.09.24_03.42.53.csv" },
  { name: "TOI", file: "/data/TOI_2025.09.24_03.43.03.csv" },
  { name: "K2", file: "/data/k2pandc_2025.09.24_03.43.09.csv" },
];

function parseCSV(text: string): any[] {
  const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
  if (lines.length < 2) return [];
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const obj: any = {};
    headers.forEach((h, i) => (obj[h.trim()] = values[i]?.trim() || ""));
    return obj;
  });
}

const UnifiedDataExplorer: React.FC = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>(
    csvFiles.map((f) => f.name)
  );
  const [loading, setLoading] = useState(true);
  // Advanced filter state
  const [filterCol, setFilterCol] = useState<string>("");
  const [filterValue, setFilterValue] = useState<string>("");
  // Chart state
  const [chartCol, setChartCol] = useState<string>("");

  useEffect(() => {
    Promise.all(
      csvFiles.map(async ({ name, file }) => {
        const res = await fetch(file);
        const text = await res.text();
        return { name, data: parseCSV(text) };
      })
    )
      .then(setDatasets)
      .finally(() => setLoading(false));
  }, []);

  // Unified search/filter/advanced filter
  const filtered = datasets
    .filter((ds) => selected.includes(ds.name))
    .map((ds) => {
      let data = ds.data;
      if (search) {
        data = data.filter((row) =>
          Object.values(row).some((v) =>
            String(v).toLowerCase().includes(search.toLowerCase())
          )
        );
      }
      if (filterCol && filterValue) {
        data = data.filter(
          (row) =>
            row[filterCol] &&
            String(row[filterCol])
              .toLowerCase()
              .includes(filterValue.toLowerCase().trim())
        );
      }
      return { ...ds, data };
    });

  // Helper: get all unified data
  const allData = filtered.flatMap((ds) => ds.data);

  // 1. Planet Radius Distribution (Histogram)
  const planetRadius = allData
    .map((row) => parseFloat(row["pl_rade"]))
    .filter((x) => !isNaN(x));
  const radiusBins = Array.from({ length: 20 }, (_, i) => i * 2);
  const radiusCounts = radiusBins.map(
    (bin, i) =>
      planetRadius.filter((r) => r >= bin && r < (radiusBins[i + 1] ?? 100))
        .length
  );

  // 2. Orbital Period Distribution (Histogram)
  const orbitalPeriod = allData
    .map((row) => parseFloat(row["pl_orbper"]))
    .filter((x) => !isNaN(x));
  const periodBins = [
    0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
  ];
  const periodCounts = periodBins.map(
    (bin, i) =>
      orbitalPeriod.filter((p) => p >= bin && p < (periodBins[i + 1] ?? 1e6))
        .length
  );

  // 4. Planet Equilibrium Temperature Distribution (Histogram)
  const eqTemp = allData
    .map((row) => parseFloat(row["pl_eqt"]))
    .filter((x) => !isNaN(x));
  const eqtBins = [0, 200, 400, 600, 800, 1000, 1200, 1500, 2000, 3000, 5000];
  const eqtCounts = eqtBins.map(
    (bin, i) =>
      eqTemp.filter((t) => t >= bin && t < (eqtBins[i + 1] ?? 1e6)).length
  );

  // 5. Disposition Breakdown (Pie) - merged classes
  const dispCounts: Record<string, number> = {
    CONFIRMED: 0,
    "FALSE POSITIVE": 0,
    CANDIDATE: 0,
    OTHERS: 0,
  };
  allData.forEach((row) => {
    const disp = (
      row["tfopwg_disp"] ||
      row["disposition"] ||
      row["koi_disposition"] ||
      "Unknown"
    ).toUpperCase();
    if (["CONFIRMED", "CP", "KP"].includes(disp)) dispCounts.CONFIRMED++;
    else if (["FALSE POSITIVE", "FP"].includes(disp))
      dispCounts["FALSE POSITIVE"]++;
    else if (["CANDIDATE", "PC"].includes(disp)) dispCounts.CANDIDATE++;
    else if (["APC", "FA", "REFUTED"].includes(disp)) dispCounts.OTHERS++;
    else dispCounts.OTHERS++;
  });

  // 7. Stellar Distance Distribution (Histogram)
  const stDist = allData
    .map((row) => parseFloat(row["st_dist"]))
    .filter((x) => !isNaN(x));
  const distBins = [0, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  const distCounts = distBins.map(
    (bin, i) =>
      stDist.filter((d) => d >= bin && d < (distBins[i + 1] ?? 1e6)).length
  );

  // 9. Dataset Comparison (Stacked Bar)
  const datasetNames = filtered.map((ds) => ds.name);
  const dispTypes = Array.from(
    new Set(
      allData.map(
        (row) =>
          row["tfopwg_disp"] ||
          row["disposition"] ||
          row["koi_disposition"] ||
          "Unknown"
      )
    )
  );
  const datasetDispCounts = datasetNames.map((name) => {
    const ds = filtered.find((d) => d.name === name);
    return dispTypes.map((type) =>
      ds
        ? ds.data.filter(
            (row) =>
              (row["tfopwg_disp"] ||
                row["disposition"] ||
                row["koi_disposition"] ||
                "Unknown") === type
          ).length
        : 0
    );
  });

  // 10. Time Series of Discoveries (Line)
  const dateField = "toi_created";
  const dateCounts: Record<string, number> = {};
  allData.forEach((row) => {
    const date = row[dateField]?.slice(0, 10);
    if (date) dateCounts[date] = (dateCounts[date] || 0) + 1;
  });
  const sortedDates = Object.keys(dateCounts).sort();
  const discoveriesOverTime = sortedDates.map((date) => dateCounts[date]);

  return (
    <Card>
      <h2 className="text-2xl font-bold text-white mb-2">
        Unified Data Explorer
      </h2>
      {/* 10 Scientific Insight Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        {/* 1. Planet Radius Distribution */}
        <div className="bg-slate-900 p-4 rounded-lg">
          <h3 className="text-cyan-400 font-semibold mb-2">
            Planet Radius Distribution
          </h3>
          <Bar
            data={{
              labels: radiusBins.map(
                (b, i) => `${b}–${radiusBins[i + 1] ?? "max"}`
              ),
              datasets: [
                {
                  label: "Count",
                  data: radiusCounts,
                  backgroundColor: "rgba(34,211,238,0.6)",
                },
              ],
            }}
            options={{
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { color: "#fff" } },
                y: { ticks: { color: "#fff" } },
              },
            }}
          />
        </div>
        {/* 2. Orbital Period Distribution */}
        <div className="bg-slate-900 p-4 rounded-lg">
          <h3 className="text-cyan-400 font-semibold mb-2">
            Orbital Period Distribution
          </h3>
          <Bar
            data={{
              labels: periodBins.map(
                (b, i) => `${b}–${periodBins[i + 1] ?? "max"}`
              ),
              datasets: [
                {
                  label: "Count",
                  data: periodCounts,
                  backgroundColor: "rgba(251,191,36,0.6)",
                },
              ],
            }}
            options={{
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { color: "#fff" } },
                y: { ticks: { color: "#fff" } },
              },
            }}
          />
        </div>
        {/* 3. Planet Equilibrium Temperature */}
        <div className="bg-slate-900 p-4 rounded-lg">
          <h3 className="text-cyan-400 font-semibold mb-2">
            Planet Equilibrium Temperature
          </h3>
          <Bar
            data={{
              labels: eqtBins.map((b, i) => `${b}–${eqtBins[i + 1] ?? "max"}`),
              datasets: [
                {
                  label: "Count",
                  data: eqtCounts,
                  backgroundColor: "rgba(16,185,129,0.6)",
                },
              ],
            }}
            options={{
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { color: "#fff" } },
                y: { ticks: { color: "#fff" } },
              },
            }}
          />
        </div>
        {/* 4. Stellar Distance Distribution */}
        <div className="bg-slate-900 p-4 rounded-lg">
          <h3 className="text-cyan-400 font-semibold mb-2">
            Stellar Distance Distribution
          </h3>
          <Bar
            data={{
              labels: distBins.map(
                (b, i) => `${b}–${distBins[i + 1] ?? "max"}`
              ),
              datasets: [
                {
                  label: "Count",
                  data: distCounts,
                  backgroundColor: "rgba(236,72,153,0.6)",
                },
              ],
            }}
            options={{
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { color: "#fff" } },
                y: { ticks: { color: "#fff" } },
              },
            }}
          />
        </div>
        {/* 5. Dataset Comparison by Disposition */}
        <div className="bg-slate-900 p-4 rounded-lg">
          <h3 className="text-cyan-400 font-semibold mb-2">
            Dataset Comparison by Disposition
          </h3>
          <Bar
            data={{
              labels: datasetNames,
              datasets: dispTypes.map((type, i) => ({
                label: type,
                data: datasetDispCounts.map((arr) => arr[i]),
                backgroundColor: [
                  "rgba(34,211,238,0.6)",
                  "rgba(251,191,36,0.6)",
                  "rgba(139,92,246,0.6)",
                  "rgba(16,185,129,0.6)",
                  "rgba(239,68,68,0.6)",
                  "rgba(236,72,153,0.6)",
                  "rgba(253,224,71,0.6)",
                  "rgba(59,130,246,0.6)",
                ][i % 8],
                stack: "Stack 0",
              })),
            }}
            options={{
              plugins: { legend: { labels: { color: "#fff" } } },
              scales: {
                x: { stacked: true, ticks: { color: "#fff" } },
                y: { stacked: true, ticks: { color: "#fff" } },
              },
            }}
          />
        </div>
        {/* 6. Disposition Breakdown */}
        <div className="bg-slate-900 p-4 rounded-lg">
          <h3 className="text-cyan-400 font-semibold mb-2">
            Disposition Breakdown
          </h3>
          <Pie
            data={{
              labels: Object.keys(dispCounts),
              datasets: [
                {
                  label: "Disposition",
                  data: Object.values(dispCounts),
                  backgroundColor: [
                    "rgba(34,211,238,0.6)",
                    "rgba(251,191,36,0.6)",
                    "rgba(139,92,246,0.6)",
                    "rgba(16,185,129,0.6)",
                  ],
                },
              ],
            }}
            options={{ plugins: { legend: { labels: { color: "#fff" } } } }}
          />
        </div>
        {/* 7. Discoveries Over Time (spans two columns) */}
        <div className="bg-slate-900 p-4 rounded-lg col-span-1 md:col-span-2">
          <h3 className="text-cyan-400 font-semibold mb-2">
            Discoveries Over Time
          </h3>
          <Line
            data={{
              labels: sortedDates,
              datasets: [
                {
                  label: "Discoveries",
                  data: discoveriesOverTime,
                  borderColor: "rgba(59,130,246,1)",
                  backgroundColor: "rgba(59,130,246,0.3)",
                  fill: true,
                },
              ],
            }}
            options={{
              plugins: { legend: { labels: { color: "#fff" } } },
              scales: {
                x: { ticks: { color: "#fff" } },
                y: { ticks: { color: "#fff" } },
              },
            }}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-4 mb-4 items-end">
        <input
          className="p-2 rounded bg-slate-800 text-white"
          placeholder="Search all datasets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {csvFiles.map((f) => (
          <label key={f.name} className="text-white">
            <input
              type="checkbox"
              checked={selected.includes(f.name)}
              onChange={(e) => {
                setSelected((sel) =>
                  e.target.checked
                    ? [...sel, f.name]
                    : sel.filter((n) => n !== f.name)
                );
              }}
            />{" "}
            {f.name}
          </label>
        ))}
        {/* Advanced filter controls */}
        {filtered[0]?.data[0] && (
          <>
            <select
              className="p-2 rounded bg-slate-800 text-white"
              value={filterCol}
              onChange={(e) => setFilterCol(e.target.value)}
            >
              <option value="">Filter column...</option>
              {Object.keys(filtered[0].data[0]).map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
            <input
              className="p-2 rounded bg-slate-800 text-white"
              placeholder="Filter value..."
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              disabled={!filterCol}
            />
          </>
        )}
        {/* Chart column selector */}
        {filtered[0]?.data[0] && (
          <select
            className="p-2 rounded bg-slate-800 text-white"
            value={chartCol}
            onChange={(e) => setChartCol(e.target.value)}
          >
            <option value="">Chart column...</option>
            {Object.keys(filtered[0].data[0]).map((col) => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </select>
        )}
      </div>
      {loading ? (
        <div className="text-slate-400">Loading datasets...</div>
      ) : (
        <>
          {/* Chart display */}
          {chartCol && (
            <div className="mb-8 bg-slate-900 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-cyan-400 mb-2">
                Distribution of {chartCol}
              </h3>
              <Bar
                data={{
                  labels: filtered[0].data
                    .map((row, i) => row[chartCol] || `Row ${i + 1}`)
                    .slice(0, 30),
                  datasets: [
                    {
                      label: chartCol,
                      data: filtered[0].data
                        .map((row) => {
                          const val = row[chartCol];
                          const num = Number(val);
                          return isNaN(num) ? 1 : num;
                        })
                        .slice(0, 30),
                      backgroundColor: "rgba(34,211,238,0.6)",
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { display: false },
                    title: { display: false },
                  },
                  scales: {
                    x: { ticks: { color: "#fff" } },
                    y: { ticks: { color: "#fff" } },
                  },
                }}
              />
              <div className="text-slate-500 mt-1">Showing up to 30 values</div>
            </div>
          )}
          <div className="overflow-x-auto">
            {filtered.map((ds) => (
              <div key={ds.name} className="mb-8">
                <h3 className="text-lg font-semibold text-cyan-400 mb-2">
                  {ds.name} Dataset
                </h3>
                <table className="min-w-full text-xs text-left text-slate-300 border border-slate-700">
                  <thead>
                    <tr>
                      {ds.data[0] &&
                        Object.keys(ds.data[0]).map((h) => (
                          <th
                            key={h}
                            className="border-b border-slate-700 px-2 py-1"
                          >
                            {h}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ds.data.slice(0, 20).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-800">
                        {Object.values(row).map((v, j) => (
                          <td
                            key={j}
                            className="px-2 py-1 border-b border-slate-700"
                          >
                            {String(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ds.data.length > 20 && (
                  <div className="text-slate-500 mt-1">
                    Showing 20 of {ds.data.length} rows
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
};

export default UnifiedDataExplorer;
