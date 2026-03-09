import { execFileSync } from 'child_process';
import inquirer from 'inquirer';

/**
 * Runs a git command in the repository directory.
 *
 * @param {string[]} args
 * @param {string} cwd
 * @param {string} safeDirectory
 * @returns {string}
 */
function runGit(args, cwd, safeDirectory) {
  return execFileSync('git', ['-c', `safe.directory=${safeDirectory}`, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

/**
 * Resolves the git repository root from any nested folder.
 *
 * @param {string} startDir
 * @returns {string}
 */
function resolveGitRoot(startDir) {
  return execFileSync('git', ['-c', 'safe.directory=*', 'rev-parse', '--show-toplevel'], {
    cwd: startDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

/**
 * Best-effort startup update flow:
 * 1. Always fetches from `origin`.
 * 2. If local branch is behind its upstream, prompts to update.
 * 3. Pulls with fast-forward only, then asks user to restart and exits.
 *
 * @param {string} repoDir
 * @returns {Promise<boolean>} `true` when app should exit after update.
 */
export async function handleStartupUpdate(repoDir) {
  let gitRoot;
  try {
    gitRoot = resolveGitRoot(repoDir);
  } catch {
    return false;
  }

  try {
    runGit(['fetch', '--quiet', '--prune', 'origin'], gitRoot, gitRoot);
  } catch (error) {
    console.warn(`\nWarning: Could not fetch remote updates. Continuing anyway. (${error.message})`);
    return false;
  }

  let upstreamRef;
  try {
    upstreamRef = runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], gitRoot, gitRoot);
  } catch {
    return false;
  }

  const localHead = runGit(['rev-parse', 'HEAD'], gitRoot, gitRoot);
  const upstreamHead = runGit(['rev-parse', '@{u}'], gitRoot, gitRoot);
  const mergeBase = runGit(['merge-base', 'HEAD', '@{u}'], gitRoot, gitRoot);

  const localIsBehind = localHead === mergeBase && upstreamHead !== localHead;
  if (!localIsBehind) {
    return false;
  }

  const { shouldPullUpdate } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldPullUpdate',
      message: `Updates are available from ${upstreamRef}. Pull latest changes now?`,
      default: true
    }
  ]);

  if (!shouldPullUpdate) {
    return false;
  }

  try {
    runGit(['pull', '--ff-only'], gitRoot, gitRoot);
  } catch (error) {
    console.error(`\nUnable to pull updates automatically: ${error.message}`);
    return false;
  }

  await inquirer.prompt([
    {
      type: 'input',
      name: 'restartAck',
      message: 'Update complete. Please restart the app now. Press Enter to close this run.'
    }
  ]);

  return true;
}
