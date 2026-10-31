Pod::Spec.new do |s|
  s.name           = 'DaemonsPad'
  s.version        = '1.0.0'
  s.summary        = 'C-263: a game controller held on the device (the GameSir Pocket Taco, any iOS controller), read with GameController for the game'
  s.author         = 'CodeMusic'
  s.homepage       = 'https://github.com/CodeMusic/daemons-companion'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => 'https://github.com/CodeMusic/daemons-companion.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'GameController'
  s.source_files   = '**/*.swift'
end
