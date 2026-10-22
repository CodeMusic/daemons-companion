// C-180 (the user, 2026-10-22: "adding support for the ax630 so I can benchmark its practicality and discuss voice
// options"): every model the Module LLM holds, timed as the companion would use it -- and every voice saved, to listen to.
//
//   npx tsx tools/ax630bench.ts http://<module>:8000                  every model the module lists
//   npx tsx tools/ax630bench.ts http://<module>:8000 --out DIR        where the report and the voices go (./ax630-bench)
//   npx tsx tools/ax630bench.ts URL --only qwen2.5-0.5b --runs 5      some models, more runs each
//   npx tsx tools/ax630bench.ts URL --wav said.wav                    a real recording for speech to text too
//
// Thinking (llm): the time to the first words -- what a device waits on -- the whole answer, and words a second, for a
// daemon's short reply. Speaking (tts): the time to make a line, and the line saved (DIR/voice-<model>-<n>.wav) to hear.
// Hearing (stt): a voice made above heard back (and --wav if given), with the time and what it heard.
// It runs on the hub (the module is on the hub's own link) or on any computer that reaches the module. It reads only.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chat, hear, listModels, speak, type ModuleModel } from "../src/ai/module.js";

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const out = flag("--out") ?? "ax630-bench", only = flag("--only")?.toLowerCase().split(","), runs = Number(flag("--runs") ?? 3);
const wavPath = flag("--wav");
const base = args[0];
if (!base) { console.error("ax630bench: give the module's address, e.g. http://192.168.50.2:8000"); process.exit(2); }

// A daemon's turn, as the companion asks it: short, in character, a sentence or two
const SYSTEM = "You are ROVERCUB, a small daemon who lives on the user's handheld. Answer in one or two short sentences, warmly, in character.";
const ASKS = ["Good morning! How are you today?", "I finished my walk. What should I do next?", "Tell me something you noticed today."];
const LINES = [
  "Good morning. The day is blue, and so am I, a little.",            // a daemon's line
  "ROVERCUB. A small daemon that keeps watch while you sleep.",      // an INDEX-like line
];

const ms = (n: number | null) => n === null ? "--" : `${Math.round(n)} ms`;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

async function main() {
  mkdirSync(out, { recursive: true });
  const report: string[] = [`# AX630 benchmark`, ``, `${new Date().toISOString()} -- ${base}, ${runs} runs a model`, ``];
  let models: ModuleModel[];
  try { models = await listModels(base); }
  catch (e) {
    console.error(`ax630bench: no model list at ${base}/v1/models -- ${(e as Error).message}`);
    console.error("  Is llm-openai-api installed and running on the module (apt install llm-openai-api; systemctl restart llm-openai-api)?");
    process.exit(1);
  }
  if (only) models = models.filter((m) => only.some((o) => m.id.toLowerCase().includes(o)));
  report.push(`## Models`, ``, ...models.map((m) => `- \`${m.id}\` (${m.kind})`), ``);
  console.log(`models: ${models.map((m) => `${m.id} (${m.kind})`).join(", ")}`);

  report.push(`## Thinking`, ``, `| model | first words (median) | whole answer (median) | words/s | an answer |`, `|---|---|---|---|---|`);
  for (const m of models.filter((x) => x.kind === "llm")) {
    const firsts: number[] = [], totals: number[] = [], rates: number[] = []; let sample = "", failed = "";
    for (let i = 0; i < runs; i++) {
      try {
        const r = await chat(base, m.id, [{ role: "system", content: SYSTEM }, { role: "user", content: ASKS[i % ASKS.length] }], { maxTokens: 60 });
        if (r.firstMs !== null) firsts.push(r.firstMs);
        totals.push(r.totalMs);
        const words = r.text.trim().split(/\s+/).filter(Boolean).length, after = r.totalMs - (r.firstMs ?? 0);
        if (words > 1 && after > 0) rates.push((words - 1) / (after / 1000));
        sample ||= r.text.trim().replace(/\s+/g, " ").slice(0, 140);
        console.log(`  ${m.id} #${i + 1}: first ${ms(r.firstMs)}, all ${ms(r.totalMs)}, "${r.text.trim().slice(0, 60)}"`);
      } catch (e) { failed = (e as Error).message; console.log(`  ${m.id} #${i + 1}: ${failed}`); }
    }
    report.push(firsts.length || totals.length
      ? `| \`${m.id}\` | ${ms(median(firsts))} | ${ms(median(totals))} | ${rates.length ? median(rates).toFixed(1) : "--"} | ${sample.replace(/\|/g, "/")} |`
      : `| \`${m.id}\` | failed | | | ${failed.replace(/\|/g, "/").slice(0, 120)} |`);
  }

  report.push(``, `## Speaking`, ``, `| model | line | made in | saved |`, `|---|---|---|---|`);
  const made: { file: string; wav: Buffer; text: string }[] = [];
  for (const m of models.filter((x) => x.kind === "tts")) {
    for (const [n, line] of LINES.entries()) {
      try {
        const r = await speak(base, m.id, line);
        const wav = r.audio.subarray(0, 4).toString("latin1") === "RIFF";
        const file = `voice-${m.id.replace(/[^\w.-]/g, "_")}-${n + 1}.${wav ? "wav" : "pcm"}`;
        writeFileSync(join(out, file), r.audio);
        if (wav) made.push({ file, wav: r.audio, text: line });
        report.push(`| \`${m.id}\` | ${line} | ${ms(r.ms)} | ${file} (${r.mime}, ${Math.round(r.audio.length / 1024)} KB) |`);
        console.log(`  ${m.id}: ${ms(r.ms)} -> ${file}`);
      } catch (e) { report.push(`| \`${m.id}\` | ${line} | failed | ${(e as Error).message.slice(0, 120)} |`); }
    }
  }

  report.push(``, `## Hearing`, ``, `| model | recording | heard in | heard |`, `|---|---|---|---|`);
  const recordings = [...made.slice(0, 2), ...(wavPath ? [{ file: wavPath, wav: readFileSync(wavPath), text: "(your recording)" }] : [])];
  for (const m of models.filter((x) => x.kind === "stt")) {
    if (!recordings.length) { report.push(`| \`${m.id}\` | (no recording: no voice was made, and no --wav) | | |`); continue; }
    for (const rec of recordings) {
      try {
        const r = await hear(base, m.id, rec.wav);
        report.push(`| \`${m.id}\` | ${rec.file} | ${ms(r.ms)} | ${r.text.replace(/\|/g, "/").slice(0, 140)} |`);
        console.log(`  ${m.id} heard ${rec.file} in ${ms(r.ms)}: "${r.text.slice(0, 60)}"`);
      } catch (e) { report.push(`| \`${m.id}\` | ${rec.file} | failed | ${(e as Error).message.slice(0, 120)} |`); }
    }
  }
  writeFileSync(join(out, "report.md"), report.join("\n") + "\n");
  console.log(`\nreport: ${join(out, "report.md")}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
