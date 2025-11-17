// section3.js

const S3_DATA_URL = "./data/WarList.csv";

d3.csv(S3_DATA_URL, d3.autoType).then(raw => {
  const norm = v => (v == null ? "" : String(v).trim());

 
  const rows = raw
    .map(d => {
      const start = +d.start_year;
      return {
        start_year: Number.isFinite(start) ? start : NaN,
        region: norm(d.region),
        purpose: norm(d.purpose) || "Unknown"
      };
    })
    .filter(d => Number.isFinite(d.start_year));

  
  const perDecadePurpose = d3.rollups(
    rows,
    v => v.length,
    d => Math.floor(d.start_year / 10) * 10,  
    d => d.purpose                          
  )
    .flatMap(([decade, purposes]) =>
      purposes.map(([purpose, count]) => ({
        decade,
        purpose,
        count
      }))
    )
    .sort((a, b) =>
      d3.ascending(a.decade, b.decade) ||
      d3.ascending(a.purpose, b.purpose)
    );

  const root = document.querySelector('[data-chart="s3-line"]');
  if (!root) return;

  if (perDecadePurpose.length === 0) {
    root.innerHTML = "<div style='padding:12px;color:#888'>No temporal data found for start_year and purpose.</div>";
    return;
  }

  const minDecade = d3.min(perDecadePurpose, d => d.decade);
  const maxDecade = d3.max(perDecadePurpose, d => d.decade);

 
  const warPalette = [
    "#7a0000", // blood red
    "#e55c00", // burnt ember
    "#3d250c", // dark soil
    "#8b5a2b", // earth brown
    "#f4d35e", // dust yellow
    "#9e9e9e", // ash gray
    "#5f5f5f" // steel smoke
  ];

  const chart = Plot.plot({
    height: 420,
    marginLeft: 60,
    marginRight: 20,
    marginBottom: 60,
    x: {
      label: "Decade of war onset",
      domain: [minDecade, maxDecade],
      tickFormat: d => d,
      tickRotate: -45
    },
    y: {
      label: "Number of wars started",
      grid: true
    },
    color: {
      legend: true,
      label: "War purpose",
      type: "categorical",
      range: warPalette
    },
    marks: [
      Plot.line(perDecadePurpose, {
        x: "decade",
        y: "count",
        stroke: "purpose",
        curve: "catmull-rom",
        strokeWidth: 2
      }),
      Plot.dot(perDecadePurpose, {
        x: "decade",
        y: "count",
        stroke: "purpose",
        fill: "purpose",
        r: 3,
        title: d =>
          `Decade: ${d.decade}\nPurpose: ${d.purpose}\nWars started: ${d.count}`
      }),
      Plot.ruleY([0])
    ]
  });

  root.innerHTML = "";
  root.appendChild(chart);
});
