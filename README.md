# Gold Rush Telegram Bot

This bot fetches the daily gold rate from Tanishq, compares it with yesterday, calculates the lowest observed rate for the current month and year, and sends a formatted Telegram message at a fixed time every day.

## What it sends

- Today's Tanishq rate
- Yesterday's rate
- Up/down change in rupees and percent
- Lowest observed rate this month
- Highest observed rate this month
- Lowest observed rate this year
- Highest observed rate this year

The bot uses the official Tanishq gold rate page:

- https://www.tanishq.co.in/gold-rate.html

## Setup

1. Copy `.env.example` to `.env`
2. Fill in:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `SCHEDULE_TIME` in `HH:MM` 24-hour format
   - Optional: `SEND_ON_START=true` if you want one message immediately when the process starts
3. Start the bot:

```bash
npm start
```

To send a message immediately:

```bash
npm run send-now
```

## Telegram chat ID

You need the chat ID where the bot should post.

- For a direct chat, send a message to your bot first.
- For a group, add the bot to the group and send a message.
- Then get the chat ID from the Telegram Bot API `getUpdates` response.

Example:

```text
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

## Notes

- The bot stores fetched history in `data/rates.json`.
- Tanishq history available on the page may not always cover the full year. When that happens, the message labels the result as "available history since ...".
- The scheduler runs inside the Node process, so keep the process running with a process manager like `pm2`, `screen`, `tmux`, `systemd`, or a container restart policy.
- By default the bot waits for the next scheduled time. Use `SEND_ON_START=true` or `npm run send-now` if you want an immediate send.
