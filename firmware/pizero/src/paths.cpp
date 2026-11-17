// C-378: the program's folders, and files written whole or not at all.
#include "paths.h"

#include <cstdio>
#include <cstdlib>
#include <sys/stat.h>
#include <unistd.h>

static std::string home() {
  const char *h = getenv("HOME");
  return h && *h ? h : "/tmp";
}
static void makeDirs(const std::string &path) {
  for (size_t i = 1; i <= path.size(); i++)
    if (i == path.size() || path[i] == '/') mkdir(path.substr(0, i).c_str(), 0755);
}
static std::string ensured(const std::string &dir) { makeDirs(dir); return dir; }

std::string dataDir() {
  if (const char *d = getenv("DAEMONS_HOME")) return ensured(std::string(d) + "/data");
  return ensured(home() + "/.local/share/daemons");
}
std::string configDir() {
  if (const char *d = getenv("DAEMONS_HOME")) return ensured(std::string(d) + "/config");
  return ensured(home() + "/.config/daemons");
}
std::string inData(const std::string &name) { return dataDir() + "/" + name; }
std::string dataSub(const std::string &dir) { return ensured(dataDir() + "/" + dir); }
std::string inConfig(const std::string &name) { return configDir() + "/" + name; }

bool readFile(const std::string &path, Bytes &out) {
  FILE *f = fopen(path.c_str(), "rb");
  if (!f) return false;
  out.clear();
  uint8_t buf[1 << 16];
  size_t n;
  while ((n = fread(buf, 1, sizeof buf, f)) > 0) out.insert(out.end(), buf, buf + n);
  bool ok = !ferror(f);
  fclose(f);
  return ok;
}
bool readText(const std::string &path, std::string &out) {
  Bytes b;
  if (!readFile(path, b)) return false;
  out.assign(b.begin(), b.end());
  return true;
}
bool writeFileAtomic(const std::string &path, const Bytes &bytes) {
  std::string tmp = path + ".new";
  FILE *f = fopen(tmp.c_str(), "wb");
  if (!f) return false;
  bool ok = fwrite(bytes.data(), 1, bytes.size(), f) == bytes.size();
  ok = fflush(f) == 0 && ok;
  ok = fsync(fileno(f)) == 0 && ok;
  fclose(f);
  if (!ok || rename(tmp.c_str(), path.c_str()) != 0) { remove(tmp.c_str()); return false; }
  return true;
}
bool writeTextAtomic(const std::string &path, const std::string &text) {
  return writeFileAtomic(path, Bytes(text.begin(), text.end()));
}
bool exists(const std::string &path) {
  struct stat st;
  return stat(path.c_str(), &st) == 0;
}
