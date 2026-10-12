// C-100: the widget's buttons -- FEED, WATER, TRAIN, and SLEEP (C-114), as the app's LifeCard has them (C-13) -- each an App Intent,
// so it runs from the home screen without opening the app. The answer is the day's life; the widget draws it at once.
import AppIntents
import WidgetKit

enum CareKind: String {
  case feed, water, train, sleep
  var said: String { switch self { case .feed: "Eaten."; case .water: "Drank."; case .train: "Trained."; case .sleep: "Asleep." } }   // DRAFT
}

func care(_ kind: CareKind) async {
  guard var s = Shared.snapshot, s.carries else { return }
  if Shared.alone {                                  // C-111: the phone alone -- kept here, tended when the app opens
    Shared.keep(kind.rawValue)
    switch kind {
    case .feed: s.fed = min(3, s.fed + 1); s.tired = s.tired == "asleep" ? "awake" : s.tired   // tended, it wakes (C-114)
    case .water: s.watered = min(3, s.watered + 1); s.tired = s.tired == "asleep" ? "awake" : s.tired
    case .train: s.trained = true; s.tired = s.tired == "asleep" ? "awake" : s.tired
    case .sleep: s.tired = "asleep"
    }
    s.said = kind.said; s.did = kind.rawValue; s.at = Date(); Shared.snapshot = s
    return
  }
  do {
    let l: Life = try await Companion.call("/api/daemon/\(kind.rawValue)", post: true)
    s.word = l.word; s.fed = l.fed.today; s.watered = l.watered.today; s.trained = l.trained; s.tired = l.tired; s.cue = l.cue
    if let lv = l.level { s.level = lv }
    s.said = kind.said; s.did = kind.rawValue
  } catch {
    Shared.keep(kind.rawValue)                       // C-87: nothing lost -- the app sends it from home
    s.said = "Kept until home answers."              // DRAFT
    s.did = "kept"
  }
  s.at = Date()
  Shared.snapshot = s
}

struct FeedIntent: AppIntent {
  static var title: LocalizedStringResource = "Feed your daemon"
  func perform() async throws -> some IntentResult { await care(.feed); return .result() }
}
struct WaterIntent: AppIntent {
  static var title: LocalizedStringResource = "Give your daemon a drink"   // C-117, DRAFT
  func perform() async throws -> some IntentResult { await care(.water); return .result() }
}
struct TrainIntent: AppIntent {
  static var title: LocalizedStringResource = "Train your daemon"
  func perform() async throws -> some IntentResult { await care(.train); return .result() }
}
struct SleepIntent: AppIntent {                     // C-114
  static var title: LocalizedStringResource = "Put your daemon to bed"
  func perform() async throws -> some IntentResult { await care(.sleep); return .result() }
}
