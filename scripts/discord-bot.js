// Discord bot that watches specific channels and extracts tasks using LLM.
// Features: Rich extraction, slash commands, multiple channels, thread support, embed replies
// Usage: node scripts/discord-bot.js (requires env vars below and discord.js installed)

/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require("crypto");
const { Client, GatewayIntentBits, EmbedBuilder, ChannelType } = require("discord.js");

const {
  DISCORD_BOT_TOKEN,
  // Multiple channels support: comma-separated list
  DISCORD_WATCH_CHANNEL_IDS,
  // Backwards compatibility: single channel
  DISCORD_WATCH_CHANNEL_ID,
  DISCORD_INTEGRATION_URL = "http://localhost:3000/api/integrations/discord",
  DISCORD_TASK_URL = "http://localhost:3000/api/integrations/discord/task",
  DISCORD_INTEGRATION_TOKEN,
  // Optional HMAC signing secret for replay-protected requests (must match the
  // web app's DISCORD_SIGNING_SECRET). When unset, requests use token auth only.
  DISCORD_SIGNING_SECRET,
  OPENAI_API_KEY,
  // Optional: Web app URL for task links
  HOLOPLAX_WEB_URL = "http://localhost:3000",
} = process.env;

// POST a JSON payload to an integration endpoint with the shared bearer token
// and, when a signing secret is configured, an HMAC signature + timestamp that
// the server verifies (defense-in-depth against token leakage / replay).
async function postIntegration(url, payload) {
  const raw = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${DISCORD_INTEGRATION_TOKEN}`,
  };
  if (DISCORD_SIGNING_SECRET) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `v0=${crypto
      .createHmac("sha256", DISCORD_SIGNING_SECRET)
      .update(`v0:${timestamp}:${raw}`)
      .digest("hex")}`;
    headers["x-integration-timestamp"] = timestamp;
    headers["x-integration-signature"] = signature;
  }
  return fetch(url, { method: "POST", headers, body: raw });
}

// Parse watch channel IDs (supports both single and multiple)
const watchChannelIds = (() => {
  const multipleIds = (DISCORD_WATCH_CHANNEL_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (multipleIds.length > 0) return multipleIds;
  // Fallback to single channel for backwards compatibility
  if (DISCORD_WATCH_CHANNEL_ID) return [DISCORD_WATCH_CHANNEL_ID];
  return [];
})();

if (!DISCORD_BOT_TOKEN || !DISCORD_INTEGRATION_TOKEN) {
  console.error("Missing env: DISCORD_BOT_TOKEN, DISCORD_INTEGRATION_TOKEN");
  process.exit(1);
}

if (watchChannelIds.length === 0) {
  console.warn(
    "Warning: No watch channels configured (DISCORD_WATCH_CHANNEL_IDS or DISCORD_WATCH_CHANNEL_ID)",
  );
  console.warn("Bot will only respond to slash commands");
}

if (!OPENAI_API_KEY) {
  console.error("Missing env: OPENAI_API_KEY (required for task extraction)");
  process.exit(1);
}

// Urgency colors for embeds
const URGENCY_COLORS = {
  LOW: 0x28a745, // Green
  MEDIUM: 0xffc107, // Yellow
  HIGH: 0xdc3545, // Red
};

// Urgency labels for display
const URGENCY_LABELS = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

/**
 * Parse relative date strings to ISO format
 */
function parseDueDate(dueDateStr) {
  if (!dueDateStr) return null;

  const today = new Date();
  const str = dueDateStr.toLowerCase().trim();

  // Already in ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.split("T")[0];
  }

  // Relative dates (English)
  if (str === "today") {
    return today.toISOString().split("T")[0];
  }
  if (str === "tomorrow") {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  }
  if (str === "next week") {
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.toISOString().split("T")[0];
  }

  // Relative dates (Japanese)
  if (str.includes("今日")) {
    return today.toISOString().split("T")[0];
  }
  if (str.includes("明日")) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  }
  if (str.includes("明後日")) {
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);
    return dayAfter.toISOString().split("T")[0];
  }
  if (str.includes("来週")) {
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.toISOString().split("T")[0];
  }

  // Try parsing as date
  const parsed = new Date(dueDateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return null;
}

/**
 * Use LLM to determine if a message contains a task/todo item.
 * Returns { isTask: boolean, title?: string, dueDate?: string, urgency?: string, points?: number }
 */
async function analyzeMessage(content, threadContext = "") {
  const systemPrompt = `あなたはメッセージからタスクを抽出するアシスタントです。
ユーザーのメッセージを読んで、それがタスク・TODO・やるべきこと・依頼・作業項目を含むかどうか判断してください。

判断基準:
- 「〜する」「〜やる」「〜対応」「〜修正」「〜追加」などの行動を示す内容はタスク
- そうでない場合も、内容がタスクに見受けられる場合も追加
- 質問、雑談、感想、報告だけの場合はタスクではない
- 「〜してほしい」「〜お願い」などの依頼もタスク

期限の抽出:
- 「今日中」「今日まで」→ 今日の日付
- 「明日まで」「明日中」→ 明日の日付
- 「来週まで」→ 来週の日付
- 具体的な日付が書かれていればそれを使用
- 期限がなければ null

緊急度の判断:
- 「緊急」「急ぎ」「至急」「ASAP」「すぐに」→ HIGH
- 「できれば」「余裕があれば」「暇な時に」→ LOW
- それ以外 → MEDIUM

ポイント（複雑さ）の推定:
- 簡単な作業、5分以内 → 1
- 小さな作業、30分以内 → 2
- 通常の作業、1-2時間 → 3
- やや大きい作業、半日 → 5
- 大きな作業、1日 → 8
- 非常に大きな作業 → 13
- 不明な場合 → 3

JSON形式で回答してください:
{"isTask": true/false, "title": "タスクの場合は簡潔なタイトル(30文字以内)", "dueDate": "YYYY-MM-DD形式 or null", "urgency": "LOW/MEDIUM/HIGH", "points": 1/2/3/5/8/13/21/34}`;

  const userMessage = threadContext
    ? `スレッドの親メッセージ:\n${threadContext}\n\n現在のメッセージ:\n${content}`
    : content;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 150,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      console.error("OpenAI API error:", res.status);
      return { isTask: false };
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "{}";
    const result = JSON.parse(text);

    return {
      isTask: result.isTask === true,
      title: result.title || null,
      dueDate: parseDueDate(result.dueDate),
      urgency: ["LOW", "MEDIUM", "HIGH"].includes(result.urgency) ? result.urgency : "MEDIUM",
      points: [1, 2, 3, 5, 8, 13, 21, 34].includes(result.points) ? result.points : 3,
    };
  } catch (error) {
    console.error("LLM analysis failed:", error.message);
    return { isTask: false };
  }
}

/**
 * Create an embed for task creation response
 */
function createTaskEmbed(
  title,
  { urgency = "MEDIUM", points = 3, dueDate = null, taskId = null, isIntake = false },
) {
  const color = URGENCY_COLORS[urgency] ?? URGENCY_COLORS.MEDIUM;
  const urgencyLabel = URGENCY_LABELS[urgency] ?? "Medium";

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(isIntake ? `Intake: ${title}` : `Task: ${title}`)
    .setDescription(isIntake ? "Added to inbox for review" : "Added to backlog")
    .addFields(
      { name: "Priority", value: urgencyLabel, inline: true },
      { name: "Points", value: String(points), inline: true },
      { name: "Due", value: dueDate || "None", inline: true },
    )
    .setTimestamp();

  if (taskId) {
    embed.setFooter({ text: `ID: ${taskId}` });
    // Add link to web UI if available
    const webUrl = `${HOLOPLAX_WEB_URL}/backlog`;
    embed.setURL(webUrl);
  }

  return embed;
}

/**
 * Handle slash command interactions
 */
async function handleSlashCommand(interaction) {
  const { commandName, options, user, channel } = interaction;

  if (commandName === "task") {
    await interaction.deferReply();

    const title = options.getString("title");
    const description = options.getString("description") ?? "";
    const dueInput = options.getString("due");
    const urgency = options.getString("urgency") ?? "MEDIUM";
    const points = options.getInteger("points") ?? 3;

    const dueDate = parseDueDate(dueInput);

    try {
      const res = await postIntegration(DISCORD_TASK_URL, {
        title,
        description,
        dueDate,
        urgency,
        points,
        author: user.username,
        channel: channel?.name ?? "unknown",
        threadId: channel?.isThread?.() ? channel.id : null,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error(`Failed to create task: ${data.error ?? res.status}`);
        await interaction.editReply({
          content: `Failed to create task: ${data.error ?? "Unknown error"}`,
        });
        return;
      }

      const data = await res.json();
      const embed = createTaskEmbed(title, {
        urgency,
        points,
        dueDate,
        taskId: data.taskId,
        isIntake: false,
      });

      await interaction.editReply({ embeds: [embed] });
      console.log(`[Slash] Created task ${data.taskId}: ${title}`);
    } catch (error) {
      console.error("Create task failed:", error);
      await interaction.editReply({
        content: "Failed to create task. Please try again.",
      });
    }
  }

  if (commandName === "tasks") {
    await interaction.deferReply({ ephemeral: true });

    // Note: This would require a tasks list API endpoint
    // For now, show a helpful message
    await interaction.editReply({
      content: `View your tasks at: ${HOLOPLAX_WEB_URL}/backlog`,
    });
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  if (watchChannelIds.length > 0) {
    console.log(`Watching channels: ${watchChannelIds.join(", ")}`);
  } else {
    console.log("No watch channels configured - slash commands only");
  }
  console.log("Mode: LLM task extraction + slash commands");
});

// Handle slash command interactions
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    await handleSlashCommand(interaction);
  } catch (error) {
    console.error("Slash command error:", error);
    const reply =
      interaction.deferred || interaction.replied
        ? interaction.editReply.bind(interaction)
        : interaction.reply.bind(interaction);
    await reply({ content: "An error occurred while processing the command.", ephemeral: true });
  }
});

// Handle message-based task extraction
client.on("messageCreate", async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Check if we should watch this channel
  const channelId = message.channel.id;
  const parentChannelId = message.channel.parentId;

  // Watch the direct channel or parent channel (for threads)
  const isWatchedChannel =
    watchChannelIds.includes(channelId) ||
    (parentChannelId && watchChannelIds.includes(parentChannelId));

  if (!isWatchedChannel) return;

  const content = message.content.trim();
  if (!content) return;

  // Get thread context if in a thread
  let threadContext = "";
  let threadId = null;
  let threadUrl = null;

  if (
    message.channel.type === ChannelType.PublicThread ||
    message.channel.type === ChannelType.PrivateThread
  ) {
    threadId = message.channel.id;
    threadUrl = message.url;

    try {
      const starterMessage = await message.channel.fetchStarterMessage();
      if (starterMessage) {
        threadContext = starterMessage.content.slice(0, 500);
      }
    } catch (err) {
      console.log(`Could not fetch thread starter: ${err.message}`);
    }
  }

  // Analyze with LLM
  const analysis = await analyzeMessage(content, threadContext);

  if (!analysis.isTask) {
    console.log(`[Skip] Not a task: ${content.slice(0, 50)}...`);
    return;
  }

  console.log(
    `[Task] Detected: ${analysis.title} (urgency: ${analysis.urgency}, points: ${analysis.points}, due: ${analysis.dueDate})`,
  );

  try {
    const res = await postIntegration(DISCORD_INTEGRATION_URL, {
      title: analysis.title,
      body: content,
      source: "discord",
      author: message.author.username,
      channel: message.channel.name,
      dueDate: analysis.dueDate,
      urgency: analysis.urgency,
      points: analysis.points,
      threadId,
      threadUrl,
      messageUrl: message.url,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`Failed to create intake: ${data.error ?? res.status}`);
      await message.react("fail");
      return;
    }

    const data = await res.json();
    console.log(`Created intake item ${data.itemId}: ${analysis.title}`);

    // Reply with embed
    const embed = createTaskEmbed(analysis.title, {
      urgency: analysis.urgency,
      points: analysis.points,
      dueDate: analysis.dueDate,
      taskId: data.itemId,
      isIntake: true,
    });

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Create intake failed:", error);
    await message.react("fail");
  }
});

client.login(DISCORD_BOT_TOKEN);
