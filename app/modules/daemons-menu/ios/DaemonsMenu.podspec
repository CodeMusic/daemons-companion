Pod::Spec.new do |s|
  s.name           = 'DaemonsMenu'
  s.version        = '1.0.0'
  s.summary        = 'C-264: HOW TO PLAY in the menu bar Help menu (the Mac, the iPad), added to the app delegate at run time'
  s.author         = 'CodeMusic'
  s.homepage       = 'https://github.com/CodeMusic/daemons-companion'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => 'https://github.com/CodeMusic/daemons-companion.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files   = '**/*.swift'
end
