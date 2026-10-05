// C-15: the phone's meeting beacon. iOS lets an app advertise only its local name and service UUIDs -- no service
// data, no manufacturer data -- so the beacon is one 128-bit service UUID carrying a species and an hourly random tag
// (app/beacon.ts builds it). In the background iOS moves it to its "overflow area", which other iPhones still hear.
import CoreBluetooth
import ExpoModulesCore

public class DaemonsBeaconModule: Module {
  private var manager: CBPeripheralManager?
  private var watcher: StateWatcher?
  fileprivate var wanted: String?

  public func definition() -> ModuleDefinition {
    Name("DaemonsBeacon")
    Function("start") { (uuid: String) in
      self.wanted = uuid
      if self.manager == nil {
        self.watcher = StateWatcher(owner: self)
        self.manager = CBPeripheralManager(delegate: self.watcher, queue: nil)
      }
      self.advertise()
    }
    Function("stop") {
      self.wanted = nil
      self.manager?.stopAdvertising()
    }
  }

  fileprivate func advertise() {
    guard let m = manager, m.state == .poweredOn, let u = wanted else { return }
    m.stopAdvertising()
    m.startAdvertising([CBAdvertisementDataServiceUUIDsKey: [CBUUID(string: u)]])
  }
}

// Bluetooth comes up a moment after the manager is made: advertise once it is on.
class StateWatcher: NSObject, CBPeripheralManagerDelegate {
  weak var owner: DaemonsBeaconModule?
  init(owner: DaemonsBeaconModule) { self.owner = owner }
  func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) { owner?.advertise() }
}
