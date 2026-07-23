// `jest.spyOn` on this module's named export fails under the SWC/ESM
// transform in this repo ("Cannot redefine property") — mock the module with
// a factory instead, same net effect (assert on call args to the mock).
const isRateLimitedMock = jest.fn();
jest.mock("../../../lib/voucher-rate-limit", () => ({
  isRateLimited: (...args: unknown[]) => isRateLimitedMock(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { voucherRateLimitMiddleware } = require("../voucher-rate-limit");

describe("voucherRateLimitMiddleware — IP source (unit)", () => {
  beforeEach(() => {
    isRateLimitedMock.mockReset();
    isRateLimitedMock.mockResolvedValue(false);
  });

  it("never derives the rate-limit IP from the client-controlled X-Forwarded-For header", async () => {
    const req: any = {
      headers: { "x-forwarded-for": "1.2.3.4" },
      ip: "10.0.0.5",
      auth_context: { actor_id: "cus_1" },
    };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await voucherRateLimitMiddleware(req, res, next);

    expect(isRateLimitedMock).toHaveBeenCalledWith(
      undefined,
      "cus_1",
      "10.0.0.5",
    );
    expect(next).toHaveBeenCalled();
  });

  it("returns a 429 body matching the shared ErrorEnvelope contract", async () => {
    isRateLimitedMock.mockResolvedValue(true);

    const req: any = { headers: {}, ip: "10.0.0.5", auth_context: {} };
    const json = jest.fn();
    const res: any = { status: jest.fn().mockReturnValue({ json }) };
    const next = jest.fn();

    await voucherRateLimitMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "rate_limited",
        code: "VOUCHER_RATE_LIMITED",
        message: expect.any(String),
        customer_message:
          "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 30 phút.",
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
