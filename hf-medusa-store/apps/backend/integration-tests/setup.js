// Jest `setupFiles` entry — runs before the test framework is installed, so it
// must stay side-effect free (no afterEach/beforeEach here). Unit suites need
// nothing; integration suites manage their own lifecycle via @medusajs/test-utils.
process.env.MEDUSA_WORKER_MODE = process.env.MEDUSA_WORKER_MODE || "shared";
