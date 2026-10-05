Pod::Spec.new do |s|
  s.name           = 'DaemonsBeacon'
  s.version        = '1.0.0'
  s.summary        = 'C-15: the DAEMONS companion meeting beacon (a CoreBluetooth advertisement of one service UUID)'
  s.author         = 'CodeMusic'
  s.homepage       = 'https://github.com/CodeMusic/daemons-companion'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => 'https://github.com/CodeMusic/daemons-companion.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files   = '**/*.swift'
end
