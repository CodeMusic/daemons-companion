// C-113: the den the daemon is drawn in -- its type's place (server/src/dens.ts says which colours and which motif).
// Drawn here, never sent as a picture: the wall over its deep, the floor it stands on, the motif faint across it, and a
// light behind wherever the daemon is. No words.
import SwiftUI

struct Den: Codable, Equatable {
  var type: String = "CONTENT"
  var motif: String = "nest"
  var wall: String = "#67625a"
  var deep: String = "#3b3832"
  var floor: String = "#2b2924"
  var glow: String = "#e4ded3"
}

extension Color {
  init(hex: String) {
    let v = UInt32(hex.dropFirst(), radix: 16) ?? 0x142640
    self.init(red: Double(v >> 16 & 0xff) / 255, green: Double(v >> 8 & 0xff) / 255, blue: Double(v & 0xff) / 255)
  }
}

// The same scatter every time for a motif, so a den does not shuffle itself between refreshes.
struct Scatter {
  var s: UInt64
  init(_ seed: String) { s = seed.utf8.reduce(1469598103934665603) { ($0 ^ UInt64($1)) &* 1099511628211 } }
  mutating func next() -> Double { s = s &* 6364136223846793005 &+ 1442695040888963407; return Double(s >> 33) / Double(1 << 31) }
}

let FLOOR_AT = 0.80   // where the floor begins, as a share of the den's height

struct DenView: View {
  let den: Den
  var light: CGPoint? = nil   // where the daemon is, as shares of the den: the light falls there

  var body: some View {
    Canvas { ctx, size in
      let w = size.width, h = size.height, fy = h * FLOOR_AT
      let glow = Color(hex: den.glow)
      ctx.fill(Path(CGRect(origin: .zero, size: size)),
               with: .linearGradient(Gradient(colors: [Color(hex: den.wall), Color(hex: den.deep)]),
                                     startPoint: .zero, endPoint: CGPoint(x: 0, y: fy)))
      if let p = light {
        let c = CGPoint(x: p.x * w, y: p.y * h), r = min(w, h) * 0.55
        ctx.fill(Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r)),
                 with: .radialGradient(Gradient(colors: [glow.opacity(0.28), glow.opacity(0)]), center: c, startRadius: 0, endRadius: r))
      }
      var m = ctx; m.opacity = 0.22
      motif(&m, w, h, fy, glow)
      ctx.fill(Path(CGRect(x: 0, y: fy, width: w, height: h - fy)), with: .color(Color(hex: den.floor)))
      ctx.fill(Path(CGRect(x: 0, y: fy, width: w, height: 1.5)), with: .color(glow.opacity(0.25)))
    }
  }

  func motif(_ c: inout GraphicsContext, _ w: Double, _ h: Double, _ fy: Double, _ ink: Color) {
    var r = Scatter(den.motif)
    let u = min(w, h) / 40   // one unit: the motif keeps its grain at every size
    func dot(_ x: Double, _ y: Double, _ d: Double) { c.fill(Path(ellipseIn: CGRect(x: x - d / 2, y: y - d / 2, width: d, height: d)), with: .color(ink)) }
    func line(_ pts: [CGPoint], _ lw: Double) { var p = Path(); p.addLines(pts); c.stroke(p, with: .color(ink), lineWidth: lw) }
    switch den.motif {
    case "waves":     // FLOW: moving water, the lower the stronger
      for row in 0..<4 {
        let y = fy - Double(row) * 6 * u - 3 * u
        line(stride(from: 0.0, through: w, by: 2).map { CGPoint(x: $0, y: y + sin($0 / (5 * u) + Double(row)) * 1.6 * u) }, max(1, u * (1.2 - Double(row) * 0.2)))
      }
    case "grass":     // GROWTH: blades along the floor
      for _ in 0..<Int(w / (2.2 * u)) {
        let x = r.next() * w, t = (3 + r.next() * 6) * u, lean = (r.next() - 0.5) * 3 * u
        line([CGPoint(x: x, y: fy), CGPoint(x: x + lean, y: fy - t)], max(1, u * 0.7))
      }
    case "strata":    // STRATUM: the ground in layers, rising up the wall
      for i in 0..<5 {
        let y = fy - Double(i) * 4.5 * u
        line(stride(from: 0.0, through: w, by: 6).map { CGPoint(x: $0, y: y - sin($0 / (13 * u) + Double(i) * 1.7) * u) }, u * (1.6 - Double(i) * 0.25))
      }
    case "cairn":     // LEGACY: a cairn to one side, stone on stone
      var y = fy, sw = 9 * u
      let x = w * 0.84
      for _ in 0..<5 { let sh = sw * 0.45; c.fill(Path(ellipseIn: CGRect(x: x - sw / 2, y: y - sh, width: sw, height: sh)), with: .color(ink)); y -= sh * 0.9; sw *= 0.78 }
    case "specks":    // SWARM: many small things, all about
      for _ in 0..<70 { dot(r.next() * w, r.next() * fy, (0.5 + r.next()) * u) }
    case "rings":     // CONTEXT: rings around the middle, each one wider
      for i in 1...6 { let rr = Double(i) * 5 * u; c.stroke(Path(ellipseIn: CGRect(x: w / 2 - rr, y: fy * 0.55 - rr, width: 2 * rr, height: 2 * rr)), with: .color(ink), lineWidth: u * 0.6) }
    case "embers":    // ENTROPY: rising from the floor, fewer the higher
      for _ in 0..<40 { let y = fy * (1 - pow(r.next(), 0.6)); dot(r.next() * w, y, (0.4 + 1.2 * y / fy) * u) }
    case "drips":     // CORRUPT: running down from the top
      for _ in 0..<Int(w / (4 * u)) {
        let x = r.next() * w, l = (3 + r.next() * 12) * u
        line([CGPoint(x: x, y: 0), CGPoint(x: x, y: l)], u * 0.9); dot(x, l, 2 * u)
      }
    case "carrier":   // SIGNAL: one long carrier wave, and its echo
      for (k, a) in [(1.0, 4.0), (0.5, 2.0)] {
        line(stride(from: 0.0, through: w, by: 2).map { CGPoint(x: $0, y: fy * 0.45 + sin($0 / (4 * u) * k) * a * u) }, u * 0.8 * k + 0.5)
      }
    case "grid":      // LOGIC: squared off
      for x in stride(from: 0.0, through: w, by: 6 * u) { line([CGPoint(x: x, y: 0), CGPoint(x: x, y: fy)], 0.6) }
      for y in stride(from: 0.0, through: fy, by: 6 * u) { line([CGPoint(x: 0, y: y), CGPoint(x: w, y: y)], 0.6) }
    case "plates":    // HARDENED: tempered panels, riveted
      for x in stride(from: 0.0, through: w, by: 12 * u) {
        line([CGPoint(x: x, y: 0), CGPoint(x: x, y: fy)], u * 0.8)
        for y in stride(from: 3 * u, to: fy, by: 9 * u) { dot(x + 2.2 * u, y, 1.4 * u); dot(x + 9.8 * u, y, 1.4 * u) }
      }
    case "flecks":    // FROZEN: still flakes, hanging
      for _ in 0..<26 {
        let x = r.next() * w, y = r.next() * fy, a = (0.8 + r.next()) * u
        for k in 0..<3 { let t = Double(k) * .pi / 3; line([CGPoint(x: x - cos(t) * a, y: y - sin(t) * a), CGPoint(x: x + cos(t) * a, y: y + sin(t) * a)], 0.7) }
      }
    case "facets":    // EMERGENT: small cut faces catching light
      for _ in 0..<18 {
        let x = r.next() * w, y = r.next() * fy, a = (1 + r.next() * 1.6) * u
        var p = Path(); p.addLines([CGPoint(x: x, y: y - a), CGPoint(x: x + a * 0.6, y: y), CGPoint(x: x, y: y + a), CGPoint(x: x - a * 0.6, y: y)]); p.closeSubpath()
        c.fill(p, with: .color(ink))
      }
    case "box":       // OPAQUE: a box inside the box, and nothing to see in it
      for i in 1...3 { let k = Double(i) * 3.5 * u; c.stroke(Path(CGRect(x: k, y: k, width: w - 2 * k, height: fy - k)), with: .color(ink), lineWidth: u * 0.5) }
    case "fog":       // LATENT: something there and not quite
      for _ in 0..<8 { let x = r.next() * w, y = r.next() * fy, a = (6 + r.next() * 10) * u; c.fill(Path(ellipseIn: CGRect(x: x - a, y: y - a / 2, width: 2 * a, height: a)), with: .color(ink.opacity(0.45))) }
    case "streaks":   // VECTOR: the air going past
      for _ in 0..<14 { let x = r.next() * w, y = r.next() * fy, l = (6 + r.next() * 14) * u; line([CGPoint(x: x, y: y), CGPoint(x: x + l, y: y - l * 0.35)], u * 0.6) }
    default:          // CONTENT, the nest: somewhere soft on the floor, and nothing else asked of it
      for i in 0..<3 { let a = (14 - Double(i) * 3) * u; c.stroke(Path(ellipseIn: CGRect(x: w / 2 - a, y: fy - a * 0.22, width: 2 * a, height: a * 0.44)), with: .color(ink), lineWidth: u * 0.8) }
    }
  }
}
