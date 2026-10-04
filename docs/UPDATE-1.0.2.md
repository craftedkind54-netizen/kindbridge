# Automatic YouTube linking — bot 1.0.2

The description-code verification step is removed. Staff approval of an application also approves its supplied YouTube channel link. Once the Minecraft account is whitelisted, Railway looks up the channel, registers it, assigns the YouTuber role, queues its initial scoreboard statistics and follows its public uploads/streams. Nobody needs to edit a channel description or run `/verify`.

This is staff-approved linking, not proof of channel ownership. Staff should review the link in the application. Duplicate channels cannot be assigned to two members.

## Update without deleting your repository

Use `KindSMP-YouTube-Update-1.0.2.zip`. Extract it and replace these four files in the existing GitHub `bot/src` folder:

- `youtube.js`
- `discord.js`
- `main.js`
- `store.js`

Commit the replacements and let Railway redeploy. Keep all other files, Railway variables, and the `/data` volume. You do not need to delete the repository or upload a new Minecraft JAR. Bridge 1.0.1 supports the same creator-sync protocol. Its old in-game `/youtube` help may still mention verification; the current Discord commands are authoritative.

Run `/setup` once as staff to update the existing application panel's text. The bot replaces Discord's registered commands on startup: `/verify` is removed, and `/youtube` now shows linking status. Existing approved applications with saved channel links are picked up automatically; there is no need to reapply. Existing channel links remain intact. Historical application messages are updated to remove the old "not yet verified" field label after approval; messages for still-pending applications update when reviewed.

## If someone omitted the optional link

A staff member runs:

```text
/link-youtube member:@Member channel:https://www.youtube.com/@TheirChannel
```

The member needs an approved application. Linking waits for whitelisting if the server is offline. To change a linked channel, staff first uses `/unlink-youtube`, then `/link-youtube` with the replacement. Unlinking disables automatic relinking from the old application until staff approves another link.

## Errors and timing

An API key is still required in Railway as `YOUTUBE_API_KEY`. A missing/invalid channel, API problem, or duplicate link does not grant a creator entry. Failed linking attempts retry every ten minutes and send at most one staff alert per application per day. `/youtube` shows the member's latest link error; `/health` shows the bot's latest YouTube error. Valid existing applications normally link on the next YouTube worker pass, followed by the normal role and statistics workers. Weekly refresh and quota limits remain in place.

Automatic linking never runs for pending or rejected applications, or for a blank optional YouTube field. Members with no link still receive normal SMP membership after whitelisting.

## Validation

25 bot tests passed, including automatic registration without a description code, backfilling existing accepted applications, skipping pending/blank links, honoring staff unlink, retries, and rejecting duplicate channel assignment. No live Discord account changes or Railway deployment were performed locally. No secrets are included in the update ZIP.

The existing database column `verified_at` and scoreboard boolean `verified` are retained for compatibility. For newly linked channels they represent acceptance for the creator system, not independently verified ownership.
