# Offline whitelist queue update — 1.0.1

Staff-approved players stay in Railway's persistent queue without a time limit. Paper cannot edit its whitelist while stopped. When the server starts, the plugin connects automatically and processes up to 20 requests per pass, sequentially with no polling delay between requests. Further passes continue until the backlog is empty. Players do not need to reapply or be approved again.

Pending applications are never whitelisted without staff approval. Only unfinished form drafts and YouTube verification codes have a 30-minute expiry. Discord messages now explain the difference, and the staff review message updates when whitelisting succeeds.

Whitelist failures retry indefinitely with a delay capped at one minute. Other queued requests can proceed during that delay. A request interrupted by a server crash can take up to three minutes for its existing processing lease to expire before retrying. A network acknowledgement lost after whitelisting may cause an idempotent re-add; it does not create another application or grant roles before completion is acknowledged.

Scoreboard setup errors no longer prevent the whitelist worker from starting.

## Install both parts

1. Stop Minecraft, replace only the old KindSMP-Bridge JAR with `KindSMP-Bridge-1.0.1.jar`, and keep the existing `plugins/KindSMPBridge/config.yml` (including your URL and secret). Keep CreatorScoreboard and Geyser/Floodgate installed. Do not run two KindSMPBridge JARs together.
2. Update the GitHub source from the new source ZIP, preserving its folder structure. The Railway runtime changes are in `bot/src/store.js` and `bot/src/discord.js`. Updating only the JAR improves queue draining but does not update Discord text or the retry delay.
3. Redeploy Railway, preserving its existing variables and persistent volume. `DATA_DIR=/data` must point to a volume mounted at `/data`; this is what keeps queued approvals across bot restarts. Do not delete the database. Existing queued approvals are compatible with this update.
4. Start Paper. Use `/kindsmp status` in Minecraft and `/health` in Discord to confirm connection. Approved players are processed automatically.

## Acceptance check

With Minecraft stopped and Railway running, submit and approve a test application. Confirm `/status` says the request is saved. Leave it queued for more than 30 minutes, then start Paper. Confirm the staff log changes to whitelisting completed, the account appears in the whitelist, and the member receives their role and joining instructions. Repeat with a Bedrock account. Invalid usernames or unavailable account lookup services still need correction; being queued does not guarantee that an invalid account can be whitelisted.

Automated regression tests cover seven days offline plus a bot database reopen, pending-versus-approved accounts, retry delays, independent queued players, batched plugin processing, shutdown, and connection failure. A live server acceptance test has not been performed for this update.
