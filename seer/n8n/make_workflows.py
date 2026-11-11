#!/usr/bin/env python3
"""The companion's n8n workflows, written from one place (2026-10-07; companion C-64, C-66, C-83; moved here from DAEMONS
ai/n8n with the local-cloud package, 2026-11-11).

    python3 seer/n8n/make_workflows.py OUT [INTERNAL]   # writes daemon_talk and daemon_hear into OUT: internal, and
                                                       # public-relay/ forwarding to INTERNAL (the n8n they run on)
    python3 seer/n8n/push.py internal|public FILE      # then puts each onto its server, switched on, tagged daemons

seer/bindSeer.sh runs both, with OUT = seer/out/n8n and INTERNAL = this machine's n8n. The models are named by the
local-cloud's LiteLLM (seer/make.py: seer-talk, seer-hear), whichever machine answers them -- the Tiiny, local models or
OpenRouter -- so the workflows never change when the set-up does; DAEMONS_LLM_KEY is LiteLLM's key for them.

daemon/talk: text or recorded audio -> speech to text -> the carried daemon answers (local model, or OpenRouter) ->
the INDEX voice. daemon/hear: recorded audio -> text, alone. Both never throw before Respond (daemon/voice's lesson:
a thrown node leaves the caller hanging).
"""
import json, os, sys
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "out", "n8n")
INTERNAL = (sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:5678").rstrip("/")
os.makedirs(os.path.join(OUT, "public-relay"), exist_ok=True)

# C-270 (companion; the user, 2026-11-01: "the TTS returns the pronouciation of daemon as (DEE-MON)"): what a voice is
# handed, never what is shown -- DAEMON respelled as it is said, DAY-mon (the companion's server/src/ai/say.ts, the same rule)
# A word ending in daemon keeps its front (eudaemon -> eudaymon, 2026-11-01); no braces, so n8n's {{ }} cannot misread it
SAYABLE = r".replace(/\b(\w*?)daemon(s?)\b/gi, (w) => ((d) => w[0] === w[0].toLowerCase() ? d : d[0].toUpperCase() + d.slice(1))(w.toLowerCase().replace(/daemon(s?)$/, 'daymon$1')))"


def node(i, name, typ, ver, pos, params, **extra):
    n = {"parameters": params, "id": i, "name": name, "type": "n8n-nodes-base." + typ, "typeVersion": ver, "position": pos}
    n.update(extra); return n

def iff(i, name, pos, left, op):
    return node(i, name, "if", 2, pos, {"conditions": {"options": {"caseSensitive": True, "typeValidation": "loose"},
        "conditions": [{"leftValue": left, "rightValue": True if op == "true" else "",
                        "operator": {"type": "boolean" if op == "true" else "string", "operation": op, "singleValue": True}}],
        "combinator": "and"}, "options": {}})

VALIDATE = r"""// daemon/talk: a person speaks (or types) to the daemon they carry, and it answers in its own words, read aloud
// by the INDEX voice. Companion C-64 / C-66.
//
// Never throws. Under responseMode:responseNode a thrown node never reaches Respond and the caller hangs
// (daemon/voice measured a 120 s hang) -- so a bad request comes back as a named error instead.
const req = $input.first().json;
const headers = req.headers || {};
const body = req.body || {};
const expected = $env.DEX_SHARED_SECRET;
if (expected && headers['x-dex-secret'] !== expected) return [{ json: { ok: false, error: 'unauthorized' } }];
const text = String(body.text || '').trim();
const audioBase64 = body.audioBase64 ? String(body.audioBase64) : '';
if (!text && !audioBase64) return [{ json: { ok: false, error: 'nothing to answer: send text or audioBase64' } }];

// Local or OpenRouter. 'auto' (the default) asks the local model unless it is already answering someone; then
// OpenRouter, so a second person never waits behind the first. 'local' and 'openrouter' force one.
const hasOpenRouter = !!$env.OPENROUTER_API_KEY;
const want = String(body.provider || 'auto');
const g = $getWorkflowStaticData('global');
const now = Date.now();
g.inflight = (g.inflight || []).filter((t) => now - t < 120000);     // a turn that never finished stops counting
let provider = want === 'openrouter' && hasOpenRouter ? 'openrouter' : 'local';
if (want === 'auto' && g.inflight.length && hasOpenRouter) provider = 'openrouter';
if (provider === 'local') g.inflight.push(now);

const d = body.daemon || {};
return [{ json: {
  ok: true, text, heard: null, audioBase64, audioMime: String(body.audioMime || 'audio/wav'),
  provider, want, hasOpenRouter, startedAt: now,   // want: what was asked -- "local" never falls back to OpenRouter
  daemon: { nickname: String(d.nickname || d.name || 'your daemon'), name: String(d.name || ''), types: String(d.types || ''),
            category: String(d.category || ''), entry: String(d.entry || ''), said: String(d.said || '').slice(0, 200) },
  day: body.day || null,
  // the goal the companion is walking them through, and its one next step (the companion server sends it)
  goal: body.goal && typeof body.goal === 'object' ? { goal: String(body.goal.goal || '').slice(0, 120),
        step: String(body.goal.step || '').slice(0, 160), milestone: String(body.goal.milestone || '').slice(0, 120) } : null,
  history: Array.isArray(body.history) ? body.history.slice(-6) : [],
  speak: body.speak !== false, voice: String(body.voice || 'index'),
  localModel: String(body.localModel || ''),
} }];"""

TO_FILE = r"""// The device's recording, as a file the speech-to-text server can take.
const v = $input.first().json;
const bin = await this.helpers.prepareBinaryData(Buffer.from(v.audioBase64, 'base64'), 'speech.wav', v.audioMime);
return [{ json: v, binary: { audio: bin } }];"""

TRANSCRIPT = r"""// What was heard becomes what was said. If nothing could be made out, the daemon is told so and asks again.
const v = $('Validate + Choose').first().json;
const r = ($input.first() || {}).json || {};
const heard = String(r.text || '').trim();
return [{ json: { ...v, text: heard || v.text, heard: heard || null, audioBase64: '' } }];"""

BUILD = r"""// The daemon, as a character: its name, its types, its INDEX entry, and the day. Short and spoken, because it is
// read aloud. It helps with goals when asked and never explains what it stands for (DAEMONS craft rule 1).
const v = $input.first().json;
const d = v.daemon;
const day = v.day || {};
// A small model mentions whatever it is told, so it is told the goal only when they ask about it: never nags (PLAN 7).
const asksAboutGoal = /\b(what (should|do|now|next)|next|goal|step|to ?do|help|plan|task|stuck)\b/i.test(String(v.text || ''));
const system = [
  `You are ${d.nickname}, a DAEMON${d.name && d.name !== d.nickname ? ' (' + d.name + ')' : ''}, carried by the person you are talking with on a small handheld companion.`,
  d.types ? `Your types: ${d.types}.` : '',
  d.category ? `Your INDEX category: ${d.category}.` : '',
  d.entry ? `Your INDEX entry, as the record describes you: ${d.entry}` : '',
  // companion C-303 (T-522): the record is about it; this is how it speaks of itself
  d.said ? `You say of yourself, in your own words: "${d.said}" That is how you sound.` : '',
  day.theme || day.cue ? `Today is ${day.day || 'today'}: ${day.theme || ''}${day.cue ? ', ' + day.cue : ''}.` : '',
  asksAboutGoal && v.goal && v.goal.step ? `They are working toward: ${v.goal.goal || 'a goal'}${v.goal.milestone ? ' (now: ' + v.goal.milestone + ')' : ''}. Their one next step: ${v.goal.step}. Bring it up only if they ask what to do or about their goal; then name that step, simply. Never nag.` : '',
  'Speak as yourself, in one to three short sentences: warm, curious, a little strange. You are heard, not read, so no lists, no markdown and no emoji.',
  'Help with their goals when they ask. Never lecture, and never explain what you are a metaphor for.',
].filter(Boolean).join('\n');
const messages = [{ role: 'system', content: system }];
for (const h of v.history) {
  if (h && h.text) messages.push({ role: 'user', content: String(h.text) });
  if (h && h.answer) messages.push({ role: 'assistant', content: String(h.answer) });
}
messages.push({ role: 'user', content: v.text || '(they spoke, but nothing could be made out)' });
const local = v.provider === 'local';
// The local model by name -- LM Studio loads it on the first request (2026-10-07: nothing stays loaded there).
const model = local ? (v.localModel || $env.DAEMONS_LLM_MODEL || 'google/gemma-3-4b')
                    : ($env.DAEMONS_OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct');
return [{ json: { ...v,
  url: local ? (($env.DAEMONS_LLM_URL || $env.DEX_LLM_URL || 'http://host.docker.internal:1234') + '/v1/chat/completions')
             : 'https://openrouter.ai/api/v1/chat/completions',
  auth: local ? ($env.DAEMONS_LLM_KEY ? 'Bearer ' + $env.DAEMONS_LLM_KEY : '') : 'Bearer ' + ($env.OPENROUTER_API_KEY || ''),
  completionBody: { model, messages, max_tokens: 200, temperature: 0.7, stream: false },
} }];"""

PARSE = r"""// The answer, and the local model's turn released. A reasoning model's <think> block is not something to say aloud.
const v = $('Build Chat').first().json;
const r = ($input.first() || {}).json || {};
const raw = r?.choices?.[0]?.message?.content ?? r?.message?.content ?? '';
const answer = String(raw).replace(/<think>[\s\S]*?<\/think>/g, '').replace(/[*_#`]+/g, '').replace(/\s+/g, ' ').trim();   // spoken: no markdown
let provider = v.provider;
try { if ($('Think (OpenRouter)').isExecuted) provider = 'openrouter'; } catch (e) {}
const g = $getWorkflowStaticData('global');
g.inflight = (g.inflight || []).filter((t) => t !== v.startedAt);
return [{ json: { answer: answer || null, error: answer ? null : 'no_model_answered', provider, heard: v.heard || null,
                  speak: !!(v.speak && answer), voice: v.voice } }];"""

ASSEMBLE = r"""// mp3 -> base64 when it spoke, and a named absence when the voice was down. Must not throw (see Validate).
let p = {};
try { p = $('Parse + Release').first().json || {}; } catch (e) { p = {}; }
let audioBase64 = null;
if (p.speak) {
  try { const buf = await this.helpers.getBinaryDataBuffer(0, 'data'); if (buf && buf.length) audioBase64 = buf.toString('base64'); } catch (e) {}
}
return [{ json: { answer: p.answer || null, heard: p.heard || null, provider: p.provider || null, audioBase64,
                  audioMime: audioBase64 ? 'audio/mpeg' : null,
                  error: p.error || (p.speak && !audioBase64 ? 'voice_unavailable' : null) } }];"""

def http_llm(i, name, pos, url, auth, body):
    return node(i, name, "httpRequest", 4.2, pos, {"method": "POST", "url": url, "sendHeaders": True,
        "headerParameters": {"parameters": [{"name": "Content-Type", "value": "application/json"},
                                            {"name": "Authorization", "value": auth},
                                            {"name": "HTTP-Referer", "value": "https://codemusic.ca"},
                                            {"name": "X-Title", "value": "DAEMONS companion"}]},
        "sendBody": True, "specifyBody": "json", "jsonBody": body, "options": {"timeout": 90000}}, continueOnFail=True)

nodes = [
    node("t1", "Webhook /daemon/talk", "webhook", 2, [0, 0], {"httpMethod": "POST", "path": "daemon/talk", "responseMode": "responseNode", "options": {}}, webhookId="daemon-talk"),
    node("t2", "Validate + Choose", "code", 2, [220, 0], {"jsCode": VALIDATE}),
    iff("t3", "Ok?", [440, 0], "={{ $json.ok }}", "true"),
    node("t4", "Respond Error", "respondToWebhook", 1, [660, 220], {"respondWith": "json", "responseBody": "={{ JSON.stringify({ answer: null, error: $json.error }) }}", "options": {}}),
    iff("t5", "Heard audio?", [660, 0], "={{ $json.audioBase64 }}", "notEmpty"),
    node("t6", "Audio to File", "code", 2, [880, -160], {"jsCode": TO_FILE}),
    node("t7", "Hear (speech to text)", "httpRequest", 4.2, [1100, -160], {"method": "POST",
        "url": "={{ ($env.DAEMONS_STT_URL || 'http://host.docker.internal:8770') + '/v1/audio/transcriptions' }}",
        "sendHeaders": True, "headerParameters": {"parameters": [
            {"name": "Authorization", "value": "={{ $env.DAEMONS_LLM_KEY ? 'Bearer ' + $env.DAEMONS_LLM_KEY : '' }}"}]},
        "sendBody": True, "contentType": "multipart-form-data", "bodyParameters": {"parameters": [
            {"parameterType": "formBinaryData", "name": "file", "inputDataFieldName": "audio"},
            {"name": "model", "value": "={{ $env.DAEMONS_STT_MODEL || 'whisper-1' }}"},
            {"name": "response_format", "value": "json"}]},
        "options": {"timeout": 60000}}, continueOnFail=True),
    node("t8", "Take Transcript", "code", 2, [1320, -160], {"jsCode": TRANSCRIPT}),
    node("t9", "Build Chat", "code", 2, [1540, 0], {"jsCode": BUILD}),
    http_llm("t10", "Think (chosen)", [1760, 0], "={{ $json.url }}", "={{ $json.auth }}", "={{ JSON.stringify($json.completionBody) }}"),
    iff("t11", "Local failed?", [1980, 0],
        "={{ !($json.choices && $json.choices[0]) && $('Build Chat').first().json.provider === 'local' && $('Build Chat').first().json.hasOpenRouter && $('Build Chat').first().json.want !== 'local' }}", "true"),
    http_llm("t12", "Think (OpenRouter)", [2200, -160], "https://openrouter.ai/api/v1/chat/completions",
        "={{ 'Bearer ' + ($env.OPENROUTER_API_KEY || '') }}",
        "={{ JSON.stringify({ ...$('Build Chat').first().json.completionBody, model: $env.DAEMONS_OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct' }) }}"),
    node("t13", "Parse + Release", "code", 2, [2420, 0], {"jsCode": PARSE}),
    iff("t14", "Speak it?", [2640, 0], "={{ $json.speak }}", "true"),
    node("t15", "Index TTS (local)", "httpRequest", 4.2, [2860, -160], {"method": "POST",
        "url": "={{ $env.DEXTER_TTS_URL || 'http://host.docker.internal:8880/tts' }}", "sendHeaders": True,
        "headerParameters": {"parameters": [{"name": "X-Dex-Key", "value": "={{ $env.DEX_KEY }}"}, {"name": "Content-Type", "value": "application/json"}]},
        "sendBody": True, "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ text: String($json.answer || '')" + SAYABLE + ".slice(0, 600), voice: $json.voice || 'index' }) }}",
        "options": {"response": {"response": {"responseFormat": "file"}}, "timeout": 90000}}, continueOnFail=True),
    node("t16", "Assemble", "code", 2, [3080, 0], {"jsCode": ASSEMBLE}),
    node("t17", "Respond", "respondToWebhook", 1, [3300, 0], {"respondWith": "json", "responseBody": "={{ JSON.stringify($json) }}", "options": {}}),
]
def c(*pairs):
    out = {}
    for src, outputs in pairs:
        out[src] = {"main": [[{"node": n, "type": "main", "index": 0}] if n else [] for n in outputs]}
    return out
connections = c(
    ("Webhook /daemon/talk", ["Validate + Choose"]),
    ("Validate + Choose", ["Ok?"]),
    ("Ok?", ["Heard audio?", "Respond Error"]),
    ("Heard audio?", ["Audio to File", "Build Chat"]),
    ("Audio to File", ["Hear (speech to text)"]),
    ("Hear (speech to text)", ["Take Transcript"]),
    ("Take Transcript", ["Build Chat"]),
    ("Build Chat", ["Think (chosen)"]),
    ("Think (chosen)", ["Local failed?"]),
    ("Local failed?", ["Think (OpenRouter)", "Parse + Release"]),
    ("Think (OpenRouter)", ["Parse + Release"]),
    ("Parse + Release", ["Speak it?"]),
    ("Speak it?", ["Index TTS (local)", "Assemble"]),
    ("Index TTS (local)", ["Assemble"]),
    ("Assemble", ["Respond"]),
)
internal = {"name": "DAEMONS — daemon/talk (speak with your daemon)", "nodes": nodes, "pinData": {}, "connections": connections,
            "active": False, "settings": {"executionOrder": "v1", "binaryMode": "separate"}}
json.dump(internal, open(os.path.join(OUT, "DAEMONS - daemon_talk (internal).json"), "w"), indent=2, ensure_ascii=False)

SHAPE = r"""// A dead backend comes back as a NAMED absence, never a 500: the device can say "the voice is down" or "nobody
// answered" instead of hanging (daemon/voice's relay does the same).
const j = ($input.first() || {}).json || {};
if (!j.answer && !j.error) return [{ json: { answer: null, heard: null, provider: null, audioBase64: null, audioMime: null, error: 'backend_unreachable' } }];
return [{ json: j }];"""
relay = {"name": "DAEMONS Public — daemon/talk relay", "nodes": [
    node("pt1", "Public Webhook", "webhook", 2, [0, 0], {"httpMethod": "POST", "path": "daemon/talk", "responseMode": "responseNode", "options": {}}, webhookId="pub-daemon-talk"),
    node("pt2", "Relay to Internal", "httpRequest", 4.2, [224, 0], {"method": "POST", "url": INTERNAL + "/webhook/daemon/talk",
        "sendHeaders": True, "headerParameters": {"parameters": [{"name": "Content-Type", "value": "application/json"},
            {"name": "x-dex-secret", "value": "={{ $json.headers['x-dex-secret'] || '' }}"}]},
        "sendBody": True, "specifyBody": "json", "jsonBody": "={{ JSON.stringify($json.body) }}", "options": {"timeout": 180000}}, continueOnFail=True),
    node("pt3", "Shape Response", "code", 2, [448, 0], {"jsCode": SHAPE}),
    node("pt4", "Respond", "respondToWebhook", 1, [672, 0], {"respondWith": "json", "responseBody": "={{ JSON.stringify($json) }}", "options": {}}),
], "pinData": {}, "connections": c(("Public Webhook", ["Relay to Internal"]), ("Relay to Internal", ["Shape Response"]), ("Shape Response", ["Respond"])),
   "settings": {"executionOrder": "v1"}}
json.dump(relay, open(os.path.join(OUT, "public-relay", "DAEMONS Public - daemon_talk relay.json"), "w"), indent=2, ensure_ascii=False)


# ---- daemon/hear: speech to text, alone (C-83) --------------------------------------------------------------------
HEAR_VALIDATE = r"""// daemon/hear: recorded audio in, what was said out. Never throws (see daemon/talk).
const req = $input.first().json;
const headers = req.headers || {};
const body = req.body || {};
const expected = $env.DEX_SHARED_SECRET;
if (expected && headers['x-dex-secret'] !== expected) return [{ json: { ok: false, error: 'unauthorized' } }];
const audioBase64 = body.audioBase64 ? String(body.audioBase64) : '';
if (!audioBase64) return [{ json: { ok: false, error: 'nothing to hear: send audioBase64' } }];
return [{ json: { ok: true, audioBase64, audioMime: String(body.audioMime || 'audio/wav'), language: String(body.language || '') } }];"""
HEAR_SHAPE = r"""// The words, or a named absence: a device can say "I could not hear that" instead of hanging.
const r = ($input.first() || {}).json || {};
const text = String(r.text || '').trim();
return [{ json: { text: text || null, error: text ? null : (r.error ? String(r.error.message || r.error).slice(0, 200) : 'nothing_heard') } }];"""
hear_nodes = [
    node("h1", "Webhook /daemon/hear", "webhook", 2, [0, 0], {"httpMethod": "POST", "path": "daemon/hear", "responseMode": "responseNode", "options": {}}, webhookId="daemon-hear"),
    node("h2", "Validate", "code", 2, [220, 0], {"jsCode": HEAR_VALIDATE}),
    iff("h3", "Ok?", [440, 0], "={{ $json.ok }}", "true"),
    node("h4", "Respond Error", "respondToWebhook", 1, [660, 220], {"respondWith": "json", "responseBody": "={{ JSON.stringify({ text: null, error: $json.error }) }}", "options": {}}),
    node("h5", "Audio to File", "code", 2, [660, 0], {"jsCode": TO_FILE}),
    node("h6", "Hear (speech to text)", "httpRequest", 4.2, [880, 0], {"method": "POST",
        "url": "={{ ($env.DAEMONS_STT_URL || 'http://host.docker.internal:8770') + '/v1/audio/transcriptions' }}",
        "sendHeaders": True, "headerParameters": {"parameters": [
            {"name": "Authorization", "value": "={{ $env.DAEMONS_LLM_KEY ? 'Bearer ' + $env.DAEMONS_LLM_KEY : '' }}"}]},
        "sendBody": True, "contentType": "multipart-form-data", "bodyParameters": {"parameters": [
            {"parameterType": "formBinaryData", "name": "file", "inputDataFieldName": "audio"},
            {"name": "model", "value": "={{ $env.DAEMONS_STT_MODEL || 'whisper-1' }}"},
            {"name": "response_format", "value": "json"}]},
        "options": {"timeout": 60000}}, continueOnFail=True),
    node("h7", "Shape", "code", 2, [1100, 0], {"jsCode": HEAR_SHAPE}),
    node("h8", "Respond", "respondToWebhook", 1, [1320, 0], {"respondWith": "json", "responseBody": "={{ JSON.stringify($json) }}", "options": {}}),
]
hear = {"name": "DAEMONS — daemon/hear (speech to text)", "nodes": hear_nodes, "pinData": {}, "active": False,
        "connections": c(("Webhook /daemon/hear", ["Validate"]), ("Validate", ["Ok?"]), ("Ok?", ["Audio to File", "Respond Error"]),
                         ("Audio to File", ["Hear (speech to text)"]), ("Hear (speech to text)", ["Shape"]), ("Shape", ["Respond"])),
        "settings": {"executionOrder": "v1", "binaryMode": "separate"}}
json.dump(hear, open(os.path.join(OUT, "DAEMONS - daemon_hear (internal).json"), "w"), indent=2, ensure_ascii=False)
HEAR_RELAY_SHAPE = r"""// A dead backend comes back as a named absence, never a 500.
const j = ($input.first() || {}).json || {};
if (!j.text && !j.error) return [{ json: { text: null, error: 'backend_unreachable' } }];
return [{ json: j }];"""
hear_relay = {"name": "DAEMONS Public — daemon/hear relay", "nodes": [
    node("ph1", "Public Webhook", "webhook", 2, [0, 0], {"httpMethod": "POST", "path": "daemon/hear", "responseMode": "responseNode", "options": {}}, webhookId="pub-daemon-hear"),
    node("ph2", "Relay to Internal", "httpRequest", 4.2, [224, 0], {"method": "POST", "url": INTERNAL + "/webhook/daemon/hear",
        "sendHeaders": True, "headerParameters": {"parameters": [{"name": "Content-Type", "value": "application/json"},
            {"name": "x-dex-secret", "value": "={{ $json.headers['x-dex-secret'] || '' }}"}]},
        "sendBody": True, "specifyBody": "json", "jsonBody": "={{ JSON.stringify($json.body) }}", "options": {"timeout": 90000}}, continueOnFail=True),
    node("ph3", "Shape Response", "code", 2, [448, 0], {"jsCode": HEAR_RELAY_SHAPE}),
    node("ph4", "Respond", "respondToWebhook", 1, [672, 0], {"respondWith": "json", "responseBody": "={{ JSON.stringify($json) }}", "options": {}}),
], "pinData": {}, "connections": c(("Public Webhook", ["Relay to Internal"]), ("Relay to Internal", ["Shape Response"]), ("Shape Response", ["Respond"])),
   "settings": {"executionOrder": "v1"}}
json.dump(hear_relay, open(os.path.join(OUT, "public-relay", "DAEMONS Public - daemon_hear relay.json"), "w"), indent=2, ensure_ascii=False)
print("written")
