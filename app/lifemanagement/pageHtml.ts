// C-298: a JOURNAL chapter's page as HTML, one US Letter page -- its type sized to the words. No React Native here, so
// the server's tests and the review sheet render it too (page.ts sends it out).
export type Page = { journal: string; n: number; title: string; body: string; first: string; last: string; count: number };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const day = (iso: string) => new Date(iso).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
export const spanOf = (p: Pick<Page, "first" | "last">) => { const a = day(p.first), z = day(p.last); return a === z ? a : `${a} – ${z}`; };

export function pageHtml(p: Page) {
  // pt: 12 for a thinker's page (at most 350 words); smaller only when it must be, the area shrinking with the words; the
  // words past what 8.5pt holds are left off rather than spill to a second page (measured: Chrome and iOS print alike)
  const room = 3600, text = p.body.length > room ? `${p.body.slice(0, p.body.lastIndexOf(" ", room))}…` : p.body;
  const lines = text.split("\n").length;
  const size = Math.max(8.5, Math.min(12, 12 * Math.sqrt(1750 / (text.length + lines * 40))));
  const paras = text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const body = paras.map((x) => /^carried forward:/i.test(x) ? `<p class="fwd">${esc(x)}</p>` : `<p>${esc(x).replace(/\n/g, "<br>")}</p>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.title)}</title><style>
@page { size: letter; margin: 0.75in; }
html, body { margin: 0; padding: 0; background: #fff; }
body { font-family: Georgia, "Times New Roman", serif; color: #1b1d22; font-size: ${size.toFixed(1)}pt; line-height: 1.5; }
.top { font-family: "Courier New", monospace; font-size: 8.5pt; letter-spacing: 2px; text-transform: uppercase; color: #6b6658;
       border-bottom: 1px solid #c9c2b0; padding-bottom: 6px; display: flex; justify-content: space-between; }
h1 { font-size: 22pt; line-height: 1.2; margin: 22px 0 4px; font-weight: 700; }
.when { font-style: italic; color: #6b6658; margin: 0 0 18px; }
p { margin: 0 0 0.8em; text-align: justify; hyphens: auto; }
.fwd { margin-top: 1.2em; padding-top: 0.6em; border-top: 1px solid #e3ddcc; font-style: italic; text-align: left; }
.foot { margin-top: 26px; font-family: "Courier New", monospace; font-size: 7.5pt; letter-spacing: 2px; color: #9a9483; text-align: center; }
</style></head><body>
<div class="top"><span>${esc(p.journal)}</span><span>Chapter ${p.n}</span></div>
<h1>${esc(p.title)}</h1>
<div class="when">${esc(spanOf(p))} · ${p.count} entr${p.count === 1 ? "y" : "ies"}</div>
${body}
<div class="foot">KEPT WITH DAEMONS</div>
</body></html>`;
}

