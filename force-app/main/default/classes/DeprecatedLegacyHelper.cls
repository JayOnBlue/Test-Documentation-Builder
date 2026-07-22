/**
 * Not called from anywhere, doesn't call anything. Left in place to prove the
 * docs site's "no dependents found" and "no dependencies found" states work,
 * and that a fully isolated component is correctly excluded from Features.
 */
public class DeprecatedLegacyHelper {
    public static String formatLegacyCode(String input) {
        return input == null ? '' : input.trim().toUpperCase();
    }
}
