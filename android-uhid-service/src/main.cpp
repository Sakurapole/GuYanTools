#include "uhid_device.h"

#include <csignal>
#include <iostream>
#include <string>

namespace {
volatile std::sig_atomic_t g_stop = 0;
void on_signal(int) { g_stop = 1; }
}

int main() {
  std::signal(SIGTERM, on_signal);
  std::signal(SIGINT, on_signal);

  guyan::uhid::UhidDevice keyboard;
  guyan::uhid::UhidDevice mouse;
  std::string error;
  if (!keyboard.open("/dev/uhid", error) ||
      !keyboard.create(guyan::uhid::keyboard_descriptor(), "GuYanTools Keyboard", error) ||
      !keyboard.wait_for_start(5000, error) ||
      !mouse.open("/dev/uhid", error) ||
      !mouse.create(guyan::uhid::mouse_descriptor(), "GuYanTools Mouse", error) ||
      !mouse.wait_for_start(5000, error)) {
    std::cerr << error << '\n';
    return 1;
  }

  std::cout << "READY\n" << std::flush;
  std::string line;
  while (!g_stop && std::getline(std::cin, line)) {
    if (!keyboard.check_events(error) || !mouse.check_events(error)) {
      std::cerr << error << '\n';
      return 1;
    }
  }
  return 0;
}
