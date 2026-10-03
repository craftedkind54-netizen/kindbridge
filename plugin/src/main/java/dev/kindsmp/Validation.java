package dev.kindsmp;

import java.net.URI;
import java.util.UUID;

public final class Validation {
    private Validation() {}
    public static URI railway(String text) {
        URI uri = URI.create(text);
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null || !uri.getPath().matches("/?")) {
            throw new IllegalArgumentException("railway-url must be an HTTPS origin without credentials, path or query");
        }
        return URI.create(text.replaceAll("/$", ""));
    }
    public static void username(String edition, String name) {
        String pattern = switch (edition) {
            case "java" -> "[A-Za-z0-9_]{3,16}";
            case "bedrock" -> "[A-Za-z0-9][A-Za-z0-9 _]{0,15}";
            default -> throw new IllegalArgumentException("Unknown Minecraft edition");
        };
        if (name == null || !name.matches(pattern)) throw new IllegalArgumentException("Invalid Minecraft username");
    }
    public static UUID uuid(String text) {
        if (text == null || !text.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) throw new IllegalArgumentException("Invalid UUID");
        return UUID.fromString(text);
    }
}
