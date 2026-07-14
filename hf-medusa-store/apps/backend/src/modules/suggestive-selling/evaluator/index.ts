/**
 * Evaluator barrel — SPEC A.4.
 * `engine` holds the I/O layer (EvaluationEngine: enrich + BR-02 filter + response
 * over selected candidates); `pipeline` holds the pure business-rule functions.
 * Import pure functions straight from ./pipeline in unit tests to avoid loading
 * the Medusa runtime.
 */
export { EvaluationEngine } from "./engine";
export type { EngineDeps, EngineLogger, QueryGraph } from "./engine";
export { CartEvaluationEngine } from "./cart-engine";
export type { CartEngineDeps, CartRuleService } from "./cart-engine";
export * from "./pipeline";
export * from "./cart-rules";
