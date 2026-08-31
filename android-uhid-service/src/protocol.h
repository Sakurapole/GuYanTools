#pragma once

#include <array>
#include <cstdint>
#include <string_view>

namespace guyan::uhid {

struct KeyboardReport {
  std::uint8_t modifiers = 0;
  std::array<std::uint8_t, 6> keys{};
};

struct MouseReport {
  std::uint8_t buttons = 0;
  std::int8_t dx = 0;
  std::int8_t dy = 0;
  std::int8_t wheel = 0;
};

enum class MessageType { Keyboard, Mouse };

struct InputMessage {
  MessageType type = MessageType::Keyboard;
  KeyboardReport keyboard{};
  MouseReport mouse{};
};

enum class ParseError {
  None,
  Empty,
  InvalidJson,
  UnknownType,
  InvalidReport,
  OutOfRange,
};

ParseError parse_input_message(std::string_view line, InputMessage& output);

}  // namespace guyan::uhid
