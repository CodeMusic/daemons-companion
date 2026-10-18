// Every picture in the companion is pixel art -- the daemons, the MARK badges, the player, the GUIDE's cover -- drawn small
// and shown large. iOS enlarges an image by smoothing it, which turned every one soft on the phone (seen on the user's
// iPhone, 2026-10-17; the site was already sharp, by CSS image-rendering: pixelated). React Native has no setting for it,
// so at launch every UIImageView is told to enlarge by repeating pixels: its layer's magnification filter, nearest.
// Shrinking is left as it was. setImage: is UIImageView's own method, so swapping it touches no other kind of view.
import ExpoModulesCore
import UIKit

public class DaemonsPixelsDelegate: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication,
                          didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    UIImageView.daemonsPixelsOnce()
    return true
  }
}

extension UIImageView {
  nonisolated(unsafe) private static var swapped = false
  static func daemonsPixelsOnce() {
    guard !swapped,
          let mine = class_getInstanceMethod(UIImageView.self, #selector(daemonsPixels_setImage(_:))),
          let theirs = class_getInstanceMethod(UIImageView.self, #selector(setter: UIImageView.image)) else { return }
    method_exchangeImplementations(theirs, mine)
    swapped = true
  }
  @objc func daemonsPixels_setImage(_ image: UIImage?) {
    daemonsPixels_setImage(image)              // the original, after the swap
    layer.magnificationFilter = .nearest
  }
}
