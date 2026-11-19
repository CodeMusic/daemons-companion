// C-418 in the widget (DAEMONS T-594; the user, 2026-11-18: "Train should also (for both in app and on the widget) have an
// animation"): TRAIN SINGS, as app/screens/daemon/OwnSong.tsx draws it -- the part it is learning leaving its mouth note by
// note, each rising in its pitch's colour (a note not yet learned a faint cloud of its candidates), then a group of green
// binary for each note the TRAIN moved flying back into it. A widget is drawn from timeline entries (DaemonWidget.swift
// wander): each entry says how far into the part it is (`sung`, seconds) or how far back the error has come (`back`,
// 0..1), and SwiftUI moves every note between one entry and the next. Every word DRAFT.
import SwiftUI

let RISE_SECONDS = 1.7

// A note head in its colours: a black key's split between the two either side; `faint` for static's candidates
struct NoteGlyph: View {
  let midi: Int
  let head: CGFloat
  var faint: Double = 1
  var body: some View {
    let c = SongMath.colours(midi)
    Canvas { ctx, size in
      let w = head * 1.15, h = head * 0.9, y = size.height - h
      ctx.fill(Path(CGRect(x: w - max(1.2, head * 0.14), y: 0, width: max(1.2, head * 0.14), height: y + h * 0.5)),
               with: .color(Color(hex: c[0])))
      let oval = Path(ellipseIn: CGRect(x: 0, y: y, width: w, height: h))
      ctx.fill(oval, with: .color(Color(hex: c[0])))
      if c.count > 1 {                                       // a black key: the right half the upper neighbour's colour
        ctx.clip(to: Path(CGRect(x: w / 2, y: y, width: w / 2, height: h)))
        ctx.fill(oval, with: .color(Color(hex: c[1])))
      }
    }
    .frame(width: head * 1.3, height: head * 2.2)
    .opacity(faint)
  }
}

struct SongFlight: View {
  let song: SongSnap
  let sung: Double?
  let back: Double?
  let side: CGFloat
  let mouth: CGPoint
  let ahead: CGFloat                                         // -1: it faces left (the game's front sprites), 1: right

  var body: some View {
    let heard = SongMath.heard(song, share: song.share)
    let after = SongMath.heard(song, share: SongMath.taught(song))
    let beat = 60 / (song.part?.bpm ?? 100)
    let lo = heard.map(\.midi).min() ?? 60, hi = heard.map(\.midi).max() ?? 72
    let starts = heard.indices.map { i in heard[..<i].reduce(0.0) { $0 + $1.beats * beat } }
    let head = max(4, side / 20)
    let rise = { (n: HeardNote) in side * (0.3 + 0.5 * CGFloat(n.midi - lo) / CGFloat(max(1, hi - lo))) }
    let drift = { (i: Int) in ahead * side * (0.18 + 0.09 * CGFloat(i % 4)) }
    let moved = heard.indices.filter { after[$0].sure > heard[$0].sure }
    ZStack(alignment: .topLeading) {
      ForEach(Array(heard.enumerated()), id: \.offset) { i, n in
        let age = sung.map { max(0, min(1, ($0 - starts[i]) / RISE_SECONDS)) } ?? 1
        let shown = sung.map { $0 >= starts[i] && $0 <= starts[i] + RISE_SECONDS } ?? false
        Group {
          if n.sure >= 1 { NoteGlyph(midi: n.midi, head: head) }
          else {                                             // STATIC: its candidates, each at its own height
            ZStack {
              ForEach(Array(n.candidates.enumerated()), id: \.offset) { k, c in
                NoteGlyph(midi: c, head: head * 0.75, faint: k == 0 ? 0.25 + 0.6 * n.sure : 0.32 * (1 - n.sure) + 0.08)
                  .offset(x: CGFloat((k * 5) % 7) * head * 0.35 - head, y: -CGFloat(c - n.midi) * head * 0.45)
              }
            }
          }
        }
        .position(x: mouth.x + drift(i) * age, y: mouth.y - rise(n) * age)
        .opacity(shown ? 1 - age * age * 0.6 : 0)
      }
      if let b = back {                                      // the error carried back: one green group a note moved
        ForEach(Array(moved.prefix(8).enumerated()), id: \.offset) { j, i in
          let bits = String(i & 15, radix: 2).leftPad(4) + " " + String(max(1, min(15, Int(((after[i].sure - heard[i].sure) * 15).rounded()))), radix: 2).leftPad(4)
          Text(bits).font(.system(size: max(7, head * 1.1), weight: .bold, design: .monospaced))
            .foregroundStyle(Color(hex: SongMath.binary))
            .position(x: mouth.x + drift(i) * (1 - b), y: mouth.y - rise(heard[i]) * (1 - b) + CGFloat(j % 3) * head * 0.4 * (1 - b))
            .opacity(b >= 1 ? 0 : 1)
        }
      }
    }
  }
}

extension String {
  func leftPad(_ n: Int) -> String { String(repeating: "0", count: max(0, n - count)) + self }
}
