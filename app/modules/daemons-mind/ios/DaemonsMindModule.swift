// C-280 (the user, 2026-11-03: "even an option to use your iphone ... the local onboard ai"): the phone thinks, hears
// and speaks for its daemon by itself. Thinking is Apple's on-device model (FoundationModels: iOS 26 and an Apple
// Intelligence iPhone -- on anything else `available` says why and the hub answers as before); hearing is the phone's
// own speech recognition, on the device where it can be; speaking is its system voice, for when the hub's cannot be
// reached. What is said is respelled before it reaches here (sayable, app/platform/mind.ts), as every speech path is.
import ExpoModulesCore
import Speech
import AVFoundation
#if canImport(FoundationModels)
import FoundationModels
#endif

final class MindException: GenericException<String> {
  override var reason: String { param }
}

public class DaemonsMindModule: Module {
  private let voice = AVSpeechSynthesizer()

  public func definition() -> ModuleDefinition {
    Name("DaemonsMind")

    // Whether this phone can think for itself, and if not, why (in Apple's words)
    AsyncFunction("available") { () -> [String: Any] in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        switch SystemLanguageModel.default.availability {
        case .available: return ["mind": true]
        case .unavailable(let why): return ["mind": false, "why": "\(why)"]
        }
      }
      #endif
      return ["mind": false, "why": "needs iOS 26 and Apple Intelligence"]
    }

    // One answer: who it is (the system message), the talk so far, and what was just said
    AsyncFunction("think") { (system: String, history: [[String: String]], said: String) async throws -> String in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        let before = history.compactMap { t -> String? in
          guard let s = t["said"], let a = t["answer"] else { return nil }
          return "They said: \(s)\nYou answered: \(a)"
        }.joined(separator: "\n")
        let session = LanguageModelSession(instructions: before.isEmpty ? system : "\(system)\n\nEarlier today:\n\(before)")
        return try await session.respond(to: said).content
      }
      #endif
      throw MindException("this phone cannot think for itself (it needs iOS 26 and Apple Intelligence)")
    }

    // What a recording says, heard on the phone (on the device itself where it can be)
    AsyncFunction("hear") { (uri: String) async throws -> String in
      let status = await withCheckedContinuation { (c: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
        SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0) }
      }
      guard status == .authorized else { throw MindException("speech recognition is off for this app (Settings, then DAEMONS)") }
      guard let url = URL(string: uri), let ear = SFSpeechRecognizer(), ear.isAvailable else {
        throw MindException("this phone cannot hear just now")
      }
      let ask = SFSpeechURLRecognitionRequest(url: url)
      ask.shouldReportPartialResults = false
      if ear.supportsOnDeviceRecognition { ask.requiresOnDeviceRecognition = true }
      return try await withCheckedThrowingContinuation { (c: CheckedContinuation<String, Error>) in
        var done = false
        ear.recognitionTask(with: ask) { result, error in
          if done { return }
          if let error = error { done = true; c.resume(throwing: MindException(error.localizedDescription)); return }
          if let result = result, result.isFinal { done = true; c.resume(returning: result.bestTranscription.formattedString) }
        }
      }
    }

    // The phone's own voice, when the hub's is out of reach
    Function("say") { (text: String) in
      try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
      try? AVAudioSession.sharedInstance().setActive(true)
      self.voice.stopSpeaking(at: .immediate)
      self.voice.speak(AVSpeechUtterance(string: text))
    }
  }
}
