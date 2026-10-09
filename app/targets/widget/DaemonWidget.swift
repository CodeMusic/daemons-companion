// C-100: a daemon on the home screen. The widget is a device of its own (`iphone-widget-xxxxxx`, app/widget.ts): the
// daemon it carries is chosen under DEVICE > YOUR DEVICES like any board's, and its three buttons tend it from here.
// Every word on it is DRAFT.
import AppIntents
import SwiftUI
import WidgetKit

struct Entry: TimelineEntry {
  let date: Date
  let snapshot: Snapshot?
  let paired: Bool
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry {
    Entry(date: Date(), snapshot: Snapshot(carries: true, name: "DAEMON", level: 5, word: "Content", fed: 1, watered: 1), paired: true)
  }
  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    completion(context.isPreview ? placeholder(in: context) : Entry(date: Date(), snapshot: Shared.snapshot, paired: Shared.paired))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    Task {
      // A button was just pressed: show its answer a minute before asking the companion again.
      if let s = Shared.snapshot, s.said != nil, Date().timeIntervalSince(s.at) < 60 {
        return completion(Timeline(entries: [Entry(date: Date(), snapshot: s, paired: Shared.paired)],
                                   policy: .after(s.at.addingTimeInterval(60))))
      }
      let s = await Companion.refresh()
      completion(Timeline(entries: [Entry(date: Date(), snapshot: s, paired: Shared.paired)],
                          policy: .after(Date().addingTimeInterval(30 * 60))))
    }
  }
}

let NAVY = Color(red: 0x14 / 255, green: 0x26 / 255, blue: 0x40 / 255)
let INK = Color.white
let SOFT = Color.white.opacity(0.65)

struct Sprite: View {
  let png: String?
  let asleep: Bool
  var body: some View {
    if let png, let data = Data(base64Encoded: png), let ui = UIImage(data: data) {
      Image(uiImage: ui).interpolation(.none).resizable().scaledToFit()
        .opacity(asleep ? 0.55 : 1)
    } else {
      Image(systemName: "questionmark").font(.title).foregroundStyle(SOFT)
    }
  }
}

struct CareButton<I: AppIntent>: View {
  let intent: I
  let label: String
  let symbol: String
  let compact: Bool
  var body: some View {
    Button(intent: intent) {
      if compact {
        Image(systemName: symbol).font(.system(size: 13, weight: .semibold)).frame(maxWidth: .infinity, minHeight: 26)
      } else {
        Label(label, systemImage: symbol).font(.system(size: 12, weight: .semibold)).labelStyle(.titleAndIcon)
          .frame(maxWidth: .infinity, minHeight: 28)
      }
    }
    .buttonStyle(.plain)
    .foregroundStyle(NAVY)
    .background(RoundedRectangle(cornerRadius: 6).fill(Color.white.opacity(0.9)))
  }
}

struct Buttons: View {
  let compact: Bool
  var body: some View {
    HStack(spacing: 6) {
      CareButton(intent: FeedIntent(), label: "Feed", symbol: "fork.knife", compact: compact)
      CareButton(intent: WaterIntent(), label: "Water", symbol: "drop.fill", compact: compact)
      CareButton(intent: TrainIntent(), label: "Train", symbol: "figure.strengthtraining.traditional", compact: compact)
    }
  }
}

struct Said: View {
  let text: String
  var body: some View { Text(text).font(.system(size: 11)).foregroundStyle(SOFT).multilineTextAlignment(.center) }
}

struct DaemonWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: Entry

  var body: some View {
    Group {
      if !entry.paired {
        Said(text: "Open DAEMONS and pair this phone with your companion.")
      } else if let s = entry.snapshot, s.carries {
        if family == .systemSmall { small(s) } else { medium(s) }
      } else if entry.snapshot != nil {
        Said(text: "No daemon here. SEND one in the game, then choose it for THIS PHONE'S WIDGET under DEVICE in the app.")
      } else {
        Said(text: "Looking for your companion...")
      }
    }
    .containerBackground(NAVY, for: .widget)
  }

  func small(_ s: Snapshot) -> some View {
    VStack(spacing: 4) {
      HStack(alignment: .firstTextBaseline) {
        Text(s.name).font(.system(size: 12, weight: .bold, design: .monospaced)).foregroundStyle(INK).lineLimit(1)
        Spacer(minLength: 2)
        Text("Lv\(s.level)").font(.system(size: 10, design: .monospaced)).foregroundStyle(SOFT)
      }
      Sprite(png: s.png, asleep: s.tired == "asleep").frame(maxHeight: .infinity)
      Text(s.said ?? s.word).font(.system(size: 11)).foregroundStyle(SOFT).lineLimit(1)
      Buttons(compact: true)
    }
  }

  func medium(_ s: Snapshot) -> some View {
    VStack(spacing: 8) {
      HStack(spacing: 12) {
        Sprite(png: s.png, asleep: s.tired == "asleep").frame(width: 72, height: 72)
        VStack(alignment: .leading, spacing: 3) {
          HStack(alignment: .firstTextBaseline) {
            Text(s.name).font(.system(size: 15, weight: .bold, design: .monospaced)).foregroundStyle(INK).lineLimit(1)
            Text("Lv. \(s.level)").font(.system(size: 11, design: .monospaced)).foregroundStyle(SOFT)
          }
          Text(s.word).font(.system(size: 15, weight: .semibold)).foregroundStyle(INK).lineLimit(1)
          Text("fed \(s.fed) of 3 · water \(s.watered) of 3\(s.trained ? " · trained" : "")")
            .font(.system(size: 11)).foregroundStyle(SOFT).lineLimit(1)
          if let line = s.said ?? s.cue { Text(line).font(.system(size: 11)).foregroundStyle(SOFT).lineLimit(1) }
        }
        Spacer(minLength: 0)
      }
      Buttons(compact: false)
    }
  }
}

struct DaemonWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: KIND, provider: Provider()) { DaemonWidgetView(entry: $0) }
      .configurationDisplayName("Your daemon")
      .description("The daemon this phone carries, and FEED, WATER and TRAIN from the home screen.")
      .supportedFamilies([.systemSmall, .systemMedium])
  }
}

@main
struct DaemonWidgets: WidgetBundle {
  var body: some Widget { DaemonWidget() }
}
