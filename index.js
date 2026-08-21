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
import { pollTelegramCommands } from "./src/bot.js";

const CHART_COMMAND_PATTERN = /^\/chart(?:@\w+)?(?:\s+(\d+))?\s*$/;
const DEFAULT_CHART_DAYS = 30;

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

  const chartUrl = buildLineChartUrl({
    series: results.map((r) => ({ label: `${r.summary.variant}K`, entries: r.entries })),
    days: DEFAULT_CHART_DAYS,
  });
  await sendTelegramPhoto({
    token: config.telegramBotToken,
    chatId: config.telegramChatId,
    photoUrl: chartUrl,
  });

  const date = summaries[0].formatDateShort(summaries[0].date);
  console.log(`Sent Telegram message and chart for ${date} (${config.variants.join("K, ")}K).`);
}

function loadCurrentSeries() {
  return config.variants.map((variant) => {
    const dataFile = path.join(config.dataDir, `rates_${variant}k.json`);
    return { label: `${variant}K`, entries: toSortedEntries(loadStoredHistory(dataFile)) };
  });
}

async function handleTelegramCommand(text, chatId) {
  const match = CHART_COMMAND_PATTERN.exec(text);
  if (!match) return;

  const days = match[1] ? Number(match[1]) : DEFAULT_CHART_DAYS;
  const chartUrl = buildLineChartUrl({ series: loadCurrentSeries(), days });

  await sendTelegramPhoto({ token: config.telegramBotToken, chatId, photoUrl: chartUrl });
  console.log(`Sent on-demand ${days}-day chart to chat ${chatId}.`);
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
