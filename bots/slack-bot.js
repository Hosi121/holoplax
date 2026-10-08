// Minimal Slack bot using @slack/bolt that posts to the Holoplax integration endpoint.
// Requires Slack credentials plus a Holoplax shared integration token.

/* eslint-disable @typescript-eslint/no-require-imports */
const { App } = require("@slack/bolt");
const crypto = require("crypto");

const {
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  SLACK_APP_TOKEN,
  SLACK_TASK_URL = "http://localhost:3000/api/integrations/discord/task",
  SLACK_INTEGRATION_TOKEN,
  DISCORD_INTEGRATION_TOKEN,
  INTEGRATION_SIGNING_SECRET,
  DISCORD_SIGNING_SECRET,
} = process.env;

const integrationToken = SLACK_INTEGRATION_TOKEN || DISCORD_INTEGRATION_TOKEN;
const signingSecret = INTEGRATION_SIGNING_SECRET || DISCORD_SIGNING_SECRET;

if (!SLACK_BOT_TOKEN || !SLACK_SIGNING_SECRET || !integrationToken) {
  console.error(
    "Missing env: SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_INTEGRATION_TOKEN (or DISCORD_INTEGRATION_TOKEN)",
  );
  process.exit(1);
}

const app = new App({
  token: SLACK_BOT_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
  appToken: SLACK_APP_TOKEN,
  socketMode: Boolean(SLACK_APP_TOKEN),
});

app.command("/holotask", async ({ ack, respond, command }) => {
  await ack();
  const text = command.text || "";
  const parts = text.split("|").map((p) => p.trim());
  const [title, description, pointsRaw] = parts;
  const points = Number(pointsRaw);
  try {
    const payload = JSON.stringify({
      title,
      description,
      points: Number.isFinite(points) && points > 0 ? points : undefined,
      author: command.user_name,
      channel: command.channel_name,
    });
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${integrationToken}`,
    };
    if (signingSecret) {
      const timestamp = String(Math.floor(Date.now() / 1000));
      headers["x-integration-timestamp"] = timestamp;
      headers["x-integration-signature"] = `v0=${crypto
        .createHmac("sha256", signingSecret)
        .update(`v0:${timestamp}:${payload}`)
        .digest("hex")}`;
    }
    const res = await fetch(SLACK_TASK_URL, {
      method: "POST",
      headers,
      body: payload,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `API error ${res.status}`);
    }
    const data = await res.json();
    if (!data.taskId) throw new Error("API response did not include taskId");
    await respond(`タスクを作成しました: ${title} (id: ${data.taskId})`);
  } catch (error) {
    console.error("failed to create task", error);
    await respond(`失敗しました: ${error.message}`);
  }
});

(async () => {
  await app.start(process.env.PORT || 3001);
  console.log("Slack bot is running");
})();
