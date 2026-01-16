// Minimal Slack bot using @slack/bolt that posts to the Holoplax integration endpoint.
// Requires env: SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, DISCORD_INTEGRATION_TOKEN (shared), DISCORD_INTEGRATION_URL or SLACK_INTEGRATION_URL.

/* eslint-disable @typescript-eslint/no-var-requires */
const { App } = require("@slack/bolt");

const {
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  SLACK_APP_TOKEN,
  SLACK_INTEGRATION_URL,
  DISCORD_INTEGRATION_URL,
  DISCORD_INTEGRATION_TOKEN,
} = process.env;

const integrationUrl = SLACK_INTEGRATION_URL || DISCORD_INTEGRATION_URL;

if (!SLACK_BOT_TOKEN || !SLACK_SIGNING_SECRET || !integrationUrl || !DISCORD_INTEGRATION_TOKEN) {
  console.error(
    "Missing env: SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, DISCORD_INTEGRATION_TOKEN, SLACK_INTEGRATION_URL/DISCORD_INTEGRATION_URL",
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
    const res = await fetch(integrationUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DISCORD_INTEGRATION_TOKEN}`,
      },
      body: JSON.stringify({
        title,
        description,
        points: Number.isFinite(points) && points > 0 ? points : undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `API error ${res.status}`);
    }
    const data = await res.json();
    await respond(`タスクを作成しました: ${title} (id: ${data.taskId ?? "N/A"})`);
  } catch (error) {
    console.error("failed to create task", error);
    await respond(`失敗しました: ${error.message}`);
  }
});

(async () => {
  await app.start(process.env.PORT || 3001);
  console.log("Slack bot is running");
})();
