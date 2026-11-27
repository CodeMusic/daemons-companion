// C-600 (C-596; the user, 2026-11-27): THE ENGINE ROOM's HOARD -- the household's own storage, managed in one place:
//   THE MEASURE     how much of it is used, and whether every file is held, and held twice
//   WHAT OFFERS IT  each node: EXTEND (adds its room) or REPLICA (a copy of everything), here or away, and how it is linked
//   THE HUB'S OWN   a drive or folder of the hub's, with the most it will share
//   WHEN IT IS FULL by hand, or the oldest first -- and never a PROTECTED file
//   THE FILES       every file kept, whoever put it there: PROTECT it, or delete it (a keeper may delete any)
//   ITS KEEPERS     who may do all this; and which paired keys are one person's
// Its own file, so admin.js stays the frame: admin.js hands it what a page needs (the API, the note, the page).
// Seeing that a file is there is not reading it: this page never opens one. Every word DRAFT.
export function hoard({ api, esc, ago, note, stale, page, ui }) {
  const size = (n) => { const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0, x = Math.max(0, Number(n) || 0); while (x >= 1000 && i < 4) { x /= 1000; i++; } return `${i === 0 ? x : x >= 100 ? Math.round(x) : Math.round(x * 10) / 10} ${u[i]}`; };
  const when = (ms) => ago(new Date(ms).toISOString());
  const LINK = { ethernet: "Ethernet", wifi: "Wi-Fi", cell: "mobile data", other: "its link not read" };
  // what is typed into the page is kept between redraws (data-keep names where)
  page.addEventListener("input", (ev) => { const k = ev.target?.dataset?.keep; if (k) (ui().typed ??= {})[k] = ev.target.value; });
  const typed = (k, otherwise = "") => ui().typed?.[k] ?? otherwise;
  const shareSaid = (f) => {
    if (f.share === "me") return "only its owner";
    const who = f.share === "household" ? "the household" : `a friend${f.friend ? ` (${f.friend})` : ""}`;
    if (f.ended) return `${who}, ended`;
    return `${who}${f.once ? ", until downloaded" : f.until ? `, until ${new Date(f.until).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : ", always"}`;
  };
  const KIND = { file: "", spoken: "SPOKEN", magic: "MAGIC FILE", video: "MAGIC VIDEO", answer: "ANSWER" };

  async function draw() {
    const h = await api("/api/engine/hoard");
    if (stale()) return;
    const u = ui();
    u.ticked ??= new Set(); u.owner ??= "all";
    for (const id of [...u.ticked]) if (!h.all.some((f) => f.id === id)) u.ticked.delete(id);
    const pct = h.capacity ? Math.min(100, Math.round((h.used / h.capacity) * 100)) : 0;
    const owners = [...new Set(h.all.map((f) => f.ownerName))].sort();
    const q = typed("find").trim().toLowerCase();
    const shown = h.all.filter((f) => (u.owner === "all" || f.ownerName === u.owner) && (!q || f.name.toLowerCase().includes(q)));
    const here = h.here, vols = h.volumes ?? [];
    const dir = typed("dir", here?.dir ?? vols[0]?.path ?? ""), gb = typed("gb", here ? String(Math.round(here.bytes / 1e6) / 1000) : "");
    const kind = u.kind ?? here?.kind ?? "extend";
    const chip = (act, val, on, label) => `<button class="btn ${on ? "" : "quiet"}" data-act="${act}" data-v="${esc(val)}">${esc(label)}</button>`;
    const persons = h.keys.filter((k) => k.person === k.key);

    page.innerHTML = `<h1>THE HOARD</h1>
      <p class="lede">The household's own storage, on its own drives and computers. ${h.capacity ? `${size(h.used)} of ${size(h.capacity)} used, ${size(h.free)} free.` : "Nothing offers it room yet: offer a folder of the hub's below, or switch THE HOARD on in the server on another computer."}</p>
      ${h.capacity ? `<div class="card"><div style="height:12px;border-radius:6px;background:var(--line);overflow:hidden" role="img" aria-label="${pct}% used"><div style="height:100%;width:${pct}%;background:var(--gold)"></div></div>
        <div class="small" style="margin-top:8px">${h.files} file${h.files === 1 ? "" : "s"}${h.blobs ? ` · ${h.safe === h.blobs ? "every one is held" : `<b class="warm">${h.blobs - h.safe} not yet held by any node</b>`} · ${h.twice} held on two or more` : ""}${h.waiting ? ` · ${h.waiting} waiting on the hub for a node to take them` : ""}</div></div>` : ""}
      ${note()}

      <h2>WHAT OFFERS IT</h2>
      <div class="grid">${h.nodes.map((n) => `<div class="card">
          <span class="eyebrow">${n.kind === "replica" ? "REPLICA · a copy of everything" : "EXTEND · adds its room"}${n.state === "retiring" ? " · LEAVING" : ""}</span><br>
          <b>${esc(n.name)}</b> <span class="small">${n.here ? "this hub" : n.fresh ? "here" : `away, last heard ${esc(when(n.seen))}`}</span><br>
          <span class="small">offers ${size(n.offer)} · holds ${n.has} file${n.has === 1 ? "" : "s"}${n.used ? ` (${size(n.used)})` : ""}${n.behind ? ` · <b class="warm">${n.behind} still to fetch</b>` : ""}</span><br>
          <span class="small">${esc(LINK[n.link] ?? n.link)}${n.up ? ` · ${n.up} Mbit/s up` : ""}${n.ping !== null && !n.here ? ` · ping ${n.ping} ms` : ""}${n.here ? "" : n.doors ? "" : " · no door to reach it by"}${n.rests ? ` · <b class="warm">resting: ${esc(n.rests)}</b>` : ""}</span>
          ${Object.keys(n.learned ?? {}).length ? `<br><span class="small faint">measured: ${Object.entries(n.learned).map(([k, v]) => `${v} Mbit/s ${k === "here" ? "at home" : k === "tailnet" ? "over the tailnet" : "across the internet"}`).join(", ")} · ${Math.round(n.reliability * 100)}% reliable</span>` : ""}
          ${n.here ? "" : `<div class="row" style="margin-top:8px">${n.state === "on" ? `<button class="btn quiet" data-act="hnode" data-id="${esc(n.id)}" data-v="retire">MOVE ITS FILES OFF</button>` : n.offer ? `<button class="btn quiet" data-act="hnode" data-id="${esc(n.id)}" data-v="back">KEEP IT AFTER ALL</button>` : ""}
            ${n.fresh ? "" : `<button class="btn danger" data-act="hnode" data-id="${esc(n.id)}" data-v="forget">FORGET IT</button>`}</div>`}
        </div>`).join("") || `<p class="small">No node yet.</p>`}</div>

      <h2>THE HUB'S OWN OFFER</h2>
      <div class="card">
        <p class="small">${here ? `The hub offers <b>${size(here.bytes)}</b> of <b>${esc(here.dir)}</b> as ${here.kind === "replica" ? "a REPLICA" : "an EXTEND"}.` : "The hub offers nothing of its own. With a drive plugged in, pick it here."}
          THE HOARD keeps to a folder of its own inside the one you pick (<code>daemons-hoard</code>) and never reads or removes anything else there.</p>
        ${vols.length ? `<div class="row" style="margin-bottom:8px">${vols.map((v) => `<button class="btn ${dir === v.path ? "" : "quiet"}" data-act="hdir" data-v="${esc(v.path)}">${esc(v.path)} <span class="small">${size(v.free)} free of ${size(v.total)}</span></button>`).join("")}</div>` : ""}
        <div class="row">
          <label class="grow"><span class="small">The drive or folder, by its whole path</span><br><input data-keep="dir" value="${esc(dir)}" placeholder="/media/drive" style="width:100%" aria-label="the folder"></label>
          <label><span class="small">The most to share, GB</span><br><input data-keep="gb" value="${esc(gb)}" inputmode="decimal" size="8" aria-label="gigabytes"></label>
        </div>
        <div class="row" style="margin-top:8px">${chip("hkind", "extend", kind === "extend", "EXTEND")}${chip("hkind", "replica", kind === "replica", "REPLICA")}
          <span class="small grow">${kind === "replica" ? "REPLICA adds no room: the hub keeps a copy of everything, so a file is still reachable when another node is away." : "EXTEND adds this room to THE HOARD's: 1 TB and a new 1 TB offer make 2 TB."}</span></div>
        <div class="row" style="margin-top:10px"><button class="btn" data-act="hoffer">${here ? "CHANGE THE OFFER" : "OFFER IT"}</button>
          ${here ? `<button class="btn quiet" data-act="hofferoff">TAKE THE OFFER BACK</button><span class="small">Its files move to the other nodes first; nothing is deleted from the folder until they are held elsewhere.</span>` : ""}</div>
      </div>

      <h2>WHEN IT IS FULL</h2>
      <div class="card">
        <div class="row">${chip("hpolicy", "manual", h.policy === "manual", "BY HAND")}${chip("hpolicy", "oldest", h.policy === "oldest", "THE OLDEST FIRST")}
          <span class="small grow">${h.policy === "oldest" ? "When a new file has no room, the oldest files are removed, only as many as it needs. A PROTECTED file is never removed this way." : "When there is no room a new file is refused, and someone makes room by hand here."}</span></div>
        <div class="row" style="margin-top:10px"><label><span class="small">Make room now, GB</span><br><input data-keep="room" value="${esc(typed("room"))}" inputmode="decimal" size="8" aria-label="gigabytes to free"></label>
          <button class="btn quiet" data-act="hroom">SEE WHAT WOULD GO</button>
          ${u.would ? `<span class="grow small">${u.would.ids.length} file${u.would.ids.length === 1 ? "" : "s"}, the oldest unprotected, ${size(u.would.freed)}: ${u.would.names.map(esc).join(", ")}</span>
            <button class="btn danger" data-act="hroomgo">YES, REMOVE ${u.would.ids.length}</button><button class="btn quiet" data-act="hroomno">NO</button>` : ""}</div>
        ${h.cleaned?.length ? `<p class="small faint" style="margin-top:10px">Made way lately: ${h.cleaned.map((c) => `${esc(c.name)} (${esc(c.ownerName)}, ${size(c.size)}) for ${esc(c.for)}, ${esc(when(c.at))}`).join("; ")}</p>` : ""}
      </div>

      <h2>THE FILES</h2>
      <div class="row">${chip("howner", "all", u.owner === "all", "EVERYONE'S")}${owners.map((o) => chip("howner", o, u.owner === o, o)).join("")}
        <input data-keep="find" value="${esc(typed("find"))}" placeholder="find by name" aria-label="find by name" class="grow"></div>
      <div class="row" style="margin:10px 0">
        <button class="btn quiet" data-act="htickall">${shown.length && shown.every((f) => u.ticked.has(f.id)) ? "UNTICK ALL" : "TICK ALL SHOWN"}</button>
        ${u.ticked.size ? (u.sure
          ? `<span class="grow">Delete ${u.ticked.size} from THE HOARD, from every node that holds ${u.ticked.size === 1 ? "it" : "them"}? This cannot be undone.</span>
             <button class="btn danger" data-act="hdelete">YES, DELETE ${u.ticked.size}</button><button class="btn quiet" data-act="hsure">NO</button>`
          : `<button class="btn danger" data-act="hsure">DELETE ${u.ticked.size}…</button>`) : ""}
      </div>
      <div class="grid">${shown.map((f) => `<div class="card">
          <label class="row" style="align-items:flex-start;cursor:pointer">
            <input type="checkbox" data-act="htick" data-id="${f.id}" ${u.ticked.has(f.id) ? "checked" : ""} aria-label="tick ${esc(f.name)}">
            <span class="grow" style="min-width:0;overflow-wrap:anywhere">
              <span class="eyebrow">${esc(f.ownerName)}${KIND[f.kind] ? ` · ${KIND[f.kind]}` : ""}${f.protected ? " · PROTECTED" : ""}</span><br>
              <b>${esc(f.name)}</b><br>
              <span class="small">${size(f.size)} · ${esc(when(f.added))} · ${f.how === "move" ? "moved here" : "a copy"}</span><br>
              <span class="small">shared with ${esc(shareSaid(f))}</span>
            </span></label>
          <div class="row" style="margin-top:8px"><button class="btn quiet" data-act="hprotect" data-id="${f.id}" data-v="${f.protected ? "0" : "1"}">${f.protected ? "UNPROTECT" : "PROTECT"}</button></div>
        </div>`).join("") || `<p class="small">${h.all.length ? "Nothing by that name." : "Nothing is kept yet."}</p>`}</div>

      <h2>ITS KEEPERS</h2>
      <div class="card">
        <p class="small">${h.keepers.length ? "Only the keepers ticked here, and the hub's own machine, manage THE HOARD." : "<b>Anyone with a paired key can manage THE HOARD</b> -- the hub has no separate admin sign-in. Tick its keepers to keep this page to them."}
          Two keys that are one person's (a phone and a tablet) can be set together, so each reads what the other kept to itself.</p>
        ${h.keys.map((k) => `<div class="row" style="margin-top:6px">
            <label style="cursor:pointer"><input type="checkbox" data-act="hkeeper" data-id="${esc(k.person)}" ${k.keeper ? "checked" : ""} aria-label="keeper"> <b>${esc(k.name)}</b>${k.key === h.me.key || k.person === h.me.key ? ' <span class="small">(this key)</span>' : ""}</label>
            <span class="grow"></span>
            <label class="small">the same person as <select data-act="hperson" data-id="${esc(k.key)}">
              <option value="">itself</option>${persons.filter((p) => p.key !== k.key).map((p) => `<option value="${esc(p.key)}" ${k.person === p.key ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
          </div>`).join("") || `<p class="small">No key is paired yet.</p>`}
      </div>`;
  }

  const num = (s) => Number(String(s).replace(",", "."));
  const acts = {
    hdir: (d) => { (ui().typed ??= {}).dir = d.v; },
    hkind: (d) => { ui().kind = d.v; },
    hoffer: async () => {
      const u = ui(), gb = num(u.typed?.gb ?? page.querySelector('[data-keep="gb"]')?.value), dir = (u.typed?.dir ?? page.querySelector('[data-keep="dir"]')?.value ?? "").trim();
      if (!(gb > 0)) throw new Error("Say how many gigabytes the hub may share.");
      await api("/api/engine/hoard/offer", { dir, gb, kind: u.kind ?? "extend" });
      u.note = "Offered."; u.typed = {};
    },
    hofferoff: async () => { await api("/api/engine/hoard/offer", { off: true }); ui().note = "Taken back: its files move to the other nodes first."; ui().typed = {}; },
    hpolicy: async (d) => { await api("/api/engine/hoard/policy", { full: d.v }); },
    hroom: async () => {
      const u = ui(), gb = num(u.typed?.room ?? "");
      if (!(gb > 0)) throw new Error("Say how many gigabytes to free.");
      const all = (await api("/api/engine/hoard")).all;
      const r = await api("/api/engine/hoard/cleanup", { gb, dry: true });
      u.would = { gb, ids: r.ids, freed: r.freed, names: r.ids.map((id) => all.find((f) => f.id === id)?.name ?? id) };
    },
    hroomno: () => { ui().would = null; },
    hroomgo: async () => { const u = ui(); if (!u.would) return; const r = await api("/api/engine/hoard/cleanup", { gb: u.would.gb }); u.note = `Removed ${r.ids.length}.`; u.would = null; },
    howner: (d) => { ui().owner = d.v; },
    htick: (d, el) => { const t = (ui().ticked ??= new Set()); el.checked ? t.add(d.id) : t.delete(d.id); ui().sure = false; },
    htickall: async () => {
      const u = ui(), q = (u.typed?.find ?? "").trim().toLowerCase();
      const shown = (await api("/api/engine/hoard")).all.filter((f) => (u.owner === "all" || f.ownerName === u.owner) && (!q || f.name.toLowerCase().includes(q)));
      const all = shown.length && shown.every((f) => u.ticked.has(f.id));
      for (const f of shown) all ? u.ticked.delete(f.id) : u.ticked.add(f.id);
      u.sure = false;
    },
    hsure: () => { ui().sure = !ui().sure; },
    hdelete: async () => { const u = ui(); const r = await api("/api/engine/hoard/delete", { ids: [...u.ticked] }); u.note = `Deleted ${r.removed.length}.`; u.ticked = new Set(); u.sure = false; },
    hprotect: async (d) => { await api("/api/engine/hoard/protect", { id: d.id, on: d.v === "1" }); },
    hnode: async (d) => { await api("/api/engine/hoard/node", { id: d.id, act: d.v }); ui().note = d.v === "retire" ? "Its files are moving to the nodes that stay." : d.v === "forget" ? "Forgotten." : "Kept."; },
    hkeeper: async (d, el) => {
      const h = await api("/api/engine/hoard"), now = new Set(h.keepers);
      el.checked ? now.add(d.id) : now.delete(d.id);
      if (now.size && !now.has(h.me.key) && h.me.key !== "here") throw new Error("Tick your own key too, or you would lock yourself out of this page.");
      await api("/api/engine/hoard/keepers", { keys: [...now] });
    },
  };
  // a select's change is its act (the page's click handler takes buttons and ticks)
  page.addEventListener("change", async (ev) => {
    const el = ev.target;
    if (el?.dataset?.act !== "hperson") return;
    try { await api("/api/engine/hoard/person", { key: el.dataset.id, person: el.value || null }); ui().note = el.value ? "Set together." : "Apart again."; }
    catch (e) { ui().note = e.message; }
    await draw().catch(() => {});
  });
  return { draw, acts };
}
