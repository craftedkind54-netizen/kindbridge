# Bot 1.0.5: private welcome DMs

The final welcome DM uses the requested short format: welcome/whitelist confirmation, Java address, Bedrock address and port, and the rules-channel link. Server addresses continue to come from the existing Railway JAVA_ADDRESS, BEDROCK_ADDRESS and BEDROCK_PORT variables; they are not added to the public source code.

## Delivery

- Staff approval queues a private address DM stating that Minecraft whitelisting is still pending. Successful whitelisting queues the final welcome DM.
- DM delivery runs before staff-log and role maintenance, so a staff-log failure no longer prevents DMs.
- Closed/blocked DMs retry every 15 minutes; temporary failures retry with backoff. Previously blocked DMs are eligible again. Previously successful DMs are not automatically resent.
- A missing address for the applicant's edition leaves delivery pending instead of recording an incomplete welcome as sent. Staff can check /health for missing address configuration and DM failures.
- Players can use /join to request their own approved joining details by private DM. Staff can use /resend-welcome member: to resend them. These commands report success or failure privately and have a 30-second resend cooldown.
- If Discord blocks delivery, enable direct messages from server members, unblock the bot if necessary, then use /join. /status shows delivery state and remains a private fallback for whitelisted members.

## Upgrade

Deploy the updated bot and keep the existing /data volume and Railway variables. New commands register on startup. Use /join to recover an older welcome DM, or /resend-welcome member: as staff. No Minecraft plugin update is needed.

## Validation

45 local tests passed. New checks cover exact message formatting, pending versus completed whitelisting, blocked-DM retries, missing addresses, delivery despite staff-log failure, recipient isolation and resend permissions. Live Discord delivery cannot be established by local tests; verify the message in the recipient's DM inbox after deployment. The HTTP integration test remains unverified because this environment blocks loopback connections.
