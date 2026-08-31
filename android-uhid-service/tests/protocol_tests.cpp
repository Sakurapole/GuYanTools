#include "protocol.h"

#include <cassert>

int main() {
  using namespace guyan::uhid;
  InputMessage message;
  assert(parse_input_message(R"({"type":"keyboard","report":{"modifiers":0,"keys":[4]}})", message) == ParseError::None);
  assert(message.type == MessageType::Keyboard);
  assert(message.keyboard.modifiers == 0);
  assert(parse_input_message(R"({"type":"mouse","report":{"buttons":1,"dx":0,"dy":0,"wheel":0}})", message) == ParseError::None);
  assert(message.type == MessageType::Mouse);
  assert(parse_input_message(R"({"type":"unknown","report":{}})", message) == ParseError::UnknownType);
  assert(parse_input_message("", message) == ParseError::Empty);
  return 0;
}
