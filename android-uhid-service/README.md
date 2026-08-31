# GuYanTools Android UHID Service

This directory builds a temporary Android ARM64 executable, not an APK. The
desktop app pushes the executable to `/data/local/tmp`, grants execute
permission, and runs it through `adb shell` for the lifetime of one input
sharing session.

The service will consume newline-delimited JSON from stdin and create virtual
keyboard/mouse devices through `/dev/uhid`. The protocol parser is kept
host-testable so malformed reports can be rejected without an Android device.

Build requirements:

- Android NDK with CMake toolchain
- CMake 3.22+
- Ninja
- `arm64-v8a` target support

The UHID device implementation and complete report protocol are added in the
following plan tasks.
