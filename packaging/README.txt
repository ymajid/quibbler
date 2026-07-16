quibbler — kdb+/q IDE
====================

QUICK START (Windows)
  1. Double-click  start-quibbler.bat
  2. A window opens. Click "+ New Connection" and enter your kdb+ host:port.
  3. Type a q expression and press Ctrl+Enter to run it.

  That's it. (macOS / Linux: run ./start-quibbler.sh instead.)

WHAT YOU NEED
  - Java 17 or newer (free): https://adoptium.net/temurin/releases/?version=17
      NOTE: if you downloaded the "quibbler-win" version, Java is already
      bundled — just double-click quibbler.exe, nothing to install.
  - Google Chrome is recommended (any browser works — it falls back to your
    default browser automatically).
  - A kdb+/q process to connect to. quibbler is the client; point it at your
    own q process, e.g. one started with:  q -p 5000

TIPS
  - Run on a different port:        start-quibbler.bat 9000
  - Don't auto-open a browser:      set QUIBBLER_NO_BROWSER=1  (then start)
  - Your connections and query history are saved under your home folder in
    a ".quibbler" directory.

KEYBOARD
  Ctrl+Enter  run query          Ctrl+P  switch connection / tab
  Ctrl+N      new tab            Ctrl+S  save file
  Ctrl+1..4   result / chart / console / history

Project & source: https://github.com/ymajid/mercury
