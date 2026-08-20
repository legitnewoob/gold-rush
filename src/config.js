import path from "node:path";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseScheduleTime(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    throw new Error("SCHEDULE_TIME must be in HH:MM 24-hour format.");
  }

  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
    raw: value,
  };
}

function parsePositiveInteger(name, fallback) {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

export function getConfig() {
  const schedule = parseScheduleTime(process.env.SCHEDULE_TIME?.trim() || "09:00");
  const timezone = process.env.TIMEZONE?.trim() || "Asia/Kolkata";
  const variantsRaw = process.env.TANISHQ_VARIANTS?.trim() || process.env.TANISHQ_VARIANT?.trim() || "24,22";
  const variants = variantsRaw.split(",").map((v) => {
    const n = Number(v.trim());
    if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid karat in TANISHQ_VARIANTS: ${v}`);
    return n;
  });
  const grams = parsePositiveInteger("TANISHQ_GRAMS", 1);
  const sendOnStart = (process.env.SEND_ON_START?.trim() || "false").toLowerCase() === "true";

  return {
    telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
    telegramChatId: required("TELEGRAM_CHAT_ID"),
    schedule,
    timezone,
    variants,
    grams,
    sendOnStart,
    dataDir: path.resolve(process.env.DATA_DIR?.trim() || "./data"),
  };
}
