// C-378: one libcurl call per request; redirects followed (a GitHub release's file is served from elsewhere).
#include "hub/http.h"

#include <curl/curl.h>
#include <mutex>

static size_t take(char *p, size_t size, size_t n, void *to) {
  ((Bytes *)to)->insert(((Bytes *)to)->end(), (uint8_t *)p, (uint8_t *)p + size * n);
  return size * n;
}

static Reply call(const std::string &url, const std::string *post, const std::vector<std::string> &headers, long timeoutMs) {
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
  curl_easy_setopt(c, CURLOPT_CONNECTTIMEOUT_MS, timeoutMs < 5000 ? timeoutMs : 5000L);
  curl_easy_setopt(c, CURLOPT_NOSIGNAL, 1L);
  curl_easy_setopt(c, CURLOPT_USERAGENT, "daemons-zero");
  curl_easy_setopt(c, CURLOPT_WRITEFUNCTION, take);
  curl_easy_setopt(c, CURLOPT_WRITEDATA, &r.body);
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

Reply httpGet(const std::string &url, const std::vector<std::string> &headers, long timeoutMs) {
  return call(url, nullptr, headers, timeoutMs);
}
Reply httpPost(const std::string &url, const std::string &json, const std::vector<std::string> &headers, long timeoutMs) {
  return call(url, &json, headers, timeoutMs);
}
