/**
 * Launches Electron with ELECTRON_RUN_AS_NODE cleared.
 * This variable is set by VS Code (which is itself Electron-based) and causes
 * child Electron processes to run as plain Node.js, breaking all Electron APIs.
 */
const { spawn } = require('child_process');
const path = require('path');

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

const electronPath = require('electron');
const args = [path.join(__dirname, '..'), ...process.argv.slice(2)];

const child = spawn(electronPath, args, { env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code || 0));
