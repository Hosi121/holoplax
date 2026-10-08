# Discord Bot Integration

## Overview
Discord bot integration for Holoplax with:
- **Auto-detection (Message Monitoring)**: LLM-based task extraction from messages with rich extraction (due date, priority, points)
- **Slash Commands**: `/task` for explicit task creation directly to backlog
- **Multiple Channel Support**: Watch multiple channels simultaneously
- **Thread Support**: Context from parent messages included in analysis
- **Embed Replies**: Rich visual feedback when tasks are created

## Architecture

```
Message in watched channel
    │
    ▼
LLM Analysis (rich extraction)
    │
    ├── Not a task → Skip
    │
    └── Task detected
            │
            ▼
        IntakeItem (Inbox)
            │
            ▼
        Embed reply

Slash command /task
    │
    ▼
Direct Task creation (Backlog)
    │
    ▼
Embed reply
```

## Required Environment Variables

### Bot Side
| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_BOT_TOKEN` | Yes | Bot token from Discord Developer Portal |
| `DISCORD_INTEGRATION_TOKEN` | Yes | Shared token (must match Hono API) |
| `DISCORD_WATCH_CHANNEL_IDS` | No | Comma-separated channel IDs to watch |
| `DISCORD_WATCH_CHANNEL_ID` | No | Single channel ID (backwards compatibility) |
| `DISCORD_INTEGRATION_URL` | No | Intake API URL (default: http://localhost:3000/api/integrations/discord) |
| `DISCORD_TASK_URL` | No | Task API URL (default: http://localhost:3000/api/integrations/discord/task) |
| `HOLOPLAX_WEB_URL` | No | Web app URL for links (default: http://localhost:3000) |
| `OPENAI_API_KEY` | Yes | OpenAI API key for task extraction |

### Slash Command Registration
| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_CLIENT_ID` | Yes | Application client ID |
| `DISCORD_GUILD_ID` | Yes* | Guild ID (*not required for global commands) |

### Hono Side
| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_INTEGRATION_TOKEN` | Yes | Shared token |
| `DISCORD_USER_ID` | Yes* | User ID for task creation |
| `DISCORD_WORKSPACE_ID` | Yes* | Workspace ID for task creation |
| `INTEGRATION_USER_ID` | No | Fallback user ID |
| `INTEGRATION_WORKSPACE_ID` | No | Fallback workspace ID |

## Setup

### 1. Discord Developer Portal
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create or select your application
3. Go to **Bot** tab:
   - Enable `MESSAGE CONTENT INTENT` (required for message reading)
   - Copy the bot token
4. Go to **OAuth2 > URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Read Messages/View Channels`, `Send Messages`, `Add Reactions`, `Embed Links`, `Use Slash Commands`
5. Use the generated URL to invite the bot to your server

### 2. Install Dependencies
```bash
npm install discord.js
```

### 3. Configure Environment
```bash
# Bot configuration
export DISCORD_BOT_TOKEN="your-bot-token"
export DISCORD_INTEGRATION_TOKEN="shared-secret-token"
export DISCORD_WATCH_CHANNEL_IDS="channel-id-1,channel-id-2"
export OPENAI_API_KEY="your-openai-key"

# Slash command registration
export DISCORD_CLIENT_ID="your-client-id"
export DISCORD_GUILD_ID="your-guild-id"

# Hono API configuration
export DISCORD_USER_ID="your-holoplax-user-id"
export DISCORD_WORKSPACE_ID="your-workspace-id"
```

### 4. Deploy Slash Commands
```bash
# Guild-scoped (instant update)
npm run discord:deploy

# Global (takes up to 1 hour)
npm run discord:deploy -- --global
```

### 5. Start the Bot
```bash
npm run bot:discord
```

## Features

### Rich Task Extraction
The LLM extracts additional metadata from messages:

| Field | Extraction Logic |
|-------|------------------|
| `dueDate` | "today", "tomorrow", "next week", or specific dates |
| `urgency` | HIGH: "urgent", "ASAP"; LOW: "when possible"; MEDIUM: default |
| `points` | Estimated based on task complexity (1-13 Fibonacci scale) |

Example:
```
Message: "Please prepare the report by tomorrow, it's urgent!"
→ dueDate: 2025-01-26, urgency: HIGH, points: 3
```

### Slash Commands

#### `/task`
Create a task directly in the backlog.

```
/task title:"Fix login bug" description:"Users can't login with Google" urgency:HIGH points:5 due:tomorrow
```

| Option | Required | Description |
|--------|----------|-------------|
| `title` | Yes | Task title (max 140 chars) |
| `description` | No | Task description |
| `due` | No | Due date (ISO or relative: today, tomorrow, next week) |
| `urgency` | No | LOW, MEDIUM, HIGH (default: MEDIUM) |
| `points` | No | 1, 2, 3, 5, 8, 13 (default: 3) |

#### `/tasks`
View link to task list (placeholder for future implementation).

### Multiple Channel Support
Watch multiple channels by setting comma-separated IDs:
```bash
DISCORD_WATCH_CHANNEL_IDS="123456789,987654321,456789123"
```

The bot also watches threads within these channels.

### Thread Support
When a message is posted in a thread, the bot includes the parent message as context for better task extraction:

```
Parent message: "We need to improve the onboarding flow"
Thread reply: "I'll handle the email verification step"
→ Task created with parent context for better title generation
```

### Embed Replies
Tasks are confirmed with rich embeds showing:
- Task title
- Priority (color-coded: green/yellow/red)
- Story points
- Due date
- Link to web UI

## API Endpoints

### POST `/api/integrations/discord`
Creates an IntakeItem (inbox) for review.

**Request:**
```json
{
  "title": "Task title",
  "body": "Original message content",
  "author": "username",
  "channel": "channel-name",
  "dueDate": "2025-01-25",
  "urgency": "HIGH",
  "points": 3,
  "threadId": "thread-id",
  "messageUrl": "discord://..."
}
```

**Response:**
```json
{
  "itemId": "intake-item-id"
}
```

### POST `/api/integrations/discord/task`
Creates a Task directly in the backlog.

**Request:**
```json
{
  "title": "Task title",
  "description": "Task description",
  "dueDate": "2025-01-25",
  "urgency": "HIGH",
  "points": 5,
  "author": "username",
  "channel": "channel-name",
  "threadId": "thread-id"
}
```

**Response:**
```json
{
  "taskId": "task-id",
  "title": "Task title",
  "points": 5,
  "urgency": "HIGH",
  "dueDate": "2025-01-25T00:00:00.000Z",
  "status": "BACKLOG"
}
```

## Visual Feedback

| Event | Response |
|-------|----------|
| Task detected (auto) | Embed reply: "Intake: {title}" |
| `/task` command | Embed reply: "Task: {title}" |
| Error | Error message in reply |

Embed colors by urgency:
- LOW: Green (#28a745)
- MEDIUM: Yellow (#ffc107)
- HIGH: Red (#dc3545)

## Troubleshooting

### Bot doesn't respond to messages
1. Ensure `MESSAGE CONTENT INTENT` is enabled in Developer Portal
2. Verify `DISCORD_WATCH_CHANNEL_IDS` or `DISCORD_WATCH_CHANNEL_ID` is set correctly
3. Check bot has permissions in the channel

### Slash commands not appearing
1. Run `node scripts/deploy-discord-commands.js`
2. For global commands, wait up to 1 hour
3. Verify `DISCORD_CLIENT_ID` and `DISCORD_GUILD_ID` are correct

### Tasks not being created
1. Check `DISCORD_INTEGRATION_TOKEN` matches on both bot and API
2. Verify `DISCORD_USER_ID` and `DISCORD_WORKSPACE_ID` are set
3. Check API server logs for errors

### LLM not detecting tasks
1. Verify `OPENAI_API_KEY` is valid
2. Check OpenAI API quota
3. Review the system prompt in `discord-bot.js` for your use case

## Cost Considerations
- OpenAI API: ~$0.001 per message analyzed (GPT-4o-mini)
- Slash commands do not use LLM for task extraction
