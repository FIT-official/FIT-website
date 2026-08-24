import { timingSafeEqual } from "crypto";

// Constant-time comparison for cron bearer-token auth — a plain `!==` on
// strings short-circuits on the first mismatched byte, leaking timing
// information about how much of the secret an attacker has guessed.
export function verifyCronSecret(provided, expected) {
    const a = Buffer.from(String(provided ?? ""), "utf8");
    const b = Buffer.from(String(expected ?? ""), "utf8");
    if (a.length !== b.length) {
        // Compare against a same-length buffer so this branch takes
        // comparable time to the equal-length case, then always return false.
        timingSafeEqual(a, a);
        return false;
    }
    return timingSafeEqual(a, b);
}
