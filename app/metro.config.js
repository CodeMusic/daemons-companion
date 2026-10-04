// The app reads what DAEMONS exports into server/data/ (the week, for its themes), so Metro watches that folder too.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, "../server/data")];
module.exports = config;
