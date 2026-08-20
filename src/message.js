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

  return [
    `${color} ${chart} <b>Tanishq ${summary.variant}K Gold Rate</b>`,
    escapeHtml(summary.formatDateShort(summary.date)),
    "",
    `<b>Today</b>: ${escapeHtml(summary.formatCurrency(summary.todayRate))} / ${summary.grams}g`,
    `<b>Yesterday</b>: ${escapeHtml(summary.formatCurrency(summary.yesterdayRate))} / ${summary.grams}g`,
    `${color} <b>Change</b>: ${formatChange(summary)}`,
    "",
    `<b>${escapeHtml(monthLowLabel)}</b>: ${escapeHtml(summary.formatCurrency(summary.monthLow.rate))} on ${escapeHtml(summary.formatDateCompact(summary.monthLow.date))}`,
  ].join("\n");
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
    return `${s.variant}K: ${escapeHtml(s.formatCurrency(s.monthLow.rate))} on ${escapeHtml(s.formatDateCompact(s.monthLow.date))}${label}`;
  });

  const showYearLow = summaries.some((s) => s.hasFullYearData);
  const yearLowLines = showYearLow
    ? summaries
        .filter((s) => s.hasFullYearData)
        .map((s) => {
          const label = s.yearCoverage ? ` (${s.yearCoverage})` : "";
          return `${s.variant}K: ${escapeHtml(s.formatCurrency(s.yearLow.rate))} on ${escapeHtml(s.formatDateCompact(s.yearLow.date))}${label}`;
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
    ...(showYearLow ? ["", "<b>This year's low</b>", ...yearLowLines] : []),
  ].join("\n");
}
