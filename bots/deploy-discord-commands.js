#!/usr/bin/env node
// Deploy Discord slash commands to a guild or globally.
// Usage: node scripts/deploy-discord-commands.js [--global]
//
// Required environment variables:
// - DISCORD_BOT_TOKEN: Bot token
// - DISCORD_CLIENT_ID: Application client ID
// - DISCORD_GUILD_ID: Guild ID (for guild-scoped commands, optional if --global)

/* eslint-disable @typescript-eslint/no-require-imports */
const { REST, Routes } = require("discord.js");
const { commands } = require("./discord-commands.js");

const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

if (!DISCORD_BOT_TOKEN) {
  console.error("Missing env: DISCORD_BOT_TOKEN");
  process.exit(1);
}

if (!DISCORD_CLIENT_ID) {
  console.error("Missing env: DISCORD_CLIENT_ID");
  process.exit(1);
}

const isGlobal = process.argv.includes("--global");

if (!isGlobal && !DISCORD_GUILD_ID) {
  console.error("Missing env: DISCORD_GUILD_ID (required for guild-scoped commands)");
  console.error("Use --global flag for global commands");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);

async function deployCommands() {
  try {
    const commandData = commands.map((cmd) => cmd.toJSON());
    console.log(`Deploying ${commandData.length} slash command(s)...`);

    let result;
    if (isGlobal) {
      // Global commands (available in all guilds, takes up to 1 hour to propagate)
      result = await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: commandData });
      console.log(`Successfully deployed ${result.length} global command(s).`);
      console.log("Note: Global commands may take up to 1 hour to appear in all guilds.");
    } else {
      // Guild-scoped commands (instant update, only in specified guild)
      result = await rest.put(
        Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
        { body: commandData },
      );
      console.log(
        `Successfully deployed ${result.length} guild command(s) to guild ${DISCORD_GUILD_ID}.`,
      );
    }

    console.log("\nRegistered commands:");
    result.forEach((cmd) => {
      console.log(`  /${cmd.name}: ${cmd.description}`);
    });
  } catch (error) {
    console.error("Failed to deploy commands:", error);
    process.exit(1);
  }
}

deployCommands();
