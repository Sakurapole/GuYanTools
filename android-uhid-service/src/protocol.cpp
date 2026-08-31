#include "protocol.h"

#include <algorithm>
#include <charconv>
#include <cctype>
#include <string>

namespace guyan::uhid {

namespace {
bool has_only_known_fields(std::string_view line, MessageType type) {
  if (type == MessageType::Keyboard) {
    return line.find("\"type\"") != std::string_view::npos &&
           line.find("\"report\"") != std::string_view::npos &&
           line.find("\"modifiers\"") != std::string_view::npos &&
           line.find("\"keys\"") != std::string_view::npos;
  }
  return line.find("\"type\"") != std::string_view::npos &&
         line.find("\"report\"") != std::string_view::npos &&
         line.find("\"buttons\"") != std::string_view::npos &&
         line.find("\"dx\"") != std::string_view::npos &&
         line.find("\"dy\"") != std::string_view::npos &&
         line.find("\"wheel\"") != std::string_view::npos;
}

bool extract_integer(std::string_view line, std::string_view key, int& value) {
  const auto key_pos = line.find(key);
  if (key_pos == std::string_view::npos) return false;
  const auto colon = line.find(':', key_pos + key.size());
  if (colon == std::string_view::npos) return false;
  auto begin = colon + 1;
  while (begin < line.size() && std::isspace(static_cast<unsigned char>(line[begin]))) ++begin;
  auto end = begin;
  if (end < line.size() && (line[end] == '-' || line[end] == '+')) ++end;
  const auto digits = end;
  while (end < line.size() && std::isdigit(static_cast<unsigned char>(line[end]))) ++end;
  if (digits == end) return false;
  const auto result = std::from_chars(line.data() + begin, line.data() + end, value);
  return result.ec == std::errc{};
}
}  // namespace

ParseError parse_input_message(std::string_view line, InputMessage& output) {
  if (line.empty()) return ParseError::Empty;
  if (line.size() > 4096 || line.front() != '{' || line.back() != '}') return ParseError::InvalidJson;
  if (line.find("\"type\":\"keyboard\"") != std::string_view::npos) {
    if (!has_only_known_fields(line, MessageType::Keyboard)) return ParseError::InvalidReport;
    int modifiers = 0;
    if (!extract_integer(line, "\"modifiers\"", modifiers) || modifiers < 0 || modifiers > 255) return ParseError::OutOfRange;
    output.type = MessageType::Keyboard;
    output.keyboard.modifiers = static_cast<std::uint8_t>(modifiers);
    return ParseError::None;
  }
  if (line.find("\"type\":\"mouse\"") != std::string_view::npos) {
    if (!has_only_known_fields(line, MessageType::Mouse)) return ParseError::InvalidReport;
    int buttons = 0;
    if (!extract_integer(line, "\"buttons\"", buttons) || buttons < 0 || buttons > 255) return ParseError::OutOfRange;
    output.type = MessageType::Mouse;
    output.mouse.buttons = static_cast<std::uint8_t>(buttons);
    return ParseError::None;
  }
  return ParseError::UnknownType;
}

}  // namespace guyan::uhid
