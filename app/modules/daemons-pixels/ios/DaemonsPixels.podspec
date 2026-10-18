Pod::Spec.new do |s|
  s.name           = 'DaemonsPixels'
  s.version        = '1.0.0'
  s.summary        = 'The companion is pixel art: every picture enlarged by repeating its pixels, never smoothed'
  s.author         = 'CodeMusic'
  s.homepage       = 'https://github.com/CodeMusic/daemons-companion'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => 'https://github.com/CodeMusic/daemons-companion.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files   = '**/*.swift'
end
