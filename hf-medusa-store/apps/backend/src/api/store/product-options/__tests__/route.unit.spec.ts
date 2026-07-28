import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils";
import { GET } from "../route";

describe("GET /store/product-options unit tests", () => {
  const createMockReqRes = (productsData: any[]) => {
    const mockQuery = {
      graph: jest.fn().mockResolvedValue({ data: productsData }),
    };

    const req: any = {
      scope: {
        resolve: jest.fn().mockImplementation((key: string) => {
          if (key === ContainerRegistrationKeys.QUERY || key === "query") {
            return mockQuery;
          }
          throw new Error(`Unknown registration key: ${key}`);
        }),
      },
    };

    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    return { req, res, mockQuery };
  };

  it("should return empty list when no published products exist", async () => {
    const { req, res } = createMockReqRes([]);

    await GET(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ product_options: [] });
  });

  it("should group options by title, aggregate all option_value IDs per value text, and filter out 'Default' options", async () => {
    const productsData = [
      {
        id: "prod_1",
        status: ProductStatus.PUBLISHED,
        deleted_at: null,
        options: [
          {
            id: "opt_default",
            title: "Default",
            deleted_at: null,
            values: [{ id: "optval_def", value: "Default", deleted_at: null }],
          },
          {
            id: "opt_1",
            title: "Size",
            deleted_at: null,
            values: [
              { id: "optval_1", value: "41", deleted_at: null },
              { id: "optval_2", value: "42", deleted_at: null },
            ],
          },
        ],
      },
      {
        id: "prod_2",
        status: ProductStatus.PUBLISHED,
        deleted_at: null,
        options: [
          {
            id: "opt_2",
            title: "Size",
            deleted_at: null,
            values: [
              { id: "optval_3", value: "42", deleted_at: null },
              { id: "optval_4", value: "43", deleted_at: null },
            ],
          },
          {
            id: "opt_3",
            title: "Color",
            deleted_at: null,
            values: [
              { id: "optval_5", value: "Red", deleted_at: null },
            ],
          },
        ],
      },
    ];

    const { req, res } = createMockReqRes(productsData);

    await GET(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      product_options: [
        {
          id: "opt_1",
          title: "Size",
          values: [
            { id: "optval_1", value: "41" },
            { id: "optval_2,optval_3", value: "42" },
            { id: "optval_4", value: "43" },
          ],
        },
        {
          id: "opt_3",
          title: "Color",
          values: [
            { id: "optval_5", value: "Red" },
          ],
        },
      ],
    });
  });

  it("should exclude soft-deleted or non-published products and soft-deleted options/values", async () => {
    const productsData = [
      {
        id: "prod_draft",
        status: ProductStatus.DRAFT,
        deleted_at: null,
        options: [
          {
            id: "opt_draft",
            title: "DraftOption",
            deleted_at: null,
            values: [{ id: "val_draft", value: "X", deleted_at: null }],
          },
        ],
      },
      {
        id: "prod_deleted",
        status: ProductStatus.PUBLISHED,
        deleted_at: new Date(),
        options: [
          {
            id: "opt_deleted_prod",
            title: "DeletedProdOption",
            deleted_at: null,
            values: [{ id: "val_del_prod", value: "Y", deleted_at: null }],
          },
        ],
      },
      {
        id: "prod_pub",
        status: ProductStatus.PUBLISHED,
        deleted_at: null,
        options: [
          {
            id: "opt_del",
            title: "DeletedOption",
            deleted_at: new Date(),
            values: [{ id: "val_1", value: "Z", deleted_at: null }],
          },
          {
            id: "opt_valid",
            title: "ValidOption",
            deleted_at: null,
            values: [
              { id: "val_del", value: "DeletedVal", deleted_at: new Date() },
              { id: "val_good", value: "GoodVal", deleted_at: null },
            ],
          },
        ],
      },
    ];

    const { req, res } = createMockReqRes(productsData);

    await GET(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      product_options: [
        {
          id: "opt_valid",
          title: "ValidOption",
          values: [{ id: "val_good", value: "GoodVal" }],
        },
      ],
    });
  });
});
