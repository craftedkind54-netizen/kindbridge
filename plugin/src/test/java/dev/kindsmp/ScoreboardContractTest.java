package dev.kindsmp;
import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.*;
import java.net.URLClassLoader;
import java.nio.file.Path;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ScoreboardContractTest {
    @Test void suppliedJarExposesEveryMethodUsedByAdapter() throws Exception {
        String jar=System.getProperty("creator.jar");
        assumeTrue(jar!=null,"Optional local CreatorScoreboard JAR contract check");
        try (var loader=new URLClassLoader(new java.net.URL[]{Path.of(jar).toUri().toURL()},getClass().getClassLoader())) {
            String root="com.craftedsmp.creatorscoreboard.";
            Class<?> plugin=loader.loadClass(root+"CreatorScoreboardPlugin");
            Class<?> creator=loader.loadClass(root+"creator.Creator");
            Class<?> manager=loader.loadClass(root+"creator.CreatorManager");
            Class<?> board=loader.loadClass(root+"leaderboard.PhysicalLeaderboard");
            for(String method:new String[]{"reloadPluginConfig","getCreatorManager","getDatabaseManager","getPhysicalLeaderboard"}) assertNotNull(plugin.getMethod(method));
            assertNotNull(plugin.getMethod("finishCreatorLink",creator,boolean.class));
            assertNotNull(plugin.getMethod("unlinkCreator",creator));
            assertNotNull(manager.getMethod("getOrCreate",UUID.class,String.class));
            assertNotNull(manager.getMethod("byChannelId",String.class));
            assertNotNull(manager.getMethod("get",UUID.class));
            assertNotNull(manager.getMethod("save",creator));
            assertNotNull(board.getMethod("setCountdownMillis",long.class));
            for(String field:new String[]{"ChannelId","ChannelName","ChannelUrl","UploadPlaylistId","ProfilePictureUrl"}) assertNotNull(creator.getMethod("set"+field,String.class));
            for(String field:new String[]{"Subscribers","Likes","Uploads"}) {
                assertNotNull(creator.getMethod("get"+field)); assertNotNull(creator.getMethod("set"+field,long.class)); assertNotNull(creator.getMethod("setPrevious"+field,long.class));
            }
            assertNotNull(creator.getMethod("getUuid"));
            assertNotNull(creator.getMethod("setVerified",boolean.class));
            assertNotNull(creator.getMethod("getLastSuccessfulRefresh"));
            assertNotNull(creator.getMethod("setLastSuccessfulRefresh",Instant.class));
        }
    }
}
