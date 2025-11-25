// section4.js

const S4_DATA_URL = "./data/WarList.csv";
const S4_COLS = {
  region: "region",
  purpose: "purpose",
  start: "start_year",
  end: "end_year",
  duration: "duration"
};

// --------- Helpers (similar style to other sections) ---------
function s4_enrich(rows) {
  return rows.map(d => {
    const s = +d[S4_COLS.start];
    const e = +d[S4_COLS.end];
    const purposeRaw = (d[S4_COLS.purpose] ?? "").toString().trim();
    const durRaw = d[S4_COLS.duration];

    let dur = NaN;
    if (durRaw != null && durRaw !== "") {
      const num = typeof durRaw === "number"
        ? durRaw
        : parseFloat(String(durRaw).replace(/,/g, ".").replace(/[^\d.\-+eE]/g, ""));
      if (Number.isFinite(num) && num >= 0) dur = num;
    }
    if (!Number.isFinite(dur) && Number.isFinite(s) && Number.isFinite(e)) {
      dur = Math.max(0, e - s);
    }

    return {
      ...d,
      __region: (d[S4_COLS.region] ?? "").toString().trim(),
      __purpose: purposeRaw,
      __purpose_lc: purposeRaw.toLowerCase(),
      __start: Number.isFinite(s) ? s : NaN,
      __end: Number.isFinite(e) ? e : NaN,
      __duration: Number.isFinite(dur) ? dur : NaN
    };
  });
}

function s4_mount(el, fig) {
  el.innerHTML = "";
  el.classList.add("chart-mounted");
  el.appendChild(fig);
}

// --------- MAIN ---------
d3.csv(S4_DATA_URL, d3.autoType).then(raw0 => {
  const raw = s4_enrich(raw0);

  // ================== CHART 1: Choropleth ==================
  (async function drawChoropleth() {
    const root = document.querySelector('[data-chart="s4-choropleth"]');
    if (!root) return;

    const base = raw.filter(d => d.__region);
    if (!base.length) {
      root.innerHTML = "<div style='padding:12px;color:#888'>No region data found for choropleth.</div>";
      return;
    }

    const countsArr = d3.rollups(base, v => v.length, d => d.__region)
      .map(([region, value]) => ({ region, value }));

    const countMap = new Map(countsArr.map(d => [d.region, d.value]));

    const warCounts = Array.from(countMap.values());
    const minWarCount = d3.min(warCounts);
    const maxWarCount = d3.max(warCounts);

    try {
      const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
      const countries = topojson.feature(world, world.objects.countries);

      countries.features.forEach(f => {
        const name = (f.properties && f.properties.name) ? f.properties.name : "";
        f.properties.warCount = countMap.get(name) || 0;
      });

      const fig = Plot.plot({
        height: 420,
        margin: 30,
        projection: "equal-earth",
        color: {
          label: "Number of wars",
          scheme: "Reds",
          legend: true,
          domain: [minWarCount, maxWarCount]
        },
        marks: [
          Plot.geo(countries, {
            fill: d => d.properties.warCount,
            stroke: "#111",
            strokeWidth: 0.5,
            tip: true,
            title: d => `${d.properties.name}\nWars: ${d.properties.warCount}`
          }),
          Plot.sphere({ stroke: "#222" })
        ]
      });

      s4_mount(root, fig);
    } catch (err) {
      console.error("Choropleth error:", err);
      root.innerHTML = "<div style='padding:12px;color:#f88'>Failed to load world map or render choropleth. Check network / topojson URL.</div>";
    }
  })();

  // ================== CHART 2: Bubble Map (Average Duration) ==================
  (async function drawBubbleMap() {
    const root = document.querySelector('[data-chart="s4-bubble"]');
    if (!root) return;

    const rows = raw.filter(d => d.__region && Number.isFinite(d.__duration));
    if (!rows.length) {
      root.innerHTML = "<div style='padding:12px;color:#888'>No duration data found for bubble map.</div>";
      return;
    }

    const perRegion = d3.rollups(
      rows,
      v => d3.mean(v, d => d.__duration),
      d => d.__region
    ).map(([region, avgDuration]) => ({ region, avgDuration }))
     .filter(d => Number.isFinite(d.avgDuration));

    try {
      const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
      const countries = topojson.feature(world, world.objects.countries);

      // Map region name to avgDuration
      const durMap = new Map(perRegion.map(d => [d.region, d.avgDuration]));

      // Build bubble data: centroid + avgDuration for countries that match
      const bubbleData = [];
      countries.features.forEach(f => {
        const name = (f.properties && f.properties.name) ? f.properties.name : "";
        const val = durMap.get(name);
        if (Number.isFinite(val) && val > 0) {
          const [lon, lat] = d3.geoCentroid(f);
          bubbleData.push({
            name,
            avgDuration: val,
            lon,
            lat
          });
        }
      });

      if (!bubbleData.length) {
        root.innerHTML = "<div style='padding:12px;color:#888'>No matching country names between dataset and world map for bubble plot.</div>";
        return;
      }

      const maxDur = d3.max(bubbleData, d => d.avgDuration) || 1;
      const rScale = d3.scaleSqrt()
        .domain([0, maxDur])
        .range([0, 18]);

      const fig = Plot.plot({
        height: 420,
        margin: 30,
        projection: "equal-earth",
        marks: [
          // base map with neutral fill
          Plot.geo(countries, {
            fill: "#1b1f2a",
            stroke: "#222",
            strokeWidth: 0.5
          }),
          // bubbles
          Plot.dot(bubbleData, {
            x: "lon",
            y: "lat",
            r: d => rScale(d.avgDuration),
            fill: "#e6b422",
            fillOpacity: 0.8,
            stroke: "#111",
            tip: true,
            title: d => `${d.name}\nAverage duration: ${d.avgDuration.toFixed(2)} years`
          }),
          Plot.sphere({ stroke: "#222" })
        ]
      });

      s4_mount(root, fig);
    } catch (err) {
      console.error("Bubble map error:", err);
      root.innerHTML = "<div style='padding:12px;color:#f88'>Failed to load world map or render bubble map.</div>";
    }
  })();

  // ================== CHART 3: Regional Dumbbell (Frequency vs Duration) ==================
  (function drawRegionalDumbbell() {
    const root = document.querySelector('[data-chart="s4-dumbbell"]');
    if (!root) return;

    const rows = raw.filter(d => d.__region && Number.isFinite(d.__duration));
    if (!rows.length) {
      root.innerHTML = "<div style='padding:12px;color:#888'>No data for regional dumbbell chart.</div>";
      return;
    }

    // Summaries per region (geographical unit)
    const summary = d3.rollups(
      rows,
      v => ({
        count: v.length,
        avgDuration: d3.mean(v, d => d.__duration)
      }),
      d => d.__region
    )
      .map(([region, stats]) => ({
        region,
        count: stats.count,
        avgDuration: stats.avgDuration
      }))
      .filter(d => Number.isFinite(d.avgDuration));

    // Top regions by count for readability
    summary.sort((a, b) => d3.descending(a.count, b.count));
    const TOP = 15;
    const top = summary.slice(0, TOP);

    if (!top.length) {
      root.innerHTML = "<div style='padding:12px;color:#888'>No sufficient regional data for dumbbell chart.</div>";
      return;
    }

    const minCount = d3.min(top, d => d.count);
    const maxCount = d3.max(top, d => d.count);
    const minDur = d3.min(top, d => d.avgDuration);
    const maxDur = d3.max(top, d => d.avgDuration);

    const norm = (v, min, max) => (max > min ? (v - min) / (max - min) : 0.5);

    const dumbbell = top.map(d => ({
      region: d.region,
      nCount: norm(d.count, minCount, maxCount),
      nDuration: norm(d.avgDuration, minDur, maxDur)
    }));

    const dots = dumbbell.flatMap(d => ([
      { region: d.region, metric: "War frequency", value: d.nCount },
      { region: d.region, metric: "Average duration", value: d.nDuration }
    ]));

    const fig = Plot.plot({
      height: Math.max(420, dumbbell.length * 24),
      marginLeft: 220,
      x: {
        label: "Normalized metric (0–1)",
        domain: [0, 1],
        grid: true
      },
      y: {
        label: null,
        domain: dumbbell.map(d => d.region)
      },
      color: {
        legend: true,
        label: "Metric",
        domain: ["War frequency", "Average duration"]
      },
      marks: [
        // line connecting the two metrics per region
        Plot.ruleX(dumbbell, {
          x1: "nCount",
          x2: "nDuration",
          y: "region"
        }),
        // dots at endpoints
        Plot.dot(dots, {
          x: "value",
          y: "region",
          fill: "metric",
          r: 4,
          tip: true,
          title: d => `${d.region}\n${d.metric}: ${d.value.toFixed(2)}`
        })
      ]
    });

    s4_mount(root, fig);
  })();

  // ================== CHART 4: Bivariate Choropleth (Frequency × Duration) ==================
  (async function drawBivariateMap() {
    const root = document.querySelector('[data-chart="s4-bivariate"]');
    if (!root) return;

    const rows = raw.filter(d => d.__region && Number.isFinite(d.__duration));
    if (!rows.length) {
      root.innerHTML = "<div style='padding:12px;color:#888'>No data for bivariate choropleth.</div>";
      return;
    }

    // Per-country summary: war count + avg duration
    const summary = d3.rollups(
      rows,
      v => ({
        count: v.length,
        avgDuration: d3.mean(v, d => d.__duration)
      }),
      d => d.__region
    )
      .map(([region, stats]) => ({
        region,
        count: stats.count,
        avgDuration: stats.avgDuration
      }))
      .filter(d => Number.isFinite(d.avgDuration) && Number.isFinite(d.count));

    if (!summary.length) {
      root.innerHTML = "<div style='padding:12px;color:#888'>No valid summary for bivariate choropleth.</div>";
      return;
    }

    // Define 3-level bins (Low / Medium / High) for both metrics
    const counts = summary.map(d => d.count);
    const durs = summary.map(d => d.avgDuration);

    const c_q1 = d3.quantile(counts.slice().sort(d3.ascending), 0.33);
    const c_q2 = d3.quantile(counts.slice().sort(d3.ascending), 0.66);
    const d_q1 = d3.quantile(durs.slice().sort(d3.ascending), 0.33);
    const d_q2 = d3.quantile(durs.slice().sort(d3.ascending), 0.66);

    function level(v, q1, q2) {
      if (v <= q1) return "Low";
      if (v <= q2) return "Medium";
      return "High";
    }

    summary.forEach(d => {
      const fLevel = level(d.count, c_q1, c_q2);
      const tLevel = level(d.avgDuration, d_q1, d_q2);
      d.freqLevel = fLevel;
      d.durLevel = tLevel;
      d.classLabel = `${fLevel} freq / ${tLevel} dur`;
    });

    const classMap = new Map(summary.map(d => [d.region, d.classLabel]));

    // Define class order and color palette (9 combos + 1 no-data)
    const classes = [
      "Low freq / Low dur",
      "Low freq / Medium dur",
      "Low freq / High dur",
      "Medium freq / Low dur",
      "Medium freq / Medium dur",
      "Medium freq / High dur",
      "High freq / Low dur",
      "High freq / Medium dur",
      "High freq / High dur",
      "No data"
    ];

    const palette = [
      "#e8e8e8", // Low/Low
      "#b3d1f2", // Low/Med
      "#6baed6", // Low/High
      "#fdd0a2", // Med/Low
      "#fdae6b", // Med/Med
      "#fd8d3c", // Med/High
      "#fbb4b9", // High/Low
      "#fb6a4a", // High/Med
      "#cb181d", // High/High
      "#333333"  // No data
    ];

    try {
      const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
      const countries = topojson.feature(world, world.objects.countries);

      countries.features.forEach(f => {
        const name = (f.properties && f.properties.name) ? f.properties.name : "";
        const cls = classMap.get(name) || "No data";
        f.properties.bivarClass = cls;
      });

      const fig = Plot.plot({
        height: 420,
        margin: 30,
        projection: "equal-earth",
        color: {
          label: "War frequency × duration",
          domain: classes,
          range: palette
        },
        marks: [
          Plot.geo(countries, {
            fill: d => d.properties.bivarClass,
            stroke: "#111",
            strokeWidth: 0.5,
            tip: true,
            title: d => {
              const name = d.properties.name;
              const cls = d.properties.bivarClass;
              return `${name}\nCategory: ${cls}`;
            }
          }),
          Plot.sphere({ stroke: "#222" })
        ]
      });

      s4_mount(root, fig);
      // ---- Bivariate Legend (custom 3x3 matrix) ----
      const legendCanvas = document.createElement("div");
      legendCanvas.style.marginTop = "12px";
      legendCanvas.style.display = "inline-block";

      legendCanvas.innerHTML = `
        <div style="font-size:13px;margin-bottom:6px;color:#ccc">War frequency × Duration</div>
        <table style="border-collapse: collapse;">
          <tr>
            <td></td>
            <td style="text-align:center;font-size:12px;color:#ccc;">Low</td>
            <td style="text-align:center;font-size:12px;color:#ccc;">Med</td>
            <td style="text-align:center;font-size:12px;color:#ccc;">High</td>
          </tr>
          <tr>
            <td style="font-size:12px;color:#ccc;">Low</td>
            <td style="width:28px;height:28px;background:#e8e8e8"></td>
            <td style="width:28px;height:28px;background:#b3d1f2"></td>
            <td style="width:28px;height:28px;background:#6baed6"></td>
          </tr>
          <tr>
            <td style="font-size:12px;color:#ccc;">Med</td>
            <td style="width:28px;height:28px;background:#fdd0a2"></td>
            <td style="width:28px;height:28px;background:#fdae6b"></td>
            <td style="width:28px;height:28px;background:#fd8d3c"></td>
          </tr>
          <tr>
            <td style="font-size:12px;color:#ccc;">High</td>
            <td style="width:28px;height:28px;background:#fbb4b9"></td>
            <td style="width:28px;height:28px;background:#fb6a4a"></td>
            <td style="width:28px;height:28px;background:#cb181d"></td>
          </tr>
        </table>
        <div style="margin-top:6px;font-size:11px;color:#aaa;">Freq → (left → right)</div>
        <div style="font-size:11px;color:#aaa;">Duration ↑ (bottom → top)</div>
      `;

      root.appendChild(legendCanvas);
    } catch (err) {
      console.error("Bivariate choropleth error:", err);
      root.innerHTML = "<div style='padding:12px;color:#f88'>Failed to load world map or render bivariate choropleth.</div>";
    }
  })();

}).catch(err => {
  console.error("Section 4 failed to load CSV:", err);
  const root = document.querySelector("main") || document.body;
  const msg = document.createElement("div");
  msg.style.color = "darkred";
  msg.style.padding = "12px";
  msg.textContent = "Error loading data for Section 4. Check data/WarList.csv path.";
  root.prepend(msg);
});
