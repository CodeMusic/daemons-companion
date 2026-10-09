// C-100: the daemon on the home screen -- a widget that is a device of its own (Shared.swift says how it reaches the
// companion, Care.swift what its three buttons do). Its App Group is the app's, which hands it the companion's address,
// key and the way from away (app/widget.ts).
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "widget",
  name: "DaemonWidget",
  displayName: "DAEMONS",
  icon: "../../assets/icon.png",
  deploymentTarget: "17.0",              // a button that works without opening the app (an App Intent) is iOS 17
  colors: { $accent: "#142640", $widgetBackground: "#142640" },
  entitlements: {
    "com.apple.security.application-groups": config.ios.entitlements["com.apple.security.application-groups"],
  },
});
