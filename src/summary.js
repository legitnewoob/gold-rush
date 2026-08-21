function formatDateShort(isoDate, timezone) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function formatDateCompact(isoDate, timezone) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    day: "2-digit",
    month: "short",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function getYesterdayIso(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function formatDateRelative(isoDate, todayIso, timezone) {
  if (isoDate === todayIso) {
    return "today";
  }
  if (isoDate === getYesterdayIso(todayIso)) {
    return "yesterday";
  }
  return `on ${formatDateCompact(isoDate, timezone)}`;
}

function formatCurrency(amount) {
  return `₹${new Intl.NumberFormat("en-IN").format(amount)}`;
}

function findLowest(entries) {
  return entries.reduce((lowest, entry) => {
    if (!lowest || entry.rate < lowest.rate) {
      return entry;
    }
    return lowest;
  }, null);
}

function findHighest(entries) {
  return entries.reduce((highest, entry) => {
    if (!highest || entry.rate > highest.rate) {
      return entry;
    }
    return highest;
  }, null);
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => left.date.localeCompare(right.date));
}

function getCoverageLabel(periodStartIso, earliestEntry, timezone) {
  if (!earliestEntry || earliestEntry.date <= periodStartIso) {
    return null;
  }

  return `available history since ${formatDateShort(earliestEntry.date, timezone)}`;
}

export function buildSummary({ currentSnapshot, historyEntries, timezone }) {
  const sorted = sortEntries(historyEntries);
  const latest = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;

  if (!latest) {
    throw new Error("No history entries are available.");
  }

  const effectiveYesterdayRate = previous?.rate ?? currentSnapshot.current.yesterdayRate;
  const todayRate = currentSnapshot.current.todayRate;
  const delta = todayRate - effectiveYesterdayRate;
  const deltaPercent = effectiveYesterdayRate
    ? ((delta / effectiveYesterdayRate) * 100).toFixed(2)
    : "0.00";

  const monthPrefix = latest.date.slice(0, 7);
  const yearPrefix = latest.date.slice(0, 4);
  const monthEntries = sorted.filter((entry) => entry.date.startsWith(monthPrefix));
  const yearEntries = sorted.filter((entry) => entry.date.startsWith(yearPrefix));
  const monthLow = findLowest(monthEntries);
  const yearLow = findLowest(yearEntries);
  const monthHigh = findHighest(monthEntries);
  const yearHigh = findHighest(yearEntries);

  const monthStart = `${monthPrefix}-01`;
  const yearStart = `${yearPrefix}-01-01`;
  const monthCoverage = getCoverageLabel(monthStart, monthEntries[0], timezone);
  const yearCoverage = getCoverageLabel(yearStart, yearEntries[0], timezone);

  // yearLow is only meaningful once we have data from the full calendar year start.
  // Show it only when our history covers back to Jan 1 of the current year.
  const hasFullYearData = yearEntries.length > 0 && yearEntries[0].date <= yearStart;

  return {
    variant: currentSnapshot.variant,
    grams: currentSnapshot.grams,
    date: latest.date,
    todayRate,
    yesterdayRate: effectiveYesterdayRate,
    delta,
    deltaPercent,
    trend: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
    monthLow,
    monthHigh,
    monthCoverage,
    yearLow,
    yearHigh,
    yearCoverage,
    hasFullYearData,
    formatCurrency,
    formatDateShort: (isoDate) => formatDateShort(isoDate, timezone),
    formatDateCompact: (isoDate) => formatDateRelative(isoDate, latest.date, timezone),
  };
}
