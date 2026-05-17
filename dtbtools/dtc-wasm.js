#!/usr/bin/env node

/**
 * dtc-wasm.js - A CLI drop-in replacement for native dtc using WebAssembly
 * 
 * Usage: node dtc-wasm.js -I <dts|dtb> -O <dts|dtb> -o <output> <input> [--quiet]
 */

import { readFileSync, writeFileSync } from 'fs';
import { convert } from './dtc-wrapper.js';

async function main() {
  const args = process.argv.slice(2);
  let inputFormat = null;
  let outputFormat = null;
  let outputFile = null;
  let inputFile = null;
  let quiet = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-I') {
      inputFormat = args[++i];
    } else if (arg === '-O') {
      outputFormat = args[++i];
    } else if (arg === '-o') {
      outputFile = args[++i];
    } else if (arg === '--quiet' || arg === '-q') {
      quiet = true;
    } else if (!arg.startsWith('-')) {
      inputFile = arg;
    }
  }

  if (!inputFile) {
    console.error("DTC WASM CLI Error: No input file specified.");
    process.exit(1);
  }

  try {
    const inputData = readFileSync(inputFile);
    
    // Set target output format using our smart wrapper's outFilename prediction
    const convertOptions = {
      outFilename: outputFile || `out.${outputFormat || 'dts'}`
    };

    // Determine if input is DTS or DTB
    let isInputDts = false;
    if (inputFormat === 'dts') {
      isInputDts = true;
    } else if (inputFormat === 'dtb') {
      isInputDts = false;
    } else {
      // Auto-detect based on file extension or magic number
      const isDtbMagic = inputData.length >= 4 &&
                         inputData[0] === 0xd0 &&
                         inputData[1] === 0x0d &&
                         inputData[2] === 0xfe &&
                         inputData[3] === 0xed;
      isInputDts = !isDtbMagic;
    }

    const convertedInput = isInputDts ? inputData.toString('utf8') : new Uint8Array(inputData);
    const outputData = await convert(convertedInput, convertOptions);

    if (outputFile) {
      if (typeof outputData === 'string') {
        writeFileSync(outputFile, outputData, 'utf8');
      } else {
        writeFileSync(outputFile, outputData);
      }
    } else {
      // Print to standard output
      if (typeof outputData === 'string') {
        process.stdout.write(outputData);
      } else {
        process.stdout.write(Buffer.from(outputData));
      }
    }
  } catch (err) {
    console.error(`DTC WASM CLI Error: ${err.message}`);
    process.exit(1);
  }
}

main();
