// C-100: what the widget shares with the app, and how it reaches the companion. The app writes the companion's
// address, its key, the way from away and the widget's own device id into the App Group (app/widget.ts); the widget
// keeps what it last showed there too, so a home screen away from everything still shows the daemon.
import Foundation
import WidgetKit

let GROUP = "group.com.codemusic.daemonscompanion"
let KIND = "DaemonWidget"

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
  var at: Date = Date()
}

// The day's life, as GET /api/daemon/life and POST /api/daemon/<care> answer (server/src/life.ts)
struct Life: Decodable {
  struct Count: Decodable { let today: Int; let due: Int }
  let word: String; let fed: Count; let watered: Count; let trained: Bool; let tired: String; let cue: String?
  let level: Int?
}
// The part of GET /api/device/state the widget draws
struct DeviceState: Decodable {
  struct Daemon: Decodable { let slot: Int; let name: String; let nickname: String; let level: Int; let artKey: String; let life: Life }
  let daemon: Daemon?
}
struct Art: Decodable { let png: String }

enum Shared {
  static let defaults = UserDefaults(suiteName: GROUP)
  static func string(_ key: String) -> String? {
    guard let v = defaults?.string(forKey: key), !v.isEmpty else { return nil }
    return v
  }
  static var paired: Bool { string("server") != nil && string("token") != nil && string("device") != nil }

  static var snapshot: Snapshot? {
    get { defaults?.data(forKey: "snapshot").flatMap { try? JSONDecoder().decode(Snapshot.self, from: $0) } }
    set { defaults?.set(newValue.flatMap { try? JSONEncoder().encode($0) }, forKey: "snapshot") }
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
    var relay = URLRequest(url: url, timeoutInterval: 20)
    relay.httpMethod = "POST"
    relay.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
    relay.setValue("application/json", forHTTPHeaderField: "content-type")
    var body: [String: Any] = ["method": post ? "POST" : "GET", "path": full]
    if post { body["body"] = [String: Any]() }
    relay.httpBody = try JSONSerialization.data(withJSONObject: body)
    guard let (data, r) = try? await URLSession.shared.data(for: relay), let h = r as? HTTPURLResponse, h.statusCode == 200
    else { throw Unreachable() }
    return try JSONDecoder().decode(T.self, from: data)
  }

  // The daemon this widget carries, its day and its picture -- the picture fetched again only when its art would change.
  static func refresh() async -> Snapshot? {
    guard Shared.paired else { return nil }
    do {
      let st: DeviceState = try await call("/api/device/state")
      guard let d = st.daemon else { let s = Snapshot(carries: false); Shared.snapshot = s; return s }
      let old = Shared.snapshot
      var png = old?.artKey == d.artKey ? old?.png : nil
      if png == nil { png = (try? await call("/api/art?party=\(d.slot)") as Art)?.png }
      let s = Snapshot(carries: true, name: d.nickname.isEmpty ? d.name : d.nickname, level: d.level, word: d.life.word,
                       fed: d.life.fed.today, watered: d.life.watered.today, trained: d.life.trained, tired: d.life.tired,
                       cue: d.life.cue, png: png, artKey: d.artKey, said: nil, at: Date())
      Shared.snapshot = s
      return s
    } catch {
      return Shared.snapshot
    }
  }
}
