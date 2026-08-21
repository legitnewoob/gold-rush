// Dark-surface categorical steps (validated pair) from the dataviz palette.
const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500"];
const SURFACE = "#161616";
const GRID_COLOR = "rgba(255,255,255,0.07)";
const AXIS_LABEL_COLOR = "#8a897f";
const TITLE_COLOR = "#f5f5f0";
const LEGEND_LABEL_COLOR = "#c3c2b7";

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function formatAxisDate(isoDate) {
  const [, month, day] = isoDate.split("-");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${monthNames[Number(month) - 1]}`;
}

function lastNDays(entries, days) {
  if (entries.length === 0) return [];
  const latestDate = entries[entries.length - 1].date;
  const cutoff = new Date(`${latestDate}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return entries.filter((entry) => entry.date >= cutoffIso);
}

export function buildLineChartUrl({ series, days = 30, width = 800, height = 400 }) {
  const windowed = series.map((s) => ({ label: s.label, entries: lastNDays(s.entries, days) }));

  const labelSet = new Set();
  for (const s of windowed) {
    for (const entry of s.entries) labelSet.add(entry.date);
  }
  const labels = [...labelSet].sort();

  const datasets = windowed.map((s, i) => {
    const rateByDate = new Map(s.entries.map((e) => [e.date, e.rate]));
    const color = SERIES_COLORS[i % SERIES_COLORS.length];
    return {
      label: s.label,
      data: labels.map((date) => rateByDate.get(date) ?? null),
      borderColor: color,
      backgroundColor: hexToRgba(color, 0.18),
      fill: true,
      spanGaps: true,
      tension: 0.35,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 2.5,
    };
  });

  const config = {
    type: "line",
    data: {
      labels: labels.map(formatAxisDate),
      datasets,
    },
    options: {
      layout: { padding: 16 },
      title: {
        display: true,
        text: `Gold Rate — Last ${days} Days`,
        fontColor: TITLE_COLOR,
        fontSize: 18,
        fontStyle: "bold",
        padding: 16,
      },
      legend: {
        display: datasets.length > 1,
        position: "bottom",
        labels: { fontColor: LEGEND_LABEL_COLOR, fontSize: 13, boxWidth: 14 },
      },
      scales: {
        xAxes: [
          {
            gridLines: { color: GRID_COLOR, zeroLineColor: GRID_COLOR, drawBorder: false },
            ticks: { autoSkip: true, maxTicksLimit: 8, fontColor: AXIS_LABEL_COLOR },
          },
        ],
        yAxes: [
          {
            gridLines: { color: GRID_COLOR, zeroLineColor: GRID_COLOR, drawBorder: false },
            ticks: { beginAtZero: false, fontColor: AXIS_LABEL_COLOR },
          },
        ],
      },
    },
  };

  const encoded = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?c=${encoded}&width=${width}&height=${height}&backgroundColor=${encodeURIComponent(SURFACE)}&format=png`;
}
