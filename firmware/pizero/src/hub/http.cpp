// C-378: one libcurl call per request; redirects followed (a GitHub release's file is served from elsewhere).
#include "hub/http.h"

#include <curl/curl.h>
#include <mutex>
#include <strings.h>

static size_t take(char *p, size_t size, size_t n, void *to) {
  ((Bytes *)to)->insert(((Bytes *)to)->end(), (uint8_t *)p, (uint8_t *)p + size * n);
  return size * n;
}

// C-511: a Set-Cookie's "name=value" kept (a site's sign-in answers with its session that way)
static size_t headerLine(char *p, size_t size, size_t n, void *to) {
  std::string line(p, size * n);
  if (line.size() > 11 && strncasecmp(line.c_str(), "set-cookie:", 11) == 0) {
    size_t a = line.find_first_not_of(' ', 11), b = line.find_first_of(";\r\n", a);
    if (a != std::string::npos) *(std::string *)to = line.substr(a, b == std::string::npos ? std::string::npos : b - a);
  }
  return size * n;
}

static Reply call(const std::string &url, const std::string *post, const std::vector<std::string> &headers, long timeoutMs, long connectMs) {
  static std::once_flag once;
  std::call_once(once, [] { curl_global_init(CURL_GLOBAL_DEFAULT); });
  Reply r;
  CURL *c = curl_easy_init();
  if (!c) { r.error = "no curl"; return r; }
  curl_slist *h = nullptr;
  for (auto &x : headers) h = curl_slist_append(h, x.c_str());
  if (post) h = curl_slist_append(h, "content-type: application/json");
  curl_easy_setopt(c, CURLOPT_URL, url.c_str());
  curl_easy_setopt(c, CURLOPT_HTTPHEADER, h);
  curl_easy_setopt(c, CURLOPT_FOLLOWLOCATION, 1L);
  curl_easy_setopt(c, CURLOPT_TIMEOUT_MS, timeoutMs);
  curl_easy_setopt(c, CURLOPT_CONNECTTIMEOUT_MS, connectMs > 0 ? connectMs : timeoutMs < 5000 ? timeoutMs : 5000L);
  curl_easy_setopt(c, CURLOPT_NOSIGNAL, 1L);
  curl_easy_setopt(c, CURLOPT_USERAGENT, "daemons-zero");
  curl_easy_setopt(c, CURLOPT_WRITEFUNCTION, take);
  curl_easy_setopt(c, CURLOPT_WRITEDATA, &r.body);
  curl_easy_setopt(c, CURLOPT_HEADERFUNCTION, headerLine);
  curl_easy_setopt(c, CURLOPT_HEADERDATA, &r.cookie);
  if (post) {
    curl_easy_setopt(c, CURLOPT_POSTFIELDS, post->data());
    curl_easy_setopt(c, CURLOPT_POSTFIELDSIZE, (long)post->size());
  }
  CURLcode e = curl_easy_perform(c);
  if (e != CURLE_OK) r.error = curl_easy_strerror(e);
  else curl_easy_getinfo(c, CURLINFO_RESPONSE_CODE, &r.status);
  curl_slist_free_all(h);
  curl_easy_cleanup(c);
  return r;
}

Reply httpGet(const std::string &url, const std::vector<std::string> &headers, long timeoutMs, long connectMs) {
  return call(url, nullptr, headers, timeoutMs, connectMs);
}
Reply httpPost(const std::string &url, const std::string &json, const std::vector<std::string> &headers, long timeoutMs, long connectMs) {
  return call(url, &json, headers, timeoutMs, connectMs);
}
