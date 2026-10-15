// C-100: the widget's buttons -- FEED, WATER, TRAIN, and SLEEP (C-114), as the app's LifeCard has them (C-13) -- each an App Intent,
// so it runs from the home screen without opening the app.
// C-122: it lives in _shared/, compiled into the app as well as the widget: each button is an AudioPlaybackIntent, which
// iOS runs in the app's own process (a widget extension may not play sound -- the user, 2026-10-15: "the widget buttons
// work but no sound"), so the care's phrase is heard. The App Group is shared, so the press reaches the widget the same.
// C-122: the happy path first (the user, 2026-10-15: "presume the happy path, show the screen feedback and then send to the
// server"). A press counts at once, the widget is asked to redraw, the care's phrase plays, and only then is the companion
// asked; its answer quietly corrects the counts. If it cannot be reached the press is kept (C-87) and nothing on screen says so.
import AppIntents
import AVFoundation
import WidgetKit

enum CareKind: String {
  case feed, water, train, sleep
  var said: String { switch self { case .feed: "Eaten."; case .water: "Drank."; case .train: "Trained."; case .sleep: "Asleep." } }   // DRAFT
}

// What the press does to the day, assumed before anyone answers -- the same rule the phone alone has always used (C-111)
func presume(_ kind: CareKind, _ s: inout Snapshot) {
  switch kind {
  case .feed: s.fed = min(3, s.fed + 1); s.tired = s.tired == "asleep" ? "awake" : s.tired   // tended, it wakes (C-114)
  case .water: s.watered = min(3, s.watered + 1); s.tired = s.tired == "asleep" ? "awake" : s.tired
  case .train: s.trained = true; s.tired = s.tired == "asleep" ? "awake" : s.tired
  case .sleep: s.tired = "asleep"
  }
  s.said = kind.said; s.did = kind.rawValue; s.at = Date()
}

func care(_ kind: CareKind) async {
  guard var s = Shared.snapshot, s.carries else { return }
  presume(kind, &s)
  Shared.snapshot = s
  WidgetCenter.shared.reloadAllTimelines()          // drawn now, not after the companion answers
  CareSound.play(kind)
  if Shared.alone { Shared.keep(kind.rawValue); await CareSound.finish(); return }   // C-111: tended when the app opens
  do {
    let l: Life = try await Companion.call("/api/daemon/\(kind.rawValue)", post: true)
    if var now = Shared.snapshot {                   // a second press may have landed meanwhile: correct the counts only
      now.word = l.word; now.fed = l.fed.today; now.watered = l.watered.today; now.trained = l.trained; now.tired = l.tired
      now.cue = l.cue
      if let lv = l.level { now.level = lv }
      Shared.snapshot = now
    }
  } catch {
    Shared.keep(kind.rawValue)                       // C-87: nothing lost -- the app sends it from home
  }
  await CareSound.finish()
}

// C-122: each care's phrase of DAEMONS' music, as the app (careSound.ts) and the boards (tunes.h TUNE_FED ...) play it -- a
// square wave on the day's note. Made in memory, so the widget carries no sound files. Change the notes in all three together.
enum CareSound {
  static let tunes: [CareKind: [(Int, Int)]] = [
    .feed:  [(0, 230), (-3, 115), (0, 115), (2, 230), (0, 115), (-3, 330)],                       // BLANCHE
    .water: [(0, 120), (-2, 120), (-4, 120), (-5, 120), (-4, 120), (-2, 120), (0, 300)],          // VERDIGRIS
    .train: [(0, 140), (0, 140), (2, 140), (4, 140), (7, 140), (7, 320)],                         // BRAZEN
    .sleep: [(0, 360), (-5, 360), (-9, 360), (-5, 360), (-7, 360), (-9, 360), (-10, 800)],        // HALFTONE, slowed
  ]
  static var player: AVAudioPlayer?
  static var length: Double = 0

  // The day's note, as tunes.h's dayRoot: Sunday C ... Saturday B
  static var dayRoot: Int { [72, 74, 76, 77, 79, 81, 83][(Calendar.current.component(.weekday, from: Date()) + 6) % 7] }

  static func wav(_ tune: [(Int, Int)], root: Int) -> Data {
    let rate = 22050
    var samples: [Int16] = []
    for (semis, ms) in tune {
      let f = 440 * pow(2, Double(root + semis - 69) / 12), n = rate * ms / 1000, gap = Int(Double(rate) * 0.012)
      for i in 0..<n {
        let env = min(1, Double(i) / 80) * (Double(i) < Double(n) * 0.8 ? 1 : max(0, Double(n - i) / (Double(n) * 0.2)))
        let wave = (Double(i) * f / Double(rate)).truncatingRemainder(dividingBy: 1) < 0.5 ? 0.22 : -0.22
        samples.append(Int16((i > n - gap ? 0 : wave * env) * 32767))
      }
    }
    var d = Data()
    func u32(_ x: Int) { withUnsafeBytes(of: UInt32(x).littleEndian) { d.append(contentsOf: $0) } }
    func u16(_ x: Int) { withUnsafeBytes(of: UInt16(x).littleEndian) { d.append(contentsOf: $0) } }
    d.append(contentsOf: Array("RIFF".utf8)); u32(36 + samples.count * 2); d.append(contentsOf: Array("WAVEfmt ".utf8))
    u32(16); u16(1); u16(1); u32(rate); u32(rate * 2); u16(2); u16(16)
    d.append(contentsOf: Array("data".utf8)); u32(samples.count * 2)
    for s in samples { withUnsafeBytes(of: s.littleEndian) { d.append(contentsOf: $0) } }
    return d
  }

  // Playback, mixed with whatever is playing: the press runs with the app in the background, where an ambient session is
  // silenced. It is a short phrase, played over (never instead of) the user's own audio.
  static func play(_ kind: CareKind) {
    guard let tune = tunes[kind] else { return }
    try? AVAudioSession.sharedInstance().setCategory(.playback, options: [.mixWithOthers])
    try? AVAudioSession.sharedInstance().setActive(true)
    player = try? AVAudioPlayer(data: wav(tune, root: dayRoot))
    player?.play()
    length = Double(tune.reduce(0) { $0 + $1.1 }) / 1000
  }

  // The intent's process may end the moment perform() returns, so it waits for the phrase to finish first.
  static func finish() async {
    guard let p = player, p.isPlaying else { return }
    let left = max(0, length - p.currentTime)
    try? await Task.sleep(nanoseconds: UInt64(left * 1_000_000_000))
  }
}

@available(iOS 17.0, *)
struct FeedIntent: AudioPlaybackIntent {
  static var title: LocalizedStringResource = "Feed your daemon"
  func perform() async throws -> some IntentResult { await care(.feed); return .result() }
}
@available(iOS 17.0, *)
struct WaterIntent: AudioPlaybackIntent {
  static var title: LocalizedStringResource = "Give your daemon a drink"   // C-117, DRAFT
  func perform() async throws -> some IntentResult { await care(.water); return .result() }
}
@available(iOS 17.0, *)
struct TrainIntent: AudioPlaybackIntent {
  static var title: LocalizedStringResource = "Train your daemon"
  func perform() async throws -> some IntentResult { await care(.train); return .result() }
}
@available(iOS 17.0, *)
struct SleepIntent: AudioPlaybackIntent {                     // C-114
  static var title: LocalizedStringResource = "Put your daemon to bed"
  func perform() async throws -> some IntentResult { await care(.sleep); return .result() }
}
