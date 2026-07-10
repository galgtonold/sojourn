// Pure-function coverage for the embeddings helpers (no network). The provider
// client (embedText/embedBatch) is exercised for its no-config short-circuit.
import { describe, it, expect } from "vitest";
import {
  postEmbeddingInput,
  photoEmbeddingInput,
  toVectorLiteral,
  embedText,
  embedBatch,
} from "@/lib/ai/embeddings";
import { isEmbeddingsConfigured } from "@/lib/env";

describe("embedding input builders", () => {
  it("orders post fields and drops blanks", () => {
    expect(
      postEmbeddingInput({
        title: "Dawn on Fitz Roy",
        location: "El Chaltén",
        excerpt: "",
        body: "The granite turned to embers.",
      }),
    ).toBe("Dawn on Fitz Roy\n\nEl Chaltén\n\nThe granite turned to embers.");
  });

  it("returns an empty string when nothing is set", () => {
    expect(postEmbeddingInput({})).toBe("");
    expect(photoEmbeddingInput({ caption: null, alt: "  " })).toBe("");
  });

  it("orders photo fields (caption first, AI description last)", () => {
    expect(
      photoEmbeddingInput({
        caption: "First light",
        place_name: "Laguna de los Tres",
        ai_description: "A jagged granite spire glows orange at dawn.",
      }),
    ).toBe(
      "First light\n\nLaguna de los Tres\n\nA jagged granite spire glows orange at dawn.",
    );
  });

  it("clips overly long inputs", () => {
    const huge = "x".repeat(20000);
    expect(postEmbeddingInput({ body: huge }).length).toBe(8000);
  });
});

describe("toVectorLiteral", () => {
  it("renders the pgvector bracket form", () => {
    expect(toVectorLiteral([1, 0.5, -2])).toBe("[1,0.5,-2]");
  });
});

describe("embedding inputs include place data", () => {
  it("photo input places nearby candidates right after place_name", () => {
    expect(
      photoEmbeddingInput({
        caption: "First light",
        place_name: "Laguna de los Tres",
        nearby_places: ["Cerro Torre", "Río Fitz Roy"],
        ai_description: "A jagged spire.",
      }),
    ).toBe(
      "First light\n\nLaguna de los Tres\n\nCerro Torre Río Fitz Roy\n\nA jagged spire.",
    );
  });

  it("photo input omits nearby candidates when absent", () => {
    expect(
      photoEmbeddingInput({ caption: "First light", nearby_places: null }),
    ).toBe("First light");
  });

  it("post input places the place index right after location", () => {
    expect(
      postEmbeddingInput({
        title: "Dawn on Fitz Roy",
        location: "El Chaltén",
        place_index: "Laguna de los Tres Cerro Torre",
        body: "Granite embers.",
      }),
    ).toBe(
      "Dawn on Fitz Roy\n\nEl Chaltén\n\nLaguna de los Tres Cerro Torre\n\nGranite embers.",
    );
  });
});

describe("embeddings client without a provider", () => {
  it("is unconfigured in the test environment", () => {
    expect(isEmbeddingsConfigured).toBe(false);
  });

  it("no-ops gracefully (no network) when unconfigured", async () => {
    expect(await embedText("anything")).toBeNull();
    expect(await embedBatch(["a", "b"])).toEqual([null, null]);
  });
});
