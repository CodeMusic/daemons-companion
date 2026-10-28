import { describe, expect, it } from "vitest";
import { EXPRESSIONS, expressionFor, faceOf, mouthPatch } from "../src/expressions.js";

describe("C-213: the mouth, open while it speaks", () => {
  it("is known where a person found it, and nothing elsewhere", () => {
    const f = faceOf("archiver")!;                            // faces.json: mouth [16, 28, 2, 1]
    expect(mouthPatch(f, EXPRESSIONS.awake)).toEqual([{ x: 16, y: 28, w: 2, h: 2, rgb: expect.any(Array) }]);
    expect(mouthPatch(faceOf("artsai")!, EXPRESSIONS.awake)).toEqual([]);   // no mouth found yet
  });
  it("is red inside when there is room", () => {
    const p = mouthPatch({ eyes: [], fill: 1, line: 5, lineRgb: [16, 16, 16], mouth: [10, 40, 5, 3] }, EXPRESSIONS.awake);
    expect(p).toHaveLength(2);
    expect(p[1]).toMatchObject({ x: 11, y: 41, w: 3, h: 2 });
  });
  it("rides every host's expression", () => {
    expect(expressionFor({ tired: "awake" }, null, faceOf("archiver")).mouth).toHaveLength(1);
    expect(expressionFor({ tired: "awake" }, null, null).mouth).toEqual([]);
  });
});
