# Set up Kind SMP

You will upload the source to your GitHub repository, run the bot on Railway, and put the companion JAR on your Paper server. Do not paste the whole project into one GitHub file; keep the included folders and filenames.

## 1. Create your GitHub repository

1. Create a repository called `kind-smp` (a private repository is a good default).
2. Extract `KindSMP-GitHub-Source.zip` locally.
3. Upload the extracted contents to the repository root, including `.github`, `.gitignore`, `.dockerignore`, `.env.example`, `Dockerfile`, `railway.toml`, `package.json`, `pnpm-lock.yaml`, `bot`, `plugin`, and `docs`.
4. Check that `Dockerfile` is directly at the repository root, not inside another `kind-smp` folder.
5. Open the repository's Actions tab. The workflow tests the bot and builds an installable plugin artifact.

Do not upload the original CreatorScoreboard JAR, a real `.env` file, database files, API keys or bot tokens. The supplied original scoreboard JAR contains a Google API key; rotate that key in Google Cloud before using or distributing the old plugin. The new source package contains no copied credentials or decompiled code.

## 2. Create the Discord application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications), create **Kind SMP**, and open its Bot settings.
2. Obtain the bot token and put it directly in Railway's `DISCORD_TOKEN` variable in the next step. Do not commit it to GitHub or share it in chat.
3. Create a server-install invitation with the `bot` and `applications.commands` scopes.
4. Give the bot **View Channels**, **Send Messages**, **Embed Links**, **Read Message History**, and **Manage Roles**. It does not require Administrator or privileged gateway intents.
5. Invite it to server `1555704317552361563`.
6. In Discord Server Settings → Roles, move the bot's role above **SMP Member** and **YouTuber**. Give your staff and yourself role `1555726622982668408`.
7. Make form-log channel `1555723400008302763` private. Deny View Channel for `@everyone`; do not grant it to general member, YouTuber, or other public roles. Give access to staff and the bot. Review individual-member overrides too. The bot refuses to post form logs if `@everyone`, SMP Member, or YouTuber has access.
8. Give the bot permission to view and send in each configured announcement/application channel.

The bot uses Discord's gateway connection. Leave the Interactions Endpoint URL blank; the Railway public URL is for Minecraft communication and YouTube notifications.

## 3. Deploy on Railway

1. Create a Railway project and deploy your GitHub repository. Railway uses the included Dockerfile.
2. Attach a persistent **volume mounted at `/data`**. Keep **one replica**. Enable volume backups.
3. Generate a public Railway domain for the service; set the target port to the service's `PORT` (Railway supplies this variable).
4. Add these variables:

| Variable | What to put there |
| --- | --- |
| `DISCORD_TOKEN` | Token from your Discord app |
| `BRIDGE_SECRET` | A randomly generated secret of at least 32 characters, used only by this bot and your plugin |
| `PUBLIC_URL` | Your service URL, such as `https://kind-smp-production.up.railway.app` |
| `DATA_DIR` | `/data` |
| `YOUTUBE_API_KEY` | A new restricted YouTube Data API key from step 4 |

Generate a bridge secret with your password manager. If using Node locally, this command generates one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Store it in Railway and the private Minecraft plugin configuration only.

All your Discord IDs are already defaults in the code. `.env.example` lists every optional override; it is a reference and is not loaded automatically on Railway. Ordinary videos and Shorts both default to `1555724261912748074`.

You can initially leave `YOUTUBE_API_KEY` blank while testing applications. YouTube features remain unavailable until it is set. `DISCORD_TOKEN`, `BRIDGE_SECRET` and `PUBLIC_URL` are required to start.

## 4. Enable YouTube

1. Create or select a Google Cloud project dedicated to this bot.
2. Enable **YouTube Data API v3**.
3. Create an API key and restrict its API access to YouTube Data API v3.
4. Put the key in Railway as `YOUTUBE_API_KEY`. Do not put it into CreatorScoreboard's config; Railway manages API calls.
5. Keep `YOUTUBE_DAILY_BUDGET=8000` unless you intentionally change it based on the project's actual quota. The bot's budget does not account for other callers on the same project.

No Google OAuth client is needed for this implementation. Creators prove channel control by placing a temporary random code in their public channel description. The app never needs their Google password.

## 5. Install the Minecraft companion

1. Back up the existing `plugins/CreatorScoreboard` folder and its database.
2. Stop the Paper **1.21.11** server. It needs **Java 21**.
3. Keep **Geyser**, **Floodgate**, and your original **CreatorScoreboard-1.0.0.jar** installed.
4. Add **KindSMP-Bridge-1.0.1.jar** to the server's `plugins` folder. This is a separate companion, not a replacement for the existing scoreboard JAR.
5. Start the server once to generate `plugins/KindSMPBridge/config.yml`, then stop it.
6. Edit that config:

```yaml
railway-url: "https://YOUR-ACTUAL-SERVICE.up.railway.app"
bridge-secret: "THE-SAME-SECRET-YOU-PUT-IN-RAILWAY"
poll-seconds: 10
application-url: "https://discord.com/channels/1555704317552361563/1555722797475561543"
scoreboard-integration: true
manage-scoreboard-youtube: true
```

7. Start the server. Run `/kindsmp status` as an operator; it should report Connected.
8. Enable the server whitelist using `whitelist on` in the server console if it is not already enabled. Keep Java online-mode authentication correctly configured; Geyser uses Floodgate authentication for Bedrock.
9. Use `/setscoreboardhere` as an operator to place your existing leaderboard if needed.

On enable, the bridge clears CreatorScoreboard's old API key, disables its own verification, changes its interval to weekly, and redirects its YouTube/update commands to explain the Discord-managed workflow. It does not modify the original JAR. Do not restore the old key or run another stats updater against the same Google project.

No RCON password or inbound administration port is required. The plugin polls Railway over HTTPS, and only accepts fixed whitelist/creator operations from its authenticated queue.

## 6. Find and add your Minecraft address

Open the website/dashboard where you manage the Minecraft server. Look for **IP Address**, **Server Address**, **Connect**, **Overview**, or **Network/Allocations**. It often looks like `play.example.net` or `123.45.67.89:25565`.

Use the public address players connect to, not `localhost`, the Railway bot domain, or a private `192.168…` address. The bot's Railway address is separate from Minecraft's address.

For Bedrock, check the public UDP port allocated by your host and Geyser's `bedrock.port` configuration. The normal default is `19132`, but your host may use another value.

Add these Railway variables when you know them:

```text
JAVA_ADDRESS=your-java-address:port
BEDROCK_ADDRESS=your-bedrock-hostname
BEDROCK_PORT=19132
JOIN_INSTRUCTIONS=Optional additional joining instructions
```

Until then, accepted players can still be whitelisted, but their welcome message explicitly asks them to get the address from staff. `/status` reads the current values after redeploying with updated variables.

## 7. Start applications and test

1. Give yourself the configured staff role and run `/setup` in Discord.
2. Submit a test application with a real Java account. Verify all six answers appear only in the private form log.
3. Approve it. Check `/health`, verify the account is on the whitelist, then confirm it receives the member role and welcome DM. With DMs closed, use `/status`.
4. Test a Bedrock application with the real Xbox gamertag, spaces included and no Floodgate prefix. Confirm the player can join through Geyser.
5. Reject a separate test application. Confirm a reason is required and reapplication is blocked for 24 hours. During testing only, `REAPPLY_HOURS=0` can disable the wait; restore 24 afterwards.
6. After approval, use `/youtube channel:https://www.youtube.com/@YourHandle`. Put the generated code into the channel description and run `/verify`.
7. Confirm the YouTuber role and scoreboard entry appear. The initial stats refresh should queue within about a minute while APIs are healthy, followed by updates every seven days.
8. Check an upcoming stream with `/stream url:…`, and a Short with `/short url:…`. Confirm the right announcement channels and no duplicate on repeated submission.
9. Restart Railway and Paper separately. Check that pending requests and verified creators persist, and that `/health` reconnects.

## Troubleshooting

- **Bot will not start:** check its Railway logs, required variables, public HTTPS URL and bridge secret length. Never paste tokens into support messages.
- **Slash commands missing:** verify the app has joined the correct server, has `applications.commands` scope, and the bot's logs say it connected.
- **No form log:** make the log channel private and allow staff/bot access. `/health` shows the last Discord error. Also check Send Messages and Embed Links.
- **Cannot grant roles:** the bot needs Manage Roles and its role must be higher than both target roles.
- **Approved but not whitelisted:** check `/health` for the queued job and error. Ensure Paper is running, secrets match, and the username is correct. Bedrock needs Floodgate available on Paper. Fix the external issue and use `/retry job:…` or wait for retry.
- **No scoreboard entry:** verify CreatorScoreboard is enabled; inspect the creator job error in `/health`. An old entry for the same YouTube channel but a different player needs migration before retrying. Verify again through Discord for creators not yet registered with the bot.
- **No YouTube updates:** check key restrictions, project quota, local daily budget, feed errors and the service's public URL. `/health` reports the most recent error, which may be historical. Automatic discovery is not guaranteed for every upcoming stream; use `/stream` when necessary.
- **Changing someone's YouTube channel:** staff runs `/unlink-youtube member:…`; the player then starts `/youtube` and verifies the new channel. Scoreboard removal and addition are queued in order.
- **Application typed incorrectly:** correct it before staff approves by rejecting with an explanation and letting the applicant reapply. There is no automatic account-transfer or approved-application-edit command in this release.

## Data and maintenance

The SQLite database on `/data` stores application answers (including age), Discord IDs, approved account UUIDs, review decisions, creator mappings, cached public YouTube data and queue state. The private form-log messages also retain application answers. Treat database backups and that channel as staff-only records; remove records/messages when your server's retention policy requires it. No application data belongs in GitHub.

Keep Railway running continuously, one replica only. Back up its volume and the Minecraft scoreboard data before updates. Review `/health` after changing permissions, credentials, plugin versions or Geyser/Floodgate account-link configuration.
