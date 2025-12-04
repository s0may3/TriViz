// section5.js — Region×Purpose heatmap + Sankey

const S5_DATA_URL = "./data/WarList.csv";

d3.csv(S5_DATA_URL, d3.autoType).then(raw => {
  if (!raw || !raw.length) {
    showError("No data found in WarList.csv for Section 5.");
    return;
  }

  const norm = v => (v == null ? "" : String(v).trim());

  // Normalize rows: only fields we need
  const rows = raw
    .map(d => ({
      region: norm(d.region),
      purpose: norm(d.purpose),
      start_year: d.start_year,
      end_year: d.end_year,
      duration: d.duration
    }))
    .filter(d => d.region && d.purpose);

  if (!rows.length) {
    showError("WarList.csv has no usable region/purpose data.");
    return;
  }

//   renderHeatmap(rows);
  renderSankey(rows);
  renderBubbleHierarchy(rows);


}).catch(err => {
  console.error(err);
  showError("Error loading WarList.csv for Section 5.");
});

function showError(msg) {
  const c = document.querySelector("main") || document.body;
  const div = document.createElement("div");
  div.style.color = "red";
  div.style.padding = "12px";
  div.style.marginTop = "12px";
  div.textContent = msg;
  c.prepend(div);
}

// /* -----------------------------------------------------------
//    5.1 — Region × Purpose Heatmap
// ----------------------------------------------------------- */
// function renderHeatmap(rows) {
//   const root = document.querySelector('[data-chart="s5-degree"]');
//   if (!root) return;

//   // Count wars per region × purpose
//   const counts = d3.rollups(
//     rows,
//     v => v.length,
//     d => d.region,
//     d => d.purpose
//   )
//   .map(([region, purposes]) => ({
//     region,
//     purposes: purposes.map(([purpose, count]) => ({ purpose, count }))
//   }));

//   // Choose top regions & purposes
//   const regionTotals = counts.map(d => ({
//     region: d.region,
//     total: d3.sum(d.purposes, p => p.count)
//   })).sort((a,b) => d3.descending(a.total,b.total));

//   const purposeTotals = d3.rollups(rows, v => v.length, d => d.purpose)
//     .map(([purpose,total]) => ({ purpose,total }))
//     .sort((a,b) => d3.descending(a.total,b.total));

//   const TOP_REGIONS = 12;
//   const TOP_PURPOSES = 10;

//   const keepRegions = new Set(regionTotals.slice(0,TOP_REGIONS).map(d => d.region));
//   const keepPurposes = new Set(purposeTotals.slice(0,TOP_PURPOSES).map(d => d.purpose));

//   const regions = regionTotals
//     .map(d => d.region)
//     .filter(r => keepRegions.has(r));

//   const purposes = purposeTotals
//     .map(d => d.purpose)
//     .filter(p => keepPurposes.has(p));

//   if (!regions.length || !purposes.length) {
//     root.innerHTML = "<div style='padding:12px;color:#888'>Not enough region–purpose data for heatmap.</div>";
//     return;
//   }

//   // Build lookup table
//   const countMap = new Map();
//   counts.forEach(r => {
//     if (!keepRegions.has(r.region)) return;
//     r.purposes.forEach(p => {
//       if (!keepPurposes.has(p.purpose)) return;
//       countMap.set(`${r.region}||${p.purpose}`, p.count);
//     });
//   });

//   const cells = [];
//   regions.forEach(r => {
//     purposes.forEach(p => {
//       cells.push({
//         region: r,
//         purpose: p,
//         value: countMap.get(`${r}||${p}`) || 0
//       });
//     });
//   });

//   const maxValue = d3.max(cells, d => d.value) || 1;

//   const width = root.clientWidth || 900;
//   const height = 420;
//   const margin = { top: 140, right: 20, bottom: 60, left: 160 };
//   const innerWidth = width - margin.left - margin.right;
//   const innerHeight = height - margin.top - margin.bottom;

//   root.innerHTML = "";
//   const svg = d3.select(root)
//     .append("svg")
//     .attr("width", width)
//     .attr("height", height)
//     .style("background", "#111");

//   const g = svg.append("g")
//     .attr("transform", `translate(${margin.left},${margin.top})`);

//   const x = d3.scaleBand()
//     .domain(purposes)
//     .range([0, innerWidth])
//     .padding(0.03);

//   const y = d3.scaleBand()
//     .domain(regions)
//     .range([0, innerHeight])
//     .padding(0.03);

//   const color = d3.scaleSequential(d3.interpolateYlOrRd)
//     .domain([0, maxValue]);

//   g.selectAll("rect")
//     .data(cells)
//     .join("rect")
//     .attr("x", d => x(d.purpose))
//     .attr("y", d => y(d.region))
//     .attr("width", x.bandwidth())
//     .attr("height", y.bandwidth())
//     .attr("fill", d => d.value ? color(d.value) : "#151515")
//     .attr("stroke", "#222")
//     .append("title")
//     .text(d => `${d.region} × ${d.purpose}\nWars: ${d.value}`);

//   // Region labels
//   g.append("g")
//     .selectAll("text")
//     .data(regions)
//     .join("text")
//     .attr("x", -8)
//     .attr("y", d => y(d) + y.bandwidth()/2)
//     .attr("text-anchor","end")
//     .attr("dominant-baseline","middle")
//     .attr("fill","#ddd")
//     .attr("font-size",10)
//     .text(d => d);

//   // Purpose labels
//   g.append("g")
//     .selectAll("text")
//     .data(purposes)
//     .join("text")
//     .attr("transform", d => {
//       const tx = x(d) + x.bandwidth()/2;
//       return `translate(${tx},-8) rotate(-60)`;
//     })
//     .attr("text-anchor","start")
//     .attr("dominant-baseline","middle")
//     .attr("fill","#ddd")
//     .attr("font-size",10)
//     .text(d => d);

//   // Legend
//   const legendWidth = 140;
//   const legendHeight = 10;
//   const legendScale = d3.scaleLinear()
//     .domain([0, maxValue])
//     .range([0, legendWidth]);

//   const defs = svg.append("defs");
//   const gradientId = "heatmap-gradient";
//   const gradient = defs.append("linearGradient")
//     .attr("id", gradientId)
//     .attr("x1","0%")
//     .attr("x2","100%")
//     .attr("y1","0%")
//     .attr("y2","0%");

//   d3.range(0,1.01,0.1).forEach(t=>{
//     gradient.append("stop")
//       .attr("offset",`${t*100}%`)
//       .attr("stop-color", color(t*maxValue));
//   });

//   const legend = svg.append("g")
//     .attr("transform",`translate(${margin.left + innerWidth - legendWidth},${margin.top + innerHeight + 30})`);

//   legend.append("rect")
//     .attr("width",legendWidth)
//     .attr("height",legendHeight)
//     .attr("fill",`url(#${gradientId})`);

//   legend.append("g")
//     .attr("transform",`translate(0,${legendHeight})`)
//     .call(d3.axisBottom(legendScale).ticks(4).tickSize(3))
//     .selectAll("text")
//     .attr("fill","#ddd")
//     .attr("font-size",10);

//   legend.append("text")
//     .attr("x",legendWidth/2)
//     .attr("y",legendHeight+24)
//     .attr("text-anchor","middle")
//     .attr("fill","#ddd")
//     .attr("font-size",10)
//     .text("Number of wars (region × purpose)");
// }

/* -----------------------------------------------------------
   5.2 — Sankey Diagram (Region → Purpose)
----------------------------------------------------------- */
function renderSankey(rows) {
  const root = document.querySelector('[data-chart="s5-sankey"]');
  if (!root) return;

  const regionCounts = d3.rollups(rows, v => v.length, d => d.region)
    .map(([region,count]) => ({region,count}))
    .sort((a,b)=>d3.descending(a.count,b.count));

  const purposeCounts = d3.rollups(rows, v => v.length, d => d.purpose)
    .map(([purpose,count]) => ({purpose,count}))
    .sort((a,b)=>d3.descending(a.count,b.count));

  const TOP_REGIONS = 8;
  const TOP_PURPOSES = 8;

  const keepRegions = new Set(regionCounts.slice(0,TOP_REGIONS).map(d=>d.region));
  const keepPurposes = new Set(purposeCounts.slice(0,TOP_PURPOSES).map(d=>d.purpose));

  const flowMap = new Map();
  rows.forEach(d=>{
    if (!keepRegions.has(d.region) || !keepPurposes.has(d.purpose)) return;
    const key = `${d.region}||${d.purpose}`;
    flowMap.set(key,(flowMap.get(key)||0)+1);
  });

  if (!flowMap.size) {
    root.innerHTML = "<div style='padding:12px;color:#888'>Not enough region-purpose data for Sankey.</div>";
    return;
  }

  const nodeNames = new Set();
  flowMap.forEach((_count,key)=>{
    const [r,p] = key.split("||");
    nodeNames.add(`R: ${r}`);
    nodeNames.add(`P: ${p}`);
  });

  const nodesList = Array.from(nodeNames).map((name,i)=>({name,index:i}));
  const indexByName = new Map(nodesList.map(d=>[d.name,d.index]));

  const linksList = Array.from(flowMap.entries()).map(([key,value])=>{
    const [r,p] = key.split("||");
    return {
      source: indexByName.get(`R:${" "+r}`.trim()),
      target: indexByName.get(`P:${" "+p}`.trim()),
      value
    };
  });

  const width = root.clientWidth || 900;
  const height = 500;

  root.innerHTML = "";
  const svg = d3.select(root).append("svg")
    .attr("width",width)
    .attr("height",height);

  const sankey = d3.sankey()
    .nodeWidth(20)
    .nodePadding(12)
    .extent([[1,1],[width-1,height-6]]);

  const graph = sankey({
    nodes: nodesList.map(d=>({name:d.name})),
    links: linksList.map(l=>({...l}))
  });

  const color = d3.scaleOrdinal(d3.schemeCategory10);

  svg.append("g")
    .attr("fill","none")
    .selectAll("path")
    .data(graph.links)
    .join("path")
    .attr("d",d3.sankeyLinkHorizontal())
    .attr("stroke",d=>color(d.source.name))
    .attr("stroke-width",d=>Math.max(1,d.width))
    .attr("stroke-opacity",0.45)
    .append("title")
    .text(d=>{
      const src=d.source.name.replace("R: ","");
      const tgt=d.target.name.replace("P: ","");
      return `${src} → ${tgt}\nConflicts: ${d.value}`;
    });

  const node=svg.append("g")
    .selectAll("rect")
    .data(graph.nodes)
    .join("rect")
    .attr("x",d=>d.x0)
    .attr("y",d=>d.y0)
    .attr("width",d=>d.x1-d.x0)
    .attr("height",d=>d.y1-d.y0)
    .attr("fill",d=>color(d.name))
    .attr("stroke","#333");

  node.append("title")
    .text(d=>`${d.name}\nTotal flow: ${d.value}`);

  svg.append("g")
    .selectAll("text")
    .data(graph.nodes)
    .join("text")
    .attr("x",d=>d.x1+6)
    .attr("y",d=>(d.y0+d.y1)/2)
    .attr("dy","0.35em")
    .attr("font-size",11)
    .text(d=>d.name.replace("R: ","").replace("P: ",""));
}
// -----------------------------------------------------------
// 5.3 — Bubble Hierarchy: Purpose → Region (circle packing)
// -----------------------------------------------------------
function renderBubbleHierarchy(rows) {
  const rootEl = document.querySelector('[data-chart="s5-bubble"]');
  if (!rootEl) return;

  const base = rows.filter(d => d.region && d.purpose);
  if (!base.length) {
    rootEl.innerHTML = "<div style='padding:12px;color:#888'>No region–purpose data for bubble hierarchy.</div>";
    return;
  }

  // aggregate: purpose -> region -> count
  const nested = d3.rollups(
    base,
    v => v.length,
    d => d.purpose,
    d => d.region
  );

  const data = {
    name: "Wars",
    children: nested.map(([purpose, regions]) => ({
      name: purpose,
      children: regions.map(([region, count]) => ({
        name: region,
        value: count
      }))
    }))
  };

  const root = d3.hierarchy(data)
    .sum(d => d.value)
    .sort((a, b) => (b.value || 0) - (a.value || 0));

  const width = rootEl.clientWidth || 900;
  const height = 550;

  const pack = d3.pack()
    .size([width, height])
    .padding(3);

  pack(root);

  rootEl.innerHTML = "";
  const svg = d3.select(rootEl)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("background", "#111");

  const purposes = root.children ? root.children.map(d => d.data.name) : [];
  const color = d3.scaleOrdinal(d3.schemeTableau10)
    .domain(purposes);

  const node = svg.selectAll("g")
    .data(root.descendants())
    .join("g")
    .attr("transform", d => `translate(${d.x},${d.y})`);

  node.append("circle")
    .attr("r", d => d.r)
    .attr("fill", d => {
      if (d.depth === 0) return "none"; // ریشه
      if (d.depth === 1) return color(d.data.name); // purpose
      if (d.depth === 2) return color(d.parent.data.name); // region
      return "#555";
    })
    .attr("fill-opacity", d => d.children ? 0.2 : 0.8)
    .attr("stroke", d => d.children ? "#555" : "#fff")
    .append("title")
    .text(d => {
      if (d.depth === 0) return `All wars\nTotal: ${d.value}`;
      if (d.depth === 1) return `${d.data.name}\nWars: ${d.value}`;
      return `${d.data.name}\nWars: ${d.value}\nPurpose: ${d.parent.data.name}`;
    });

  // فقط روی برگ‌ها که شعاع کافی دارن، لیبل بزنیم
  node.filter(d => !d.children && d.r > 14)
    .append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .attr("fill", "#fff")
    .attr("font-size", d => Math.min(12, d.r / 2.2))
    .text(d => d.data.name);
}

