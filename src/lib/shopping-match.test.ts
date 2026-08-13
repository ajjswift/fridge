import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isConfidentShoppingMatch } from "./shopping-match";

const item = (name: string, productId: number | null = null) => ({ id: 1, name, product_id: productId });
const product = (name: string, id = 10, category: string | null = null) => ({ id, name, brand: null, category });

describe("isConfidentShoppingMatch", () => {
  it("matches the exact saved product regardless of the text", () => {
    assert.equal(isConfidentShoppingMatch(item("Weekly treat", 10), product("Anything", 10)), true);
  });

  it("ignores pack-size differences in otherwise exact names", () => {
    assert.equal(isConfidentShoppingMatch(item("Pasta 1kg"), product("Pasta 2 kg")), true);
  });

  it("matches a specific free-typed word inside a fuller scanned name", () => {
    assert.equal(isConfidentShoppingMatch(item("Minstrels"), product("Minstrels Milk Chocolate")), true);
  });

  it("matches a broad request when the scanned product carries that category", () => {
    assert.equal(
      isConfidentShoppingMatch(
        item("Pasta"),
        product("Fusilli", 10, "Plant-based foods, Cereals and potatoes, Pastas"),
      ),
      true,
    );
  });

  it("does not treat generic partial names as a match without category evidence", () => {
    assert.equal(isConfidentShoppingMatch(item("Milk"), product("Oat Milk Barista")), false);
    assert.equal(isConfidentShoppingMatch(item("Chocolate"), product("Dark Chocolate Raisins")), false);
  });
});
