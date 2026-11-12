// C-221 spike: two GBA games joined by mGBA's own lockstep link cable, headless, each player's screen and buttons
// over HTTP. The lockstep callbacks are mGBA's Qt MultiplayerController's (0.10.5), ported to C.
//   linkhost ROM0 SAV0 ROM1 SAV1 PORT PAGE.html [ADDRESS]
// It answers 127.0.0.1 unless given an address (the tailnet's, say): /p writes into a game's memory. DRAFT, a spike.
#include <mgba/core/core.h>
#include <mgba/core/thread.h>
#include <mgba/core/lockstep.h>
#include <mgba/core/log.h>
#include <stdarg.h>
#include <mgba/internal/gba/gba.h>
#include <mgba/internal/gba/sio/lockstep.h>
#include <mgba-util/vfs.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <pthread.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <time.h>
#include <unistd.h>
#include <fcntl.h>
#include <zlib.h>

#define W 240
#define H 160
#define N 2

struct Player {
	struct mCore* core;
	struct mCoreThread thread;
	struct GBASIOLockstepNode node;
	color_t* video;
	uint8_t frame[W * H * 4];
	unsigned long frames;
	pthread_mutex_t fl;
	int awake;
	int32_t cyclesPosted;
	unsigned waitMask;
	int id;
};

static struct Player P[N];
static struct GBASIOLockstep lock;
static pthread_mutex_t lockMutex = PTHREAD_MUTEX_INITIALIZER;
static const char* page;
static const char* bindAddr = "127.0.0.1";
static volatile int quit = 0;

static void lk(struct mLockstep* l) { (void) l; pthread_mutex_lock(&lockMutex); }
static void ulk(struct mLockstep* l) { (void) l; pthread_mutex_unlock(&lockMutex); }

static bool sig(struct mLockstep* l, unsigned mask) {
	(void) l;
	struct Player* p = &P[0];
	bool woke = false;
	p->waitMask &= ~mask;
	if (!p->waitMask && p->awake < 1) { mCoreThreadStopWaiting(&p->thread); p->awake = 1; woke = true; }
	return woke;
}
static bool wt(struct mLockstep* l, unsigned mask) {
	(void) l;
	struct Player* p = &P[0];
	bool slept = false;
	p->waitMask |= mask;
	if (p->awake > 0) { mCoreThreadWaitFromThread(&p->thread); p->awake = 0; slept = true; }
	return slept;
}
static void addC(struct mLockstep* l, int id, int32_t cycles) {
	(void) l;
	if (cycles < 0) abort();
	if (!id) {
		for (int i = 1; i < N; ++i) {
			struct Player* p = &P[i];
			if (p->node.d.p->mode > SIO_MULTI) continue;
			p->cyclesPosted += cycles;
			if (p->awake < 1) p->node.nextEvent += p->cyclesPosted;
			mCoreThreadStopWaiting(&p->thread);
			p->awake = 1;
		}
	} else {
		P[id].cyclesPosted += cycles;
	}
}
static int32_t useC(struct mLockstep* l, int id, int32_t cycles) {
	(void) l;
	struct Player* p = &P[id];
	p->cyclesPosted -= cycles;
	if (p->cyclesPosted <= 0) { mCoreThreadWaitFromThread(&p->thread); p->awake = 0; }
	return p->cyclesPosted;
}
static int32_t unusedC(struct mLockstep* l, int id) { (void) l; return P[id].cyclesPosted; }
static void unload(struct mLockstep* l, int id) {
	(void) l;
	if (id) {
		P[id].cyclesPosted = 0;
		struct Player* p = &P[0];
		p->waitMask &= ~(1 << id);
		if (!p->waitMask && p->awake < 1) { mCoreThreadStopWaiting(&p->thread); p->awake = 1; }
	} else {
		for (int i = 1; i < N; ++i) {
			struct Player* p = &P[i];
			p->cyclesPosted += lock.players[0]->eventDiff;
			if (p->awake < 1) {
				p->node.nextEvent += p->cyclesPosted;
				mCoreThreadStopWaiting(&p->thread);
				p->awake = 1;
			}
		}
	}
}

// mGBA's own logger prints every DMA and BIOS call -- megabytes a second; only what went wrong is kept
static struct mLogFilter quietFilter;
static void quietLog(struct mLogger* l, int category, enum mLogLevel level, const char* format, va_list args) {
	(void) l;
	if (!(level & (mLOG_FATAL | mLOG_ERROR))) return;
	fprintf(stderr, "%s: ", mLogCategoryName(category));
	vfprintf(stderr, format, args);
	fputc('\n', stderr);
}
static struct mLogger quiet = { .log = quietLog, .filter = &quietFilter };

static double now(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec + t.tv_nsec / 1e9; }

// every frame: the screen copied out for the server; player 1 (the lockstep's master) held to the GBA's 59.73 fps,
// the others paced by the cycles it posts them
static void onFrame(struct mCoreThread* t) {
	struct Player* p = t->userData;
	pthread_mutex_lock(&p->fl);
	memcpy(p->frame, p->video, sizeof(p->frame));
	p->frames++;
	pthread_mutex_unlock(&p->fl);
	if (p->id == 0) {
		static double next = 0;
		double n = now();
		if (next == 0 || n - next > 0.25) next = n;
		next += 1.0 / 59.7275;
		if (next > n) usleep((useconds_t) ((next - n) * 1e6));
	}
}

static bool startPlayer(int i, const char* rom, const char* sav) {
	struct Player* p = &P[i];
	memset(p, 0, sizeof(*p));
	p->id = i;
	p->awake = 1;
	pthread_mutex_init(&p->fl, NULL);
	p->core = mCoreFind(rom);
	if (!p->core || !p->core->init(p->core)) return false;
	mCoreInitConfig(p->core, NULL);
	p->video = calloc(W * H, sizeof(color_t));
	p->core->setVideoBuffer(p->core, p->video, W);
	p->core->setAudioBufferSize(p->core, 2048);
	if (!mCoreLoadFile(p->core, rom)) return false;
	struct VFile* vf = VFileOpen(sav, O_RDWR | O_CREAT);
	if (!vf || !p->core->loadSave(p->core, vf)) return false;
	p->thread.core = p->core;
	p->thread.userData = p;
	p->thread.frameCallback = onFrame;
	p->thread.logger.logger = &quiet;
	return true;
}

static void attach(int i) {
	struct Player* p = &P[i];
	struct GBA* gba = p->core->board;
	GBASIOLockstepNodeCreate(&p->node);
	GBASIOLockstepAttachNode(&lock, &p->node);
	GBASIOSetDriver(&gba->sio, &p->node.d, SIO_MULTI);
	GBASIOSetDriver(&gba->sio, &p->node.d, SIO_NORMAL_32);
}

static void sendAll(int fd, const void* b, size_t n) {
	const char* c = b;
	while (n) { ssize_t w = write(fd, c, n); if (w <= 0) return; c += w; n -= (size_t) w; }
}
static void replyAs(int fd, const char* type, const char* encoding, const void* body, size_t n) {
	char h[320];
	int l = snprintf(h, sizeof(h), "HTTP/1.1 200 OK\r\nContent-Type: %s\r\n%s%s%sContent-Length: %zu\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
	                 type, encoding ? "Content-Encoding: " : "", encoding ? encoding : "", encoding ? "\r\n" : "", n);
	sendAll(fd, h, (size_t) l);
	sendAll(fd, body, n);
}
static void reply(int fd, const char* type, const void* body, size_t n) { replyAs(fd, type, NULL, body, n); }

static void* serve(void* arg) {
	int port = *(int*) arg;
	int s = socket(AF_INET, SOCK_STREAM, 0), one = 1;
	setsockopt(s, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));
	struct sockaddr_in a = { .sin_family = AF_INET, .sin_port = htons((uint16_t) port), .sin_addr.s_addr = 0 };
	a.sin_addr.s_addr = inet_addr(bindAddr);
	if (bind(s, (struct sockaddr*) &a, sizeof(a)) || listen(s, 16)) { perror("listen"); exit(1); }
	fprintf(stderr, "linkhost: http://%s:%d/\n", bindAddr, port);
	static uint8_t buf[W * H * 4];
	while (!quit) {
		int c = accept(s, NULL, NULL);
		if (c < 0) continue;
		char req[1024] = { 0 };
		ssize_t r = read(c, req, sizeof(req) - 1);
		int who = 0;
		unsigned keys = 0, addr = 0, width = 0, val = 0;
		if (r <= 0) { close(c); continue; }
		if (sscanf(req, "GET /f/%d", &who) == 1 && who >= 0 && who < N) {
			pthread_mutex_lock(&P[who].fl);
			memcpy(buf, P[who].frame, sizeof(buf));
			pthread_mutex_unlock(&P[who].fl);
			// a screen deflates to a tenth or less: what makes it playable over the tailnet rather than the room
			static uint8_t z[W * H * 4 + 1024];
			uLongf zn = sizeof(z);
			if (strstr(req, "deflate") && compress2(z, &zn, buf, sizeof(buf), 1) == Z_OK)
				replyAs(c, "application/octet-stream", "deflate", z, zn);
			else
				reply(c, "application/octet-stream", buf, sizeof(buf));
		} else if (sscanf(req, "GET /k/%d/%u", &who, &keys) == 2 && who >= 0 && who < N) {
			P[who].core->setKeys(P[who].core, keys & 0x3FF);
			reply(c, "text/plain", "ok", 2);
		} else if (sscanf(req, "GET /p/%d/%x/%u/%u", &who, &addr, &width, &val) == 4 && who >= 0 && who < N) {
			// the DEBUG build's theatre warp and the like: a byte or a halfword into the game's memory
			if (width == 16) P[who].core->busWrite16(P[who].core, addr, (uint16_t) val);
			else P[who].core->busWrite8(P[who].core, addr, (uint8_t) val);
			reply(c, "text/plain", "ok", 2);
		} else if (!strncmp(req, "GET /state", 10)) {
			char j[160];
			int l = snprintf(j, sizeof(j), "{\"frames\":[%lu,%lu],\"attached\":%d}", P[0].frames, P[1].frames, lock.d.attached);
			reply(c, "application/json", j, (size_t) l);
		} else {
			FILE* f = fopen(page, "rb");
			static char html[1 << 16];
			size_t n = f ? fread(html, 1, sizeof(html), f) : 0;
			if (f) fclose(f);
			reply(c, "text/html; charset=utf-8", html, n);
		}
		close(c);
	}
	return NULL;
}

static void stop(int s) { (void) s; quit = 1; }

int main(int argc, char** argv) {
	if (argc < 7) { fprintf(stderr, "linkhost ROM0 SAV0 ROM1 SAV1 PORT PAGE [ADDRESS]\n"); return 2; }
	page = argv[6];
	if (argc > 7) bindAddr = argv[7];
	int port = atoi(argv[5]);
	mLogFilterInit(&quietFilter);
	quietFilter.defaultLevels = mLOG_FATAL | mLOG_ERROR;
	mLogSetDefaultLogger(&quiet);
	GBASIOLockstepInit(&lock);
	lock.d.context = NULL;
	lock.d.lock = lk; lock.d.unlock = ulk; lock.d.signal = sig; lock.d.wait = wt;
	lock.d.addCycles = addC; lock.d.useCycles = useC; lock.d.unusedCycles = unusedC; lock.d.unload = unload;
	for (int i = 0; i < N; ++i)
		if (!startPlayer(i, argv[1 + 2 * i], argv[2 + 2 * i])) { fprintf(stderr, "player %d failed to load\n", i + 1); return 1; }
	for (int i = 0; i < N; ++i) {
		if (!mCoreThreadStart(&P[i].thread)) { fprintf(stderr, "player %d did not start\n", i + 1); return 1; }
	}
	for (int i = 0; i < N; ++i) { mCoreThreadInterrupt(&P[i].thread); attach(i); mCoreThreadContinue(&P[i].thread); }
	signal(SIGINT, stop); signal(SIGTERM, stop);
	pthread_t srv;
	pthread_create(&srv, NULL, serve, &port);
	while (!quit) sleep(1);
	for (int i = N - 1; i >= 0; --i) { mCoreThreadEnd(&P[i].thread); mCoreThreadJoin(&P[i].thread); }
	for (int i = 0; i < N; ++i) P[i].core->deinit(P[i].core);   // the saves flushed to their files
	fprintf(stderr, "linkhost: stopped, saves written\n");
	return 0;
}
