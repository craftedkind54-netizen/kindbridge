# Validation — 2 October 2026

- **20 Node tests passed**: staff authorization through actual Discord interaction handlers, mandatory rejection reasons, age/rules checks, duplicate applications, reapplication cooldown, atomic decisions, lease/retry handling, invalid acknowledgements, database persistence, authenticated HTTP bridge, signed YouTube notifications, verification ownership, quota reset across Pacific daylight/standard time, URL restrictions, video categorization, announcement deduplication, weekly caching, form limits and notification-driven rechecks.
- **3 Java tests passed**: invalid username/UUID/origin handling and a reflection contract check against the exact supplied `CreatorScoreboard-1.0.0.jar`. Every public method used by the integration was found. This does not simulate its rendering or database at runtime.
- **Paper plugin compiled and packaged successfully** with Java 21 against Paper API 1.21.11.
- **Production dependency audit passed** with no known vulnerabilities reported after updating the XML parser to 5.11.2. This is the audit result at build time, not a guarantee against future advisories.
- Discord forms were serialized successfully with the installed discord.js 14.27.0 builders.
- Source packaging excludes original JARs, decompiled inspection files, installed dependencies, databases and credentials.

## Not performed

No Discord login, real role assignment, real YouTube API key/ownership verification, Railway deployment, Docker runtime execution, or live Paper/Geyser/Floodgate join test was performed. No GitHub repository or Discord application was created in the user's account. Run the acceptance steps in SETUP.md before opening applications publicly.

The included source and companion JAR are ready for configuration and live acceptance testing; they are not a claim that external services have already been connected.

## 1.0.1 offline queue update
22 Node tests and 6 Java tests passed, including seven-day offline persistence and batched processing. The JAR rebuilt successfully. Live server acceptance testing is still required.
