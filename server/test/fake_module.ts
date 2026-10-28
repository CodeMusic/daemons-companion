// C-180: a stand-in for the Module LLM's OpenAI-format API, answering as the module should (module.test.ts, and
// tools/ax630bench.ts run against it by hand)
import { createServer, type Server } from "node:http";

export function fakeModule(opts: { firstDelayMs?: number; busyHearing?: boolean } = {}): Server {
  return createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    if (req.url === "/v1/models") { res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ data: [{ id: "qwen2.5-0.5B-prefill-20e" }, { id: "melotts-en-default" }, { id: "whisper-tiny" }] })); }
    if (req.url === "/v1/chat/completions") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      if (opts.firstDelayMs) await new Promise((r) => setTimeout(r, opts.firstDelayMs));
      for (const w of ["Good ", "morning", "!"]) { res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`); await new Promise((r) => setTimeout(r, 5)); }
      return res.end("data: [DONE]\n\n");
    }
    if (req.url === "/v1/audio/speech") {
      const { input } = JSON.parse(body.toString());
      res.writeHead(200, { "content-type": "audio/wav" });
      return res.end(Buffer.concat([Buffer.from("RIFF"), Buffer.from(String(input))]));
    }
    if (req.url === "/v1/audio/transcriptions") {
      if (opts.busyHearing) { res.writeHead(500); return res.end("Server busy, please try again later"); }   // Whisper with no NPU memory left
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ text: body.includes("said.wav") ? "heard it" : "" }));
    }
    res.writeHead(404); res.end();
  });
}
