// C-100: what the widget shares with the app, and how it reaches the companion. The app writes the companion's
// address, its key, the way from away and the widget's own device id into the App Group (app/platform/widget.ts); the widget
// keeps what it last showed there too, so a home screen away from everything still shows the daemon.
import Foundation
import WidgetKit

let GROUP = "group.com.codemusic.daemonscompanion"
let KIND = "DaemonWidget"

// C-119: how it looks now, as the server describes it (server/src/expressions.ts). The picture comes already in its shade
// (/api/art?expression=); the widget draws the eye patches and the mark over it, and takes the pose's rest.
struct Expr: Codable {
  struct Pose: Codable { let dy: Double; let squash: Double; let still: Bool; let girth: Double? }   // C-266: girth, as it has been fed and trained
  struct Mark: Codable { let rows: [String]; let rgb: [Int] }
  struct Patch: Codable { let x: Double; let y: Double; let w: Double; let h: Double; let rgb: [Int] }
  let name: String; let pose: Pose; let mark: Mark?; let patch: [Patch]
}

// What the widget last drew: the carried daemon and its day, and its picture (a PNG, base64, as /api/art gives it).
struct Snapshot: Codable {
  var carries: Bool                 // false: the companion answered, and this widget carries no daemon
  var name: String = ""
  var level: Int = 0
  var word: String = ""
  var fed: Int = 0
  var watered: Int = 0
  var trained: Bool = false
  var tired: String = "awake"
  var cue: String? = nil
  var png: String? = nil
  var artKey: String? = nil
  var said: String? = nil           // the last button's answer ("Eaten.") -- shown until the next refresh
  var did: String? = nil            // C-113: which button that was (feed, water, train, or kept), for the daemon to answer
  var den: Den? = nil               // C-113: where it is drawn (server/src/dens.ts)
  var expr: Expr? = nil             // C-119: its expression
  var at: Date = Date()
  var sound: Bool? = nil            // C-160: this phone's own SOUND (PLACES, ITS SETTINGS): false is silent
  var volume: Int? = nil            //        and how loud, 0..100 as the boards have it (60 unless set)
  var edition: String? = nil        // T-425: the save's -- its instrument, the harp (CONTENT) or the flute (CONTEXT)
  var rest: Int? = nil              // C-279: how well it has slept, 0..100 (C-266's care.rest), for the moon
  var wakesAt: Date? = nil          // C-300: asleep -- when it would wake by itself, so the widget is drawn again then
  var sky: Sky? = nil               // C-312: what the aurora waits on (the book mended; both editions met)
}

// C-312 (the user, 2026-11-10, by multiple choice: "Bands over its sky"): the aurora in the widget's night sky -- the den's
// rule to the bit (server/src/aurora.ts, itself the cartridge's daemons_aurora.c): THE UNITY BOOK mended, the game's night
// watch (20:00 to 5:00), and one night in three picked from the date. A widget cannot breathe, so its bands are drawn at
// the breath's middle. Every edge of it is the den's; nothing here is decided again.
struct Sky: Codable { let edition: String; let mended: Bool; let both: Bool }
enum Aurora {
  static let line = ["CONTENT": "#F7394A", "CONTEXT": "#52F77B"]
  static let bands = ["CONTENT": [255, 160, 64, 16, 0, 0], "CONTEXT": [96, 255, 160, 48, 16, 0]]
  static let conjugate = [255, 255, 176, 64, 16, 0]          // red in the top band, green below (C-306)
  static func dayNumber(_ y: Int, _ m: Int, _ d: Int) -> Int {
    let before = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    let yy = (y - 2000) & 0xFFFF
    var days = yy * 365 + (yy + 3) / 4 + before[(m - 1) % 12] + d - 1
    if m > 2 && yy % 4 == 0 { days += 1 }
    return days & 0xFFFF
  }
  static func night(_ date: Date) -> Int {
    let c = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
    let day = dayNumber(c.year!, c.month!, c.day!), minute = c.hour! * 60 + c.minute!
    return (minute < 12 * 60 ? day - 1 : day) & 0xFFFF
  }
  static func isLightNight(_ n: Int) -> Bool {
    var x = ((n & 0xFFFF) * 40503) % 65536
    x ^= x >> 7
    x = (x * 40503) % 65536
    return (x >> 8) % 3 == 0
  }
  static func shows(_ sky: Sky?, at date: Date) -> Bool {
    guard let sky, sky.mended else { return false }
    let h = Calendar.current.component(.hour, from: date)
    return (h >= 20 || h < 5) && isLightNight(night(date))
  }
  // each band top first: its colour and how strongly (0..1), at the breath's middle -- aurora.ts auroraWeight(band, 0.5)
  static func sky(_ sky: Sky) -> [(String, Double)] {
    let e = sky.edition == "CONTEXT" ? "CONTEXT" : "CONTENT"
    let ws = sky.both ? conjugate : bands[e]!
    return ws.enumerated().map { i, w in
      (sky.both ? (i < 1 ? line["CONTENT"]! : line["CONTEXT"]!) : line[e]!, Double((72 + 128 * 96 / 255) * w / 255) / 256)
    }
  }
}

// C-301: the watches of the day the care key turns on -- server/src/life.ts DUSK and DAWN (context.ts watchOf)
let DUSK_HOUR = 18, DAWN_HOUR = 5
func isNight(_ d: Date) -> Bool { let h = Calendar.current.component(.hour, from: d); return h >= DUSK_HOUR || h < DAWN_HOUR }
// the next dusk or dawn after this moment -- when the care key would change by itself
func nextTurn(after d: Date) -> Date {
  let cal = Calendar.current
  // C-312: and 20:00, when a night of light begins
  let turns = [DAWN_HOUR, DUSK_HOUR, 20].compactMap { cal.nextDate(after: d, matching: DateComponents(hour: $0, minute: 0), matchingPolicy: .nextTime) }
  return turns.min() ?? d.addingTimeInterval(3600)
}
func isoDate(_ s: String?) -> Date? {
  guard let s else { return nil }
  let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return f.date(from: s) ?? ISO8601DateFormatter().date(from: s)
}

// The day's life, as GET /api/daemon/life and POST /api/daemon/<care> answer (server/src/life.ts)
struct Life: Decodable {
  struct Count: Decodable { let today: Int; let due: Int }
  let word: String; let fed: Count; let watered: Count; let trained: Bool; let tired: String; let cue: String?
  let level: Int?
  struct Care: Decodable { let rest: Int }   // C-279: the rest of C-266's care is not drawn here
  let care: Care?
  let wakesAt: String?                       // C-300
}
// The part of GET /api/device/state the widget draws
struct DeviceState: Decodable {
  struct Daemon: Decodable { let slot: Int; let name: String; let nickname: String; let level: Int; let artKey: String; let life: Life
                         let den: Den?; let expression: Expr? }
  let daemon: Daemon?
  struct Hearing: Decodable { let sound: Bool?; let volume: Int? }
  let settings: Hearing?            // C-160: its own over every device's
  let edition: String?              // T-425: the save's edition
  let sky: Sky?                     // C-312: the aurora's
}
struct Art: Decodable { let png: String }

enum Shared {
  static let defaults = UserDefaults(suiteName: GROUP)
  static func string(_ key: String) -> String? {
    guard let v = defaults?.string(forKey: key), !v.isEmpty else { return nil }
    return v
  }
  static var paired: Bool { alone || (string("server") != nil && string("token") != nil && string("device") != nil) }
  // C-111: the phone hosting on its own -- no companion to ask; the app draws the widget (app/platform/widget.ts, drawAlone)
  static var alone: Bool { string("alone") == "1" && string("device") != nil }

  static var snapshot: Snapshot? {
    get { defaults?.data(forKey: "snapshot").flatMap { try? JSONDecoder().decode(Snapshot.self, from: $0) } }
    set { defaults?.set(newValue.flatMap { try? JSONEncoder().encode($0) }, forKey: "snapshot") }
  }

  // C-111: the snapshot the app drew, and every button pressed since, counted on top until the app tends the daemon
  // with them (the queue below) and draws it again.
  static var alonePicture: Snapshot? {
    guard var s = string("aloneSnapshot").flatMap({ try? JSONDecoder().decode(Snapshot.self, from: Data($0.utf8)) }) else { return nil }
    let iso = ISO8601DateFormatter()
    for k in kept where (k["at"] as? String).flatMap(iso.date(from:)).map({ $0 > s.at }) ?? true {
      let path = (k["path"] as? String) ?? ""
      if let kind = CareKind(rawValue: String(path.dropFirst("/api/daemon/".count))), path.hasPrefix("/api/daemon/") {
        let at = s.at, said = s.said, did = s.did
        presume(kind, &s)                                    // C-122: the same rule as the press -- tended, it wakes
        s.at = at; s.said = said; s.did = did
      }
    }
    return s
  }
  static var kept: [[String: Any]] {
    (string("queue").flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) } as? [[String: Any]]) ?? []
  }

  // C-87: a button pressed with the companion out of reach is kept, and the app sends it when it next reaches home.
  static func keep(_ care: String) {
    var q = (string("queue").flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) } as? [[String: Any]]) ?? []
    q.append(["path": "/api/daemon/\(care)", "at": ISO8601DateFormatter().string(from: Date())])
    if let d = try? JSONSerialization.data(withJSONObject: q) { defaults?.set(String(decoding: d, as: UTF8.self), forKey: "queue") }
  }
}

struct Unreachable: Error {}

// The app's own way (App.tsx, apiLive): home first, briefly, then the way from away -- which carries the request as
// JSON {method, path, body} to the user's relay. Every request names this widget as its device (?device=).
enum Companion {
  static func call<T: Decodable>(_ path: String, post: Bool = false) async throws -> T {
    guard let server = Shared.string("server"), let token = Shared.string("token"), let device = Shared.string("device")
    else { throw Unreachable() }
    let full = path + (path.contains("?") ? "&" : "?") + "device=\(device)"
    var home = URLRequest(url: URL(string: server + full)!, timeoutInterval: Shared.string("away") == nil ? 8 : 2.5)
    home.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
    if post {
      home.httpMethod = "POST"; home.httpBody = Data("{}".utf8)
      home.setValue("application/json", forHTTPHeaderField: "content-type")
    }
    if let (data, r) = try? await URLSession.shared.data(for: home), let h = r as? HTTPURLResponse, h.statusCode == 200 {
      return try JSONDecoder().decode(T.self, from: data)
    }
    guard let away = Shared.string("away"), let url = URL(string: away) else { throw Unreachable() }
    // C-109: at home a slow answer (the .local name looked up) can miss home's short wait, and the relay cannot reach
    // the companion from there either -- so when the relay fails, home is asked once more, in full
    func homeAgain() async throws -> T {
      home.timeoutInterval = 8
      guard let (data, r) = try? await URLSession.shared.data(for: home), let h = r as? HTTPURLResponse, h.statusCode == 200
      else { throw Unreachable() }
      return try JSONDecoder().decode(T.self, from: data)
    }
    var relay = URLRequest(url: url, timeoutInterval: 20)
    relay.httpMethod = "POST"
    relay.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
    relay.setValue("application/json", forHTTPHeaderField: "content-type")
    var body: [String: Any] = ["method": post ? "POST" : "GET", "path": full]
    if post { body["body"] = [String: Any]() }
    relay.httpBody = try JSONSerialization.data(withJSONObject: body)
    guard let (data, r) = try? await URLSession.shared.data(for: relay), let h = r as? HTTPURLResponse, h.statusCode == 200
    else { return try await homeAgain() }
    return try JSONDecoder().decode(T.self, from: data)
  }

  // C-122: presses kept while the companion was out of reach are sent by the widget itself the next time it asks, in
  // order, so it does not wait for the app to be opened -- the ones that still do not go through stay kept.
  static func sendKept() async {
    let q = Shared.kept
    guard !q.isEmpty else { return }
    var left: [[String: Any]] = []
    for (i, k) in q.enumerated() {
      guard let path = k["path"] as? String, path.hasPrefix("/api/daemon/") else { continue }
      do { let _: Life = try await call(path, post: true) } catch { left = Array(q[i...]); break }
    }
    let now = Shared.kept                                    // a press made meanwhile stays kept as well
    left += now.dropFirst(q.count)
    if left.isEmpty { Shared.defaults?.removeObject(forKey: "queue") }
    else if let d = try? JSONSerialization.data(withJSONObject: left) { Shared.defaults?.set(String(decoding: d, as: UTF8.self), forKey: "queue") }
  }

  // The daemon this widget carries, its day and its picture -- the picture fetched again only when its art would change.
  static func refresh() async -> Snapshot? {
    guard Shared.paired else { return nil }
    if Shared.alone { let s = Shared.alonePicture; Shared.snapshot = s; return s }   // C-111: nothing to ask
    await sendKept()
    do {
      let st: DeviceState = try await call("/api/device/state")
      guard let d = st.daemon else { let s = Snapshot(carries: false); Shared.snapshot = s; return s }
      let old = Shared.snapshot
      let look = d.expression?.name ?? "awake", key = "\(d.artKey)/\(look)"     // C-119: its picture in its expression's shade
      var png = old?.artKey == key ? old?.png : nil
      if png == nil { png = (try? await call("/api/art?party=\(d.slot)" + (look == "awake" ? "" : "&expression=\(look)")) as Art)?.png }
      let s = Snapshot(carries: true, name: d.nickname.isEmpty ? d.name : d.nickname, level: d.level, word: d.life.word,
                       fed: d.life.fed.today, watered: d.life.watered.today, trained: d.life.trained, tired: d.life.tired,
                       cue: d.life.cue, png: png, artKey: key, said: nil, den: d.den, expr: d.expression, at: Date(),
                       sound: st.settings?.sound, volume: st.settings?.volume, edition: st.edition, rest: d.life.care?.rest,
                       wakesAt: isoDate(d.life.wakesAt), sky: st.sky)
      Shared.snapshot = s
      return s
    } catch {
      return Shared.snapshot
    }
  }
}
