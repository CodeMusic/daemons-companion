// C-263 (the user, 2026-10-31: "previously we added that pockettaco but even when I connect it doesnt control the game"):
// a controller held on the device -- the GameSir Pocket Taco, or any game controller iOS knows -- read by the app itself
// with GameController and handed to the game as its buttons. The web view's own Gamepad API sees a controller only while
// it is the first responder, and only after a press (WebKit 269292), so the game never heard it.
import ExpoModulesCore
import GameController

public class DaemonsPadModule: Module {
  private var watching: [NSObjectProtocol] = []
  private var stick: Set<Int> = []           // the d-pad directions a left stick holds down

  public func definition() -> ModuleDefinition {
    Name("DaemonsPad")
    Events("onPad", "onButton")
    OnStartObserving {
      let nc = NotificationCenter.default
      self.watching.append(nc.addObserver(forName: .GCControllerDidConnect, object: nil, queue: .main) { [weak self] n in
        if let c = n.object as? GCController { self?.attach(c) }
        self?.tell()
      })
      self.watching.append(nc.addObserver(forName: .GCControllerDidDisconnect, object: nil, queue: .main) { [weak self] _ in self?.tell() })
      GCController.controllers().forEach { self.attach($0) }
      self.tell()
    }
    OnStopObserving {
      self.watching.forEach { NotificationCenter.default.removeObserver($0) }
      self.watching = []
    }
    Function("held") { () -> [String] in self.names() }
    #if DEBUG
    // A controller to try the path with where there is none (the Simulator): GameController's own on-screen pad, which
    // the app hears as it hears a real one (EXPO_PUBLIC_DAEMONS_TRY_PAD=1, a debug build only)
    Function("tryVirtual") { (on: Bool) in
      DispatchQueue.main.async {
        if on, self.virtual == nil {
          let c = GCVirtualController.Configuration()
          c.elements = [GCInputDirectionPad, GCInputButtonA, GCInputButtonB, GCInputButtonX, GCInputButtonY]
          self.virtual = GCVirtualController(configuration: c)
          self.virtual?.connect()
        } else if !on { self.virtual?.disconnect(); self.virtual = nil }
      }
    }
    #endif
  }
  #if DEBUG
  private var virtual: GCVirtualController?
  #endif

  private func names() -> [String] {
    GCController.controllers().filter { $0.extendedGamepad != nil }.map { $0.vendorName ?? "controller" }
  }
  private func tell() { sendEvent("onPad", ["held": names()]) }
  private func press(_ b: Int, _ on: Bool) { sendEvent("onButton", ["b": b, "v": on ? 1 : 0]) }

  // The GBA's buttons as EmulatorJS numbers them (its gba pad): B 0, SELECT 2, START 3, up 4, down 5, left 6, right 7,
  // A 8, L 10, R 11. A and B are the controller's A and B; L and R its shoulders and triggers -- the Pocket Taco's M
  // buttons -- and its X and Y, as the user asked (C-234: "L/R on the M buttons or the other face buttons").
  private func attach(_ c: GCController) {
    guard let g = c.extendedGamepad else { return }
    let map: [(GCControllerButtonInput?, Int)] = [
      (g.buttonA, 8), (g.buttonB, 0), (g.buttonX, 10), (g.buttonY, 11),
      (g.leftShoulder, 10), (g.rightShoulder, 11), (g.leftTrigger, 10), (g.rightTrigger, 11),
      (g.buttonMenu, 3), (g.buttonOptions, 2),
      (g.dpad.up, 4), (g.dpad.down, 5), (g.dpad.left, 6), (g.dpad.right, 7),
    ]
    for (button, b) in map { button?.pressedChangedHandler = { [weak self] _, _, on in self?.press(b, on) } }
    g.leftThumbstick.valueChangedHandler = { [weak self] _, x, y in      // a stick, where there is one, as the d-pad
      guard let self = self else { return }
      let now: Set<Int> = Set([y > 0.5 ? 4 : nil, y < -0.5 ? 5 : nil, x < -0.5 ? 6 : nil, x > 0.5 ? 7 : nil].compactMap { $0 })
      for b in now.subtracting(self.stick) { self.press(b, true) }
      for b in self.stick.subtracting(now) { self.press(b, false) }
      self.stick = now
    }
  }
}
