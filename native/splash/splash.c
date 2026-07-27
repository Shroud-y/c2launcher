// C² Launcher splash stub.
//
// This tiny exe takes the place of "C² Launcher.exe" in the install dir (the
// real Electron binary is renamed to "C² Launcher.bin.exe" by
// scripts/afterPack.cjs). It paints a loading window within a few tens of
// milliseconds, spawns the Electron binary, and closes once Electron's main
// window is ready.
//
// Why this exists: Electron cannot paint anything until its own ~180MB binary
// has been mapped and Chromium is up, measured at ~830ms on a warm cache and
// worse on a cold one. An Electron-side splash window therefore still leaves a
// blank screen for most of the wait. Only a native process can cover it.
//
// Handoff protocol (both paths are passed to the child on its command line):
//   --splash-ready-file=<path>   child creates this file when its window is up,
//                                or when startup fails. Its appearance closes
//                                the splash.
//   --splash-status-file=<path>  child may write a single UTF-8 line here; it is
//                                displayed under the wordmark (e.g. during the
//                                multi-GB data-dir migration).
//
// Build: see build.mjs. Compiled with `zig cc` against the GDI+ *flat* API
// (the C++ Gdiplus:: wrappers would drag in libc++ for no benefit).

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>  // CommandLineToArgvW
#include <shlobj.h>    // SHGetFolderPathW, CSIDL_APPDATA
#include <shlwapi.h>   // PathFileExistsW
#include <stddef.h>    // ptrdiff_t
#include <stdio.h>
#include <string.h>  // strchr, strcmp

#define IDR_LOGO_PNG 101

// ---------------------------------------------------------------------------
// GDI+ flat API. Declared by hand: the mingw-w64 headers only expose these
// through the C++ wrappers, and we compile as C.
// ---------------------------------------------------------------------------

typedef struct GdiplusStartupInput {
  UINT32 GdiplusVersion;
  void *DebugEventCallback;
  BOOL SuppressBackgroundThread;
  BOOL SuppressExternalCodecs;
} GdiplusStartupInput;

typedef void GpImage;
typedef void GpGraphics;

// GpStatus: 0 == Ok. We only ever compare against Ok.
typedef int GpStatus;
#define GdipOk 0

// Pixel offset mode 2 == PixelOffsetModeHalf; interpolation 7 ==
// InterpolationModeHighQualityBicubic; smoothing 4 == SmoothingModeAntiAlias.
#define GdipPixelOffsetModeHalf 2
#define GdipInterpolationHighQualityBicubic 7
#define GdipSmoothingAntiAlias 4

extern GpStatus WINAPI GdiplusStartup(ULONG_PTR *token, const GdiplusStartupInput *input,
                                      void *output);
extern void WINAPI GdiplusShutdown(ULONG_PTR token);
extern GpStatus WINAPI GdipCreateBitmapFromStream(IStream *stream, GpImage **bitmap);
extern GpStatus WINAPI GdipDisposeImage(GpImage *image);
extern GpStatus WINAPI GdipCreateFromHDC(HDC hdc, GpGraphics **graphics);
extern GpStatus WINAPI GdipDeleteGraphics(GpGraphics *graphics);
extern GpStatus WINAPI GdipDrawImageRectI(GpGraphics *graphics, GpImage *image, INT x, INT y,
                                          INT width, INT height);
extern GpStatus WINAPI GdipSetInterpolationMode(GpGraphics *graphics, int mode);
extern GpStatus WINAPI GdipSetPixelOffsetMode(GpGraphics *graphics, int mode);
extern GpStatus WINAPI GdipSetSmoothingMode(GpGraphics *graphics, int mode);

// Direct pixel access, for re-tinting the logo (see tintLogo).
typedef struct GpRectI {
  INT X, Y, Width, Height;
} GpRectI;

typedef struct GpBitmapData {
  UINT Width;
  UINT Height;
  INT Stride;
  INT PixelFormat;
  void *Scan0;
  UINT_PTR Reserved;
} GpBitmapData;

#define GdipLockRead 1
#define GdipLockWrite 2
// PixelFormat32bppARGB — straight (non-premultiplied) alpha, laid out B,G,R,A.
#define GdipFormat32bppARGB 0x0026200A

extern GpStatus WINAPI GdipGetImageWidth(GpImage *image, UINT *width);
extern GpStatus WINAPI GdipGetImageHeight(GpImage *image, UINT *height);
extern GpStatus WINAPI GdipBitmapLockBits(GpImage *bitmap, const GpRectI *rect, UINT flags,
                                          INT format, GpBitmapData *locked);
extern GpStatus WINAPI GdipBitmapUnlockBits(GpImage *bitmap, GpBitmapData *locked);

// ---------------------------------------------------------------------------
// Layout / theme. Colours match the renderer's --bg / --text tokens so the
// handoff to the real window is not a visible jump.
// ---------------------------------------------------------------------------

#define SPLASH_W 420
#define SPLASH_H 260
#define LOGO_PX 96
#define BAR_W 300
#define BAR_H 4

// Defaults, used until the theme cache is read (see applyThemeFile). They match
// the BrowserWindow backgroundColor in src/main/index.ts and the "midnight"
// preset in src/renderer/theme.ts, so a first run with no cache looks like the
// app it is about to open.
//
// Not #defines: applyThemeFile overwrites them at startup with the user's
// actual theme, per-key, so a file that only parses halfway still leaves the
// rest at sane values.
static COLORREF g_colBg = RGB(0x0f, 0x11, 0x17);
static COLORREF g_colBorder = RGB(0x21, 0x26, 0x2d);
static COLORREF g_colText = RGB(0xe8, 0xea, 0xf0);
static COLORREF g_colDim = RGB(0x8a, 0x91, 0xa6);
static COLORREF g_colTrack = RGB(0x1e, 0x22, 0x2e);
static COLORREF g_colAccent = RGB(0x2f, 0x9c, 0x95);
// The logo's rounded tile. Only ever used to re-tint the embedded PNG.
static COLORREF g_colPanel = RGB(0x0f, 0x0f, 0x0f);

#define TIMER_ANIM 1
#define TIMER_POLL 2
#define ANIM_MS 16
#define POLL_MS 32

// Hard ceiling on how long the splash stays up. It only ever closes the
// splash; the child is never killed, because a legitimate startup can block
// for minutes behind a data migration or a modal dialog.
#define MAX_LIFETIME_MS 120000

static ULONG_PTR g_gdip = 0;
static GpImage *g_logo = NULL;
static HFONT g_fontTitle = NULL;
static HFONT g_fontStatus = NULL;
static HANDLE g_child = NULL;
static DWORD g_startTick = 0;
static int g_sweep = 0;
static wchar_t g_readyFile[MAX_PATH] = {0};
static wchar_t g_statusFile[MAX_PATH] = {0};
static wchar_t g_status[128] = L"Starting…";

// ---------------------------------------------------------------------------
// Theme cache. Written by src/main/splashTheme.ts whenever the user changes
// theme; read here at startup. The colours are therefore always one launch
// behind, which is unavoidable — the theme lives in renderer localStorage, and
// the whole point of this program is to run before that exists.
//
// Both the path and the `key=rrggbb` format are a contract with
// src/main/splashTheme.ts. Any change there needs a rebuild here.
// ---------------------------------------------------------------------------

// Parses exactly six hex digits followed by a terminator. Anything else is
// rejected rather than partially accepted, so a truncated write cannot produce
// a plausible-looking wrong colour.
static BOOL parseHexColor(const char *s, COLORREF *out) {
  unsigned value = 0;
  for (int i = 0; i < 6; i++) {
    char c = s[i];
    unsigned digit;
    if (c >= '0' && c <= '9') digit = (unsigned)(c - '0');
    else if (c >= 'a' && c <= 'f') digit = (unsigned)(c - 'a' + 10);
    else if (c >= 'A' && c <= 'F') digit = (unsigned)(c - 'A' + 10);
    else return FALSE;
    value = (value << 4) | digit;
  }
  if (s[6] != 0) return FALSE;
  *out = RGB((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
  return TRUE;
}

static void applyThemeLine(char *line) {
  char *eq = strchr(line, '=');
  if (!eq) return;
  *eq = 0;
  const char *value = eq + 1;

  COLORREF parsed;
  if (!parseHexColor(value, &parsed)) return;

  if (strcmp(line, "bg") == 0) g_colBg = parsed;
  else if (strcmp(line, "panel") == 0) g_colPanel = parsed;
  else if (strcmp(line, "accent") == 0) g_colAccent = parsed;
  else if (strcmp(line, "muted") == 0) g_colDim = parsed;
  else if (strcmp(line, "hover") == 0) g_colTrack = parsed;
  else if (strcmp(line, "border") == 0) g_colBorder = parsed;
}

// Same sRGB-weighted luminance and 0.55 threshold as contrastOn() in
// src/renderer/theme.ts. The wordmark is picked this way rather than taken from
// the theme's own text colour, which some presets set quite dim (midnight uses
// #737373) — fine for body text, washed out for the one word on a splash.
static COLORREF contrastOn(COLORREF c) {
  unsigned lum = 2126u * GetRValue(c) + 7152u * GetGValue(c) + 722u * GetBValue(c);
  return lum > 1402500u ? RGB(0x14, 0x10, 0x19) : RGB(0xf5, 0xf5, 0xf5);
}

static void applyThemeFile(void) {
  wchar_t appData[MAX_PATH];
  // userData is pinned to <appData>/c2launcher in src/main/index.ts; this must
  // track it. CSIDL_APPDATA is the roaming folder, i.e. %APPDATA%.
  if (SHGetFolderPathW(NULL, CSIDL_APPDATA, NULL, 0, appData) != S_OK) return;

  wchar_t path[MAX_PATH];
  if (_snwprintf(path, MAX_PATH, L"%s\\c2launcher\\splash-theme", appData) < 0) return;
  path[MAX_PATH - 1] = 0;

  HANDLE f = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL,
                         OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
  // Missing file is the normal first-run state, not an error.
  if (f == INVALID_HANDLE_VALUE) return;

  char buf[512];
  DWORD read = 0;
  BOOL ok = ReadFile(f, buf, sizeof(buf) - 1, &read, NULL);
  CloseHandle(f);
  if (!ok || read == 0) return;
  buf[read] = 0;

  for (char *line = buf; *line;) {
    char *end = line;
    while (*end && *end != '\n' && *end != '\r') end++;
    BOOL last = (*end == 0);
    *end = 0;
    applyThemeLine(line);
    if (last) break;
    line = end + 1;
  }

  g_colText = contrastOn(g_colBg);
}

// ---------------------------------------------------------------------------
// Logo: decode the PNG embedded as RCDATA. GDI+ can decode straight from an
// IStream, which lets the .rc keep a plain PNG — no build-time PNG→BMP step.
// ---------------------------------------------------------------------------

static void loadLogo(void) {
  HRSRC res = FindResourceW(NULL, MAKEINTRESOURCEW(IDR_LOGO_PNG), RT_RCDATA);
  if (!res) return;
  DWORD size = SizeofResource(NULL, res);
  HGLOBAL data = LoadResource(NULL, res);
  if (!data || size == 0) return;
  const void *bytes = LockResource(data);
  if (!bytes) return;

  // GDI+ keeps reading the stream lazily, so the copy must outlive decode.
  // It is freed with GMEM_MOVEABLE ownership handed to the IStream below.
  HGLOBAL mem = GlobalAlloc(GMEM_MOVEABLE, size);
  if (!mem) return;
  void *dst = GlobalLock(mem);
  if (!dst) {
    GlobalFree(mem);
    return;
  }
  memcpy(dst, bytes, size);
  GlobalUnlock(mem);

  IStream *stream = NULL;
  // TRUE: the stream frees the HGLOBAL on release.
  if (CreateStreamOnHGlobal(mem, TRUE, &stream) != S_OK) {
    GlobalFree(mem);
    return;
  }
  if (GdipCreateBitmapFromStream(stream, &g_logo) != GdipOk) g_logo = NULL;
  stream->lpVtbl->Release(stream);
}

// logo.png is built from exactly two colours: a #0f0f0f rounded tile and the
// #2f9c95 mark, with antialiased edges blending between them. Every opaque
// pixel is therefore tile + t*(mark - tile) for some t, so recovering t and
// re-mixing with the theme's own two colours recolours the edges correctly.
//
// A GDI+ remap table (GdipSetImageAttributesRemapTable) would have been less
// code but only matches exact colours, leaving every antialiased edge pixel at
// the original teal — a visible fringe around the whole mark.
//
// The green channel carries t: it separates the two source colours by 0x8d,
// far more than red (0x20) or blue (0x86), so quantisation error is smallest.
#define LOGO_SRC_TILE_G 0x0f
#define LOGO_SRC_MARK_G 0x9c

static BYTE lerp8(BYTE from, BYTE to, int t) {
  return (BYTE)((int)from + (((int)to - (int)from) * t) / 255);
}

static void tintLogo(void) {
  if (!g_logo) return;

  UINT w = 0, h = 0;
  if (GdipGetImageWidth(g_logo, &w) != GdipOk || GdipGetImageHeight(g_logo, &h) != GdipOk) return;
  if (w == 0 || h == 0) return;

  GpRectI rect = {0, 0, (INT)w, (INT)h};
  GpBitmapData data = {0};
  if (GdipBitmapLockBits(g_logo, &rect, GdipLockRead | GdipLockWrite, GdipFormat32bppARGB,
                         &data) != GdipOk) {
    return;  // logo stays teal; still better than no logo
  }

  const BYTE tileR = GetRValue(g_colPanel), tileG = GetGValue(g_colPanel),
             tileB = GetBValue(g_colPanel);
  const BYTE markR = GetRValue(g_colAccent), markG = GetGValue(g_colAccent),
             markB = GetBValue(g_colAccent);

  for (UINT y = 0; y < h; y++) {
    BYTE *row = (BYTE *)data.Scan0 + (ptrdiff_t)y * data.Stride;
    for (UINT x = 0; x < w; x++) {
      BYTE *px = row + x * 4;  // B, G, R, A
      // Fully transparent pixels (the rounded corners) carry no meaningful
      // colour to recover t from.
      if (px[3] == 0) continue;

      int t = ((int)px[1] - LOGO_SRC_TILE_G) * 255 / (LOGO_SRC_MARK_G - LOGO_SRC_TILE_G);
      if (t < 0) t = 0;
      if (t > 255) t = 255;

      px[0] = lerp8(tileB, markB, t);
      px[1] = lerp8(tileG, markG, t);
      px[2] = lerp8(tileR, markR, t);
    }
  }

  GdipBitmapUnlockBits(g_logo, &data);
}

// ---------------------------------------------------------------------------
// Paint. Fully double-buffered: the animated bar repaints every 16ms and
// drawing straight to the window DC would tear and flicker.
// ---------------------------------------------------------------------------

static void paint(HWND hwnd, HDC target, const RECT *rc) {
  int w = rc->right - rc->left;
  int h = rc->bottom - rc->top;

  HDC mem = CreateCompatibleDC(target);
  HBITMAP bmp = CreateCompatibleBitmap(target, w, h);
  HBITMAP oldBmp = (HBITMAP)SelectObject(mem, bmp);

  // Background + 1px border.
  HBRUSH bg = CreateSolidBrush(g_colBg);
  RECT full = {0, 0, w, h};
  FillRect(mem, &full, bg);
  DeleteObject(bg);

  HPEN border = CreatePen(PS_SOLID, 1, g_colBorder);
  HPEN oldPen = (HPEN)SelectObject(mem, border);
  HBRUSH oldBrush = (HBRUSH)SelectObject(mem, GetStockObject(NULL_BRUSH));
  Rectangle(mem, 0, 0, w, h);
  SelectObject(mem, oldBrush);
  SelectObject(mem, oldPen);
  DeleteObject(border);

  // Logo, centred horizontally.
  if (g_logo) {
    GpGraphics *g = NULL;
    if (GdipCreateFromHDC(mem, &g) == GdipOk) {
      GdipSetInterpolationMode(g, GdipInterpolationHighQualityBicubic);
      GdipSetPixelOffsetMode(g, GdipPixelOffsetModeHalf);
      GdipSetSmoothingMode(g, GdipSmoothingAntiAlias);
      GdipDrawImageRectI(g, g_logo, (w - LOGO_PX) / 2, 34, LOGO_PX, LOGO_PX);
      GdipDeleteGraphics(g);
    }
  }

  SetBkMode(mem, TRANSPARENT);

  // Wordmark.
  HFONT oldFont = (HFONT)SelectObject(mem, g_fontTitle);
  SetTextColor(mem, g_colText);
  RECT titleRect = {0, 34 + LOGO_PX + 14, w, 34 + LOGO_PX + 48};
  DrawTextW(mem, L"C² Launcher", -1, &titleRect, DT_CENTER | DT_SINGLELINE | DT_TOP);

  // Status line.
  SelectObject(mem, g_fontStatus);
  SetTextColor(mem, g_colDim);
  RECT statusRect = {12, h - 58, w - 12, h - 38};
  DrawTextW(mem, g_status, -1, &statusRect,
            DT_CENTER | DT_SINGLELINE | DT_TOP | DT_END_ELLIPSIS);
  SelectObject(mem, oldFont);

  // Indeterminate sweep bar: a short accent segment travelling along a track.
  int barX = (w - BAR_W) / 2;
  int barY = h - 28;
  HBRUSH track = CreateSolidBrush(g_colTrack);
  RECT trackRect = {barX, barY, barX + BAR_W, barY + BAR_H};
  FillRect(mem, &trackRect, track);
  DeleteObject(track);

  int segW = BAR_W / 3;
  // g_sweep runs 0..(BAR_W + segW); offsetting by segW lets the segment slide
  // in from the left edge and out past the right instead of popping.
  int segX = barX - segW + g_sweep;
  int clipL = segX < barX ? barX : segX;
  int clipR = segX + segW > barX + BAR_W ? barX + BAR_W : segX + segW;
  if (clipR > clipL) {
    HBRUSH accent = CreateSolidBrush(g_colAccent);
    RECT segRect = {clipL, barY, clipR, barY + BAR_H};
    FillRect(mem, &segRect, accent);
    DeleteObject(accent);
  }

  BitBlt(target, 0, 0, w, h, mem, 0, 0, SRCCOPY);

  SelectObject(mem, oldBmp);
  DeleteObject(bmp);
  DeleteDC(mem);
  (void)hwnd;
}

static LRESULT CALLBACK wndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
  switch (msg) {
    case WM_PAINT: {
      PAINTSTRUCT ps;
      HDC hdc = BeginPaint(hwnd, &ps);
      RECT rc;
      GetClientRect(hwnd, &rc);
      paint(hwnd, hdc, &rc);
      EndPaint(hwnd, &ps);
      return 0;
    }
    // The window is fully repainted in WM_PAINT; letting the default handler
    // erase first would flash the background brush.
    case WM_ERASEBKGND:
      return 1;
    case WM_TIMER:
      if (wp == TIMER_ANIM) {
        g_sweep = (g_sweep + 6) % (BAR_W + BAR_W / 3);
        InvalidateRect(hwnd, NULL, FALSE);
      }
      return 0;
    case WM_DESTROY:
      PostQuitMessage(0);
      return 0;
    // A splash must not be draggable, closable or activatable. HTNOWHERE makes
    // the whole window inert: clicks on it do nothing. (Note this swallows the
    // click rather than forwarding it to the window behind — that would be
    // HTTRANSPARENT, which is not wanted here: a stray click during startup
    // should not reach whatever happens to be underneath.)
    case WM_NCHITTEST:
      return HTNOWHERE;
  }
  return DefWindowProcW(hwnd, msg, wp, lp);
}

// ---------------------------------------------------------------------------
// Status polling. The child writes a single line; we read it and repaint only
// when the text actually changed.
// ---------------------------------------------------------------------------

static void pollStatus(HWND hwnd) {
  if (!g_statusFile[0]) return;
  HANDLE f = CreateFileW(g_statusFile, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE,
                         NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
  if (f == INVALID_HANDLE_VALUE) return;

  char buf[256] = {0};
  DWORD read = 0;
  BOOL ok = ReadFile(f, buf, sizeof(buf) - 1, &read, NULL);
  CloseHandle(f);
  if (!ok || read == 0) return;

  // Trim at the first newline; the child may append lines over time and only
  // the latest single-line write is meaningful.
  for (DWORD i = 0; i < read; i++) {
    if (buf[i] == '\r' || buf[i] == '\n') {
      buf[i] = 0;
      break;
    }
  }
  if (!buf[0]) return;

  wchar_t wide[128] = {0};
  if (MultiByteToWideChar(CP_UTF8, 0, buf, -1, wide, 127) == 0) return;
  if (wcscmp(wide, g_status) == 0) return;
  wcsncpy(g_status, wide, 127);
  g_status[127] = 0;
  InvalidateRect(hwnd, NULL, FALSE);
}

// ---------------------------------------------------------------------------
// Child launch
// ---------------------------------------------------------------------------

// Work out the real Electron binary's path from our own: scripts/afterPack.cjs
// renames "<product>.exe" to "<product>.bin.exe" and puts this stub in its
// place, so the child is always our own path with ".exe" → ".bin.exe".
//
// Derived rather than hardcoded on purpose: the product name lives in
// electron-builder.yml, and baking a copy of it into this file would mean a
// rename there produced a stub that builds fine and then fails to launch
// anything at runtime.
static BOOL childExePath(wchar_t *out, size_t cap) {
  wchar_t self[MAX_PATH];
  DWORD n = GetModuleFileNameW(NULL, self, MAX_PATH);
  if (n == 0 || n >= MAX_PATH) return FALSE;

  // Strip a trailing ".exe" (the shell may invoke us without it).
  size_t len = wcslen(self);
  if (len > 4 && _wcsicmp(self + len - 4, L".exe") == 0) self[len - 4] = 0;

  int written = _snwprintf(out, cap, L"%s.bin.exe", self);
  if (written < 0 || (size_t)written >= cap) return FALSE;
  return TRUE;
}

// Per-process temp path so two installs (or a relaunch) never collide.
static void tempPath(const wchar_t *tag, wchar_t *out, size_t cap) {
  wchar_t dir[MAX_PATH];
  DWORD n = GetTempPathW(MAX_PATH, dir);
  if (n == 0 || n >= MAX_PATH) {
    out[0] = 0;
    return;
  }
  _snwprintf(out, cap, L"%sc2launcher-%s-%lu.tmp", dir, tag, GetCurrentProcessId());
  out[cap - 1] = 0;
}

// Forward our own arguments to the child, minus argv[0], so shortcut params and
// electron-updater's --force-run still reach Electron.
static void buildChildCmdline(const wchar_t *exe, wchar_t *out, size_t cap) {
  const wchar_t *raw = GetCommandLineW();
  int argc = 0;
  LPWSTR *argv = CommandLineToArgvW(raw, &argc);

  int written = _snwprintf(out, cap, L"\"%s\" --splash-ready-file=\"%s\" --splash-status-file=\"%s\"",
                           exe, g_readyFile, g_statusFile);
  if (written < 0) {
    out[0] = 0;
    if (argv) LocalFree(argv);
    return;
  }
  size_t len = (size_t)written;

  if (argv) {
    for (int i = 1; i < argc; i++) {
      size_t need = wcslen(argv[i]) + 4;
      if (len + need >= cap) break;
      len += (size_t)_snwprintf(out + len, cap - len, L" \"%s\"", argv[i]);
    }
    LocalFree(argv);
  }
  out[cap - 1] = 0;
}

// wWinMain, not wmain: the exe is linked into the GUI subsystem so no console
// window flashes, and the Windows CRT startup for that subsystem calls
// wWinMain. All four parameters are unused — the command line is read back with
// GetCommandLineW so it can be forwarded verbatim, quotes intact.
int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE hPrev, PWSTR cmdLine, int showCmd) {
  (void)hInstance;
  (void)hPrev;
  (void)cmdLine;
  (void)showCmd;

  // DPI awareness must be set before the first window is created, or Windows
  // bitmap-stretches the splash on a scaled display. The v2 context API is
  // Win10 1703+, so it is resolved dynamically with a legacy fallback.
  HMODULE user32 = GetModuleHandleW(L"user32.dll");
  if (user32) {
    typedef BOOL(WINAPI * SetCtxFn)(HANDLE);
    SetCtxFn setCtx = (SetCtxFn)(void *)GetProcAddress(user32, "SetProcessDpiAwarenessContext");
    // -4 == DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
    if (!setCtx || !setCtx((HANDLE)(INT_PTR)-4)) SetProcessDPIAware();
  } else {
    SetProcessDPIAware();
  }

  // Second double-click while the first launch is still booting must not put
  // up a second splash. Named per-session, not global, so a second desktop
  // session is unaffected.
  HANDLE mutex = CreateMutexW(NULL, TRUE, L"Local\\C2LauncherSplash");
  if (mutex && GetLastError() == ERROR_ALREADY_EXISTS) return 0;

  wchar_t exe[MAX_PATH];
  if (!childExePath(exe, MAX_PATH)) return 1;

  tempPath(L"ready", g_readyFile, MAX_PATH);
  tempPath(L"status", g_statusFile, MAX_PATH);
  // A crashed previous run can leave these behind; a stale ready-file would
  // close the splash instantly.
  if (g_readyFile[0]) DeleteFileW(g_readyFile);
  if (g_statusFile[0]) DeleteFileW(g_statusFile);

  // Before the window class and the first paint, both of which use the colours.
  applyThemeFile();

  GdiplusStartupInput si = {1, NULL, FALSE, FALSE};
  GdiplusStartup(&g_gdip, &si, NULL);
  // Must come after GdiplusStartup: GdipCreateBitmapFromStream fails with
  // GdiplusNotInitialized before it, and this is the startup hot path — no
  // point copying and failing to decode 32KB of PNG twice.
  loadLogo();
  tintLogo();

  g_fontTitle = CreateFontW(-20, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                            OUT_TT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
                            DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
  g_fontStatus = CreateFontW(-12, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                             OUT_TT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
                             DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");

  WNDCLASSEXW wc = {0};
  wc.cbSize = sizeof(wc);
  wc.lpfnWndProc = wndProc;
  wc.hInstance = GetModuleHandleW(NULL);
  wc.lpszClassName = L"C2LauncherSplash";
  wc.hCursor = LoadCursorW(NULL, IDC_ARROW);
  if (!RegisterClassExW(&wc)) return 1;

  // Centre on the monitor under the cursor, which is where the user just
  // clicked — not necessarily the primary monitor.
  POINT cursor = {0, 0};
  GetCursorPos(&cursor);
  HMONITOR mon = MonitorFromPoint(cursor, MONITOR_DEFAULTTOPRIMARY);
  MONITORINFO mi = {0};
  mi.cbSize = sizeof(mi);
  int x = 100, y = 100;
  if (GetMonitorInfoW(mon, &mi)) {
    x = mi.rcWork.left + (mi.rcWork.right - mi.rcWork.left - SPLASH_W) / 2;
    y = mi.rcWork.top + (mi.rcWork.bottom - mi.rcWork.top - SPLASH_H) / 2;
  }

  // WS_EX_NOACTIVATE: the splash must never steal focus from whatever the user
  // is typing into, and must not be the window that owns the foreground when
  // Electron's real window appears.
  HWND hwnd = CreateWindowExW(WS_EX_TOPMOST | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW,
                              wc.lpszClassName, L"C² Launcher", WS_POPUP, x, y, SPLASH_W,
                              SPLASH_H, NULL, NULL, wc.hInstance, NULL);
  if (!hwnd) return 1;

  ShowWindow(hwnd, SW_SHOWNA);
  // Paint the first frame synchronously so the window is never briefly blank.
  UpdateWindow(hwnd);

  SetTimer(hwnd, TIMER_ANIM, ANIM_MS, NULL);
  SetTimer(hwnd, TIMER_POLL, POLL_MS, NULL);
  g_startTick = GetTickCount();

  // Spawn Electron.
  wchar_t cmdline[4096];
  buildChildCmdline(exe, cmdline, 4096);

  STARTUPINFOW startup = {0};
  startup.cb = sizeof(startup);
  PROCESS_INFORMATION procInfo = {0};
  if (!CreateProcessW(exe, cmdline, NULL, NULL, FALSE, 0, NULL, NULL, &startup, &procInfo)) {
    wchar_t msg[512];
    _snwprintf(msg, 512,
               L"Could not start C² Launcher.\n\n%s\n\nError %lu. Try reinstalling the launcher.",
               exe, GetLastError());
    msg[511] = 0;
    DestroyWindow(hwnd);
    MessageBoxW(NULL, msg, L"C² Launcher", MB_ICONERROR | MB_OK);
    return 1;
  }
  g_child = procInfo.hProcess;
  CloseHandle(procInfo.hThread);

  // Let the child take the foreground when its window appears, despite us
  // being the more recently started process.
  AllowSetForegroundWindow(procInfo.dwProcessId);

  // Message loop. MsgWaitForMultipleObjects wakes on either a message or the
  // child exiting, so a child that dies early closes the splash at once.
  for (;;) {
    DWORD wait = MsgWaitForMultipleObjects(1, &g_child, FALSE, POLL_MS, QS_ALLINPUT);

    if (wait == WAIT_OBJECT_0) break;  // child exited (crash, or a fast quit)

    if (wait == WAIT_OBJECT_0 + 1) {
      MSG msg;
      while (PeekMessageW(&msg, NULL, 0, 0, PM_REMOVE)) {
        if (msg.message == WM_QUIT) goto done;
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
      }
    }

    // Ready-file is the normal exit path.
    if (g_readyFile[0] && PathFileExistsW(g_readyFile)) break;
    pollStatus(hwnd);

    // Watchdog closes the splash only. Killing the child here would abort a
    // legitimate long migration or a startup blocked on a modal dialog.
    if (GetTickCount() - g_startTick > MAX_LIFETIME_MS) break;
  }

done:
  KillTimer(hwnd, TIMER_ANIM);
  KillTimer(hwnd, TIMER_POLL);
  DestroyWindow(hwnd);

  if (g_readyFile[0]) DeleteFileW(g_readyFile);
  if (g_statusFile[0]) DeleteFileW(g_statusFile);
  if (g_logo) GdipDisposeImage(g_logo);
  if (g_gdip) GdiplusShutdown(g_gdip);
  if (g_fontTitle) DeleteObject(g_fontTitle);
  if (g_fontStatus) DeleteObject(g_fontStatus);
  if (g_child) CloseHandle(g_child);
  if (mutex) {
    ReleaseMutex(mutex);
    CloseHandle(mutex);
  }
  return 0;
}
