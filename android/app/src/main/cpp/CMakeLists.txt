cmake_minimum_required(VERSION 3.22.1)

# Windows Ninja still limits generated object paths even when long paths are
# enabled in the OS. Hash long source paths before React Native adds its targets.
if(CMAKE_HOST_WIN32)
  set(CMAKE_OBJECT_PATH_MAX 250)
endif()

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

# Build llama.cpp as a separate JNI library for LAFINA's on-device NLU bridge
# without colliding with whisper.cpp's vendored ggml CMake target.
set(LLAMA_CPP_DIR "${CMAKE_CURRENT_SOURCE_DIR}/third_party/llama.cpp")
set(LLAMA_GGML_SRC "${LLAMA_CPP_DIR}/ggml/src")
set(LLAMA_SRC "${LLAMA_CPP_DIR}/src")

file(GLOB LLAMA_GGML_CPU_SOURCES CONFIGURE_DEPENDS
  "${LLAMA_GGML_SRC}/ggml-cpu/*.c"
  "${LLAMA_GGML_SRC}/ggml-cpu/*.cpp"
  "${LLAMA_GGML_SRC}/ggml-cpu/amx/*.cpp"
  "${LLAMA_GGML_SRC}/ggml-cpu/tiled/*.cpp"
)
list(FILTER LLAMA_GGML_CPU_SOURCES EXCLUDE REGEX "/hbm\\.cpp$")

if(ANDROID_ABI STREQUAL "arm64-v8a")
  list(APPEND LLAMA_GGML_CPU_SOURCES
    "${LLAMA_GGML_SRC}/ggml-cpu/arch/arm/quants.c"
    "${LLAMA_GGML_SRC}/ggml-cpu/arch/arm/repack.cpp"
  )
  set(LLAMA_ARCH_FLAGS -march=armv8-a)
elseif(ANDROID_ABI STREQUAL "x86_64")
  list(APPEND LLAMA_GGML_CPU_SOURCES
    "${LLAMA_GGML_SRC}/ggml-cpu/arch/x86/quants.c"
    "${LLAMA_GGML_SRC}/ggml-cpu/arch/x86/repack.cpp"
  )
  set(LLAMA_ARCH_FLAGS -march=x86-64 -mtune=generic -msse4.2 -mpopcnt)
else()
  set(LLAMA_ARCH_FLAGS -DGGML_CPU_GENERIC)
endif()

set(LLAMA_GGML_SOURCES
  "${LLAMA_GGML_SRC}/ggml.c"
  "${LLAMA_GGML_SRC}/ggml-alloc.c"
  "${LLAMA_GGML_SRC}/ggml-backend.cpp"
  "${LLAMA_GGML_SRC}/ggml-backend-dl.cpp"
  "${LLAMA_GGML_SRC}/ggml-backend-meta.cpp"
  "${LLAMA_GGML_SRC}/ggml-backend-reg.cpp"
  "${LLAMA_GGML_SRC}/ggml-opt.cpp"
  "${LLAMA_GGML_SRC}/ggml-threading.cpp"
  "${LLAMA_GGML_SRC}/ggml-quants.c"
  "${LLAMA_GGML_SRC}/gguf.cpp"
  ${LLAMA_GGML_CPU_SOURCES}
)

file(GLOB LLAMA_CORE_SOURCES CONFIGURE_DEPENDS "${LLAMA_SRC}/*.cpp")
list(FILTER LLAMA_CORE_SOURCES EXCLUDE REGEX "/llama-quant\\.cpp$")
file(GLOB LLAMA_MODEL_SOURCES CONFIGURE_DEPENDS "${LLAMA_SRC}/models/*.cpp")

add_library(
  lafina_llama
  SHARED
  llama_jni.cc
  ${LLAMA_GGML_SOURCES}
  ${LLAMA_CORE_SOURCES}
  ${LLAMA_MODEL_SOURCES}
)

set_target_properties(
  lafina_llama
  PROPERTIES
    C_STANDARD 11
    C_STANDARD_REQUIRED ON
    CXX_STANDARD 17
    CXX_STANDARD_REQUIRED ON
    POSITION_INDEPENDENT_CODE ON
    C_VISIBILITY_PRESET hidden
    CXX_VISIBILITY_PRESET hidden
    VISIBILITY_INLINES_HIDDEN ON
    UNITY_BUILD ON
    UNITY_BUILD_BATCH_SIZE 16
)

set_source_files_properties(
  llama_jni.cc
  ${LLAMA_GGML_SOURCES}
  ${LLAMA_CORE_SOURCES}
  PROPERTIES
    SKIP_UNITY_BUILD_INCLUSION ON
)

target_include_directories(
  lafina_llama
  PRIVATE
    "${LLAMA_CPP_DIR}/include"
    "${LLAMA_SRC}"
    "${LLAMA_CPP_DIR}/ggml/include"
    "${LLAMA_GGML_SRC}"
    "${LLAMA_GGML_SRC}/ggml-cpu"
)

target_compile_options(
  lafina_llama
  PRIVATE
    -O3
    -DNDEBUG
    -DGGML_USE_CPU
    -DGGML_USE_CPU_REPACK
    -D_GNU_SOURCE
    -pthread
    -ffunction-sections
    -fdata-sections
    ${LLAMA_ARCH_FLAGS}
)

target_link_options(
  lafina_llama
  PRIVATE
    -Wl,--gc-sections
    -Wl,-Bsymbolic
    -Wl,--exclude-libs,ALL
    -Wl,-z,max-page-size=16384
)

target_link_libraries(lafina_llama PRIVATE ${log-lib} ${android-lib} dl m)
