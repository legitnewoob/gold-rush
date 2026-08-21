function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function trendColor(trend) {
  if (trend === "up") return "🟢";
  if (trend === "down") return "🔴";
  return "⚪";
}

function trendChart(trend) {
  if (trend === "up") return "📈";
  if (trend === "down") return "📉";
  return "➡️";
}

function formatChange(summary) {
  const changeSign = summary.delta > 0 ? "+" : "";
  const numericPercent = Number.parseFloat(summary.deltaPercent);
  const percentSign = numericPercent > 0 ? "+" : "";
  const formattedPercent = `${percentSign}${Math.abs(numericPercent).toFixed(2)}%`;
  return `${changeSign}${escapeHtml(summary.formatCurrency(summary.delta))} (${escapeHtml(formattedPercent)})`;
}

export function buildTelegramMessage(summary) {
  const color = trendColor(summary.trend);
  const chart = trendChart(summary.trend);

  const monthLowLabel = summary.monthCoverage
    ? `Monthly Low (${summary.monthCoverage})`
    : "Monthly Low";
  const monthHighLabel = summary.monthCoverage
    ? `Monthly High (${summary.monthCoverage})`
    : "Monthly High";

  const lines = [
    `${color} ${chart} <b>Tanishq ${summary.variant}K Gold Rate</b>`,
    escapeHtml(summary.formatDateShort(summary.date)),
    "",
    `<b>Today</b>: ${escapeHtml(summary.formatCurrency(summary.todayRate))} / ${summary.grams}g`,
    `<b>Yesterday</b>: ${escapeHtml(summary.formatCurrency(summary.yesterdayRate))} / ${summary.grams}g`,
    `${color} <b>Change</b>: ${formatChange(summary)}`,
    "",
    `<b>${escapeHtml(monthLowLabel)}</b>: ${escapeHtml(summary.formatCurrency(summary.monthLow.rate))} ${escapeHtml(summary.formatDateCompact(summary.monthLow.date))}`,
    `<b>${escapeHtml(monthHighLabel)}</b>: ${escapeHtml(summary.formatCurrency(summary.monthHigh.rate))} ${escapeHtml(summary.formatDateCompact(summary.monthHigh.date))}`,
  ];

  if (summary.hasFullYearData) {
    const yearHighLabel = summary.yearCoverage ? `Yearly High (${summary.yearCoverage})` : "Yearly High";
    lines.push(
      `<b>${escapeHtml(yearHighLabel)}</b>: ${escapeHtml(summary.formatCurrency(summary.yearHigh.rate))} ${escapeHtml(summary.formatDateCompact(summary.yearHigh.date))}`,
    );
  }

  return lines.join("\n");
}

export function buildCombinedTelegramMessage(summaries) {
  if (summaries.length === 0) throw new Error("No summaries provided.");

  const date = summaries[0].formatDateShort(summaries[0].date);

  // Notification preview line: "🟢24K 🔴22K" — visible without opening the message
  const notifLine = summaries.map((s) => `${trendColor(s.trend)}${trendChart(s.trend)} ${s.variant}K`).join("   ");

  const rateLines = summaries.map((s) => {
    const color = trendColor(s.trend);
    return [
      `${color} <b>${s.variant}K</b>: ${escapeHtml(s.formatCurrency(s.todayRate))}/${s.grams}g`,
      `  └ ${formatChange(s)}`,
    ].join("\n");
  });

  const monthLowLines = summaries.map((s) => {
    const label = s.monthCoverage ? ` (${s.monthCoverage})` : "";
    return `${s.variant}K: ${escapeHtml(s.formatCurrency(s.monthLow.rate))} ${escapeHtml(s.formatDateCompact(s.monthLow.date))}${label}`;
  });

  const monthHighLines = summaries.map((s) => {
    const label = s.monthCoverage ? ` (${s.monthCoverage})` : "";
    return `${s.variant}K: ${escapeHtml(s.formatCurrency(s.monthHigh.rate))} ${escapeHtml(s.formatDateCompact(s.monthHigh.date))}${label}`;
  });

  const showYearData = summaries.some((s) => s.hasFullYearData);
  const yearLowLines = showYearData
    ? summaries
        .filter((s) => s.hasFullYearData)
        .map((s) => {
          const label = s.yearCoverage ? ` (${s.yearCoverage})` : "";
          return `${s.variant}K: ${escapeHtml(s.formatCurrency(s.yearLow.rate))} ${escapeHtml(s.formatDateCompact(s.yearLow.date))}${label}`;
        })
    : [];
  const yearHighLines = showYearData
    ? summaries
        .filter((s) => s.hasFullYearData)
        .map((s) => {
          const label = s.yearCoverage ? ` (${s.yearCoverage})` : "";
          return `${s.variant}K: ${escapeHtml(s.formatCurrency(s.yearHigh.rate))} ${escapeHtml(s.formatDateCompact(s.yearHigh.date))}${label}`;
        })
    : [];

  return [
    `${notifLine}`,
    `<b>Tanishq Gold — ${escapeHtml(date)}</b>`,
    "",
    ...rateLines,
    "",
    `<b>This month's low</b>`,
    ...monthLowLines,
    "",
    `<b>This month's high</b>`,
    ...monthHighLines,
    ...(showYearData ? ["", "<b>This year's low</b>", ...yearLowLines] : []),
    ...(showYearData ? ["", "<b>This year's high</b>", ...yearHighLines] : []),
  ].join("\n");
}
