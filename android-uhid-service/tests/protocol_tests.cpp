#include "protocol.h"
#include "uhid_device.h"

#include <cassert>
#include <string>

int main() {
  using namespace guyan::uhid;
  InputMessage message;
  assert(parse_input_message(R"({"type":"keyboard","report":{"modifiers":0,"keys":[4]}})", message) == ParseError::None);
  assert(message.type == MessageType::Keyboard);
  assert(message.keyboard.modifiers == 0);
  assert(message.keyboard.keys[0] == 4);
  assert(parse_input_message(R"({"type":"keyboard","report":{"modifiers":1,"keys":[1,2,3,4,5,6]}})", message) == ParseError::None);
  assert(parse_input_message(R"({"type":"keyboard","report":{"modifiers":0,"keys":[1,2,3,4,5,6,7]}})", message) != ParseError::None);
  assert(parse_input_message(R"({"type":"mouse","report":{"buttons":1,"dx":0,"dy":0,"wheel":0}})", message) == ParseError::None);
  assert(message.type == MessageType::Mouse);
  assert(message.mouse.buttons == 1 && message.mouse.dx == 0);
  assert(parse_input_message(R"({"type":"mouse","report":{"buttons":1,"dx":-128,"dy":127,"wheel":0}})", message) == ParseError::None);
  assert(parse_input_message(R"({"type":"mouse","report":{"buttons":32,"dx":0,"dy":0,"wheel":0}})", message) != ParseError::None);
  assert(parse_input_message(R"({"type":"mouse","report":{"buttons":0,"dx":128,"dy":0,"wheel":0}})", message) != ParseError::None);
  assert(parse_input_message(R"({"type":"keyboard","report":{"modifiers":0,"keys":[],"extra":1}})", message) != ParseError::None);
  const std::string oversized(4097, 'x');
  assert(parse_input_message(oversized, message) == ParseError::InvalidJson);
  assert(parse_input_message(R"({"type":"unknown","report":{}})", message) == ParseError::UnknownType);
  assert(parse_input_message("", message) == ParseError::Empty);
  assert(keyboard_descriptor().size() > 30);
  assert(mouse_descriptor().size() > 30);
  guyan::uhid::UhidDevice device;
  std::string error;
  assert(!device.open("/dev/uhid", error));
  assert(error == "UHID_PLATFORM_UNSUPPORTED");
  assert(!device.create({}, "test", error));
  assert(error == "UHID_CREATE_INVALID");
  assert(!device.send_report(nullptr, 0, error));
  assert(error == "UHID_REPORT_INVALID");
  return 0;
}
