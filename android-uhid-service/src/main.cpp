#include "protocol.h"
#include "uhid_device.h"

#include <csignal>
#include <iostream>
#include <string>
#include <vector>

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
    if (!line.empty() && line.back() == '\r') line.pop_back();
    if (line.empty()) continue;
    if (!keyboard.check_events(error) || !mouse.check_events(error)) {
      std::cerr << error << '\n';
      return 1;
    }
    guyan::uhid::InputMessage message;
    if (guyan::uhid::parse_input_message(line, message) != guyan::uhid::ParseError::None) {
      std::cerr << "UHID_PROTOCOL_ERROR\n";
      return 2;
    }
    if (message.type == guyan::uhid::MessageType::Keyboard) {
      std::vector<std::uint8_t> report(8);
      report[0] = message.keyboard.modifiers;
      for (std::size_t i = 0; i < message.keyboard.keys.size(); ++i) report[i + 2] = message.keyboard.keys[i];
      if (!keyboard.send_report(report.data(), report.size(), error)) { std::cerr << error << '\n'; return 1; }
    } else {
      const auto& mouse_report = message.mouse;
      const std::uint8_t report[] = {mouse_report.buttons, static_cast<std::uint8_t>(mouse_report.dx),
                                     static_cast<std::uint8_t>(mouse_report.dy), static_cast<std::uint8_t>(mouse_report.wheel)};
      if (!mouse.send_report(report, sizeof(report), error)) { std::cerr << error << '\n'; return 1; }
    }
  }
  return 0;
}
