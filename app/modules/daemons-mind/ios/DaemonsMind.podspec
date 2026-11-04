Pod::Spec.new do |s|
  s.name           = 'DaemonsMind'
  s.version        = '1.0.0'
  s.summary        = "C-280: this phone's own mind -- Apple's on-device model to think, its speech recognition to hear, its voice to speak"
  s.author         = 'CodeMusic'
  s.homepage       = 'https://github.com/CodeMusic/daemons-companion'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => 'https://github.com/CodeMusic/daemons-companion.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'Speech', 'AVFoundation'
  s.weak_frameworks = 'FoundationModels'
  s.source_files   = '**/*.swift'
end
