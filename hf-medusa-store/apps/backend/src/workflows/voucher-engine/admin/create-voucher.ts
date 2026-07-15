import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  createVoucherStep,
  type CreateVoucherStepInput,
} from "./steps/create-voucher";

/**
 * POST /admin/vouchers (3.4.11, SRS §6.4). Thin create wrapped in a workflow so
 * the create step's compensation can roll back on any future extension (e.g.
 * cache warm / link wiring). Returns the created voucher.
 */
export const createVoucherWorkflow = createWorkflow(
  "create-voucher",
  (input: CreateVoucherStepInput) => {
    const voucher = createVoucherStep(input);
    return new WorkflowResponse(voucher);
  },
);

export default createVoucherWorkflow;
