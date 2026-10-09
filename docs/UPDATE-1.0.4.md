# Bot 1.0.4: reapply with a new Minecraft account

Accepted players can run /apply again or use the existing application panel, choose Java or Bedrock, and submit the same combined form with their new account. Staff approval is required each time.

- Current membership remains active during review, rejection, or a failed/offline whitelist job.
- Only one application can await review or whitelisting at a time. A second submission for the current account is blocked. Rejection cooldown still applies.
- Once the new account is whitelisted successfully, the previous application is marked superseded and the new account becomes current. Staff logs show the previous and requested accounts.
- Existing YouTube channel links and cached creator stats move to the new Minecraft account. Changing a YouTube channel still requires staff to unlink/relink it; the application does not replace an existing channel link.
- Old Minecraft whitelist entries are not automatically removed. Staff must remove the previous account using the server whitelist controls if it should no longer have access.

## Upgrade

Deploy the updated bot, retain the existing /data volume, and run /setup to refresh the panel wording. The database index migration runs automatically and preserves application history. The Minecraft plugin does not need an update.

## Validation

36 application and workflow tests passed, including migration/restart, Java-to-Bedrock reapplication, staff approval, rejected/failed replacements, duplicate account and UUID protection, and creator profile transfer. Live Discord and Minecraft behavior still needs a deployment smoke test. The HTTP integration test remains unverified in this environment because loopback connections are blocked.
