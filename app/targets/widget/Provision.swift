// C-302 in the widget (the user, 2026-11-18: "the widget on the phone should be more animated when u given an action, like
// how u see in the app (eg feed and drink)"): what the daemon is given, on the den's floor in front of it, eaten or drunk
// in four stages over the care's phrase, then gone -- app/screens/daemon/Provision.tsx's frames to the pixel and its
// timing (a stage a third of the phrase, empty a moment, then faded). Change the frames in both together. A widget is
// drawn from timeline entries, so each stage is an entry (DaemonWidget.swift wander); between them SwiftUI animates.
import SwiftUI

struct Provision {
  let id: String
  let frames: [[String]]          // full, two thirds, a third, empty -- rows of pixels, "." clear
  let ink: [Character: Color]
}

enum Provisions {
  // A red fruit, bitten from the right, then down to the core, then only crumbs (DRAFT; the user kept this look, 2026-11-05)
  static let FRUIT = [
    "......s.....", "......sll...", "...rrrsrr...", "..rrrrrrrr..", ".rhhrrrrrrr.", ".rhrrrrrrrr.",
    ".rrrrrrrrrr.", ".rrrrrrrrrr.", ".rrrrrrrrrd.", "..rrrrrrdd..", "...rrrrdd...", "....rr.rr...",
  ]
  static let TWO_BITES = [
    "......s.....", "......sll...", "...rrrsrr...", "..rrrrrrrf..", ".rhhrrrrf...", ".rhrrrrf....",
    ".rrrrrrf....", ".rrrrrrrf...", ".rrrrrrrrf..", "..rrrrrrdf..", "...rrrrdd...", "....rr.rr...",
  ]
  static let CORE = [
    "......s.....", "......sll...", "....rrsr....", "....frrf....", ".....frf....", ".....frf....",
    ".....frf....", ".....frf....", "....frrrf...", "...frrrrdf..", "...rrrrdd...", "....rr.rr...",
  ]
  static let CRUMBS = Array(repeating: "............", count: 11) + ["..f....f..f."]

  // A small glass of water, the water going down a third at a time (DRAFT)
  static func glass(_ level: Int) -> [String] {
    (0..<12).map { y in
      if y == 11 { return ".gggggggg." }
      if y == 0 { return "g........g" }
      let wet = y >= 11 - level
      return "g" + (wet ? (y == 11 - level ? "hwwwwwwh" : "wwwwwwww") : "........") + "g"
    }
  }

  static func hex(_ h: String) -> Color { Color(hex: h) }
  static let fruit = Provision(id: "fruit", frames: [FRUIT, TWO_BITES, CORE, CRUMBS],
                               ink: ["r": hex("#d8443c"), "h": hex("#f39486"), "d": hex("#a8302b"), "s": hex("#6b4a2b"),
                                     "l": hex("#5cae4a"), "f": hex("#f4e3b0")])
  static let water = Provision(id: "water", frames: [glass(9), glass(6), glass(3), glass(0)],
                               ink: ["g": Color(red: 225 / 255, green: 240 / 255, blue: 250 / 255).opacity(0.85),
                                     "w": hex("#4fa3e0"), "h": hex("#bfe3fa")])

  // what each care gives until the player can choose (C-302: a remembered id will stand here)
  static func given(_ did: String?) -> Provision? { did == "feed" ? fruit : did == "water" ? water : nil }

  // a stage's length: a third of the care's phrase (Care.swift CareSound.tunes, as phraseMs in the app), never under
  // 0.4 s -- the app's floor is 0.3, a widget's entries are kept a little further apart so none is skipped
  static func step(_ did: String?) -> Double {
    let kind: CareKind = did == "feed" ? .feed : .water
    let ms = (CareSound.tunes[kind] ?? []).reduce(0) { $0 + $1.1 }
    return max(0.4, Double(ms > 0 ? ms : 1100) / 3000)
  }
}

// One frame of it, in its own pixels (never mirrored: a fruit bitten from the right stays so)
struct ProvisionView: View {
  let provision: Provision
  let stage: Int
  var body: some View {
    let rows = provision.frames[min(3, max(0, stage))]
    Canvas { c, size in
      let u = size.width / CGFloat(rows.first?.count ?? 12)
      for (y, row) in rows.enumerated() {
        for (x, ch) in row.enumerated() where ch != "." {
          guard let ink = provision.ink[ch] else { continue }
          c.fill(Path(CGRect(x: CGFloat(x) * u, y: CGFloat(y) * u, width: u + 0.3, height: u + 0.3)), with: .color(ink))
        }
      }
    }
    .aspectRatio(CGFloat(rows.first?.count ?? 12) / CGFloat(rows.count), contentMode: .fit)
    .accessibilityLabel(provision.id == "fruit" ? "a fruit" : "a glass of water")
  }
}
