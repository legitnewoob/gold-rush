import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const TANISHQ_GOLD_RATE_URL ="https://www.tanishq.co.in/gold-rate.html?lang=en_IN";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_SCRIPT = path.resolve(__dirname, "../gold-rush-python/tanishq_gold_scraper.py");
const PYTHON_BIN = process.env.PYTHON_BIN || path.resolve(__dirname, "../gold-rush-python/.venv/bin/python");
function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#8377;|&rupee;/gi, "₹");
}

function stripHtmlToText(html) {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/(p|div|section|article|tr|table|ul|ol|li|h\d)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function toNumber(raw) {
  return Number(String(raw).replace(/[^\d.-]/g, ""));
}

function toIsoDate(ddmmyyyy) {
  const [day, month, year] = ddmmyyyy.split("-");
  return `${year}-${month}-${day}`;
}

function parseCurrentTable(text, variant, grams) {
  const startIndex = text.indexOf(`${variant} Kt Gold Rate`);
  if (startIndex === -1) {
    throw new Error(`Could not find ${variant} Kt Gold Rate section in Tanishq response.`);
  }

  const historyIndex = text.indexOf("Gold Rate History", startIndex);
  const section = historyIndex === -1 ? text.slice(startIndex) : text.slice(startIndex, historyIndex);
  const compact = section.replace(/\s+/g, " ");

  const rowPattern = new RegExp(
    `${grams}\\s*G\\s*[|:]?\\s*₹\\s*([\\d,]+)\\s*([+-]?[\\d,]+|0)\\s*\\(([-+]?\\d+(?:\\.\\d+)?%)\\)\\s*[|:]?\\s*₹\\s*([\\d,]+)\\s*([+-]?[\\d,]+|0)\\s*\\(([-+]?\\d+(?:\\.\\d+)?%)\\)`,
    "i"
  );

  const match = compact.match(rowPattern);
  if (!match) {
    throw new Error(`Could not parse the ${grams}g row from the ${variant} Kt table.`);
  }

  return {
    grams,
    todayRate: toNumber(match[1]),
    todayDelta: toNumber(match[2]),
    todayDeltaPercent: match[3],
    yesterdayRate: toNumber(match[4]),
    yesterdayDelta: toNumber(match[5]),
    yesterdayDeltaPercent: match[6],
  };
}

function parseHistory(text) {
  const startIndex = text.indexOf("Gold Rate History");
  if (startIndex === -1) {
    throw new Error("Could not find the Gold Rate History section in Tanishq response.");
  }

  const endIndex = text.indexOf("Gold Rate Trends", startIndex);
  const section = endIndex === -1 ? text.slice(startIndex) : text.slice(startIndex, endIndex);

  const entries = [];
  const rowPattern = /(\d{2}-\d{2}-\d{4})\s*[|:]?\s*₹\s*([\d,]+)/g;

  for (const match of section.matchAll(rowPattern)) {
    entries.push({
      date: toIsoDate(match[1]),
      rate: toNumber(match[2]),
      source: "tanishq",
      observedAt: new Date().toISOString(),
    });
  }

  if (entries.length === 0) {
    throw new Error("Could not parse any history rows from the Tanishq page.");
  }

  return entries;
}

export function parseTanishqGoldRatePage(html, { variant, grams }) {
  const text = stripHtmlToText(html);
  const current = parseCurrentTable(text, variant, grams);
  const history = parseHistory(text);

  const latestHistory = [...history].sort((left, right) => right.date.localeCompare(left.date))[0];
  if (latestHistory.rate !== current.todayRate) {
    history.push({
      date: new Date().toISOString().slice(0, 10),
      rate: current.todayRate,
      source: "tanishq",
      observedAt: new Date().toISOString(),
    });
  }

  return {
    fetchedAt: new Date().toISOString(),
    url: TANISHQ_GOLD_RATE_URL,
    variant,
    grams,
    current,
    history,
  };
}

function runPythonScraper({ variant, grams }) {
  return new Promise((resolve, reject) => {
    execFile(PYTHON_BIN, [PYTHON_SCRIPT, "--json", "--karat", String(variant), "--grams", String(grams)], (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Python scraper failed: ${stderr || error.message}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Failed to parse Python scraper output: ${stdout.slice(0, 200)}`));
      }
    });
  });
}

function transformPythonOutput(pyData, { variant, grams }) {
  const grammageLabel = `${grams} G`;
  const karatLabel = `${variant} Kt Gold Rate`;
  const row = pyData.current.find((r) => r.grammage === grammageLabel && r.karat_label === karatLabel);
  if (!row) {
    const available = [...new Set(pyData.current.map((r) => r.karat_label))].join(", ");
    throw new Error(`Could not find ${grams}g row for "${karatLabel}". Available: ${available}`);
  }

  const todayDeltaMatch = row.today_raw.match(/([+-]?[\d,]+)\s*\(([-+]?\d+(?:\.\d+)?%)\)/);
  const todayDelta = todayDeltaMatch ? toNumber(todayDeltaMatch[1]) : 0;
  const todayDeltaPercent = todayDeltaMatch ? todayDeltaMatch[2] : "0%";

  const ydeltaMatch = row.yesterday_raw.match(/([+-]?[\d,]+)\s*\(([-+]?\d+(?:\.\d+)?%)\)/);
  const yesterdayDelta = ydeltaMatch ? toNumber(ydeltaMatch[1]) : 0;
  const yesterdayDeltaPercent = ydeltaMatch ? ydeltaMatch[2] : "0%";

  const history = pyData.history.map((h) => ({
    date: toIsoDate(h.date),
    rate: h.rate,
    source: "tanishq",
    observedAt: pyData.fetchedAt,
  }));

  const latestHistory = [...history].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (latestHistory.rate !== row.today_price) {
    history.push({
      date: new Date().toISOString().slice(0, 10),
      rate: row.today_price,
      source: "tanishq",
      observedAt: pyData.fetchedAt,
    });
  }

  return {
    fetchedAt: pyData.fetchedAt,
    url: TANISHQ_GOLD_RATE_URL,
    variant,
    grams,
    current: {
      grams,
      todayRate: row.today_price,
      todayDelta,
      todayDeltaPercent,
      yesterdayRate: row.yesterday_price,
      yesterdayDelta,
      yesterdayDeltaPercent,
    },
    history,
  };
}

export async function fetchTanishqRates(options) {
  const pyData = await runPythonScraper(options);
  return transformPythonOutput(pyData, options);
}
