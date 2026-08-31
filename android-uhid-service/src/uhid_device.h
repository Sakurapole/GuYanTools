#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace guyan::uhid {

inline constexpr std::size_t kMaxUhidDataSize = 4096;

class UhidDevice {
 public:
  UhidDevice() = default;
  UhidDevice(const UhidDevice&) = delete;
  UhidDevice& operator=(const UhidDevice&) = delete;
  ~UhidDevice();

  bool open(const char* path, std::string& error);
  bool create(const std::vector<std::uint8_t>& descriptor, const char* name, std::string& error);
  bool wait_for_start(int timeout_ms, std::string& error);
  bool check_events(std::string& error);
  bool send_report(const std::uint8_t* report, std::size_t size, std::string& error);
  void destroy();
  bool ready() const { return fd_ >= 0 && created_; }
  int fd() const { return fd_; }

 private:
  int fd_ = -1;
  bool created_ = false;
};

const std::vector<std::uint8_t>& keyboard_descriptor();
const std::vector<std::uint8_t>& mouse_descriptor();

}  // namespace guyan::uhid
