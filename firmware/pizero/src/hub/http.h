#pragma once
// C-378: HTTP through libcurl -- the hub, and GitHub for the patches.
#include <string>
#include <vector>
#include "game/hash.h"

struct Reply { long status = 0; Bytes body; std::string error; std::string cookie; bool ok() const { return status >= 200 && status < 300; } };   // cookie: the last Set-Cookie's name=value (C-511)

// connectMs: how long to wait for the other end to answer at all (0: the lesser of timeoutMs and five seconds)
Reply httpGet(const std::string &url, const std::vector<std::string> &headers = {}, long timeoutMs = 8000, long connectMs = 0);
Reply httpPost(const std::string &url, const std::string &json, const std::vector<std::string> &headers = {}, long timeoutMs = 8000,
               long connectMs = 0);
inline std::string text(const Reply &r) { return std::string(r.body.begin(), r.body.end()); }
