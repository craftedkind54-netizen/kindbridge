# Kind SMP 1.0.1

Offline queue improvements and upgrade steps: [Update 1.0.1](docs/UPDATE-1.0.1.md).

A Discord application bot for Railway and a companion Minecraft plugin for **Paper 1.21.11 / Java 21**, with **Geyser + Floodgate** and your existing **CreatorScoreboard 1.0.0**.

Start with [the setup guide](docs/SETUP.md). This is source code and a compiled companion plugin; it has not been deployed to your Discord, Railway account or Minecraft server.

## Included

- Your six questions, split across two Discord forms. YouTube is optional.
- Minimum age 13, agreement to rules, one active application per Discord user and Minecraft account, and 24 hours before reapplying after rejection.
- Staff-only approval and rejection; rejection requires a reason shown to the applicant.
- Persistent approval queue. The plugin resolves the Java account or Floodgate gamertag, whitelists its UUID, and acknowledges completion. The bot then grants membership and sends joining instructions. `/status` works when DMs are closed.
- YouTube ownership verification using a temporary random code in the channel description. A pasted channel link alone never grants the role.
- Verified creators receive the YouTuber role. Railway refreshes subscriber, upload and recent-video like totals initially and every seven days; the plugin imports them into CreatorScoreboard.
- All public creator content is eligible. Ordinary videos and Shorts share your Shorts channel; scheduled and active streams have separate channels.
- WebSub notifications, periodic feeds, bounded live-status polling, a persisted daily API budget, duplicate suppression, retry queues and staff diagnostics.
- A GitHub Actions workflow runs tests and builds the plugin.

## Your configured Discord IDs

| Purpose | ID |
| --- | --- |
| Server | 1555704317552361563 |
| Staff role | 1555726622982668408 |
| Apply channel | 1555722797475561543 |
| Private form log | 1555723400008302763 |
| SMP member role | 1555723652627173416 |
| YouTuber role | 1555723775691989033 |
| Rules channel | 1555706150488375296 |
| Scheduled streams | 1555724224297967756 |
| Shorts and ordinary videos | 1555724261912748074 |
| Live streams | 1555724180614287492 |

## Commands

| Where | Command | Purpose |
| --- | --- | --- |
| Discord | `/apply` | Open the application |
| Discord | `/status` | See application decision, rejection reason or joining instructions |
| Discord | `/youtube channel:` | Start channel ownership verification |
| Discord | `/verify` | Check the channel description code |
| Discord | `/short url:` | Submit a public Short from your verified channel |
| Discord | `/stream url:` | Register your upcoming/live stream if automatic discovery has missed it |
| Discord, staff | `/setup` | Post or update the application panel |
| Discord, staff | `/health` | See connection, quota, errors and pending job IDs |
| Discord, staff | `/retry job:` | Retry a queued Minecraft job immediately |
| Discord, staff | `/unlink-youtube member:` | Remove a creator link, role and scoreboard entry |
| Minecraft | `/kindsmp` | Link to the application channel |
| Minecraft, operator | `/kindsmp status` | Railway connection status |
| Minecraft, operator | `/setscoreboardhere` | Existing CreatorScoreboard command to place the display |

Staff commands check the configured staff role even when the caller has Discord Administrator. Give yourself that role.

## Limits that affect operation

- Live Discord, Railway, YouTube and Minecraft acceptance tests still need your credentials and running server. Local tests do not establish production compatibility.
- Keep the original CreatorScoreboard JAR installed alongside the new bridge. Its source is not required or included. The bridge targets the public methods in the exact supplied 1.0.0 JAR, not every plugin with that name.
- The bridge clears the old scoreboard's API key, disables its built-in verification, sets its refresh interval to 10,080 minutes, and directs YouTube commands to Discord. Railway becomes the API caller. The existing physical display, ranking formula and placement commands stay in the old plugin. Its timer is based on plugin startup, so its countdown may differ from the persisted per-creator Railway schedule after a restart.
- Existing scoreboard links are not automatically trusted or migrated. Those creators should verify through Discord. Channel conflicts produce an error rather than silently transferring ownership; back up the old scoreboard database before migrating.
- Automatic Shorts classification recognizes non-live videos up to three minutes with `#Shorts` in the title/description. The public Data API has no simple Shorts flag. `/short` validates ownership and duration, but cannot independently prove vertical aspect ratio. Ordinary videos go to the same destination, so untagged Shorts still appear there as videos.
- WebSub/feed discovery is best effort. Some upcoming streams may not appear promptly; `/stream` registers them explicitly. Known streams are checked every five minutes by default. There is no instant-notification or zero-quota guarantee.
- The default local cap is 8,000 API units per Pacific day. It covers this bot's calls, not other apps using the same Google project. A new dedicated Google project is recommended. When quota is exhausted, stats remain cached and updates pause. A provider quota error also blocks calls for that day.
- Weekly likes cover the latest 50 uploads, matching the supplied scoreboard's default; they are not lifetime channel likes. Hidden subscriber counts are represented as zero. YouTube may round public counts.
- Applications use the account named by the applicant and approved by staff; this is not independent proof that the Discord member owns that Minecraft account. Staff should confirm questionable accounts before approval.
- Use one Railway replica and a persistent volume mounted at `/data`. Losing that volume loses applications, queue state, verified links and deduplication history. Enable volume backups.
- The bot does not automatically remove Minecraft whitelist entries when someone leaves Discord. Staff can manage removals using the server's existing whitelist commands.
- Bedrock support expects Floodgate on this Paper server. Existing Floodgate-linked Java accounts are resolved when linking is enabled; later account-link changes need staff review. Proxy-only deployments need additional setup.
- A send accepted by Discord immediately before a prolonged process crash can be repeated after restart. Stable nonces help suppress short retry duplicates, while the database suppresses normal repeated events.

## Build and test

Node 24:

```sh
npm install --global pnpm@11.19.0
pnpm install --frozen-lockfile
pnpm test
```

Java 21 and Maven:

```sh
mvn -f plugin/pom.xml package
```

The JAR is `plugin/target/KindSMP-Bridge-1.0.1.jar`. The optional method-compatibility test uses `-Dcreator.jar=/absolute/path/CreatorScoreboard-1.0.0.jar`; it is skipped on GitHub because your original JAR is intentionally excluded.

## References

- [Paper plugin development](https://docs.papermc.io/paper/dev/getting-started/)
- [Floodgate API](https://geysermc.org/wiki/floodgate/api/)
- [Discord message delivery and nonce handling](https://docs.discord.com/developers/resources/message)
- [YouTube push notifications](https://developers.google.com/youtube/v3/guides/push_notifications)
- [YouTube channel requests](https://developers.google.com/youtube/v3/docs/channels/list)
- [YouTube video requests and quota cost](https://developers.google.com/youtube/v3/docs/videos/list)
- [Railway persistent volumes](https://docs.railway.com/volumes/reference)
