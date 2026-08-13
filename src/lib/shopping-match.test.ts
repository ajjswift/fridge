import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isConfidentShoppingMatch } from "./shopping-match";

const item = (name: string, productId: number | null = null) => ({ id: 1, name, product_id: productId });
const product = (name: string, id = 10) => ({ id, name, brand: null });

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

  it("does not treat generic partial names as a match", () => {
    assert.equal(isConfidentShoppingMatch(item("Milk"), product("Oat Milk Barista")), false);
    assert.equal(isConfidentShoppingMatch(item("Chocolate"), product("Dark Chocolate Raisins")), false);
  });
});
