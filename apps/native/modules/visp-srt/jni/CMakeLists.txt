cmake_minimum_required(VERSION 3.22)
project(visp_srt_bond LANGUAGES CXX)

if(NOT VISP_SRT_VENDOR_DIR)
  message(FATAL_ERROR "VISP_SRT_VENDOR_DIR is required; run scripts/build-libsrt.sh android")
endif()

add_library(srt SHARED IMPORTED)
set_target_properties(srt PROPERTIES
  IMPORTED_LOCATION "${VISP_SRT_VENDOR_DIR}/android/jniLibs/${ANDROID_ABI}/libsrt.so"
  INTERFACE_INCLUDE_DIRECTORIES "${VISP_SRT_VENDOR_DIR}/include"
)

add_library(visp_srt_bond SHARED bonded_srt.cpp srtla_sender.cpp)
target_compile_features(visp_srt_bond PRIVATE cxx_std_17)
target_compile_options(visp_srt_bond PRIVATE -Wall -Wextra -Werror)
target_link_libraries(visp_srt_bond PRIVATE srt log android)
