const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];

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
    return {
      label: s.label,
      data: labels.map((date) => rateByDate.get(date) ?? null),
      borderColor: SERIES_COLORS[i % SERIES_COLORS.length],
      backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length],
      fill: false,
      spanGaps: true,
      tension: 0.2,
      pointRadius: 2,
      borderWidth: 2,
    };
  });

  const config = {
    type: "line",
    data: {
      labels: labels.map(formatAxisDate),
      datasets,
    },
    options: {
      title: {
        display: true,
        text: `Gold Rate — Last ${days} Days`,
      },
      legend: {
        display: datasets.length > 1,
        position: "bottom",
      },
      scales: {
        xAxes: [{ ticks: { autoSkip: true, maxTicksLimit: 8 } }],
        yAxes: [{ ticks: { beginAtZero: false } }],
      },
    },
  };

  const encoded = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?c=${encoded}&width=${width}&height=${height}&backgroundColor=white&format=png`;
}
