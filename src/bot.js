function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchUpdates(token, { offset, timeout = 0, limit }) {
  const params = new URLSearchParams();
  if (offset !== undefined) params.set("offset", String(offset));
  if (timeout) params.set("timeout", String(timeout));
  if (limit) params.set("limit", String(limit));

  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?${params}`);
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    const description = payload?.description || `HTTP ${response.status}`;
    throw new Error(`Telegram getUpdates failed: ${description}`);
  }

  return payload.result;
}

export async function setTelegramCommands({ token, commands }) {
  const response = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ commands }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    const description = payload?.description || `HTTP ${response.status}`;
    throw new Error(`Telegram setMyCommands failed: ${description}`);
  }

  return payload.result;
}

export async function pollTelegramCommands({ token, chatId, onCommand, log = console }) {
  let offset;

  // Skip any commands that arrived while the bot was offline.
  try {
    const pending = await fetchUpdates(token, { offset: -1, limit: 1 });
    if (pending.length > 0) {
      offset = pending[pending.length - 1].update_id + 1;
    }
  } catch (error) {
    log.error("Telegram polling: failed to fetch initial offset:", error.message);
  }

  for (;;) {
    let updates;
    try {
      updates = await fetchUpdates(token, { offset, timeout: 30 });
    } catch (error) {
      log.error("Telegram polling error:", error.message);
      await sleep(5000);
      continue;
    }

    for (const update of updates) {
      offset = update.update_id + 1;

      const text = update.message?.text?.trim();
      const fromChatId = update.message?.chat?.id;
      if (!text || fromChatId === undefined || String(fromChatId) !== String(chatId)) {
        continue;
      }

      try {
        await onCommand(text, fromChatId);
      } catch (error) {
        log.error("Telegram command handler error:", error.message);
      }
    }
  }
}
