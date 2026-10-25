cmake_minimum_required(VERSION 3.22.1)

project(appmodules LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Build React Native's required app module and all generated autolinking targets.
include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

# Build whisper.cpp as a separate JNI library for LAFINA's offline STT bridge.
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(WHISPER_ALL_WARNINGS OFF CACHE BOOL "" FORCE)
set(GGML_ALL_WARNINGS OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)

# Android debug builds default to unoptimized native code, which makes GGML
# inference unusably slow on-device. Keep symbols while optimizing the native
# Whisper/GGML targets created below.
add_compile_options($<$<CONFIG:Debug>:-O3>)

add_subdirectory(third_party/whisper.cpp whisper-build)

add_library(lafina_whisper SHARED whisper_jni.cc)

target_include_directories(
  lafina_whisper
  PRIVATE
    third_party/whisper.cpp/include
    third_party/whisper.cpp/ggml/include
)

find_library(log-lib log)
find_library(android-lib android)

target_link_libraries(lafina_whisper PRIVATE whisper ${log-lib} ${android-lib})
