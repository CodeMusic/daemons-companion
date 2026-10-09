// C-100: the widget's three buttons -- FEED, WATER, TRAIN, as the app's LifeCard has them (C-13) -- each an App Intent,
// so it runs from the home screen without opening the app. The answer is the day's life; the widget draws it at once.
import AppIntents
import WidgetKit

enum CareKind: String {
  case feed, water, train
  var said: String { switch self { case .feed: "Eaten."; case .water: "Drunk."; case .train: "Trained." } }
}

func care(_ kind: CareKind) async {
  guard var s = Shared.snapshot, s.carries else { return }
  do {
    let l: Life = try await Companion.call("/api/daemon/\(kind.rawValue)", post: true)
    s.word = l.word; s.fed = l.fed.today; s.watered = l.watered.today; s.trained = l.trained; s.tired = l.tired; s.cue = l.cue
    if let lv = l.level { s.level = lv }
    s.said = kind.said
  } catch {
    Shared.keep(kind.rawValue)                       // C-87: nothing lost -- the app sends it from home
    s.said = "Kept until home answers."              // DRAFT
  }
  s.at = Date()
  Shared.snapshot = s
}

struct FeedIntent: AppIntent {
  static var title: LocalizedStringResource = "Feed your daemon"
  func perform() async throws -> some IntentResult { await care(.feed); return .result() }
}
struct WaterIntent: AppIntent {
  static var title: LocalizedStringResource = "Water your daemon"
  func perform() async throws -> some IntentResult { await care(.water); return .result() }
}
struct TrainIntent: AppIntent {
  static var title: LocalizedStringResource = "Train your daemon"
  func perform() async throws -> some IntentResult { await care(.train); return .result() }
}
