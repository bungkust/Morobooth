#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const appJsonPath = path.resolve(__dirname, '..', 'apps', 'mobile', 'app.json');

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function getCommitShortSha() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch (error) {
    console.warn('[bumpBundleVersion] Unable to read git commit hash:', error.message);
    return '';
  }
}

function bumpExpoVersion(expoVersion) {
  if (typeof expoVersion !== 'string') {
    return '1.0.0';
  }

  const segments = expoVersion.split('.');
  if (segments.length !== 3 || segments.some((segment) => Number.isNaN(Number(segment)))) {
    return '1.0.0';
  }

  const [major, minor, patch] = segments.map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

function main() {
  if (!fs.existsSync(appJsonPath)) {
    console.error(`[bumpBundleVersion] Cannot find app.json at ${appJsonPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(appJsonPath, 'utf8');
  const appJson = JSON.parse(raw);

  const timestamp = formatTimestamp(new Date());
  const shortSha = getCommitShortSha();
  const newBundleVersion = shortSha ? `${timestamp}-${shortSha}` : timestamp;

  if (!appJson.expo) {
    appJson.expo = {};
  }

  appJson.expo.version = bumpExpoVersion(appJson.expo.version);

  if (!appJson.expo.extra) {
    appJson.expo.extra = {};
  }

  appJson.expo.extra.bundleVersion = newBundleVersion;

  fs.writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`, 'utf8');

  console.log(`[bumpBundleVersion] Set expo.version to ${appJson.expo.version}`);
  console.log(`[bumpBundleVersion] Set extra.bundleVersion to ${newBundleVersion}`);
}

main();

