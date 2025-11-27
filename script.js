/*********************************************
 * PLAYER ERA VISUAL (TOP SECTION)
 *********************************************/

const eras = {
  all:        { key: "all",        label: "All Eras (1970–2015)",   start: 1970, end: 2015 },
  expansion:  { key: "expansion",  label: "Expansion Era (1970–1992)", start: 1970, end: 1992 },
  steroid:    { key: "steroid",    label: "Steroid Era (1993–2004)", start: 1993, end: 2004 },
  modern:     { key: "modern",     label: "Modern Era (2005–2015)",  start: 2005, end: 2015 }
};

const eraColors = {
  expansion: "#3b82f6",
  steroid:   "#ef4444",
  modern:    "#22c55e",
  all:       "#6b7280"
};

let currentView = "hitters";
let currentEra = "all";

const hitterEraStats  = { all: new Map(), expansion: new Map(), steroid: new Map(), modern: new Map() };
const pitcherEraStats = { all: new Map(), expansion: new Map(), steroid: new Map(), modern: new Map() };

const btnHitters       = document.getElementById("view-hitters");
const btnPitchers      = document.getElementById("view-pitchers");
const scatterTitle     = document.getElementById("player-scatter-title");
const tooltipPlayer    = d3.select("#tooltip");
const playerEmptyMsgEl = document.getElementById("player-empty-msg");

function eraKeyForYear(y) {
  if (y < 1970 || y > 2015) return null;
  if (y <= 1992) return "expansion";
  if (y <= 2004) return "steroid";
  return "modern";
}

Promise.all([
  d3.csv("Batting.csv",  d3.autoType),
  d3.csv("Pitching.csv", d3.autoType),
  d3.csv("Master.csv",   d3.autoType)
]).then(([batRaw, pitRaw, masterRaw]) => {

  const nameMap = new Map();
  masterRaw.forEach(r => {
    const id = r.playerID;
    const name =
      (r.nameFirst ? r.nameFirst + " " : "") +
      (r.nameLast  ? r.nameLast : "") ||
      r.nameGiven ||
      id;
    nameMap.set(id, (name || id).trim());
  });

  // Aggregate hitters
  batRaw.forEach(d => {
    const era = eraKeyForYear(d.yearID);
    if (!era) return;

    const pid = d.playerID;
    const stats = {
      AB: d.AB || 0, H: d.H || 0, BB: d.BB || 0, SO: d.SO || 0,
      HBP: d.HBP || 0, SF: d.SF || 0, DBL: d["2B"] || 0,
      TRP: d["3B"] || 0, HR: d.HR || 0
    };

    function update(mapKey) {
      if (!hitterEraStats[mapKey].has(pid)) {
        hitterEraStats[mapKey].set(pid, {
          playerID: pid,
          name: nameMap.get(pid),
          AB: 0, H: 0, BB: 0, SO: 0,
          HBP: 0, SF: 0, DBL: 0, TRP: 0, HR: 0
        });
      }
      const agg = hitterEraStats[mapKey].get(pid);
      Object.keys(stats).forEach(k => agg[k] += stats[k]);
    }

    update("all");
    update(era);
  });

  // Aggregate pitchers
  pitRaw.forEach(d => {
    const era = eraKeyForYear(d.yearID);
    if (!era) return;

    const pid = d.playerID;
    const stats = {
      IPouts: d.IPouts || 0, SO: d.SO || 0, BB: d.BB || 0,
      HBP: d.HBP || 0, HR: d.HR || 0, ER: d.ER || 0
    };

    function update(mapKey) {
      if (!pitcherEraStats[mapKey].has(pid)) {
        pitcherEraStats[mapKey].set(pid, {
          playerID: pid,
          name: nameMap.get(pid),
          IPouts: 0, SO: 0, BB: 0, HBP: 0, HR: 0, ER: 0
        });
      }
      const agg = pitcherEraStats[mapKey].get(pid);
      Object.keys(stats).forEach(k => agg[k] += stats[k]);
    }

    update("all");
    update(era);
  });

  drawPlayerScatter();
});

function getTopHittersForEra(eraKey, limit) {
  const arr = [];
  hitterEraStats[eraKey].forEach(d => {
    const PA = d.AB + d.BB + d.HBP + d.SF;
    if (PA < 300) return;

    const AVG     = d.AB > 0 ? d.H / d.AB : NaN;
    const HR_rate = PA  > 0 ? d.HR / PA   : NaN;

    const singles = d.H - d.DBL - d.TRP - d.HR;
    const TB = (singles > 0 ? singles : 0) + 2*d.DBL + 3*d.TRP + 4*d.HR;
    const SLG = d.AB > 0 ? TB / d.AB : NaN;

    const obpDen = d.AB + d.BB + d.HBP + d.SF;
    const OBP = obpDen > 0 ? (d.H + d.BB + d.HBP) / obpDen : NaN;

    const OPS = OBP + SLG;

    arr.push({ playerID: d.playerID, name: d.name, AVG, HR_rate, OPS, PA });
  });

  arr.sort((a, b) => b.OPS - a.OPS);
  return arr.slice(0, limit);
}

function getTopPitchersForEra(eraKey, limit) {
  const arr = [];
  pitcherEraStats[eraKey].forEach(d => {
    const IP = d.IPouts / 3;
    if (IP < 300) return;

    const ERA = IP > 0 ? 9 * d.ER / IP : NaN;
    const KBB = d.BB > 0 ? d.SO / d.BB : d.SO;

    const FIP = IP > 0
      ? (13*d.HR + 3*(d.BB + d.HBP) - 2*d.SO) / IP + 3.1
      : NaN;

    arr.push({ playerID: d.playerID, name: d.name, ERA, KBB, FIP, IP });
  });

  arr.sort((a, b) => b.KBB - a.KBB);
  return arr.slice(0, limit);
}

function drawPlayerScatter() {
  d3.select("#player-scatter-container").selectAll("*").remove();
  d3.select("#player-scatter-legend").selectAll("*").remove();
  playerEmptyMsgEl.style.display = "none";

  if (currentView === "hitters") {
    scatterTitle.textContent =
      `Top Hitters — ${eras[currentEra].label} (AVG vs HR%, bubble = OPS)`;
    drawHitterScatter();
  } else {
    scatterTitle.textContent =
      `Top Pitchers — ${eras[currentEra].label} (K/BB vs ERA, bubble = FIP)`;
    drawPitcherScatter();
  }
}

function drawHitterScatter() {
  const data = getTopHittersForEra(currentEra, 25);
  if (!data.length) {
    playerEmptyMsgEl.textContent = "No qualifying hitters for this era.";
    playerEmptyMsgEl.style.display = "block";
    return;
  }

  const box = document.getElementById("player-scatter-container").getBoundingClientRect();
  const width = box.width || 700;
  const height = box.height || 520;

  const svg = d3.select("#player-scatter-container")
    .append("svg").attr("width", width).attr("height", height);

  const margin = { top: 40, right: 60, bottom: 65, left: 90 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([0.07, 0.35]).range([0, innerW]);
  const y = d3.scaleLinear().domain([0.00, 0.08]).range([innerH, 0]);
  const rScale = d3.scaleSqrt().domain([0.4, 1.1]).range([4, 14]);

  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickFormat(d3.format(".3f")));

  g.append("g").call(d3.axisLeft(y).tickFormat(d3.format(".1%")));

  let lockedDatum = null;

  const nodes = g.selectAll(".h-node").data(data).enter().append("g")
    .attr("transform", d => `translate(${x(d.AVG)},${y(d.HR_rate)})`);

  const circles = nodes.append("circle")
    .attr("r", d => rScale(d.OPS))
    .attr("fill", eraColors[currentEra])
    .attr("stroke", "#0f172a")
    .attr("stroke-width", 1.2);

  nodes.append("circle")
    .attr("class", "hit-area")
    .attr("r", d => rScale(d.OPS) + 8)
    .attr("fill", "transparent")
    .on("mouseenter", (event, d) => {
      if (!lockedDatum) {
        d3.select(event.currentTarget.parentNode).raise();
        showTooltipPlayer(event, d, "hitter");
      }
    })
    .on("mousemove", event => {
      if (!lockedDatum) tooltipPlayer
        .style("left", event.pageX + 15 + "px")
        .style("top",  event.pageY - 15 + "px");
    })
    .on("mouseleave", () => {
      if (!lockedDatum) tooltipPlayer.style("opacity", 0);
    })
    .on("click", (event, d) => {
      if (lockedDatum === d) {
        lockedDatum = null;
        tooltipPlayer.style("opacity", 0);
        updateHighlight(circles, lockedDatum);
        return;
      }
      lockedDatum = d;
      d3.select(event.currentTarget.parentNode).raise();
      updateHighlight(circles, lockedDatum);
      showTooltipPlayer(event, d, "hitter");
      event.stopPropagation();
    });

  d3.select("body").on("click.hitterClear", e => {
    if (!e.target.closest("svg")) {
      lockedDatum = null;
      tooltipPlayer.style("opacity", 0);
      updateHighlight(circles, lockedDatum);
    }
  });

  g.append("text")
    .attr("x", innerW / 2)
    .attr("y", innerH + 40)
    .attr("text-anchor", "middle")
    .text("Batting Average (AVG)");

  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerH / 2)
    .attr("y", -55)
    .attr("text-anchor", "middle")
    .text("Home Run Rate (HR%)");

  const legend = d3.select("#player-scatter-legend");
  legend.html(`
    <span class="legend-swatch" style="background:${eraColors[currentEra]}"></span>
    Bubble size = OPS (higher is better)
  `);
}

function drawPitcherScatter() {
  const data = getTopPitchersForEra(currentEra, 25);
  if (!data.length) {
    playerEmptyMsgEl.textContent = "No qualifying pitchers for this era.";
    playerEmptyMsgEl.style.display = "block";
    return;
  }

  const box = document.getElementById("player-scatter-container").getBoundingClientRect();
  const width = box.width || 700;
  const height = box.height || 520;

  const svg = d3.select("#player-scatter-container")
    .append("svg").attr("width", width).attr("height", height);

  const margin = { top: 40, right: 60, bottom: 65, left: 90 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([0.5, 9]).range([0, innerW]);
  const y = d3.scaleLinear().domain([6.3, 1.5]).range([innerH, 0]);
  const rScale = d3.scaleSqrt().domain([1.7, 6.2]).range([22, 8]);

  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x));

  g.append("g").call(d3.axisLeft(y));

  let lockedDatum = null;

  const nodes = g.selectAll(".p-node").data(data).enter().append("g")
    .attr("transform", d => `translate(${x(d.KBB)},${y(d.ERA)})`);

  const circles = nodes.append("circle")
    .attr("r", d => rScale(d.FIP))
    .attr("fill", eraColors[currentEra])
    .attr("stroke", "#0f172a")
    .attr("stroke-width", 1.2);

  nodes.append("circle")
    .attr("class", "hit-area")
    .attr("r", d => rScale(d.FIP) + 8)
    .attr("fill", "transparent")
    .on("mouseenter", (event, d) => {
      if (!lockedDatum) {
        d3.select(event.currentTarget.parentNode).raise();
        showTooltipPlayer(event, d, "pitcher");
      }
    })
    .on("mousemove", event => {
      if (!lockedDatum) tooltipPlayer
        .style("left", event.pageX + 15 + "px")
        .style("top",  event.pageY - 15 + "px");
    })
    .on("mouseleave", () => {
      if (!lockedDatum) tooltipPlayer.style("opacity", 0);
    })
    .on("click", (event, d) => {
      if (lockedDatum === d) {
        lockedDatum = null;
        tooltipPlayer.style("opacity", 0);
        updateHighlight(circles, lockedDatum);
        return;
      }
      lockedDatum = d;
      d3.select(event.currentTarget.parentNode).raise();
      updateHighlight(circles, lockedDatum);
      showTooltipPlayer(event, d, "pitcher");
      event.stopPropagation();
    });

  d3.select("body").on("click.pitcherClear", e => {
    if (!e.target.closest("svg")) {
      lockedDatum = null;
      tooltipPlayer.style("opacity", 0);
      updateHighlight(circles, lockedDatum);
    }
  });

  g.append("text")
    .attr("x", innerW / 2)
    .attr("y", innerH + 40)
    .attr("text-anchor", "middle")
    .text("K/BB Ratio");

  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerH / 2)
    .attr("y", -55)
    .attr("text-anchor", "middle")
    .text("ERA (lower = better)");

  const legend = d3.select("#player-scatter-legend");
  legend.html(`
    <span class="legend-swatch" style="background:${eraColors[currentEra]}"></span>
    Bubble size = FIP (lower is better)
  `);
}

function showTooltipPlayer(event, d, type) {
  if (type === "hitter") {
    tooltipPlayer.style("opacity", 1)
      .html(
        `<strong>${d.name}</strong><br>` +
        `OPS: ${d.OPS.toFixed(3)}<br>` +
        `AVG: ${d.AVG.toFixed(3)}<br>` +
        `HR%: ${(d.HR_rate * 100).toFixed(2)}%<br>` +
        `PA: ${d.PA}`
      );
  } else {
    tooltipPlayer.style("opacity", 1)
      .html(
        `<strong>${d.name}</strong><br>` +
        `ERA: ${d.ERA.toFixed(2)}<br>` +
        `K/BB: ${d.KBB.toFixed(2)}<br>` +
        `FIP: ${d.FIP.toFixed(2)}<br>` +
        `IP: ${d.IP.toFixed(1)}`
      );
  }

  tooltipPlayer
    .style("left", event.pageX + 15 + "px")
    .style("top",  event.pageY - 15 + "px");
}

function updateHighlight(circles, lockedDatum) {
  circles
    .attr("opacity", d => lockedDatum && d !== lockedDatum ? 0.3 : 1)
    .attr("stroke",  d => d === lockedDatum ? "#facc15" : "#0f172a")
    .attr("stroke-width", d => d === lockedDatum ? 3 : 1.2);
}

function setEraButtons(btn) {
  document.querySelectorAll(".era-group .toggle-btn")
    .forEach(b => b.classList.remove("era-active"));
  btn.classList.add("era-active");
}

// Player view buttons
btnHitters.addEventListener("click", () => {
  currentView = "hitters";
  btnHitters.classList.add("active");
  btnPitchers.classList.remove("active");
  drawPlayerScatter();
});

btnPitchers.addEventListener("click", () => {
  currentView = "pitchers";
  btnPitchers.classList.add("active");
  btnHitters.classList.remove("active");
  drawPlayerScatter();
});

// Era buttons
document.getElementById("era-all").addEventListener("click", (event) => {
  currentEra = "all";
  setEraButtons(event.target);
  drawPlayerScatter();
});
document.getElementById("era-expansion").addEventListener("click", (event) => {
  currentEra = "expansion";
  setEraButtons(event.target);
  drawPlayerScatter();
});
document.getElementById("era-steroid").addEventListener("click", (event) => {
  currentEra = "steroid";
  setEraButtons(event.target);
  drawPlayerScatter();
});
document.getElementById("era-modern").addEventListener("click", (event) => {
  currentEra = "modern";
  setEraButtons(event.target);
  drawPlayerScatter();
});


/*********************************************
 * TEAM AGE vs PERFORMANCE VISUAL (BOTTOM)
 *********************************************/

const teamSvg = d3.select("#team-viz");
const teamWidth = +teamSvg.attr("width");
const teamHeight = +teamSvg.attr("height");

const teamMargin = { top: 40, right: 30, bottom: 60, left: 75 };
const teamInnerWidth = teamWidth - teamMargin.left - teamMargin.right;
const teamInnerHeight = teamHeight - teamMargin.top - teamMargin.bottom;

const teamG = teamSvg.append("g")
  .attr("transform", `translate(${teamMargin.left},${teamMargin.top})`);

const teamXScale = d3.scaleLinear().range([0, teamInnerWidth]);
const teamYScale = d3.scaleLinear().range([teamInnerHeight, 0]);

const teamXAxisG = teamG.append("g")
  .attr("transform", `translate(0,${teamInnerHeight})`)
  .attr("font-size", "16px");

const teamYAxisG = teamG.append("g")
  .attr("font-size", "16px");

teamG.append("text")
  .attr("x", teamInnerWidth / 2)
  .attr("y", teamInnerHeight + 45)
  .attr("text-anchor", "middle")
  .style("font-size", "18px")
  .text("Average Team Age");

const teamYLabel = teamG.append("text")
  .attr("transform", "rotate(-90)")
  .attr("x", -teamInnerHeight / 2)
  .attr("y", -55)
  .attr("text-anchor", "middle")
  .style("font-size", "18px")
  .text("Runs per Game");

const teamLineGroup = teamG.append("path")
  .attr("fill", "none")
  .attr("stroke", "#4287f5")
  .attr("stroke-width", 3);

const teamPointsGroup = teamG.append("g");
const teamAnnotationGroup = teamG.append("g").attr("class", "annotation");

const teamTooltip = d3.select("#team-tooltip");

let teamMetric = "runs_per_game";
let teamData = [];
let teamExtents = { runs_per_game: [0, 0], win_pct: [0, 0] };

d3.csv("team_age_performance.csv", d3.autoType).then(data => {
  teamData = data;

  teamExtents = {
    runs_per_game: d3.extent(teamData, d => d.runs_per_game),
    win_pct:       d3.extent(teamData, d => d.win_pct)
  };

  teamYScale.domain(teamExtents.runs_per_game);
  teamYAxisG.call(d3.axisLeft(teamYScale));

  setupTeamControls();
  drawTeamChart();
});

function setupTeamControls() {
  document.getElementById("btn-runs").onclick = () => {
    teamMetric = "runs_per_game";
    document.getElementById("btn-runs").classList.add("active");
    document.getElementById("btn-wins").classList.remove("active");
    teamYLabel.text("Runs per Game");
    teamYScale.domain(teamExtents.runs_per_game);
    teamYAxisG.call(d3.axisLeft(teamYScale));
    drawTeamChart();
  };

  document.getElementById("btn-wins").onclick = () => {
    teamMetric = "win_pct";
    document.getElementById("btn-wins").classList.add("active");
    document.getElementById("btn-runs").classList.remove("active");
    teamYLabel.text("Win Percentage");
    teamYScale.domain(teamExtents.win_pct);
    teamYAxisG.call(d3.axisLeft(teamYScale));
    drawTeamChart();
  };

  document.getElementById("era-select").onchange = drawTeamChart;
}

function filterTeamByEra() {
  const era = document.getElementById("era-select").value;
  let start = 1970, end = 2015;

  if (era === "1970-1989") { start = 1970; end = 1989; }
  else if (era === "1990-2009") { start = 1990; end = 2009; }
  else if (era === "2010-2015") { start = 2010; end = 2015; }

  return teamData.filter(d => d.yearID >= start && d.yearID <= end);
}

function aggregateTeamData(data) {
  const grouped = d3.rollups(
    data,
    v => ({
      runs_per_game: d3.mean(v, d => d.runs_per_game),
      win_pct:       d3.mean(v, d => d.win_pct),
      count:         v.length
    }),
    d => Math.round(d.avg_age)
  );

  return grouped
    .map(([age, vals]) => ({ age, ...vals }))
    .sort((a, b) => a.age - b.age);
}

function drawTeamChart() {
  const data = aggregateTeamData(filterTeamByEra());
  if (!data.length) return;

  const ages = data.map(d => d.age);
  const minAge = d3.min(ages);
  const maxAge = d3.max(ages);

  teamXScale.domain([minAge - 0.3, maxAge + 0.3]);

  teamXAxisG.call(
    d3.axisBottom(teamXScale)
      .tickValues(ages)
  );

  const line = d3.line()
    .x(d => teamXScale(d.age))
    .y(d => teamYScale(d[teamMetric]))
    .curve(d3.curveMonotoneX);

  teamLineGroup.datum(data)
    .transition().duration(400)
    .attr("d", line);

  const pts = teamPointsGroup.selectAll("circle")
    .data(data, d => d.age);

  pts.exit().remove();

  pts.enter().append("circle")
    .attr("r", 8)
    .attr("fill", "#4287f5")
    .merge(pts)
    .transition().duration(250)
    .attr("cx", d => teamXScale(d.age))
    .attr("cy", d => teamYScale(d[teamMetric]));

  teamPointsGroup.selectAll("circle")
    .on("mousemove", (event, d) => {
      teamTooltip.style("opacity", 1)
        .html(
          `<strong>Age ${d.age}</strong><br>` +
          `Runs/Game: ${d.runs_per_game.toFixed(2)}<br>` +
          `Win %: ${d.win_pct.toFixed(3)}<br>` +
          `Teams: ${d.count}`
        )
        .style("left", event.pageX + 12 + "px")
        .style("top",  event.pageY - 35 + "px");
    })
    .on("mouseout", () => teamTooltip.style("opacity", 0));

  drawTeamAnnotation(data);
}

function drawTeamAnnotation(data) {
  teamAnnotationGroup.selectAll("*").remove();
  if (!data.length) return;

  let peak = data[0];
  for (const d of data) {
    if (d[teamMetric] > peak[teamMetric]) peak = d;
  }

  const x = teamXScale(peak.age);
  const y = teamYScale(peak[teamMetric]);
  const labelY = y - 40;

  teamAnnotationGroup.append("line")
    .attr("class", "annotation-line")
    .attr("x1", x)
    .attr("y1", y)
    .attr("x2", x)
    .attr("y2", labelY);

  const tag = teamMetric === "runs_per_game"
    ? `Peak offense ≈ age ${peak.age}`
    : `Peak winning ≈ age ${peak.age}`;

  teamAnnotationGroup.append("text")
    .attr("class", "annotation-text")
    .attr("x", x)
    .attr("y", labelY - 5)
    .attr("text-anchor", "middle")
    .text(tag);
}
