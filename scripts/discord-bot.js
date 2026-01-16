// Minimal Discord bot that registers /holotask and forwards it to the Holoplax integration endpoint.
// Usage: node scripts/discord-bot.js (requires env vars below and discord.js installed)

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");

const {
  DISCORD_BOT_TOKEN,
  DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID,
  DISCORD_INTEGRATION_URL = "http://localhost:3000/api/integrations/discord",
  DISCORD_INTEGRATION_TOKEN,
} = process.env;

if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID || !DISCORD_GUILD_ID || !DISCORD_INTEGRATION_TOKEN) {
  console.error(
    "Missing env: DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, DISCORD_INTEGRATION_TOKEN",
  );
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName("holotask")
    .setDescription("Holoplax にタスクを追加します")
    .addStringOption((option) =>
      option
        .setName("text")
        .setDescription("タイトル | 説明 | ポイント(任意)")
        .setRequired(true),
    )
    .toJSON(),
];

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), {
    body: commands,
  });
  console.log("Slash command registered: /holotask");
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    await registerCommands();
  } catch (error) {
    console.error("Failed to register slash command", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "holotask") return;
  const text = interaction.options.getString("text", true);
  const parts = text.split("|").map((p) => p.trim());
  const [title, description, pointsRaw] = parts;
  const points = Number(pointsRaw);

  await interaction.deferReply({ ephemeral: true });
  try {
    const res = await fetch(DISCORD_INTEGRATION_URL, {
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
      throw new Error(data.error ?? `API error: ${res.status}`);
    }
    const data = await res.json();
    await interaction.editReply(
      `タスクを作成しました: ${title} (workspace ${data.workspaceId}, id ${data.taskId})`,
    );
  } catch (error) {
    console.error("Create task failed", error);
    await interaction.editReply(`失敗しました: ${error.message}`);
  }
});

client.login(DISCORD_BOT_TOKEN);
