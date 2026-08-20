import test from "node:test";
import assert from "node:assert/strict";

import { buildTelegramMessage, buildCombinedTelegramMessage } from "../src/message.js";
import { buildSummary } from "../src/summary.js";
import { parseTanishqGoldRatePage } from "../src/tanishq.js";

const sampleHtml = `
  <html>
    <body>
      <h3>22 Kt Gold Rate</h3>
      <table>
        <tr><th>Grammage</th><th>Today</th><th>Yesterday</th></tr>
        <tr><td>1 G</td><td>₹ 14645 +395 (+2.77%)</td><td>₹ 14250 -85 (-0.59%)</td></tr>
        <tr><td>10 G</td><td>₹ 146450 +3950 (+2.77%)</td><td>₹ 142500 -850 (-0.59%)</td></tr>
      </table>
      <h3>Gold Rate History</h3>
      <table>
        <tr><td>20-08-2026</td><td>₹ 14645</td></tr>
        <tr><td>19-08-2026</td><td>₹ 14250</td></tr>
        <tr><td>10-08-2026</td><td>₹ 13975</td></tr>
        <tr><td>29-07-2026</td><td>₹ 13200</td></tr>
      </table>
      <h3>Gold Rate Trends</h3>
    </body>
  </html>
`;

test("parseTanishqGoldRatePage extracts current rates and history", () => {
  const parsed = parseTanishqGoldRatePage(sampleHtml, { variant: 22, grams: 1 });

  assert.equal(parsed.current.todayRate, 14645);
  assert.equal(parsed.current.yesterdayRate, 14250);
  assert.equal(parsed.current.todayDeltaPercent, "+2.77%");
  assert.equal(parsed.history[0].date, "2026-08-20");
  assert.equal(parsed.history[3].rate, 13200);
});

test("buildSummary computes trend and monthly low", () => {
  const parsed = parseTanishqGoldRatePage(sampleHtml, { variant: 22, grams: 1 });
  const summary = buildSummary({
    currentSnapshot: parsed,
    historyEntries: parsed.history,
    timezone: "Asia/Kolkata",
  });

  assert.equal(summary.trend, "up");
  assert.equal(summary.hasFullYearData, false);
  assert.ok(summary.monthLow);
  assert.ok(summary.yearLow);
});

test("buildCombinedTelegramMessage shows color circles and rates", () => {
  const parsed = parseTanishqGoldRatePage(sampleHtml, { variant: 22, grams: 1 });
  const summary = buildSummary({
    currentSnapshot: parsed,
    historyEntries: parsed.history,
    timezone: "Asia/Kolkata",
  });
  const message = buildCombinedTelegramMessage([summary]);

  assert.match(message, /🟢/);
  assert.match(message, /22K/);
  assert.match(message, /\+2\.77%/);
  assert.match(message, /This month/);
  // Year low hidden until hasFullYearData
  assert.doesNotMatch(message, /This year/);
});
