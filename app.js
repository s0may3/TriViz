// ================= config =================
const DATA_URL = "./data/WarList.csv";
const COLS = { region: "region", purpose: "purpose", start: "start_year", end: "end_year" };

// ================ helpers ================
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
      __decade: Number.isFinite(s) ? Math.floor(s/10)*10 : NaN,
      __period: Number.isFinite(s) ? (s < 1914 ? "Before 1914" : "After 1914") : "Unknown"
    };
  });
}
function mount(el, figure){ el.innerHTML=""; el.classList.add("chart-mounted"); el.appendChild(figure); }

// display limits & label utilities
const LIMITS = {
  q1Top: 10,              // Bar: only top-20 regions
  q2TopRegions: 10,       // 100% Stacked & Grouped: top-10 regions
  heatmapTopRegions: 15,  // Heatmap: top-15 regions
  top3Regions: 16         // Small multiples panels
};
function truncateLabel(s, n=18){ s = String(s||""); return s.length>n ? s.slice(0,n-1)+"…" : s; }
function dynamicLeftMargin(labels){
  const maxLen = Math.max(6, ...labels.map(l => String(l||"").length));
  return Math.min(220, Math.max(80, maxLen * 7)); // 80..220 px
}
// keep only Top-N of key, others -> "Other"
function keepTopNWithOther(rows, key, N){
  const counts = d3.rollup(rows, v=>v.length, d=>d[key]);
  const sorted = Array.from(counts, ([k,v])=>({k,v})).sort((a,b)=>d3.descending(a.v,b.v));
  const top = new Set(sorted.slice(0,N).map(d=>d.k));
  return rows.map(d => ({...d, [key]: top.has(d[key]) ? d[key] : "Other"}));
}

// ================= main ===================
d3.csv(DATA_URL, d3.autoType).then(raw0 => {
  const raw = enrich(raw0);

  // ---------- Q1: Bar — Wars per Region (Top 10 only, no 'Other') ----------
  (function(){
    const el = document.querySelector('[data-chart="bar"]') || document.querySelector('[data-chart="q1-region-count"]');
    if (!el) return;

    // Filter only regions and count
    const base = raw.filter(d => d.__region);
    const counts = d3.rollups(base, v => v.length, d => d.__region)
      .map(([region,value]) => ({region,value}))
      .sort((a,b) => d3.descending(a.value,b.value))
      .slice(0, 10); // top 10 only

    const labels = counts.map(d => truncateLabel(d.region));
    const mLeft = dynamicLeftMargin(labels);

    const fig = Plot.plot({
      height: Math.max(300, counts.length * 18),
      marginLeft: mLeft,
      x: { label: "Count" },
      y: { label: null, domain: counts.map(d=>d.region) },
      marks: [
        Plot.barX(counts, { x:"value", y:"region", tip:true }),
        Plot.text(counts, { x:"value", y:"region", text:d=>d.value, dx:8 })
      ]
    });
    mount(el, fig);
  })();
// ---------- Q2: 100% Stacked — Purpose composition per Region ----------
  (function(){
    const el = document.querySelector('[data-chart="stacked-100"]') || document.querySelector('[data-chart="q2-100stacked"]');
    if (!el) return;

    // فقط top N region
    const base = raw.filter(d=>d.__region && d.__purpose);
    const totals = d3.rollup(base, v=>v.length, d=>d.__region);
    const topSet = new Set(
      Array.from(totals, ([k,v])=>({k,v}))
        .sort((a,b)=>d3.descending(a.v,b.v))
        .slice(0, LIMITS.q2TopRegions)
        .map(d=>d.k)
    );
    const trimmed = base.filter(d=>topSet.has(d.__region));

    const map = d3.rollup(trimmed, v=>v.length, d=>d.__region, d=>d.__purpose);
    const regions = Array.from(map.keys()).sort();
    const purposes = Array.from(new Set(trimmed.map(d=>d.__purpose))).sort();

    const percentRows = regions.map(r => {
      const total = d3.sum(purposes, p => map.get(r)?.get(p) || 0);
      const obj = { region: r };
      purposes.forEach(p => obj[p] = total ? (map.get(r)?.get(p) || 0)/total : 0);
      return obj;
    });

    const long = percentRows.flatMap(row =>
      purposes.map(p => ({ region: row.region, purpose: p, perc: row[p] }))
    );

    const fig = Plot.plot({
      height: 340,
      marginBottom: 80,
      y: { grid: true, tickFormat: d3.format(".0%"), domain: [0,1] },
      x: { domain: regions, tickRotate: -35 },   // خوانایی محور X
      color: { legend: true, domain: purposes },
      marks: [ Plot.barY(long, { x:"region", y:"perc", fill:"purpose", tip:true }) ]
    });
    mount(el, fig);
  })();


  // ---------- Q3: Grouped — Before vs After 1914 by Region (no "Other") ----------
  (function(){
    const el = document.querySelector('[data-chart="grouped-before-after"]') 
            || document.querySelector('[data-chart="q3-before-after"]')
            || document.querySelector('[data-chart="grouped-bar"]');
    if (!el) return;

    const rows = raw.filter(d => d.__region && d.__period !== "Unknown");

    // فقط تاپ N منطقه؛ بقیه حذف (ادغام نمی‌شن)
    const N = LIMITS.q2TopRegions;
    const totals = d3.rollup(rows, v=>v.length, d=>d.__region);
    const topSet = new Set(
      Array.from(totals, ([k,v])=>({k,v}))
        .sort((a,b)=>d3.descending(a.v,b.v))
        .slice(0, N)
        .map(d=>d.k)
    );
    const filtered = rows.filter(d => topSet.has(d.__region));

    const data = d3.rollups(filtered, v=>v.length, d=>d.__region, d=>d.__period)
      .flatMap(([region, arr]) => arr.map(([period, value]) => ({ region, period, value })));

    const regions = Array.from(new Set(data.map(d=>d.region))).sort();
    const ordered = ["Before 1914","After 1914"];

    const fig = Plot.plot({
      height: 360, marginBottom: 80,
      color: { legend: true, domain: ordered },
      x: { domain: regions, tickRotate: -35 },
      y: { grid: true, label: "Count" },
      marks: [ Plot.barY(data, { x:"region", y:"value", fill:"period", tip:true }) ]
    });
    mount(el, fig);
  })();


  // ---------- Q4: Heatmap — Region × Decade (taller + label fix) ----------
  (function(){
    const el = document.querySelector('[data-chart="heatmap"]') || document.querySelector('[data-chart="q4-heatmap-region-decade"]');
    if (!el) return;

    const base = raw.filter(d=>d.__region && Number.isFinite(d.__decade));
    const totals = d3.rollup(base, v=>v.length, d=>d.__region);
    const top = new Set(
      Array.from(totals, ([k,v])=>({k,v}))
        .sort((a,b)=>d3.descending(a.v,b.v))
        .slice(0, LIMITS.heatmapTopRegions)
        .map(d=>d.k)
    );
    const rows = base.filter(d=>top.has(d.__region));

    const grid = d3.rollups(rows, v=>v.length, d=>d.__region, d=>d.__decade)
      .flatMap(([region, arr]) => arr.map(([decade, value]) => ({ region, decade:+decade, value })));

    if (!grid.length){
      el.innerHTML = "<div style='color:#666'>No decade-encoded data found (check start_year values).</div>";
      return;
    }

    const regions = Array.from(new Set(grid.map(d=>d.region))).sort();
    const decades = Array.from(new Set(grid.map(d=>d.decade))).sort((a,b)=>a-b);

    const fig = Plot.plot({
      height: Math.max(420, regions.length * 26),
      marginLeft: 140,
      color: { scheme: "YlOrRd", legend: true, label: "Count" },
      x: { domain: decades, label: "Decade" },
      y: { domain: regions, label: "" }, // بدون متن اضافه
      marks: [ Plot.cell(grid, { x:"decade", y:"region", fill:"value", tip:true }), Plot.frame() ]
    });
    mount(el, fig);
  })();


  // ---------- Q5: Waffle — Ethnic vs Non-ethnic ----------
  (function(){
    const el = document.querySelector('[data-chart="waffle"]') || document.querySelector('[data-chart="q5-waffle-ethnic"]');
    if (!el) return;

    const rows = raw.filter(d=>d.__purpose_lc);
    const ethnic = rows.filter(d => d.__purpose_lc.includes("ethnic")).length;
    const nonEthnic = rows.length - ethnic;
    const pairs = [{group:"Ethnic", value:ethnic}, {group:"Non-ethnic", value:nonEthnic}];
    const total = d3.sum(pairs, d=>d.value) || 1;

    const tiles = 100, cols = 10, size = 18;
    const scaled = pairs.map(d => ({ group: d.group, tiles: Math.round((d.value/total)*tiles) }));
    const waffle = [];
    scaled.forEach(s => { for(let i=0;i<s.tiles;i++) waffle.push({ group: s.group }); });
    while (waffle.length < tiles) waffle.push({ group: scaled[0]?.group || "Other" });

    const color = d3.scaleOrdinal().domain(pairs.map(d=>d.group)).range(["#c51b7d","#2c7fb8"]);
    const svg = d3.create("svg").attr("width", cols*size).attr("height", Math.ceil(tiles/cols)*size);
    waffle.forEach((d,i) => {
      const x = (i % cols)*size, y = Math.floor(i/cols)*size;
      svg.append("rect").attr("x", x+2).attr("y", y+2).attr("width", size-4).attr("height", size-4)
        .attr("fill", color(d.group)).append("title").text(d.group);
    });

    const legend = d3.create("div").style("marginTop","8px").style("fontSize","12px");
    color.domain().forEach(g=>{
      const s = document.createElement("span");
      s.style.display="inline-flex"; s.style.alignItems="center"; s.style.gap="6px"; s.style.marginRight="10px";
      s.innerHTML = `<span style="width:10px;height:10px;border-radius:2px;background:${color(g)};display:inline-block"></span>${g}`;
      legend.node().appendChild(s);
    });

    el.innerHTML = "";
    el.appendChild(svg.node());
    el.appendChild(legend.node());
  })();


  // ---------- Q6 (updated): Top-3 Regions — Ethnic vs Non-ethnic ----------
  (function(){
    const el = document.querySelector('[data-chart="top3-multiples"]') || document.querySelector('[data-chart="q6-top3-multiples"]');
    if (!el) return;

    const KEY = "__region"; // explicitly region-only

    // Build Ethnic / Non-ethnic labels from purpose
    const rows = raw
      .filter(d => d[KEY] && d.__purpose_lc)
      .map(d => ({
        group: d.__purpose_lc.includes("ethnic") ? "Ethnic" : "Non-ethnic",
        loc: d[KEY]
      }));

    // Count by (group × region)
    const counts = d3.rollups(rows, v => v.length, d => d.group, d => d.loc)
      .flatMap(([group, arr]) => arr.map(([loc, value]) => ({ group, loc, value })));

    // Keep Top-3 regions per group
    const top3PerGroup = ["Ethnic", "Non-ethnic"].flatMap(g => {
      return counts
        .filter(d => d.group === g)
        .sort((a,b) => d3.descending(a.value, b.value))
        .slice(0, 3);
    });

    if (top3PerGroup.length === 0){
      el.innerHTML = "<div style='color:#666'>No data for Ethnic/Non-ethnic top-3 regions.</div>";
      return;
    }

    const fig = Plot.plot({
      height: 280,
      marginLeft: 120,
      facet: { data: top3PerGroup, fy: "group" },
      x: { label: "Count", grid: true },
      y: { label: null },
      marks: [
        Plot.barX(top3PerGroup, { x:"value", y:"loc", fy:"group", tip:true }),
        Plot.text(top3PerGroup, { x:"value", y:"loc", fy:"group", text:d=>d.value, dx:8 })
      ]
    });

    mount(el, fig);
  })();
}).catch(err => {
  console.error("Failed to load CSV:", err);
  const root = document.querySelector("main") || document.body;
  const msg = document.createElement("div");
  msg.style.color = "darkred";
  msg.style.padding = "12px";
  msg.textContent = "Error loading data. Check data/WarList.csv path and headers (region,purpose,start_year,end_year).";
  root.prepend(msg);
});
