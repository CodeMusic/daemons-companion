// C-233 on the devices: THE PLAYER'S MANUAL as chapters of plain words, from DAEMONS' manual.md
import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fetchManualText, manualText } from "../src/manual.js";
import { Store } from "../src/db.js";

const MD = `# Welcome to DAEMONS {#welcome .t-CONTEXT}

DAEMONS is a total conversion of *FireRed*. You keep an **INDEX**,
and [bind](https://x) daemons.

{{screens hello crystal | The opening.}}

## A few words {#words}

::: two
| you knew | here it is |
|---|---|
| Pokédex | **THE INDEX** |
:::

- one
- two

# About this manual {#colophon}

This manual describes **{{release}}**, built against the design bible **{{bible}}** ({{date}}).
`;

describe("THE PLAYER'S MANUAL, as words (C-233)", () => {
  it("reads chapters and sections, the formatting and the build's pictures taken out, a table row by row", () => {
    const m = manualText(MD, "11.331.1");
    expect(m.chapters.map((c) => c.title)).toEqual(["Welcome to DAEMONS", "About this manual"]);
    expect(m.chapters[0].sections[0].paragraphs).toEqual(["DAEMONS is a total conversion of FireRed. You keep an INDEX, and bind daemons."]);
    expect(m.chapters[0].sections[1]).toEqual({ title: "A few words", paragraphs: ["you knew: here it is", "Pokédex: THE INDEX", "• one", "• two"] });
    expect(m.chapters[1].sections[0].paragraphs[0]).toBe("This manual describes v11.331.1, built against the design bible v11.331.");
  });

  it("is kept by its ETag, and the kept copy answers when GitHub does not", async () => {
    const store = new Store(":memory:");
    let asked = 0;
    const ok = (async (_u: string, init: any) => { asked++; return init?.headers?.["if-none-match"] === "e1"
      ? { status: 304, ok: false, headers: new Headers(), text: async () => "" }
      : { status: 200, ok: true, headers: new Headers({ etag: "e1" }), text: async () => MD }; }) as unknown as typeof fetch;
    const t = 1_000_000, later = t + 11 * 60_000;
    const first = await fetchManualText(store, ok, t);
    expect("chapters" in first && first.chapters.length).toBe(2);
    expect(await fetchManualText(store, ok, t + 60_000)).toEqual(first);
    expect(asked).toBe(1);                                         // within ten minutes, GitHub is not asked
    expect(await fetchManualText(store, ok, later)).toEqual(first);
    expect(asked).toBe(2);                                         // then asked, and it had not changed
    expect(await fetchManualText(store, (async () => { throw new Error("offline"); }) as unknown as typeof fetch, later + 11 * 60_000)).toEqual(first);
  });

  it("reads DAEMONS' own manual, when it is beside this repo", () => {
    const at = `${process.env.HOME}/Projects/DAEMONS/docs/manual/manual.md`;
    if (!existsSync(at)) return;
    const m = manualText(readFileSync(at, "utf8"));
    expect(m.chapters.length).toBeGreaterThan(5);
    const all = JSON.stringify(m);
    expect(all).not.toMatch(/\{\{|\{#|:::|\*\*/);
  });
});
