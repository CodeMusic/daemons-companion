// C-345 (C-226 piece 5; the user, 2026-11-11, by multiple choice): the device's own age signal at guardian sign-in.
// iOS 26's Declared Age Range, asked with one gate at 18: false when the person's range is under 18, true at 18 and
// over, null when they decline, the range is unknown, or this iOS (or the Mac before macOS 26) has no such service.
// app/platform/accounts.ts grownUpHere() reads it; nothing here is kept or sent anywhere.
import ExpoModulesCore
#if canImport(DeclaredAgeRange)
import DeclaredAgeRange
#endif

public class DaemonsAgeRangeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DaemonsAgeRange")
    AsyncFunction("grownUp") { (promise: Promise) in
      #if canImport(DeclaredAgeRange)
      if #available(iOS 26.0, macCatalyst 26.0, *) {
        Task { @MainActor in
          guard let vc = self.appContext?.utilities?.currentViewController() else { promise.resolve(nil); return }
          do {
            switch try await AgeRangeService.shared.requestAgeRange(ageGates: 18, in: vc) {
            case .sharing(let range):
              if let low = range.lowerBound, low >= 18 { promise.resolve(true) }
              else if let high = range.upperBound, high < 18 { promise.resolve(false) }
              else { promise.resolve(nil) }
            case .declinedSharing:
              promise.resolve(nil)
            @unknown default:
              promise.resolve(nil)
            }
          } catch {
            promise.resolve(nil)
          }
        }
        return
      }
      #endif
      promise.resolve(nil)
    }
  }
}
