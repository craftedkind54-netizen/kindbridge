# Bot 1.0.3: one SMP and YouTube application form

The Java and Bedrock application forms now include the optional YouTube channel URL alongside the Minecraft username, age, referral answer, and reason for joining. Pressing Submit sends the whole application to staff immediately. No second form or Finish application button is needed for new applications.

A visible notice in the form explains that submitting confirms agreement to the SMP rules. This keeps the form within Discord's five-component limit while retaining both application questions. YouTube remains optional and links automatically after staff approval and successful whitelisting.

## Install

1. Replace the repository files with this archive's contents (keep Dockerfile at the repository root), then redeploy the Railway bot.
2. Keep the existing /data volume and environment variables. No database migration or Minecraft plugin update is required.
3. Run /setup in Discord to refresh the application panel text.
4. Test /apply for Java and Bedrock. Confirm a single form includes YouTube, and submission creates one private staff review entry.

Previously opened two-step forms and unexpired drafts can still finish through the legacy handlers. Existing submitted applications and approvals remain intact.

## Local verification

The application and workflow tests passed on Node 24 using the already installed matching dependencies, including Java/Bedrock submission with and without YouTube, invalid links, underage applicants, and duplicate submission protection. An outdated assertion for the existing missing-address message was corrected.

The HTTP integration test could not complete because this environment blocks local loopback connections (EACCES). Live Discord and Railway deployment have not been tested or performed.
