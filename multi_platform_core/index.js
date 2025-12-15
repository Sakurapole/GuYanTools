const { existsSync, readFileSync } = require('fs')
const { join } = require('path')
 
const { platform, arch } = process
 
let nativeBinding = null
let localFileExisted = false
let isMusl = false
let loadError = null
 
switch (platform) {
  case 'win32':
    switch (arch) {
      case 'x64':
        localFileExisted = existsSync(join(__dirname, 'multi-platform-core.win32-x64-msvc.node'))
        try {
          if (localFileExisted) {
            nativeBinding = require('./multi-platform-core.win32-x64-msvc.node')
          } else {
            nativeBinding = require('multi-platform-core.win32-x64-msvc.node')
          }
        } catch (e) {
          loadError = e
        }
        break
      case 'arm64':
        localFileExisted = existsSync(join(__dirname, 'multi-platform-core.win32-arm64-msvc.node'))
        try {
          if (localFileExisted) {
            nativeBinding = require('./multi-platform-core.win32-arm64-msvc.node')
          } else {
            nativeBinding = require('multi-platform-core.win32-arm64-msvc.node')
          }
        } catch (e) {
          loadError = e
        }
        break
      default:
        throw new Error(`Unsupported architecture on macOS: ${arch}`)
    }
    break
  default:
    throw new Error(`Unsupported OS: ${platform}, architecture: ${arch}`)
}

if (!nativeBinding) {
  if (loadError) {
    throw loadError
  }
  throw new Error(`Failed to load native binding`)
}

const { JsDatabase } = nativeBinding;

// 同时支持 CommonJS 和 ES Module
module.exports = { JsDatabase };
module.exports.Database = JsDatabase;
module.exports.default = { JsDatabase };
