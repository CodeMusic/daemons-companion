Pod::Spec.new do |s|
  s.name           = 'DaemonsAgeRange'
  s.version        = '1.0.0'
  s.summary        = 'C-345: the device age signal at guardian sign-in (iOS 26 Declared Age Range, an 18 gate)'
  s.author         = 'CodeMusic'
  s.homepage       = 'https://github.com/CodeMusic/daemons-companion'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => 'https://github.com/CodeMusic/daemons-companion.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files   = '**/*.swift'
  s.weak_frameworks = 'DeclaredAgeRange'
end
