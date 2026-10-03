package dev.kindsmp;

import com.google.gson.JsonObject;
import java.lang.reflect.Method;
import java.time.Instant;
import java.util.UUID;
import org.bukkit.Bukkit;
import org.bukkit.plugin.java.JavaPlugin;

/** Narrow adapter for the public methods inspected in the user's CreatorScoreboard 1.0.0. */
final class ScoreboardAdapter {
    private final JavaPlugin owner;
    ScoreboardAdapter(JavaPlugin owner) { this.owner = owner; }
    private JavaPlugin scoreboard() {
        var p = Bukkit.getPluginManager().getPlugin("CreatorScoreboard");
        if (!(p instanceof JavaPlugin jp) || !p.isEnabled()) throw new IllegalStateException("CreatorScoreboard 1.0.0 is not enabled");
        return jp;
    }
    static Object call(Object target, String name, Object... args) throws Exception {
        for (Method m : target.getClass().getMethods()) {
            if (!m.getName().equals(name) || m.getParameterCount() != args.length) continue;
            boolean matches = true;
            var types = m.getParameterTypes();
            for (int i=0;i<args.length;i++) {
                Class<?> t = types[i];
                if (t == long.class) t = Long.class;
                if (t == boolean.class) t = Boolean.class;
                if (t == int.class) t = Integer.class;
                if (args[i] != null && !t.isInstance(args[i])) matches = false;
            }
            if (matches) return m.invoke(target, args);
        }
        throw new NoSuchMethodException("Unsupported scoreboard API: " + name);
    }
    void configure() throws Exception {
        if (!owner.getConfig().getBoolean("manage-scoreboard-youtube", true)) return;
        JavaPlugin board = scoreboard();
        board.getConfig().set("youtube.api-key", "");
        board.getConfig().set("youtube.update-minutes", 10080);
        board.getConfig().set("verification.enabled", false);
        board.saveConfig();
        call(board,"reloadPluginConfig");
        // Route both plain and namespaced commands through the public PluginCommand objects.
        if (board.getCommand("youtube") != null) board.getCommand("youtube").setExecutor((s,c,l,a)-> {
            s.sendMessage("Verify your YouTube channel in Discord with /youtube and /verify."); return true;
        });
        if (board.getCommand("scoreboardupdate") != null) board.getCommand("scoreboardupdate").setExecutor((s,c,l,a)-> {
            s.sendMessage("Kind SMP refreshes creator statistics weekly through Railway."); return true;
        });
        owner.getLogger().info("CreatorScoreboard API key cleared; Railway manages weekly statistics.");
    }
    void sync(JsonObject data) throws Exception {
        JavaPlugin board = scoreboard();
        Object manager = call(board,"getCreatorManager");
        UUID uuid = Validation.uuid(data.get("uuid").getAsString());
        String channel = data.get("channelId").getAsString();
        if (!channel.matches("UC[A-Za-z0-9_-]{22}")) throw new IllegalArgumentException("Invalid channel ID");
        Object other = call(manager,"byChannelId",channel);
        if (other != null && !uuid.equals(call(other,"getUuid"))) throw new IllegalStateException("Channel already belongs to another scoreboard player");
        Object creator = call(manager,"getOrCreate",uuid,data.get("minecraftName").getAsString());
        long refreshed = data.get("refreshedAt").getAsLong();
        Instant existing = (Instant) call(creator,"getLastSuccessfulRefresh");
        if (existing != null && existing.toEpochMilli() > refreshed) return;
        for (String field : new String[]{"channelId","channelName","channelUrl","uploadPlaylistId","profilePictureUrl"}) {
            call(creator,"set"+Character.toUpperCase(field.charAt(0))+field.substring(1),data.get(field).getAsString());
        }
        if (existing == null || existing.toEpochMilli() != refreshed) {
            for (String field : new String[]{"Subscribers","Likes","Uploads"}) call(creator,"setPrevious"+field,call(creator,"get"+field));
        }
        for (String field : new String[]{"subscribers","likes","uploads"}) {
            long value = data.get(field).getAsLong();
            if (value < 0 || value > 1_000_000_000_000L) throw new IllegalArgumentException("Invalid creator statistic");
            call(creator,"set"+Character.toUpperCase(field.charAt(0))+field.substring(1),value);
        }
        call(creator,"setVerified",true);
        call(creator,"setLastSuccessfulRefresh",Instant.ofEpochMilli(refreshed));
        call(board,"finishCreatorLink",creator,false);
        // finishCreatorLink persists asynchronously; also wait for a durable save before acknowledging.
        call(manager,"save",creator);
        Object physical = call(board,"getPhysicalLeaderboard");
        call(physical,"setCountdownMillis",Math.max(0L,data.get("nextRefreshAt").getAsLong()-System.currentTimeMillis()));
    }
    void unlink(UUID uuid) throws Exception {
        JavaPlugin board = scoreboard(); Object manager = call(board,"getCreatorManager");
        Object creator = call(manager,"get",uuid);
        if (creator != null) call(board,"unlinkCreator",creator);
        call(call(board,"getDatabaseManager"),"deleteCreator",uuid);
    }
}
