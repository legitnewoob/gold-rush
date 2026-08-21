import path from "node:path";
import { getConfig } from "./src/config.js";
import { loadEnvFile } from "./src/env.js";
import {
  loadStoredHistory,
  mergeHistoryEntries,
  saveStoredHistory,
  toSortedEntries,
} from "./src/history-store.js";
import { buildCombinedTelegramMessage } from "./src/message.js";
import { startDailyScheduler } from "./src/scheduler.js";
import { buildSummary } from "./src/summary.js";
import { fetchTanishqRates } from "./src/tanishq.js";
import { sendTelegramMessage, sendTelegramPhoto } from "./src/telegram.js";
import { buildLineChartUrl } from "./src/chart.js";
import { pollTelegramCommands, setTelegramCommands } from "./src/bot.js";

const CHART_COMMAND_PATTERN = /^\/chart(?:@\w+)?(?:\s+(\d+))?\s*$/;
const RATES_COMMAND_PATTERN = /^\/rates(?:@\w+)?\s*$/;
const HELP_COMMAND_PATTERN = /^\/(?:help|start)(?:@\w+)?\s*$/;
const DEFAULT_CHART_DAYS = 30;

const BOT_COMMANDS = [
  { command: "rates", description: "Latest gold rate summary (today, change, monthly/yearly highs & lows)" },
  { command: "chart", description: "30-day rate chart — add a number for a custom window, e.g. /chart 90" },
  { command: "help", description: "List available commands" },
];

loadEnvFile();

const config = getConfig();
process.env.TZ = config.timezone;

async function fetchAndSaveVariant(variant) {
  const snapshot = await fetchTanishqRates({ variant, grams: config.grams });

  const dataFile = path.join(config.dataDir, `rates_${variant}k.json`);
  const storedHistory = loadStoredHistory(dataFile);
  const mergedHistory = mergeHistoryEntries(storedHistory, snapshot.history);

  const latestSnapshotEntry = [...snapshot.history].sort((left, right) => right.date.localeCompare(left.date))[0];
  mergedHistory[latestSnapshotEntry.date] = {
    rate: snapshot.current.todayRate,
    source: "tanishq",
    observedAt: snapshot.fetchedAt,
  };

  saveStoredHistory(dataFile, mergedHistory);

  const sortedEntries = toSortedEntries(mergedHistory);

  const summary = buildSummary({
    currentSnapshot: snapshot,
    historyEntries: sortedEntries,
    timezone: config.timezone,
  });

  return { summary, entries: sortedEntries };
}

async function runOnce() {
  const results = await Promise.all(config.variants.map(fetchAndSaveVariant));
  const summaries = results.map((r) => r.summary);

  const message = buildCombinedTelegramMessage(summaries);
  await sendTelegramMessage({
    token: config.telegramBotToken,
    chatId: config.telegramChatId,
    text: message,
  });

  const date = summaries[0].formatDateShort(summaries[0].date);
  console.log(`Sent Telegram message for ${date} (${config.variants.join("K, ")}K).`);
}

function loadCurrentSeries() {
  return config.variants.map((variant) => {
    const dataFile = path.join(config.dataDir, `rates_${variant}k.json`);
    return { label: `${variant}K`, entries: toSortedEntries(loadStoredHistory(dataFile)) };
  });
}

function buildSummaryFromStore(variant) {
  const dataFile = path.join(config.dataDir, `rates_${variant}k.json`);
  const entries = toSortedEntries(loadStoredHistory(dataFile));
  if (entries.length === 0) {
    throw new Error(`No stored data for ${variant}K yet.`);
  }

  const latest = entries[entries.length - 1];
  return buildSummary({
    currentSnapshot: {
      variant,
      grams: config.grams,
      current: { todayRate: latest.rate, yesterdayRate: latest.rate },
    },
    historyEntries: entries,
    timezone: config.timezone,
  });
}

function buildHelpMessage() {
  return ["<b>Available commands</b>", "", ...BOT_COMMANDS.map((c) => `/${c.command} — ${c.description}`)].join("\n");
}

async function handleTelegramCommand(text, chatId) {
  const chartMatch = CHART_COMMAND_PATTERN.exec(text);
  if (chartMatch) {
    const days = chartMatch[1] ? Number(chartMatch[1]) : DEFAULT_CHART_DAYS;
    const chartUrl = buildLineChartUrl({ series: loadCurrentSeries(), days });
    await sendTelegramPhoto({ token: config.telegramBotToken, chatId, photoUrl: chartUrl });
    console.log(`Sent on-demand ${days}-day chart to chat ${chatId}.`);
    return;
  }

  if (RATES_COMMAND_PATTERN.test(text)) {
    const summaries = config.variants.map(buildSummaryFromStore);
    const message = buildCombinedTelegramMessage(summaries);
    await sendTelegramMessage({ token: config.telegramBotToken, chatId, text: message });
    console.log(`Sent on-demand rates to chat ${chatId}.`);
    return;
  }

  if (HELP_COMMAND_PATTERN.test(text)) {
    await sendTelegramMessage({ token: config.telegramBotToken, chatId, text: buildHelpMessage() });
    console.log(`Sent help to chat ${chatId}.`);
  }
}

async function main() {
  const sendNow = process.argv.includes("--send-now");

  if (sendNow) {
    await runOnce();
    return;
  }

  if (config.sendOnStart) {
    await runOnce();
  }

  startDailyScheduler(config.schedule, runOnce);

  await setTelegramCommands({ token: config.telegramBotToken, commands: BOT_COMMANDS }).catch((error) =>
    console.error("Failed to register Telegram command suggestions:", error.message),
  );

  pollTelegramCommands({
    token: config.telegramBotToken,
    chatId: config.telegramChatId,
    onCommand: handleTelegramCommand,
  }).catch((error) => console.error("Telegram command polling stopped:", error));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
