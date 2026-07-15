import { decideRateLimit } from "../lib/rate-limit-policy";
import {
  FAIL_THRESHOLD,
  FAIL_WINDOW_S,
  COOLDOWN_S,
} from "../../../modules/voucher-engine/constants";

/**
 * Unit tests for the pure rate-limit policy (3.7.4, 3.7.5; EC-10/SEC-02).
 * No Redis: exercises only the deterministic decision from a fail count.
 */
describe("decideRateLimit (3.7.4/3.7.5)", () => {
  it("allows below the threshold (0..4)", () => {
    for (let n = 0; n < FAIL_THRESHOLD; n++) {
      expect(decideRateLimit(n)).toEqual({
        blocked: false,
        shouldSetCooldown: false,
      });
    }
  });

  it("blocks + arms cooldown at exactly the threshold (5)", () => {
    expect(decideRateLimit(FAIL_THRESHOLD)).toEqual({
      blocked: true,
      shouldSetCooldown: true,
    });
  });

  it("stays blocked beyond the threshold", () => {
    expect(decideRateLimit(FAIL_THRESHOLD + 3)).toEqual({
      blocked: true,
      shouldSetCooldown: true,
    });
  });

  it("uses the team-unified windows (15m count / 30m penalty)", () => {
    // Guards against accidental drift from REDIS_USAGE.md §3.
    expect(FAIL_THRESHOLD).toBe(5);
    expect(FAIL_WINDOW_S).toBe(15 * 60);
    expect(COOLDOWN_S).toBe(30 * 60);
  });
});
