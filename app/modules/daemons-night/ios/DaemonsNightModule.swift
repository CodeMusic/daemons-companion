// C-284 (the user, 2026-11-03: "we could capture the phone movements itself at night... so like if u pick up your phone
// while your daemon is sleeping, it affects his sleep"; by multiple choice, iOS's motion record): the phone keeps a week
// of what it was doing -- still, walking, in a car -- whether or not any app runs, and an app with the Motion permission
// may ask it afterwards. At WAKE the app asks for the night: every time the record goes from still to anything else, the
// phone was picked up or carried, and that is a stir. Nothing runs while the phone sleeps, so it costs no battery.
import AVFoundation
import CoreMotion
import ExpoModulesCore

public class DaemonsNightModule: Module {
  private let activity = CMMotionActivityManager()

  public func definition() -> ModuleDefinition {
    Name("DaemonsNight")
    // C-334: DRIFT DOWN's binaural layer is only for ears that each hear their own side -- wired or Bluetooth headphones
    Function("headphones") { () -> Bool in
      let kinds: [AVAudioSession.Port] = [.headphones, .bluetoothA2DP, .bluetoothLE, .bluetoothHFP, .usbAudio]
      return AVAudioSession.sharedInstance().currentRoute.outputs.contains { kinds.contains($0.portType) }
    }
    AsyncFunction("stirs") { (from: Double, to: Double, promise: Promise) in
      guard CMMotionActivityManager.isActivityAvailable(),
            CMMotionActivityManager.authorizationStatus() != .denied, CMMotionActivityManager.authorizationStatus() != .restricted
      else { promise.resolve(nil); return }
      let start = Date(timeIntervalSince1970: from), end = Date(timeIntervalSince1970: to)
      self.activity.queryActivityStarting(from: start, to: end, to: OperationQueue.main) { list, error in
        guard error == nil, let list = list else { promise.resolve(nil); return }
        var still = true, stirs = 0
        for a in list where a.confidence != .low {
          let moving = !a.stationary                      // picked up, carried, walked: anything but lying still
          if moving && still { stirs += 1 }
          still = !moving
        }
        promise.resolve(stirs)
      }
    }
  }
}
