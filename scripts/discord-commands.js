// Discord slash command definitions for Holoplax integration
// These commands are registered via deploy-discord-commands.js

/* eslint-disable @typescript-eslint/no-require-imports */

const { SlashCommandBuilder } = require("discord.js");

// /task command - Create a task directly in backlog
const taskCommand = new SlashCommandBuilder()
  .setName("task")
  .setDescription("Create a new task in Holoplax backlog")
  .addStringOption((option) =>
    option
      .setName("title")
      .setDescription("Task title (required)")
      .setRequired(true)
      .setMaxLength(140),
  )
  .addStringOption((option) =>
    option
      .setName("description")
      .setDescription("Task description")
      .setRequired(false)
      .setMaxLength(500),
  )
  .addStringOption((option) =>
    option
      .setName("due")
      .setDescription("Due date (e.g., 2025-01-25, tomorrow, next week)")
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("urgency")
      .setDescription("Urgency level")
      .setRequired(false)
      .addChoices(
        { name: "Low", value: "LOW" },
        { name: "Medium", value: "MEDIUM" },
        { name: "High", value: "HIGH" },
      ),
  )
  .addIntegerOption((option) =>
    option
      .setName("points")
      .setDescription("Story points (1, 2, 3, 5, 8, 13)")
      .setRequired(false)
      .addChoices(
        { name: "1 - Very small", value: 1 },
        { name: "2 - Small", value: 2 },
        { name: "3 - Medium", value: 3 },
        { name: "5 - Large", value: 5 },
        { name: "8 - Very large", value: 8 },
        { name: "13 - Extra large", value: 13 },
      ),
  );

// /tasks command - List tasks (optional feature)
const tasksCommand = new SlashCommandBuilder()
  .setName("tasks")
  .setDescription("List tasks from Holoplax")
  .addStringOption((option) =>
    option
      .setName("status")
      .setDescription("Filter by status")
      .setRequired(false)
      .addChoices(
        { name: "Backlog", value: "BACKLOG" },
        { name: "Sprint", value: "SPRINT" },
        { name: "Done", value: "DONE" },
      ),
  )
  .addIntegerOption((option) =>
    option
      .setName("limit")
      .setDescription("Number of tasks to show (default: 5)")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(20),
  );

module.exports = {
  commands: [taskCommand, tasksCommand],
  taskCommand,
  tasksCommand,
};
