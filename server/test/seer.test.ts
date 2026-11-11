// The local cloud's package (seer/): one settings file, and LiteLLM's config, n8n's environment and the workflows
// written from it -- always answering by the same four names, so n8n and the hub never change with the set-up
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const make = (conf: string, ...args: string[]) => {
  const dir = mkdtempSync(join(tmpdir(), "seer-")), f = join(dir, "seer.env");
  writeFileSync(f, conf);
  return execFileSync("python3", [join(ROOT, "seer", "make.py"), ...args], { env: { ...process.env, SEER_CONFIG: f }, encoding: "utf8" });
};
const names = (out: string) => (out.match(/LiteLLM names: (.*)/)?.[1] ?? "").split(" ").filter(Boolean);

describe("seer/make.py", () => {
  it("with a Tiiny: its old names kept, the four names on it, local and OpenRouter behind it", () => {
    const n = names(make("SEER_TIINY=yes\nSEER_PARTS=local,sleep\nOPENROUTER_API_KEY=k\nSEER_HOST=seer\n", "--print"));
    expect(n.slice(0, 4)).toEqual(["tiiny-35b", "tiiny-9b", "tiiny-hear", "tiiny-voice"]);
    for (const x of ["seer-talk", "seer-quick", "seer-hear", "seer-voice", "seer-talk-here", "seer-talk-away"]) expect(n).toContain(x);
  });
  it("without one: local models first, then OpenRouter; no voice", () => {
    const n = names(make("SEER_TIINY=no\nSEER_PARTS=local\nOPENROUTER_API_KEY=k\nSEER_HOST=seer\n", "--print"));
    expect(n).toEqual(["seer-talk", "seer-quick", "seer-hear", "seer-talk-away"]);
  });
  it("says so when nothing can talk", () => {
    expect(make("SEER_TIINY=no\nSEER_HOST=seer\n", "--print")).toMatch(/nothing here can talk/);
  });
  it("writes n8n's environment for the same names, and keys only into the files never committed", () => {
    const out = join(ROOT, "seer", "out"), had = existsSync(out);
    if (had) return;                                     // a real local cloud's out/ is never touched by a test
    try {
      make("SEER_TIINY=yes\nSEER_PARTS=local\nLITELLM_MASTER_KEY=the-key\nTIINY_API_KEY=tk\nSEER_HOST=seer\n");
      const env = readFileSync(join(out, "n8n.env"), "utf8"), lite = readFileSync(join(out, "litellm.yaml"), "utf8");
      expect(env).toMatch(/^DAEMONS_LLM_MODEL=seer-talk$/m);
      expect(env).toMatch(/^DAEMONS_STT_MODEL=seer-hear$/m);
      expect(env).toMatch(/^DAEMONS_LLM_KEY=the-key$/m);
      expect(env).toMatch(/^DAEMONS_LLM_URL=http:\/\/host\.docker\.internal:4000$/m);
      expect(lite).not.toMatch(/the-key|tk\b/);          // LiteLLM's config names its keys by environment
      expect(lite).toMatch(/master_key: os\.environ\/LITELLM_MASTER_KEY/);
      expect(readFileSync(join(out, "services.env"), "utf8")).toMatch(/TIINY_API_KEY=tk/);
      const talk = readFileSync(join(out, "n8n", "DAEMONS - daemon_talk (internal).json"), "utf8");
      expect(talk).toMatch(/DAEMONS_LLM_KEY/);
      expect(readFileSync(join(out, "n8n", "public-relay", "DAEMONS Public - daemon_talk relay.json"), "utf8"))
        .toMatch(/http:\/\/seer:5678\/webhook\/daemon\/talk/);
    } finally { rmSync(out, { recursive: true, force: true }); }
  });
  it("is ignored by git: the settings and what is written from them", () => {
    const ignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
    expect(ignore).toMatch(/^seer\/\.seer$/m);
    expect(ignore).toMatch(/^seer\/out\/$/m);
  });
});
