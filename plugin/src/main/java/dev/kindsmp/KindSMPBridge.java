package dev.kindsmp;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.plugin.java.JavaPlugin;

public final class KindSMPBridge extends JavaPlugin {
    private ScheduledExecutorService worker;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private URI origin; private String secret; private ScoreboardAdapter adapter;
    private volatile String status = "Not configured";
    private volatile long lastWarning;
    @Override public void onEnable() {
        saveDefaultConfig();
        adapter = new ScoreboardAdapter(this);
        try {
            if (getConfig().getBoolean("scoreboard-integration",true) && Bukkit.getPluginManager().isPluginEnabled("CreatorScoreboard")) {
                try { adapter.configure(); }
                catch (Exception e) { getLogger().warning("Scoreboard setup failed; whitelist processing will continue: "+rootMessage(e)); }
            }
            origin = Validation.railway(getConfig().getString("railway-url",""));
            secret = getConfig().getString("bridge-secret", "");
            if (secret.length()<32 || origin.getHost().contains("YOUR-SERVICE")) throw new IllegalArgumentException("Set railway-url and bridge-secret in plugins/KindSMPBridge/config.yml, then restart");
            worker = Executors.newSingleThreadScheduledExecutor(r -> { Thread t=new Thread(r,"KindSMP-Bridge"); t.setDaemon(true); return t; });
            worker.scheduleWithFixedDelay(this::poll,0,Math.max(5,getConfig().getInt("poll-seconds",10)),TimeUnit.SECONDS);
            status = "Connecting";
        } catch (Exception e) { status="Configuration needed"; getLogger().warning(e.getMessage()); }
    }
    private JsonObject request(String path, JsonObject body) throws Exception {
        var builder = HttpRequest.newBuilder(origin.resolve(path)).timeout(Duration.ofSeconds(20)).header("Authorization","Bearer "+secret).header("Accept","application/json");
        if (body != null) builder.header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(body.toString()));
        var result=http.send(builder.build(),HttpResponse.BodyHandlers.ofString());
        if (result.statusCode()!=200) throw new IllegalStateException("Railway HTTP "+result.statusCode());
        if (result.body().length()>262144) throw new IllegalStateException("Response too large");
        return JsonParser.parseString(result.body()).getAsJsonObject();
    }
    private void poll() {
        if (!isEnabled()) return;
        try {
            int processed = QueueDrain.drain(20, this::isEnabled, this::processNext);
            if (processed > 0) getLogger().info("Processed "+processed+" queued Kind SMP request(s).");
        } catch (Exception e) {
            status="Connection failed; retrying";
            if (System.currentTimeMillis()-lastWarning>60000) { lastWarning=System.currentTimeMillis(); getLogger().warning("Railway connection failed: "+rootMessage(e)); }
        }
    }
    private boolean processNext() throws Exception {
            JsonObject response=request("/bridge/jobs",null); status="Connected";
            if (!response.has("job") || response.get("job").isJsonNull()) return false;
            JsonObject job=response.getAsJsonObject("job"), ack=new JsonObject();
            ack.addProperty("id",job.get("id").getAsString()); ack.addProperty("lease",job.get("lease").getAsString());
            try {
                JsonObject result=execute(job.get("kind").getAsString(),job.getAsJsonObject("payload"));
                ack.addProperty("success",true); ack.add("result",result);
            } catch (Exception e) {
                ack.addProperty("success",false);
                String reason = rootMessage(e); ack.addProperty("error",reason);
                getLogger().warning("Kind SMP job failed: "+reason);
            }
            request("/bridge/ack",ack);
            return true;
    }
    private String rootMessage(Throwable e) {
        while(e.getCause()!=null) e=e.getCause();
        String text=e.getMessage(); if(text==null) text=e.getClass().getSimpleName();
        return text.substring(0,Math.min(250,text.length()));
    }
    private JsonObject execute(String kind, JsonObject data) throws Exception {
        JsonObject result=new JsonObject();
        switch(kind) {
            case "whitelist" -> {
                String edition=data.get("edition").getAsString(), name=data.get("username").getAsString();
                Validation.username(edition,name);
                UUID uuid=resolve(edition,name);
                onMain(()-> {
                    Bukkit.getOfflinePlayer(uuid).setWhitelisted(true);
                    if (!Bukkit.getOfflinePlayer(uuid).isWhitelisted()) throw new IllegalStateException("Whitelist was not saved");
                });
                result.addProperty("uuid",uuid.toString());
            }
            case "creator" -> {
                if (!getConfig().getBoolean("scoreboard-integration",true)) throw new IllegalStateException("Scoreboard integration disabled");
                onMain(()->adapter.sync(data));
            }
            case "unlink" -> onMain(()->adapter.unlink(Validation.uuid(data.get("uuid").getAsString())));
            default -> throw new IllegalArgumentException("Unknown job type");
        }
        return result;
    }
    private UUID resolve(String edition, String name) throws Exception {
        if (edition.equals("bedrock")) {
            var plugin=Bukkit.getPluginManager().getPlugin("floodgate");
            if (plugin==null || !plugin.isEnabled()) throw new IllegalStateException("Install Floodgate on this Paper server for Bedrock whitelisting");
            Class<?> api=Class.forName("org.geysermc.floodgate.api.FloodgateApi",true,plugin.getClass().getClassLoader());
            Object instance=api.getMethod("getInstance").invoke(null);
            Object pending=api.getMethod("getUuidFor",String.class).invoke(instance,name);
            UUID uuid=(UUID)((CompletableFuture<?>)pending).get(30,TimeUnit.SECONDS);
            if(uuid==null) throw new IllegalArgumentException("Xbox gamertag not found; check spelling and spaces");
            Object links=api.getMethod("getPlayerLink").invoke(instance);
            if (links != null) {
                Class<?> linkApi=Class.forName("org.geysermc.floodgate.api.link.PlayerLink",true,plugin.getClass().getClassLoader());
                if (Boolean.TRUE.equals(linkApi.getMethod("isEnabled").invoke(links))) {
                    Object linked=((CompletableFuture<?>)linkApi.getMethod("getLinkedPlayer",UUID.class).invoke(links,uuid)).get(30,TimeUnit.SECONDS);
                    if (linked != null) return (UUID)linked.getClass().getMethod("getJavaUniqueId").invoke(linked);
                }
            }
            return uuid;
        }
        var profile=Bukkit.createPlayerProfile(name).update().get(30,TimeUnit.SECONDS);
        UUID uuid=profile.getUniqueId();
        if (uuid==null || profile.getName()==null || !profile.getName().equalsIgnoreCase(name)) throw new IllegalArgumentException("Java Minecraft account not found");
        return uuid;
    }
    private void onMain(CheckedRunnable runnable) throws Exception {
        Bukkit.getScheduler().callSyncMethod(this,()-> { runnable.run(); return null; }).get(30,TimeUnit.SECONDS);
    }
    @FunctionalInterface private interface CheckedRunnable { void run() throws Exception; }
    @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length>0 && args[0].equalsIgnoreCase("status") && sender.hasPermission("kindsmp.admin")) sender.sendMessage("Kind SMP: "+status);
        else sender.sendMessage("Apply and verify YouTube in Discord: "+getConfig().getString("application-url"));
        return true;
    }
    @Override public void onDisable() { if(worker!=null) worker.shutdownNow(); }
}
