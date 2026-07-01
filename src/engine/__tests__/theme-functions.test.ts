import { describe, it, expect, vi } from "vitest";
import { parseGetAuthorArgs, createGetAuthorHandler } from "../theme-functions.ts";

describe("parseGetAuthorArgs", () => {
  it("parses id/slug expression", () => {
    expect(parseGetAuthorArgs("post.id as author")).toEqual({
      idOrSlugExpr: "post.id",
      varName: "author",
    });
  });

  it("returns null for invalid syntax", () => {
    expect(parseGetAuthorArgs("post.id")).toBeNull();
  });
});

describe("createGetAuthorHandler", () => {
  it("returns null without fetch when id is empty", async () => {
    const fetcher = vi.fn();
    const handler = createGetAuthorHandler(fetcher);
    expect(await handler("")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
