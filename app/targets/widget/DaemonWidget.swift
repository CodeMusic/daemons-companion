// C-100: a daemon on the home screen. The widget is a device of its own (`iphone-widget-xxxxxx`, app/widget.ts): the
// daemon it hosts is chosen under DEVICE > YOUR DEVICES like any board's, and its three buttons tend it from here.
// C-113: it lives in its den (Den.swift), large, and alive as it is on the boards -- it wanders the den through the hour
// and faces the way it goes, sleeps where it stopped, and answers a button with a hop. The day is pips, not a sentence.
// Small, medium and large on the home screen; two on the lock screen. Every word on it is DRAFT.
import AppIntents
import SwiftUI
import WidgetKit

struct Entry: TimelineEntry {
  let date: Date
  let snapshot: Snapshot?
  let paired: Bool
  var spot: Double = 0.5      // C-113: where in the den it stands, 0 (left) to 1 (right)
  var facesRight = false      // the game's front sprites face left; facing right is the sprite mirrored
  var hop = false             // a button was just pressed
}

// C-113: the hour's wandering, as timeline entries. Each stop is a few minutes long and it turns to face the way it went;
// asleep, it stays where it is. The walk is seeded by the hour, so a refresh mid-walk does not jump it elsewhere.
func wander(_ s: Snapshot?, paired: Bool, from start: Date, until end: Date, react: Bool) -> [Entry] {
  var r = Scatter("\(Int(start.timeIntervalSince1970 / 3600))")
  var spot = 0.3 + 0.4 * r.next(), entries: [Entry] = []
  let still = s?.tired == "asleep"
  if react {   // the answer to a press: up, then down again
    entries.append(Entry(date: start, snapshot: s, paired: paired, spot: spot, hop: true))
    entries.append(Entry(date: start.addingTimeInterval(1.2), snapshot: s, paired: paired, spot: spot))
  } else {
    entries.append(Entry(date: start, snapshot: s, paired: paired, spot: spot))
  }
  var at = start.addingTimeInterval(react ? 90 : 60 * (2 + 4 * r.next()))
  while !still && at < end {
    let next = min(0.92, max(0.08, spot + (r.next() - 0.5) * 0.7))
    entries.append(Entry(date: at, snapshot: s, paired: paired, spot: next, facesRight: next > spot))
    spot = next
    at = at.addingTimeInterval(60 * (3 + 5 * r.next()))
  }
  return entries
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry {
    Entry(date: Date(), snapshot: Snapshot(carries: true, name: "DAEMON", level: 5, word: "Content", fed: 1, watered: 1,
                                           den: Den(type: "FLOW", motif: "waves", wall: "#24375b", deep: "#152035",
                                                    floor: "#0f1727", glow: "#adc0e1")), paired: true)
  }
  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    completion(context.isPreview ? placeholder(in: context) : Entry(date: Date(), snapshot: Shared.snapshot, paired: Shared.paired))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    Task {
      let now = Date()
      // A button was just pressed: it answers with a hop, and its words stay a minute before the companion is asked again.
      if let s = Shared.snapshot, s.said != nil, now.timeIntervalSince(s.at) < 60 {
        let back = s.at.addingTimeInterval(60)
        return completion(Timeline(entries: wander(s, paired: Shared.paired, from: now, until: back, react: now.timeIntervalSince(s.at) < 10),
                                   policy: .after(back)))
      }
      let s = await Companion.refresh()
      let end = now.addingTimeInterval(30 * 60)
      completion(Timeline(entries: wander(s, paired: Shared.paired, from: now, until: end, react: false), policy: .after(end)))
    }
  }
}

let INK = Color.white
let SOFT = Color.white.opacity(0.72)
let PLAIN = Den()   // a den for a daemon whose companion has not said where it lives yet: CONTENT's

struct Sprite: View {
  let png: String?
  let asleep: Bool
  var expr: Expr? = nil             // C-119: shaded already; its eyes drawn over it here, in the sprite's own pixels
  var body: some View {
    if let png, let data = Data(base64Encoded: png), let ui = UIImage(data: data) {
      Image(uiImage: ui).interpolation(.none).resizable().scaledToFit()
        .saturation(asleep && expr == nil ? 0.4 : 1).opacity(asleep && expr == nil ? 0.75 : 1)
        .overlay {
          if let patch = expr?.patch, !patch.isEmpty {
            Canvas { c, size in
              let u = size.width / 64
              for p in patch {
                c.fill(Path(CGRect(x: p.x * u, y: p.y * u, width: p.w * u + 0.4, height: p.h * u + 0.4)), with: .color(rgb(p.rgb)))
              }
            }
          }
        }
    } else {
      Image(systemName: "questionmark").font(.title).foregroundStyle(SOFT)
    }
  }
}

// C-113: the den with the daemon in it. It stands on the floor at its spot, faces its way, hops when answered; asleep
// it lies low with a z or two; the last button's mark floats over it a moment.
struct Stage: View {
  let s: Snapshot
  let entry: Entry
  var body: some View {
    GeometryReader { g in
      let den = s.den ?? PLAIN
      let side = min(g.size.height * 0.86, g.size.width * 0.62, 192)   // 3x the game's 64, at most: it stays crisp
      let x = side / 2 + (g.size.width - side) * entry.spot
      let floor = g.size.height * FLOOR_AT
      let asleep = s.tired == "asleep"
      let above = CGPoint(x: min(g.size.width - side * 0.12, x + side * 0.36), y: max(side * 0.14, floor - side * 0.8))
      ZStack(alignment: .topLeading) {
        DenView(den: den, light: CGPoint(x: x / max(1, g.size.width), y: (floor - side / 2) / max(1, g.size.height)))
        Ellipse().fill(Color.black.opacity(0.28))   // its shadow, on the floor
          .frame(width: side * 0.55, height: side * 0.09)
          .position(x: x, y: floor + side * 0.02)
        Sprite(png: s.png, asleep: asleep, expr: s.expr)
          .scaleEffect(x: entry.facesRight ? -1 : 1, y: s.expr?.pose.squash ?? 1, anchor: .bottom)   // C-119: squashed toward its feet
          .frame(width: side, height: side)
          .position(x: x, y: floor - side / 2 + side * 0.06 - (entry.hop ? side * 0.16 : 0) + (s.expr?.pose.dy ?? 0) * side / 64)
        if let mark = s.expr?.mark, !(s.said != nil && entry.date.timeIntervalSince(s.at) < 60) {   // C-119: zz, a heart, a drop
          PixelMark(mark: mark).frame(width: max(12, side * 0.2), height: max(12, side * 0.2)).position(above)
        } else if asleep && s.expr == nil {
          Text("z  z").font(.system(size: max(9, side * 0.13), weight: .bold, design: .monospaced))
            .foregroundStyle(Color(hex: den.glow).opacity(0.8))
            .position(above)
        } else if let mark = Mark.symbol(s.did), s.said != nil, entry.date.timeIntervalSince(s.at) < 60 {
          Image(systemName: mark).font(.system(size: max(10, side * 0.16), weight: .bold))
            .foregroundStyle(Color(hex: den.glow))
            .position(above)
        }
      }
      .animation(.smooth(duration: 1.1), value: entry.spot)
      .animation(.spring(duration: 0.45, bounce: 0.5), value: entry.hop)
    }
  }
}

// C-119: the expression's 8x8 mark in the game's own pixels (never mirrored)
struct PixelMark: View {
  let mark: Expr.Mark
  var body: some View {
    Canvas { c, size in
      let u = size.width / 8
      for (y, row) in mark.rows.enumerated() {
        for (x, ch) in row.enumerated() where ch != "." {
          c.fill(Path(CGRect(x: Double(x) * u, y: Double(y) * u, width: u + 0.3, height: u + 0.3)), with: .color(ch == "o" ? .white : rgb(mark.rgb)))
        }
      }
    }
  }
}
func rgb(_ c: [Int]) -> Color { Color(red: Double(c[0]) / 255, green: Double(c[1]) / 255, blue: Double(c[2]) / 255) }

enum Mark {
  static func symbol(_ did: String?) -> String? {
    switch did { case "feed": "heart.fill"; case "water": "drop.fill"; case "train": "bolt.fill"; case "sleep": "moon.zzz.fill"; case "kept": "clock"; default: nil }
  }
}

// C-113: the day as pips -- three meals, three drinks, one training.
struct Pips: View {
  let s: Snapshot
  let glow: Color
  var size: CGFloat = 6
  var body: some View {
    HStack(spacing: size * 1.4) {
      row("fork.knife", s.fed, 3)
      row("drop.fill", s.watered, 3)
      row("figure.strengthtraining.traditional", s.trained ? 1 : 0, 1)
    }
  }
  func row(_ symbol: String, _ done: Int, _ of: Int) -> some View {
    HStack(spacing: size * 0.5) {
      Image(systemName: symbol).font(.system(size: size * 1.3, weight: .semibold)).foregroundStyle(SOFT)
      ForEach(0..<of, id: \.self) { i in
        Circle().fill(i < done ? glow : .clear)
          .overlay(Circle().stroke(glow.opacity(i < done ? 0 : 0.55), lineWidth: 1))
          .frame(width: size, height: size)
      }
    }
  }
}

struct CareButton<I: AppIntent>: View {
  let intent: I
  let label: String
  let symbol: String
  let compact: Bool
  let den: Den
  let done: Bool     // C-113: today's are all done -- it still works, quieter
  var k: CGFloat = 1 // C-113: the widget's scale (DaemonWidgetView.scale), so a smaller iPhone gets a smaller button
  var pressed = false  // C-122: this was the button just pressed -- lit, ringed, and a check while the daemon hops
  var hop = false
  var body: some View {
    Button(intent: intent) {
      Group {
        if compact {
          Image(systemName: hop ? "checkmark" : symbol).font(.system(size: 13 * k, weight: .bold))
        } else {
          Label(hop ? "Done" : label, systemImage: hop ? "checkmark" : symbol).font(.system(size: 12 * k, weight: .semibold))   // DRAFT
            .labelStyle(.titleAndIcon)
        }
      }
      .contentTransition(.symbolEffect(.replace))
      .frame(maxWidth: .infinity, minHeight: (compact ? 26 : 30) * k)
    }
    .buttonStyle(.plain)
    .foregroundStyle(Color(hex: den.deep))
    .background(RoundedRectangle(cornerRadius: 8).fill(pressed ? Color.white : Color(hex: den.glow).opacity(done ? 0.45 : 0.95)))
    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(hex: den.glow), lineWidth: pressed ? 2 : 0))
    .scaleEffect(hop ? 1.08 : 1)
    .animation(.spring(duration: 0.35, bounce: 0.5), value: hop)
  }
}

struct Buttons: View {
  let s: Snapshot
  let compact: Bool
  var k: CGFloat = 1
  var entry: Entry? = nil
  // C-122: the button just pressed stays lit while its words are shown (a minute), and shows a check during the hop
  func pressed(_ kind: String) -> Bool {
    guard let e = entry, s.did == kind, s.said != nil else { return false }
    return e.date.timeIntervalSince(s.at) < 60
  }
  var body: some View {
    let den = s.den ?? PLAIN, hop = entry?.hop ?? false
    HStack(spacing: 6 * k) {
      // C-117: the boards' order -- A drink, B feed, C train (then SLEEP)
      CareButton(intent: WaterIntent(), label: "Drink", symbol: "drop.fill", compact: compact, den: den, done: s.watered >= 3, k: k,
                 pressed: pressed("water"), hop: hop && pressed("water"))
      CareButton(intent: FeedIntent(), label: "Feed", symbol: "fork.knife", compact: compact, den: den, done: s.fed >= 3, k: k,
                 pressed: pressed("feed"), hop: hop && pressed("feed"))
      CareButton(intent: TrainIntent(), label: "Train", symbol: "figure.strengthtraining.traditional", compact: compact, den: den,
                 done: s.trained, k: k, pressed: pressed("train"), hop: hop && pressed("train"))
      CareButton(intent: SleepIntent(), label: "Sleep", symbol: "moon.fill", compact: compact, den: den, done: s.tired == "asleep", k: k,
                 pressed: pressed("sleep"), hop: hop && pressed("sleep"))   // C-114
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
    let den = entry.snapshot?.den ?? PLAIN
    Group {
      if !entry.paired {
        Said(text: "Open DAEMONS and pair this phone with your companion.")
      } else if let s = entry.snapshot, s.carries {
        switch family {
        case .accessoryCircular: circular(s)
        case .accessoryRectangular: rectangular(s)
        default:
          // C-113: widgets are not one size -- a small one is 141pt on the smallest iPhone and 170 on the largest -- so the
          // words, the pips and the buttons are scaled from the room the widget actually has.
          GeometryReader { g in
            let k = min(1.1, max(0.78, g.size.width / (family == .systemSmall ? 138 : 332)))
            switch family {
            case .systemSmall: small(s, k)
            case .systemLarge: large(s, k)
            default: medium(s, k)
            }
          }
        }
      } else if entry.snapshot != nil {
        Said(text: "No daemon here. SEND one in the game, then choose it for THIS PHONE'S WIDGET under DEVICE in the app.")
      } else {
        Said(text: "Looking for your companion...")
      }
    }
    .containerBackground(for: .widget) {
      if family == .accessoryCircular || family == .accessoryRectangular { Color.clear }
      else { LinearGradient(colors: [Color(hex: den.wall), Color(hex: den.deep)], startPoint: .top, endPoint: .bottom) }
    }
  }

  func name(_ s: Snapshot, _ size: CGFloat) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: size * 0.4) {
      Text(s.name).font(.system(size: size, weight: .bold, design: .monospaced)).foregroundStyle(INK)
        .lineLimit(1).minimumScaleFactor(0.7)
      Text("Lv\(s.level)").font(.system(size: size * 0.75, design: .monospaced)).foregroundStyle(SOFT).fixedSize()
    }
  }

  // What it would say now: a button's answer, else the meal-time cue -- on a line of its own, never cut to "Kept un..."
  func line(_ s: Snapshot, _ size: CGFloat, lines: Int = 2) -> some View {
    Group {
      if let l = s.said ?? s.cue {
        Text(l).font(.system(size: size)).foregroundStyle(SOFT).lineLimit(lines).minimumScaleFactor(0.8)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
  }

  func stage(_ s: Snapshot) -> some View {
    Stage(s: s, entry: entry).clipShape(RoundedRectangle(cornerRadius: 10))
  }

  // Small: the name, the den and the buttons. Its word and its answers are the den's to show (the mark, the z).
  func small(_ s: Snapshot, _ k: CGFloat) -> some View {
    VStack(spacing: 5 * k) {
      HStack { name(s, 11 * k); Spacer(minLength: 0) }
      stage(s).frame(maxHeight: .infinity)
      Buttons(s: s, compact: true, k: k, entry: entry)
    }
  }

  func medium(_ s: Snapshot, _ k: CGFloat) -> some View {
    HStack(spacing: 10 * k) {
      stage(s).frame(maxWidth: .infinity)
      VStack(alignment: .leading, spacing: 4 * k) {
        name(s, 14 * k)
        Text(s.word).font(.system(size: 15 * k, weight: .semibold)).foregroundStyle(INK).lineLimit(1).minimumScaleFactor(0.7)
        Pips(s: s, glow: Color(hex: (s.den ?? PLAIN).glow), size: 5 * k)
        line(s, 11 * k)
        Spacer(minLength: 0)
        Buttons(s: s, compact: true, k: k, entry: entry)
      }
      .frame(width: 148 * k)
    }
  }

  func large(_ s: Snapshot, _ k: CGFloat) -> some View {
    VStack(alignment: .leading, spacing: 8 * k) {
      HStack(alignment: .firstTextBaseline) {
        name(s, 15 * k)
        Spacer(minLength: 6)
        Text(s.word).font(.system(size: 13 * k, weight: .semibold)).foregroundStyle(SOFT).lineLimit(1).minimumScaleFactor(0.7)
      }
      stage(s).frame(maxHeight: .infinity)
      Pips(s: s, glow: Color(hex: (s.den ?? PLAIN).glow), size: 7 * k)
      line(s, 12 * k)
      Buttons(s: s, compact: false, k: k, entry: entry)
    }
  }

  // The lock screen: the system tints it, so no den -- the daemon itself, and the day as one ring.
  func circular(_ s: Snapshot) -> some View {
    let done = Double(s.fed + s.watered + (s.trained ? 1 : 0))
    return Gauge(value: done, in: 0...7) {
      Sprite(png: s.png, asleep: s.tired == "asleep").padding(6)
    }
    .gaugeStyle(.accessoryCircularCapacity)
    .widgetAccentable()
  }

  func rectangular(_ s: Snapshot) -> some View {
    HStack(spacing: 6) {
      Sprite(png: s.png, asleep: s.tired == "asleep").frame(width: 40, height: 40)
      VStack(alignment: .leading, spacing: 2) {
        Text(s.name).font(.system(size: 13, weight: .bold, design: .monospaced)).lineLimit(1).minimumScaleFactor(0.7).widgetAccentable()
        Text(s.said ?? s.word).font(.system(size: 12)).lineLimit(1).minimumScaleFactor(0.7)
        Text("fed \(s.fed)/3 · water \(s.watered)/3\(s.trained ? " · trained" : "")").font(.system(size: 11)).lineLimit(1).minimumScaleFactor(0.7)
      }
      Spacer(minLength: 0)
    }
  }
}

struct DaemonWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: KIND, provider: Provider()) { DaemonWidgetView(entry: $0) }
      .configurationDisplayName("Your daemon")
      .description("The daemon this phone hosts, in its den, and FEED, WATER and TRAIN from the home screen.")
      .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular])
  }
}

@main
struct DaemonWidgets: WidgetBundle {
  var body: some Widget { DaemonWidget() }
}
