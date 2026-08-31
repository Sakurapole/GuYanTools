#include "protocol.h"

#include <cctype>
#include <charconv>

namespace guyan::uhid {
namespace {
struct Cursor {
  std::string_view text;
  std::size_t pos = 0;
  void ws() { while (pos < text.size() && std::isspace(static_cast<unsigned char>(text[pos]))) ++pos; }
  bool take(char c) { ws(); if (pos >= text.size() || text[pos] != c) return false; ++pos; return true; }
  bool string(std::string_view expected) {
    ws();
    const auto begin = pos;
    if (pos >= text.size() || text[pos++] != '"') return false;
    const auto start = pos;
    while (pos < text.size() && text[pos] != '"') {
      if (text[pos] == '\\' || static_cast<unsigned char>(text[pos]) < 0x20) return false;
      ++pos;
    }
    if (pos >= text.size() || text.substr(start, pos - start) != expected) { pos = begin; return false; }
    ++pos;
    return true;
  }
  bool integer(int& value) {
    ws();
    const auto start = pos;
    if (pos < text.size() && text[pos] == '-') ++pos;
    const auto digits = pos;
    while (pos < text.size() && std::isdigit(static_cast<unsigned char>(text[pos]))) ++pos;
    if (digits == pos) return false;
    const auto result = std::from_chars(text.data() + start, text.data() + pos, value);
    return result.ec == std::errc{};
  }
  bool done() { ws(); return pos == text.size(); }
};

bool parse_keyboard_report(Cursor& c, KeyboardReport& report) {
  if (!c.take('{') || !c.string("modifiers") || !c.take(':')) return false;
  int modifiers = 0;
  if (!c.integer(modifiers) || modifiers < 0 || modifiers > 255 || !c.take(',')) return false;
  if (!c.string("keys") || !c.take(':') || !c.take('[')) return false;
  report = {};
  std::size_t count = 0;
  c.ws();
  if (c.pos < c.text.size() && c.text[c.pos] != ']') {
    while (true) {
      int key = 0;
      if (count >= report.keys.size() || !c.integer(key) || key < 0 || key > 255) return false;
      report.keys[count++] = static_cast<std::uint8_t>(key);
      c.ws();
      if (c.take(']')) break;
      if (!c.take(',')) return false;
    }
  } else if (!c.take(']')) return false;
  if (!c.take('}')) return false;
  report.modifiers = static_cast<std::uint8_t>(modifiers);
  return true;
}

bool parse_mouse_report(Cursor& c, MouseReport& report) {
  if (!c.take('{')) return false;
  int values[4]{};
  constexpr std::string_view names[] = {"buttons", "dx", "dy", "wheel"};
  for (int i = 0; i < 4; ++i) {
    if (!c.string(names[i]) || !c.take(':') || !c.integer(values[i])) return false;
    if (i < 3 && !c.take(',')) return false;
  }
  if (!c.take('}') || values[0] < 0 || values[0] > 31 || values[1] < -128 || values[1] > 127 ||
      values[2] < -128 || values[2] > 127 || values[3] < -128 || values[3] > 127) return false;
  report.buttons = static_cast<std::uint8_t>(values[0]);
  report.dx = static_cast<std::int8_t>(values[1]);
  report.dy = static_cast<std::int8_t>(values[2]);
  report.wheel = static_cast<std::int8_t>(values[3]);
  return true;
}
}  // namespace

ParseError parse_input_message(std::string_view line, InputMessage& output) {
  if (line.empty()) return ParseError::Empty;
  if (line.size() > 4096) return ParseError::InvalidJson;
  Cursor c{line};
  if (!c.take('{') || !c.string("type") || !c.take(':')) return ParseError::InvalidJson;
  c.ws();
  const bool keyboard = c.string("keyboard");
  const bool mouse = !keyboard && c.string("mouse");
  if (!keyboard && !mouse) return ParseError::UnknownType;
  if (!c.take(',') || !c.string("report") || !c.take(':')) return ParseError::InvalidJson;
  output = {};
  const bool valid = keyboard ? parse_keyboard_report(c, output.keyboard) : parse_mouse_report(c, output.mouse);
  if (!valid || !c.take('}') || !c.done()) return ParseError::InvalidReport;
  output.type = keyboard ? MessageType::Keyboard : MessageType::Mouse;
  return ParseError::None;
}
}  // namespace guyan::uhid
