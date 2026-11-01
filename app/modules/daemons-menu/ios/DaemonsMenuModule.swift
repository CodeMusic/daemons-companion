// C-264 (the user, 2026-10-31: "it would be nice though if u were playing you could also trigger it either by a mac help
// menu on the top-bar"): HOW TO PLAY at the top of the menu bar's Help -- the Mac's (the iPad app on an Apple Silicon Mac)
// and the iPad's own. UIKit asks the app delegate for the menus (buildMenu(with:)), and Expo's app delegate is made at
// prebuild and kept out of this repository, so the method and the command's action are given to it here, at run time,
// and the menus built again.
import ExpoModulesCore
import ObjectiveC
import UIKit

private let asked = Notification.Name("DaemonsHowToPlay")

public class DaemonsMenuModule: Module {
  private var watching: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("DaemonsMenu")
    Events("onHowToPlay")
    OnCreate { DispatchQueue.main.async { DaemonsMenuModule.install() } }
    OnStartObserving {
      self.watching = NotificationCenter.default.addObserver(forName: asked, object: nil, queue: .main) { [weak self] _ in
        self?.sendEvent("onHowToPlay", [:])
      }
    }
    OnStopObserving {
      if let w = self.watching { NotificationCenter.default.removeObserver(w) }
      self.watching = nil
    }
    #if DEBUG
    // a debug build chooses the command as the menu bar does, down the responder chain (the Simulator's taps never reach
    // the menu bar's menus)
    Function("tryHowToPlay") {
      DispatchQueue.main.async {
        let sel = NSSelectorFromString("daemonsHowToPlay:")
        let window = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first
        let target = window?.target(forAction: sel, withSender: nil)
        NSLog("DaemonsMenu: HOW TO PLAY answered by %@", String(describing: target))
        UIApplication.shared.sendAction(sel, to: target, from: nil, for: nil)
      }
    }
    #endif
  }

  private static var installed = false
  static func install() {
    guard !installed, let delegate = UIApplication.shared.delegate else { return }
    installed = true
    let cls: AnyClass = type(of: delegate)
    // the command's action, answered by the app delegate at the end of the responder chain
    let act: @convention(block) (AnyObject, AnyObject?) -> Void = { _, _ in NotificationCenter.default.post(name: asked, object: nil) }
    class_addMethod(cls, NSSelectorFromString("daemonsHowToPlay:"), imp_implementationWithBlock(act), "v@:@")
    // the menus as the delegate (or UIResponder) built them, and HOW TO PLAY first in Help
    let sel = #selector(UIResponder.buildMenu(with:))
    let before = class_getInstanceMethod(cls, sel).map { method_getImplementation($0) }
    typealias Build = @convention(c) (AnyObject, Selector, UIMenuBuilder) -> Void
    let build: @convention(block) (AnyObject, UIMenuBuilder) -> Void = { me, builder in
      if let before = before { unsafeBitCast(before, to: Build.self)(me, sel, builder) }
      guard builder.system == .main else { return }
      let item = UICommand(title: "How to Play DAEMONS", action: NSSelectorFromString("daemonsHowToPlay:"))   // DRAFT
      builder.insertChild(UIMenu(title: "", options: .displayInline, children: [item]), atStartOfMenu: .help)
    }
    let imp = imp_implementationWithBlock(build)
    if !class_addMethod(cls, sel, imp, "v@:@"), let m = class_getInstanceMethod(cls, sel) { method_setImplementation(m, imp) }
    UIMenuSystem.main.setNeedsRebuild()
  }
}
