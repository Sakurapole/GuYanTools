#include "uhid_device.h"

#include <cstring>

#if defined(__ANDROID__)
#include <fcntl.h>
#include <linux/uhid.h>
#include <sys/ioctl.h>
#include <poll.h>
#include <unistd.h>
#endif

namespace guyan::uhid {

namespace {
const std::vector<std::uint8_t> kKeyboard = {
    0x05, 0x01, 0x09, 0x06, 0xa1, 0x01, 0x05, 0x07, 0x19, 0xe0, 0x29, 0xe7, 0x15, 0x00,
    0x25, 0x01, 0x75, 0x01, 0x95, 0x08, 0x81, 0x02, 0x95, 0x01, 0x75, 0x08, 0x81, 0x01,
    0x95, 0x06, 0x75, 0x08, 0x15, 0x00, 0x25, 0x65, 0x05, 0x07, 0x19, 0x00, 0x29, 0x65,
    0x81, 0x00, 0xc0};
const std::vector<std::uint8_t> kMouse = {
    0x05, 0x01, 0x09, 0x02, 0xa1, 0x01, 0x09, 0x01, 0xa1, 0x00, 0x05, 0x09, 0x19, 0x01,
    0x29, 0x05, 0x15, 0x00, 0x25, 0x01, 0x95, 0x05, 0x75, 0x01, 0x81, 0x02, 0x95, 0x01,
    0x75, 0x03, 0x81, 0x01, 0x05, 0x01, 0x09, 0x30, 0x09, 0x31, 0x15, 0x81, 0x25, 0x7f,
    0x75, 0x08, 0x95, 0x02, 0x81, 0x06, 0x09, 0x38, 0x15, 0x81, 0x25, 0x7f, 0x75, 0x08,
    0x95, 0x01, 0x81, 0x06, 0xc0, 0xc0};
}

UhidDevice::~UhidDevice() { destroy(); }

bool UhidDevice::open(const char* path, std::string& error) {
#if defined(__ANDROID__)
  fd_ = ::open(path, O_RDWR | O_CLOEXEC);
  if (fd_ < 0) { error = "UHID_OPEN_FAILED"; return false; }
  return true;
#else
  (void)path;
  error = "UHID_PLATFORM_UNSUPPORTED";
  return false;
#endif
}

bool UhidDevice::create(const std::vector<std::uint8_t>& descriptor, const char* name, std::string& error) {
  if (descriptor.empty() || descriptor.size() > kMaxUhidDataSize || !name || *name == '\0') {
    error = "UHID_CREATE_INVALID";
    return false;
  }
#if defined(__ANDROID__)
  if (fd_ < 0) { error = "UHID_CREATE_FAILED"; return false; }
  uhid_event event{};
  event.type = UHID_CREATE2;
  std::strncpy(reinterpret_cast<char*>(event.u.create2.name), name, sizeof(event.u.create2.name) - 1);
  event.u.create2.rd_size = static_cast<std::uint16_t>(descriptor.size());
  std::memcpy(event.u.create2.rd_data, descriptor.data(), descriptor.size());
  event.u.create2.bus = BUS_USB;
  event.u.create2.vendor = 0x1d50;
  event.u.create2.product = 0x615e;
  event.u.create2.version = 1;
  if (::write(fd_, &event, sizeof(event)) != static_cast<ssize_t>(sizeof(event))) { error = "UHID_CREATE_FAILED"; return false; }
  created_ = true;
  return true;
#else
  (void)descriptor; (void)name;
  error = "UHID_PLATFORM_UNSUPPORTED";
  return false;
#endif
}

bool UhidDevice::wait_for_start(int timeout_ms, std::string& error) {
#if defined(__ANDROID__)
  if (fd_ < 0 || !created_) { error = "UHID_NOT_CREATED"; return false; }
  pollfd pfd{fd_, POLLIN, 0};
  if (::poll(&pfd, 1, timeout_ms) <= 0 || !(pfd.revents & POLLIN)) {
    error = "UHID_START_TIMEOUT";
    return false;
  }
  uhid_event event{};
  if (::read(fd_, &event, sizeof(event)) != static_cast<ssize_t>(sizeof(event))) {
    error = "UHID_DEVICE_ERROR";
    return false;
  }
  if (event.type != UHID_START) { error = "UHID_START_FAILED"; return false; }
  return true;
#else
  (void)timeout_ms;
  error = "UHID_PLATFORM_UNSUPPORTED";
  return false;
#endif
}

bool UhidDevice::check_events(std::string& error) {
#if defined(__ANDROID__)
  if (fd_ < 0) { error = "UHID_DEVICE_ERROR"; return false; }
  pollfd pfd{fd_, POLLIN, 0};
  if (::poll(&pfd, 1, 0) <= 0) return true;
  if (pfd.revents & (POLLERR | POLLHUP | POLLNVAL)) { error = "UHID_DEVICE_ERROR"; return false; }
  if (pfd.revents & POLLIN) {
    uhid_event event{};
    if (::read(fd_, &event, sizeof(event)) != static_cast<ssize_t>(sizeof(event))) {
      error = "UHID_DEVICE_ERROR";
      return false;
    }
    // UHID_STOP is a normal consumer lifecycle event on some Android kernels;
    // keep the virtual device alive so the next report can be delivered.
  }
  return true;
#else
  error = "UHID_PLATFORM_UNSUPPORTED";
  return false;
#endif
}

bool UhidDevice::send_report(const std::uint8_t* report, std::size_t size, std::string& error) {
  if (!report || size == 0 || size > kMaxUhidDataSize) {
    error = "UHID_REPORT_INVALID";
    return false;
  }
#if defined(__ANDROID__)
  if (!ready()) { error = "UHID_NOT_READY"; return false; }
  uhid_event event{};
  event.type = UHID_INPUT2;
  event.u.input2.size = static_cast<std::uint16_t>(size);
  std::memcpy(event.u.input2.data, report, size);
  if (::write(fd_, &event, sizeof(event)) != static_cast<ssize_t>(sizeof(event))) { error = "UHID_WRITE_FAILED"; return false; }
  return true;
#else
  (void)report; (void)size;
  error = "UHID_PLATFORM_UNSUPPORTED";
  return false;
#endif
}

void UhidDevice::destroy() {
#if defined(__ANDROID__)
  if (fd_ >= 0 && created_) { uhid_event event{}; event.type = UHID_DESTROY; (void)::write(fd_, &event, sizeof(event)); }
  if (fd_ >= 0) ::close(fd_);
#endif
  fd_ = -1;
  created_ = false;
}

const std::vector<std::uint8_t>& keyboard_descriptor() { return kKeyboard; }
const std::vector<std::uint8_t>& mouse_descriptor() { return kMouse; }

}  // namespace guyan::uhid
