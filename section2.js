// ========== Config ==========
const DATA_URL = "./data/WarList.csv";
const COLS = { region: "region", purpose: "purpose", start: "start_year", end: "end_year" };

// ========== Helpers ==========
function enrich(rows){
  return rows.map(d => {
    const s = +d[COLS.start], e = +d[COLS.end];
    const purpose = (d[COLS.purpose] ?? "").toString().trim();
    return {
      ...d,
      __region: (d[COLS.region] ?? "").toString().trim(),
      __purpose: purpose,
      __purpose_lc: purpose.toLowerCase(),
      __start: Number.isFinite(s) ? s : NaN,
      __end: Number.isFinite(e) ? e : NaN,
      __duration: (Number.isFinite(s) && Number.isFinite(e)) ? Math.max(0, e - s) : NaN,
      __decade: Number.isFinite(s) ? Math.floor(s/10)*10 : NaN
    };
  });
}
function mount(el, figure){ el.classList.add("chart-mounted"); el.innerHTML = ""; el.appendChild(figure); }

// ========== Main ==========
d3.csv(DATA_URL, d3.autoType).then(raw0 => {
  const raw = enrich(raw0);

 // ---------- Histogram ----------

{
  const el = document.querySelector('[data-chart="s2-hist"]');
  if (el) {

    const durationKey = Object.keys(raw[0] || {}).find(k => k && k.trim().toLowerCase() === "duration") || "DURATION";


    const cleaned = raw.map(d => {
      const v = d[durationKey];

      const num = (typeof v === "number")
        ? v
        : parseFloat(String(v).replace(/,/g, ".").replace(/[^\d.\-+eE]/g, ""));
      return Number.isFinite(num) && num >= 0 ? num : NaN;
    }).filter(Number.isFinite);


    if (cleaned.length === 0) {
      el.innerHTML = "<div style='padding:12px;color:#888'>No numeric durations found in column <b>"
        + durationKey + "</b>. Check the CSV header/value formatting.</div>";
      console.warn("Histogram: no numeric durations. Keys:", Object.keys(raw[0] || {}));
      return;
    }


    const sorted = cleaned.slice().sort((a,b) => a-b);
    const p95 = d3.quantile(sorted, 0.95);


    const n = cleaned.length;
    const thresholds = Math.min(30, Math.max(8, Math.floor(Math.sqrt(n))));


    const fig = Plot.plot({
      height: 700,
      marginLeft: 60,
      x: { label: "Duration (years)", domain: [0, 25] },
      y: { label: "Count", grid: true },
      marks: [
        Plot.rectY(
          cleaned.map(v => ({ v })),                       
          Plot.binX({ y: "count" }, { x: "v", thresholds: d3.range(0, Math.ceil(p95) + 1, 1) })  
        ),
        Plot.ruleY([0])
      ]
    });

    el.innerHTML = "";
    el.appendChild(fig);
  }
}


  // ---------- Violin Plot ----------
// ========= Horizontal Violin Plot: Duration by Purpose (D3 v7) =========
async function drawViolinPlot() {
  const CSV_PATH   = "./data/WarList.csv";
  const MAX_GROUPS = 8;     
  const MAX_YEARS  = 22;     
  const BW         = 1.2;   
  const WIDTH      = 900;
  const HEIGHT     = 460;
  const MARGIN     = { top: 24, right: 24, bottom: 56, left: 220 };


  const COLOR = {
    violinFill:  "#7c1c1c",   
    violinStroke:"#d45b5b",  
    grid:        "#9aa4b2",
    tick:        "#b8c0cc",
    text:        "#ffffff",
    dots:        "#e6e6e6",
    median:      "#f2f2f2"
  };


  const norm = v => (v == null ? "" : String(v).trim());
  function kernelEpanechnikov(k) {
    return v => {
      v = v / k;
      return Math.abs(v) <= 1 ? 0.75 * (1 - v * v) / k : 0;
    };
  }
  function kernelDensityEstimator(kernel, xs) {
    return function(sample) {
      return xs.map(x => [x, d3.mean(sample, s => kernel(x - s))]);
    };
  }

  
  const raw = await d3.csv(CSV_PATH, d3.autoType);

 
  const data = raw.map(d => {
    const s = +d.start_year, e = +d.end_year;
    const hasDur = d.duration != null && d.duration !== "";
    const dur = hasDur ? +d.duration : (Number.isFinite(s) && Number.isFinite(e) ? Math.max(0, e - s) : NaN);
    return {
      purpose: norm(d.purpose) || "(Unknown)",
      duration: Number.isFinite(dur) ? dur : NaN
    };
  }).filter(d => Number.isFinite(d.duration) && d.duration >= 0);

 
  const counts = d3.rollup(data, v => v.length, d => d.purpose);
  const topPurposes = Array.from(counts, ([purpose, count]) => ({ purpose, count }))
    .sort((a, b) => d3.descending(a.count, b.count))
    .slice(0, MAX_GROUPS)
    .map(d => d.purpose);

  const filtered = data.filter(d => topPurposes.includes(d.purpose));

 
  const xMax = Math.max(
    MAX_YEARS,
    d3.quantile(filtered, 0.99, d => d.duration) || MAX_YEARS
  );

  const x = d3.scaleLinear()
    .domain([0, xMax]).nice()
    .range([MARGIN.left, WIDTH - MARGIN.right]);

  
  const y = d3.scaleBand()
    .domain(topPurposes)
    .range([MARGIN.top, HEIGHT - MARGIN.bottom])
    .paddingInner(0.35)
    .paddingOuter(0.25);

 
  const maxHalf = Math.min(18, y.bandwidth() * 0.45);
  const widthScale = d3.scaleLinear().range([0, maxHalf]);

 
  const xGrid = d3.range(0, xMax + 0.5, 0.5);
  const kde = kernelDensityEstimator(kernelEpanechnikov(BW), xGrid);

  const grouped = d3.group(filtered, d => d.purpose);
  const violins = Array.from(grouped, ([purpose, arr]) => {
    const sample = arr.map(d => d.duration);
    const density = kde(sample); // [xVal, density]
    const maxD = d3.max(density, d => d[1]) || 1e-6;
    return { purpose, density, maxD };
  });

  const globalMaxDensity = d3.max(violins, v => v.maxD) || 1e-6;
  widthScale.domain([0, globalMaxDensity]);

  // SVG
  const root = d3.select('[data-chart="s2-violin"]');
  root.selectAll("*").remove();
  const svg = root.append("svg")
    .attr("width", WIDTH)
    .attr("height", HEIGHT);

  
  svg.append("g")
    .attr("stroke", COLOR.grid)
    .attr("stroke-opacity", 0.15)
    .selectAll("line.grid")
    .data(x.ticks(10))
    .join("line")
    .attr("x1", d => x(d))
    .attr("x2", d => x(d))
    .attr("y1", MARGIN.top)
    .attr("y2", HEIGHT - MARGIN.bottom);


  const gx = svg.append("g")
    .attr("transform", `translate(0,${HEIGHT - MARGIN.bottom})`)
    .call(d3.axisBottom(x).ticks(10));
  gx.selectAll("text").style("fill", COLOR.text).style("font-family", "sans-serif");
  gx.selectAll("line").attr("stroke", COLOR.tick);
  gx.selectAll("path").attr("stroke", COLOR.tick);

  const gy = svg.append("g")
    .attr("transform", `translate(${MARGIN.left},0)`)
    .call(d3.axisLeft(y));
  gy.selectAll("text").style("fill", COLOR.text).style("font-family", "sans-serif");
  gy.selectAll("line").attr("stroke", COLOR.tick);
  gy.selectAll("path").attr("stroke", COLOR.tick);

 
  svg.append("text")
    .attr("x", WIDTH - MARGIN.right)
    .attr("y", HEIGHT - 8)
    .attr("text-anchor", "end")
    .attr("font-size", 12)
    .attr("font-family", "sans-serif")
    .attr("fill", COLOR.text)
    .text("Duration (years)");

  svg.append("text")
    .attr("x", MARGIN.left)
    .attr("y", MARGIN.top - 8)
    .attr("font-size", 12)
    .attr("font-family", "sans-serif")
    .attr("fill", COLOR.text)
    .text("Purpose");


  const area = d3.area()
    .y0(d => {
      const cy = y(d.__purpose__) + y.bandwidth() / 2;
      return cy - widthScale(d[1]);
    })
    .y1(d => {
      const cy = y(d.__purpose__) + y.bandwidth() / 2;
      return cy + widthScale(d[1]);
    })
    .x(d => x(d[0]))
    .curve(d3.curveCatmullRom.alpha(0.6));

  svg.append("g")
    .selectAll("path.violin")
    .data(violins)
    .join("path")
    .attr("class", "violin")
    .attr("d", v => {
      v.density.forEach(d => d.__purpose__ = v.purpose);
      return area(v.density);
    })
    .attr("fill", COLOR.violinFill)
    .attr("stroke", COLOR.violinStroke)
    .attr("opacity", 0.9);


  const medians = Array.from(grouped, ([purpose, arr]) => ({
    purpose,
    median: d3.median(arr, d => d.duration)
  }));

  svg.append("g")
    .selectAll("line.median")
    .data(medians)
    .join("line")
    .attr("class", "median")
    .attr("x1", d => x(d.median))
    .attr("x2", d => x(d.median))
    .attr("y1", d => y(d.purpose) + y.bandwidth() * 0.2)
    .attr("y2", d => y(d.purpose) + y.bandwidth() * 0.8)
    .attr("stroke", COLOR.median)
    .attr("stroke-width", 2)
    .attr("opacity", 0.9)
    .append("title")
    .text(d => `Median: ${d.median?.toFixed(2)} yrs`);


  const jitter = y.bandwidth() * 0.35;
  svg.append("g")
    .attr("fill", COLOR.dots)
    .attr("fill-opacity", 0.35)
    .selectAll("circle.dot")
    .data(filtered)
    .join("circle")
    .attr("r", 1.8)
    .attr("cx", d => x(d.duration))
    .attr("cy", d => y(d.purpose) + y.bandwidth() / 2 + (Math.random() - 0.5) * jitter);
}


drawViolinPlot();



  // ---------- Boxplot ----------
  // ========= Horizontal Box Plot: Duration by Purpose (D3 v7) =========
async function drawBoxPlot() {
  const CSV_PATH   = "./data/WarList.csv";
  const MAX_GROUPS = 8;    
  const MAX_YEARS  = 22;     
  const WIDTH      = 900;
  const HEIGHT     = 420;
  const MARGIN     = { top: 24, right: 24, bottom: 56, left: 220 };


  const COLOR = {
    boxFill:    "#7c1c1c",   
    boxStroke:  "#d45b5b",   
    median:     "#ffffff",  
    outlier:    "#e6e6e6",   
    grid:       "#9aa4b2",
    tick:       "#b8c0cc",
    text:       "#ffffff"
  };

  
  const norm = v => (v == null ? "" : String(v).trim());
  const raw = await d3.csv(CSV_PATH, d3.autoType);
  const rows = raw.map(d => {
    const s = +d.start_year, e = +d.end_year;
    const hasDur = d.duration != null && d.duration !== "";
    const dur = hasDur ? +d.duration : (Number.isFinite(s) && Number.isFinite(e) ? Math.max(0, e - s) : NaN);
    return {
      purpose: norm(d.purpose) || "(Unknown)",
      duration: Number.isFinite(dur) ? dur : NaN
    };
  }).filter(d => Number.isFinite(d.duration) && d.duration >= 0);


  const counts = d3.rollup(rows, v => v.length, d => d.purpose);
  const topPurposes = Array.from(counts, ([purpose, count]) => ({ purpose, count }))
    .sort((a, b) => d3.descending(a.count, b.count))
    .slice(0, MAX_GROUPS)
    .map(d => d.purpose);

  const data = rows.filter(d => topPurposes.includes(d.purpose));

  
  const grouped = d3.group(data, d => d.purpose);

 
  function stats(arr) {
    const sorted = arr.map(d => d.duration).sort(d3.ascending);
    const n = sorted.length;
    if (n === 0) return null;
    const q1 = d3.quantileSorted(sorted, 0.25);
    const q2 = d3.quantileSorted(sorted, 0.50);
    const q3 = d3.quantileSorted(sorted, 0.75);
    const iqr = q3 - q1;
    const loFence = q1 - 1.5 * iqr;
    const hiFence = q3 + 1.5 * iqr;

   
    let low = sorted[0];
    for (let v of sorted) { if (v >= loFence) { low = v; break; } }
    let high = sorted[n - 1];
    for (let i = n - 1; i >= 0; --i) { if (sorted[i] <= hiFence) { high = sorted[i]; break; } }

    const outliers = sorted.filter(v => v < low || v > high);
    return { q1, q2, q3, low, high, outliers };
  }

  const boxes = Array.from(grouped, ([purpose, arr]) => {
    const s = stats(arr);
    return { purpose, ...s };
  }).filter(b => b && Number.isFinite(b.q1));

 
  const xMax = Math.max(
    MAX_YEARS,
    d3.max(boxes, b => b.high ?? b.q3 ?? 0) || MAX_YEARS
  );

  const x = d3.scaleLinear()
    .domain([0, xMax]).nice()
    .range([MARGIN.left, WIDTH - MARGIN.right]);

  const y = d3.scaleBand()
    .domain(topPurposes)
    .range([MARGIN.top, HEIGHT - MARGIN.bottom])
    .paddingInner(0.35)
    .paddingOuter(0.25);

  const boxH = Math.min(20, y.bandwidth() * 0.6);  

  // SVG
  const root = d3.select('[data-chart="s2-box"]');
  root.selectAll("*").remove();
  const svg = root.append("svg")
    .attr("width", WIDTH)
    .attr("height", HEIGHT);

 
  svg.append("g")
    .attr("stroke", COLOR.grid)
    .attr("stroke-opacity", 0.15)
    .selectAll("line.grid")
    .data(x.ticks(10))
    .join("line")
    .attr("x1", d => x(d))
    .attr("x2", d => x(d))
    .attr("y1", MARGIN.top)
    .attr("y2", HEIGHT - MARGIN.bottom);

 
  const gx = svg.append("g")
    .attr("transform", `translate(0,${HEIGHT - MARGIN.bottom})`)
    .call(d3.axisBottom(x).ticks(10));
  gx.selectAll("text").style("fill", COLOR.text).style("font-family", "sans-serif");
  gx.selectAll("line").attr("stroke", COLOR.tick);
  gx.selectAll("path").attr("stroke", COLOR.tick);

  const gy = svg.append("g")
    .attr("transform", `translate(${MARGIN.left},0)`)
    .call(d3.axisLeft(y));
  gy.selectAll("text").style("fill", COLOR.text).style("font-family", "sans-serif");
  gy.selectAll("line").attr("stroke", COLOR.tick);
  gy.selectAll("path").attr("stroke", COLOR.tick);

 
  svg.append("text")
    .attr("x", WIDTH - MARGIN.right)
    .attr("y", HEIGHT - 8)
    .attr("text-anchor", "end")
    .attr("font-size", 12)
    .attr("font-family", "sans-serif")
    .attr("fill", COLOR.text)
    .text("Duration (years)");

  svg.append("text")
    .attr("x", MARGIN.left)
    .attr("y", MARGIN.top - 8)
    .attr("font-size", 12)
    .attr("font-family", "sans-serif")
    .attr("fill", COLOR.text)
    .text("Purpose");



  
  svg.append("g")
    .selectAll("line.whisker")
    .data(boxes)
    .join("line")
    .attr("class", "whisker")
    .attr("x1", d => x(d.low))
    .attr("x2", d => x(d.high))
    .attr("y1", d => y(d.purpose) + y.bandwidth() / 2)
    .attr("y2", d => y(d.purpose) + y.bandwidth() / 2)
    .attr("stroke", COLOR.boxStroke)
    .attr("stroke-width", 1.5)
    .attr("opacity", 0.9);


  svg.append("g")
    .selectAll("line.whisker-cap-low")
    .data(boxes)
    .join("line")
    .attr("class", "whisker-cap-low")
    .attr("x1", d => x(d.low))
    .attr("x2", d => x(d.low))
    .attr("y1", d => y(d.purpose) + y.bandwidth()/2 - boxH*0.35)
    .attr("y2", d => y(d.purpose) + y.bandwidth()/2 + boxH*0.35)
    .attr("stroke", COLOR.boxStroke)
    .attr("stroke-width", 1.5);

  svg.append("g")
    .selectAll("line.whisker-cap-high")
    .data(boxes)
    .join("line")
    .attr("class", "whisker-cap-high")
    .attr("x1", d => x(d.high))
    .attr("x2", d => x(d.high))
    .attr("y1", d => y(d.purpose) + y.bandwidth()/2 - boxH*0.35)
    .attr("y2", d => y(d.purpose) + y.bandwidth()/2 + boxH*0.35)
    .attr("stroke", COLOR.boxStroke)
    .attr("stroke-width", 1.5);

 
  svg.append("g")
    .selectAll("rect.box")
    .data(boxes)
    .join("rect")
    .attr("class", "box")
    .attr("x", d => x(d.q1))
    .attr("y", d => y(d.purpose) + y.bandwidth()/2 - boxH/2)
    .attr("width", d => Math.max(0.5, x(d.q3) - x(d.q1)))
    .attr("height", boxH)
    .attr("fill", COLOR.boxFill)
    .attr("fill-opacity", 0.35)
    .attr("stroke", COLOR.boxStroke)
    .attr("stroke-width", 1.8);

 
  svg.append("g")
    .selectAll("line.median")
    .data(boxes)
    .join("line")
    .attr("class", "median")
    .attr("x1", d => x(d.q2))
    .attr("x2", d => x(d.q2))
    .attr("y1", d => y(d.purpose) + y.bandwidth()/2 - boxH/2)
    .attr("y2", d => y(d.purpose) + y.bandwidth()/2 + boxH/2)
    .attr("stroke", COLOR.median)
    .attr("stroke-width", 2.2)
    .append("title")
    .text(d => `Median: ${d.q2?.toFixed(2)} yrs`);

 
  svg.append("g")
    .attr("fill", COLOR.outlier)
    .attr("fill-opacity", 0.6)
    .selectAll("circle.outlier")
    .data(boxes.flatMap(b => b.outliers.map(v => ({ purpose: b.purpose, v }))))
    .join("circle")
    .attr("class", "outlier")
    .attr("r", 2.2)
    .attr("cx", d => x(d.v))
    .attr("cy", d => y(d.purpose) + y.bandwidth()/2);
}


drawBoxPlot();
})