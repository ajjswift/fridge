import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dateFromGS1, looksLikeGS1, parseGS1, parseGS1Date } from "./gs1";

/** The GS1 group separator that terminates variable-length fields. */
const GS = "\x1D";

/** A real GTIN-14 for a retail item; reduces to EAN-13 5410201000579. */
const GTIN = "0105410201000579";

describe("parseGS1Date", () => {
  it("reads a full YYMMDD date", () => {
    assert.deepEqual(parseGS1Date("260915"), {
      iso: "2026-09-15",
      precision: "day",
    });
  });

  it("treats a day of 00 as the end of that month", () => {
    assert.deepEqual(parseGS1Date("260900"), {
      iso: "2026-09-30",
      precision: "month",
    });
  });

  it("gets February right in leap and non-leap years", () => {
    assert.equal(parseGS1Date("280200")?.iso, "2028-02-29");
    assert.equal(parseGS1Date("270200")?.iso, "2027-02-28");
  });

  it("rejects impossible dates", () => {
    assert.equal(parseGS1Date("261301"), null, "month 13");
    assert.equal(parseGS1Date("260931"), null, "31 September");
    assert.equal(parseGS1Date("2609"), null, "too short");
  });
});

describe("parseGS1", () => {
  it("reads a GTIN and use-by date", () => {
    const result = parseGS1(`${GTIN}17260915`);
    assert.equal(result?.barcode, "5410201000579");
    assert.deepEqual(result?.useBy, { iso: "2026-09-15", precision: "day" });
  });

  it("reads a month-only best-before alongside a variable-length lot", () => {
    const result = parseGS1(`${GTIN}1526090010ABC123${GS}`);
    assert.deepEqual(result?.bestBefore, {
      iso: "2026-09-30",
      precision: "month",
    });
    assert.equal(result?.lot, "ABC123");
  });

  it("handles a variable-length field before a fixed one", () => {
    const result = parseGS1(`${GTIN}10LOT99${GS}17261231`);
    assert.equal(result?.lot, "LOT99");
    assert.equal(result?.useBy?.iso, "2026-12-31");
  });

  it("strips the scanner's symbology prefix", () => {
    assert.equal(parseGS1(`]C1${GTIN}17260915`)?.barcode, "5410201000579");
  });

  // The important negative case: a normal retail barcode must fall through to
  // the plain-barcode path rather than being mangled into element strings.
  it("returns null for plain retail barcodes", () => {
    assert.equal(parseGS1("5449000000996"), null, "EAN-13");
    assert.equal(parseGS1("54491472"), null, "EAN-8");
    assert.equal(parseGS1("012345678905"), null, "UPC-A");
  });
});

describe("dateFromGS1", () => {
  it("prefers use-by over best-before, because it's the safety one", () => {
    const result = parseGS1(`${GTIN}1527010117260915`)!;
    assert.deepEqual(dateFromGS1(result), {
      iso: "2026-09-15",
      precision: "day",
      type: "use_by",
    });
  });

  it("falls back to best-before", () => {
    const result = parseGS1(`${GTIN}15260900`)!;
    assert.deepEqual(dateFromGS1(result), {
      iso: "2026-09-30",
      precision: "month",
      type: "best_before",
    });
  });
});

describe("looksLikeGS1", () => {
  it("recognises element strings", () => {
    assert.equal(looksLikeGS1(`${GTIN}17260915`), true);
    assert.equal(looksLikeGS1(`${GTIN}${GS}`), true);
  });

  it("leaves plain barcodes alone", () => {
    assert.equal(looksLikeGS1("5449000000996"), false);
  });
});
