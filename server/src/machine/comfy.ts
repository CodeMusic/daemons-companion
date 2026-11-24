// BRAIN: cortex.visual (imagine) -- a picture made from words
// C-338, C-387: THE EASEL's machine -- the image door. FLUX.2 klein 4B through roverbyteseer's ComfyUI (the graph
// tools/spriteforge.py drives), a prompt in and PNG bytes out. MACHINE: what is painted, and in whose style, is the
// painter's (ai/easel.ts, MIND); this only renders it. No node: imports (fetch only), so it runs wherever the hub does.

// FLUX.2 klein 4B through ComfyUI (tools/spriteforge.py graph_klein, node for node)
export const KLEIN = { unet: "flux-2-klein-4b.safetensors", clip: "qwen_3_4b.safetensors", vae: "flux2-vae.safetensors", steps: 4, cfg: 1.0 };

export function kleinGraph(prompt: string, seed: number, w = 768, h = 768): Record<string, unknown> {
  const cond = ["4", 0];
  return {
    "1": { class_type: "UNETLoader", inputs: { unet_name: KLEIN.unet, weight_dtype: "default" } },
    "2": { class_type: "CLIPLoader", inputs: { clip_name: KLEIN.clip, type: "flux2" } },
    "3": { class_type: "VAELoader", inputs: { vae_name: KLEIN.vae } },
    "4": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["2", 0] } },
    "5": { class_type: "ConditioningZeroOut", inputs: { conditioning: cond } },
    "6": { class_type: "CFGGuider", inputs: { model: ["1", 0], positive: cond, negative: ["5", 0], cfg: KLEIN.cfg } },
    "9": { class_type: "EmptyFlux2LatentImage", inputs: { width: w, height: h, batch_size: 1 } },
    "10": { class_type: "Flux2Scheduler", inputs: { steps: KLEIN.steps, width: w, height: h } },
    "11": { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } },
    "12": { class_type: "RandomNoise", inputs: { noise_seed: seed } },
    "13": { class_type: "SamplerCustomAdvanced", inputs: { noise: ["12", 0], guider: ["6", 0], sampler: ["11", 0], sigmas: ["10", 0], latent_image: ["9", 0] } },
    "14": { class_type: "VAEDecode", inputs: { samples: ["13", 0], vae: ["3", 0] } },
    "15": { class_type: "SaveImage", inputs: { images: ["14", 0], filename_prefix: "daemons-easel" } },
  };
}

export const EASEL_HOST = "http://roverbyteseer:8008";
export const PAINT_MOST_MS = 6 * 60_000;   // the model's first painting after a rest includes loading it (about 100 s)

// The painting as PNG bytes, or a thrown reason. `wait` is how long between looks (tests make it short)
export async function comfyPaint(host: string, prompt: string, seed: number, f: typeof fetch = fetch,
                                 signal?: AbortSignal, wait = 2000): Promise<Uint8Array> {
  const base = host.replace(/\/+$/, "");
  const sent = await f(`${base}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, signal,
                                           body: JSON.stringify({ prompt: kleinGraph(prompt, seed), client_id: "daemons-easel" }) });
  if (!sent.ok) throw new Error(`the easel refused (${sent.status})`);
  const id = String(((await sent.json()) as { prompt_id?: string }).prompt_id ?? "");
  if (!id) throw new Error("the easel gave no ticket");
  const t0 = Date.now();
  for (;;) {
    if (signal?.aborted) throw new Error("stopped");
    if (Date.now() - t0 > PAINT_MOST_MS) throw new Error("the easel took too long");
    const h = (await (await f(`${base}/history/${id}`, { signal })).json()) as Record<string, any>;
    const run = h[id];
    if (run?.status?.status_str === "error") throw new Error("the easel could not paint it");
    const img = run?.outputs ? Object.values(run.outputs as Record<string, { images?: any[] }>).flatMap((o) => o.images ?? [])[0] : null;
    if (img) {
      const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder ?? "", type: img.type ?? "output" });
      const png = await f(`${base}/view?${q}`, { signal });
      if (!png.ok) throw new Error("the painting could not be fetched");
      const bytes = new Uint8Array(await png.arrayBuffer());
      // C-360: the model let go once it has painted -- ComfyUI otherwise keeps FLUX (~20 GB) in memory beside ACE-Step,
      // and roverbyteseer's 32 GB and its swap filled until it restarted (2026-11-14). Only when nothing else waits.
      try {
        const q2 = (await (await f(`${base}/queue`)).json()) as { queue_running?: unknown[]; queue_pending?: unknown[] };
        if (!q2.queue_running?.length && !q2.queue_pending?.length)
          await f(`${base}/free`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ unload_models: true, free_memory: true }) });
      } catch { /* it lets go when it needs to */ }
      return bytes;
    }
    await new Promise((r) => setTimeout(r, wait));
  }
}
