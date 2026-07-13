import { ExecArgs } from "@medusajs/framework/types";
import computeCategoryTopSellers from "../jobs/compute-category-top-sellers";

/**
 * Dev harness to trigger the compute-category-top-sellers job on demand:
 *   npx medusa exec ./src/scripts/run-topseller-job.ts
 */
export default async function runTopSellerJob({ container }: ExecArgs) {
  await computeCategoryTopSellers(container);
}
