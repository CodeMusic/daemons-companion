Pod::Spec.new do |s|
  s.name           = 'DaemonsNight'
  s.version        = '1.0.0'
  s.summary        = "C-284: the phone's own night -- its stirs while the daemon slept, from iOS's motion record (CMMotionActivityManager)"
  s.author         = 'CodeMusic'
  s.homepage       = 'https://github.com/CodeMusic/daemons-companion'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => 'https://github.com/CodeMusic/daemons-companion.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'CoreMotion'
  s.source_files   = '**/*.swift'
end
