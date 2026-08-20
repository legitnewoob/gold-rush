import fs from "node:fs";
import path from "node:path";

export function loadStoredHistory(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw);
  return typeof parsed === "object" && parsed ? parsed : {};
}

export function saveStoredHistory(filePath, historyByDate) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(historyByDate, null, 2)}\n`, "utf8");
}

export function mergeHistoryEntries(existingHistory, entries) {
  const merged = { ...existingHistory };

  for (const entry of entries) {
    merged[entry.date] = {
      rate: entry.rate,
      source: entry.source || "tanishq",
      observedAt: entry.observedAt || new Date().toISOString(),
    };
  }

  return merged;
}

export function toSortedEntries(historyByDate) {
  return Object.entries(historyByDate)
    .map(([date, value]) => ({
      date,
      rate: value.rate,
      source: value.source,
      observedAt: value.observedAt,
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}
