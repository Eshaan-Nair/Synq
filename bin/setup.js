#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const REPO_URL = 'https://github.com/Eshaan-Nair/Glia-AI.git';

console.log(`
 ===================================
   GLIA v1.4.7 - Initializer
 ===================================
`);

function ask(question, defaultVal) {
  return new Promise((resolve) => {
    rl.question(`${question} (${defaultVal}): `, (answer) => {
      resolve(answer || defaultVal);
    });
  });
}

async function run() {
  const parentDir = await ask('Where should we install Glia? (press Enter for current folder)', '.');
  const targetDirName = 'Glia-AI';
  const fullPath = path.resolve(process.cwd(), parentDir, targetDirName);

  if (fs.existsSync(fullPath)) {
    console.log(`\n [!] Folder "${fullPath}" already exists. Please delete it or choose a different location.`);
    process.exit(1);
  }

  console.log(`\n [*] Cloning Glia into ${fullPath}...`);

  const clone = spawn('git', ['clone', REPO_URL, fullPath], { stdio: 'inherit' });

  clone.on('close', (code) => {
    if (code !== 0) {
      console.error('\n [!] Failed to clone repository. Is Git installed?');
      process.exit(1);
    }

    console.log('\n [*] Repository cloned successfully.');
    console.log(' [*] Starting interactive installer...\n');

    const isWindows = process.platform === 'win32';
    const installerCmd = isWindows ? 'install.bat' : './install.sh';
    const shell = isWindows ? true : false;

    // Change working directory to the cloned repo
    const installer = spawn(installerCmd, [], {
      cwd: fullPath,
      stdio: 'inherit',
      shell: shell
    });

    installer.on('close', (code) => {
      if (code === 0) {
        console.log('\n [OK] Setup complete!');
      } else {
        console.log('\n [!] Setup exited with code ' + code);
      }
      process.exit(code);
    });
  });
}

run();
