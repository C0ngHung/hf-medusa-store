import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { evaluateProductSuggestionsWorkflow } from "../workflows/suggestive-selling/evaluate-product-suggestions";

/**
 * Dev-only harness to exercise evaluateProductSuggestions against seeded data:
 *   npx medusa exec ./src/scripts/try-evaluate.ts
 *
 * Expected (from seed):
 *   yonex-astrox-99-pro → 3 manual (no backfill)
 *   lining-axforce-80   → 2 manual + Tier-2 category backfill up to 5
 */
export default async function tryEvaluate({ container }: ExecArgs) {
  const logger = container.resolve("logger");
  const productService: any = container.resolve(Modules.PRODUCT);

  for (const handle of ["yonex-astrox-99-pro", "lining-axforce-80"]) {
    const [p] = await productService.listProducts(
      { handle },
      { select: ["id", "handle"] },
    );
    if (!p) {
      logger.warn(`[try-evaluate] product "${handle}" not found`);
      continue;
    }

    const { result } = await evaluateProductSuggestionsWorkflow(container).run({
      input: { productId: p.id },
    });

    logger.info(
      `[try-evaluate] ${handle} → ${result.length} suggestions:\n` +
        result
          .map(
            (r: any, i: number) =>
              `  ${i + 1}. [${r.tier}] ${r.product_id} (order=${r.display_order}${
                r.custom_label ? `, label="${r.custom_label}"` : ""
              })`,
          )
          .join("\n"),
    );
  }
}
