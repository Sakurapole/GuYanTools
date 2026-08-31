cmake_minimum_required(VERSION 3.22)
project(guyantools_uhid_service LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

add_library(uhid_protocol STATIC
  src/protocol.cpp
)
target_include_directories(uhid_protocol PUBLIC src)
target_compile_options(uhid_protocol PRIVATE -Wall -Wextra -Werror)

add_executable(guyantools-uhid-service
  src/main.cpp
)
target_link_libraries(guyantools-uhid-service PRIVATE uhid_protocol)
target_compile_options(guyantools-uhid-service PRIVATE -Wall -Wextra -Werror)

if (NOT ANDROID)
  enable_testing()
  add_executable(protocol_tests tests/protocol_tests.cpp)
  target_link_libraries(protocol_tests PRIVATE uhid_protocol)
  target_compile_options(protocol_tests PRIVATE -Wall -Wextra -Werror)
  add_test(NAME protocol_tests COMMAND protocol_tests)
endif()
