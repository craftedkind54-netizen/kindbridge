# Bot 1.0.6: YouTube playlist recovery

Unavailable uploads playlists no longer abort all creator stats updates or produce hourly copies of the same warning.

- Feed fallback refreshes an invalid cached playlist ID from YouTube and retries once if the ID changed.
- playlistNotFound and playlistItemsNotAccessible retain cached likes and retry after 24 hours. Subscriber and upload counts can still refresh, and other channels continue updating.
- Channels reporting zero public videos do not need a playlist request. Other failures are not treated as zero likes.
- Temporary per-channel stats errors retry after one hour without blocking healthy channels. Playlist backoff and error notification state persist in the database across restarts.
- Each unchanged issue is reported once while active. A changed issue or a recurrence after recovery can produce a new alert. Old Discord messages are not removed.

Deploy the updated bot with its existing volume and variables. No Minecraft plugin update is required. This cannot make a playlist available if YouTube does not expose it; affected channels should have their linked channel and public uploads checked.

Validation: 52 local application, notification, workflow, and YouTube recovery tests passed. Live YouTube recovery is not verified. The HTTP integration test remains unverified because this environment blocks loopback connections.

YouTube reference: https://developers.google.com/youtube/v3/docs/playlistItems/list
