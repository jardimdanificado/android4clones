/**
 * DTC WebAssembly Wrapper (Cross-platform: Node.js & Browser)
 * 
 * A unified wrapper for the WebAssembly-compiled Device Tree Compiler (DTC).
 * Automatically detects input types (DTS vs. DTB) and compiles/decompiles accordingly.
 * 
 * Credits & Thanks:
 * Special thanks to lcdyk0517 for compiling the original Device Tree Compiler (DTC) to WebAssembly!
 * Original tools and repository: https://github.com/lcdyk0517/lcdyk0517.github.io/blob/main/tools
 */

import createDtcModule from './dtc.js';

let cachedDtc = null;
let stdoutBuffer = [];
let stderrBuffer = [];

/**
 * Initialize the DTC module.
 * In Node.js, it reads the WASM binary from the filesystem.
 * In the Browser, it fetches the WASM binary dynamically.
 * 
 * @param {object} [options] - Options for initialization.
 * @param {Uint8Array} [options.wasmBinary] - Provide the WASM binary directly.
 * @returns {Promise<object>} The initialized Emscripten module.
 */
export async function initDtc(options = {}) {
  if (cachedDtc && !options.forceNew) return cachedDtc;

  let wasmBinary = options.wasmBinary;

  if (!wasmBinary) {
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      // Node.js environment
      // We use split-string dynamic imports to prevent browser bundlers (Vite/Webpack)
      // from attempting to bundle Node's internal modules during browser compilation.
      const fs = await import('f' + 's');
      const path = await import('p' + 'ath');
      const { fileURLToPath } = await import('u' + 'rl');

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const wasmPath = path.join(__dirname, 'dtc.wasm');
      wasmBinary = fs.readFileSync(wasmPath);
    } else {
      // Browser environment
      const wasmUrl = new URL('dtc.wasm', import.meta.url).href;
      const response = await fetch(wasmUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch dtc.wasm from ${wasmUrl}: ${response.statusText}`);
      }
      wasmBinary = new Uint8Array(await response.arrayBuffer());
    }
  }

  // Clear stdout/stderr buffers
  stdoutBuffer = [];
  stderrBuffer = [];

  const dtc = await createDtcModule({
    noInitialRun: true,
    wasmBinary: wasmBinary,
    stdin: () => null,
    print: (text) => stdoutBuffer.push(text),
    printErr: (text) => stderrBuffer.push(text),
  });

  // Ensure /work directory exists in the memory FS
  try {
    dtc.FS.mkdir("/work");
  } catch (e) {
    // Already exists or not needed
  }
  dtc.FS.chdir("/work");

  if (!options.forceNew) {
    cachedDtc = dtc;
  }
  return dtc;
}

/**
 * Detect if the input Uint8Array is a Device Tree Blob (DTB).
 * DTB files have a big-endian magic number 0xd00dfeed.
 * 
 * @param {Uint8Array} u8 - The data to inspect.
 * @returns {boolean} True if it is a DTB, false otherwise.
 */
export function isDTB(u8) {
  if (!(u8 instanceof Uint8Array) && !ArrayBuffer.isView(u8)) return false;
  return u8.length >= 4 &&
         u8[0] === 0xd0 &&
         u8[1] === 0x0d &&
         u8[2] === 0xfe &&
         u8[3] === 0xed;
}

/**
 * Automatically convert Device Tree input (DTS <-> DTB).
 * If the input is DTB, it decompiles to a DTS string.
 * If the input is DTS, it compiles to a DTB Uint8Array.
 * 
 * @param {string|Uint8Array|Buffer|ArrayBuffer} input - DTS string or DTB/DTS binary buffer.
 * @param {object} [options] - Optional custom options.
 * @param {Uint8Array} [options.wasmBinary] - Custom WASM binary buffer to bypass dynamic loading.
 * @returns {Promise<string|Uint8Array>}
 */
export async function convert(input, options = {}) {
  // Always use a fresh instance to avoid C-level global state pollution between runs
  const dtc = await initDtc({ ...options, forceNew: true });

  // Determine if input is DTB or DTS
  let inputIsDtb = false;
  let inputData;

  if (typeof input === 'string') {
    inputIsDtb = false;
    inputData = new TextEncoder().encode(input);
  } else {
    // Treat as buffer/typed array
    const u8 = new Uint8Array(input.buffer || input);
    if (isDTB(u8)) {
      inputIsDtb = true;
      inputData = u8;
    } else {
      // DTS text file loaded as buffer
      inputIsDtb = false;
      inputData = u8;
    }
  }

  // Determine desired output format (default is the opposite of input)
  let outputIsDtb = !inputIsDtb;

  // Predict output format based on target filename extension if provided in options
  const targetPath = options.outFilename || options.output || options.outputName;
  if (targetPath && typeof targetPath === 'string') {
    const ext = targetPath.split('.').pop().toLowerCase();
    if (ext === 'dts') {
      outputIsDtb = false;
    } else if (ext === 'dtb' || ext === 'dtbo') {
      outputIsDtb = true;
    }
  }

  // Clear buffers before execution
  stdoutBuffer = [];
  stderrBuffer = [];

  const inFilename = inputIsDtb ? "in.dtb" : "in.dts";
  const outFilename = outputIsDtb ? "out.dtb" : "out.dts";

  try {
    dtc.FS.unlink(inFilename);
  } catch (e) {}
  try {
    dtc.FS.unlink(outFilename);
  } catch (e) {}

  dtc.FS.writeFile(inFilename, inputData);

  // Execute dtc command line arguments dynamically based on detected formats
  const inputFormat = inputIsDtb ? "dtb" : "dts";
  const outputFormat = outputIsDtb ? "dtb" : "dts";
  const args = ["-I", inputFormat, "-O", outputFormat, "-o", outFilename, inFilename];

  // Call main of the compiler
  try {
    dtc.callMain(args);
  } catch (e) {
    // Emscripten exits with throw ExitStatus which is expected
  }

  // Flush virtual filesystem streams to ensure output files are written
  try {
    if (dtc._fflush) {
      dtc._fflush(0);
    }
  } catch (e) {
    // Ignore flush errors
  }

  // Check if output file was created successfully in the MEMFS
  let stat = null;
  try {
    stat = dtc.FS.stat(outFilename);
  } catch (e) {}

  if (!stat) {
    const errorMsg = stderrBuffer.join('\n') || "Unknown DTC execution error";
    throw new Error(`DTC failed: ${errorMsg}`);
  }

  // Read output from MEMFS
  const outputData = dtc.FS.readFile(outFilename);

  // Clean up MEMFS files to prevent memory buildup
  try {
    dtc.FS.unlink(inFilename);
  } catch (e) {}
  try {
    dtc.FS.unlink(outFilename);
  } catch (e) {}

  if (outputIsDtb) {
    // Compiled/Copied: DTS/DTB -> DTB (Uint8Array)
    return outputData;
  } else {
    // Decompiled/Formatted: DTB/DTS -> DTS (string)
    return new TextDecoder("utf-8").decode(outputData);
  }
}
