#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function logDebug(msg) {
  console.error(`[coree-hook] ${msg}`);
}

function main() {
  try {
    // Read stdin fully and synchronously (file descriptor 0)
    let inputStr = '';
    try {
      inputStr = fs.readFileSync(0, 'utf8');
    } catch (e) {
      logDebug(`Failed to read stdin: ${e.message}`);
    }

    logDebug(`Received stdin input length: ${inputStr.length}`);
    
    let inputJson = {};
    if (inputStr.trim()) {
      try {
        inputJson = JSON.parse(inputStr);
      } catch (e) {
        logDebug(`Failed to parse stdin as JSON: ${e.message}`);
      }
    }

    const transcriptPath = inputJson.transcriptPath;
    const invocationSeq = inputJson.sequenceNumber || inputJson.invocationSequenceNumber || 0;
    
    logDebug(`transcriptPath: ${transcriptPath}, invocationSeq: ${invocationSeq}`);

    let userPrompt = '';
    if (transcriptPath && fs.existsSync(transcriptPath)) {
      const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const step = JSON.parse(lines[i]);
          if (step.type === 'USER_INPUT' && step.content) {
            userPrompt = step.content;
            break;
          }
        } catch (e) {
          // ignore
        }
      }
    }
    
    logDebug(`Extracted userPrompt: "${userPrompt}"`);

    const injectSteps = [];
    const isFirstInvocation = invocationSeq === 0;

    // 1. Run Session Start inject if first invocation
    if (isFirstInvocation) {
      logDebug('Running inject --type session');
      try {
        const sessionOut = execSync('npx --yes @coree-ai/coree@0.14.0 inject --type session', {
          encoding: 'utf8',
          env: process.env
        });
        if (sessionOut.trim()) {
          injectSteps.push({ ephemeralMessage: sessionOut.trim() });
        }
      } catch (e) {
        logDebug(`Session inject failed: ${e.message}`);
      }
    }

    // 2. Run Prompt inject if we have a prompt
    if (userPrompt) {
      logDebug('Running inject --type prompt');
      try {
        const promptJson = JSON.stringify({ prompt: userPrompt });
        const promptOut = execSync('npx --yes @coree-ai/coree@0.14.0 inject --type prompt', {
          input: promptJson,
          encoding: 'utf8',
          env: process.env
        });
        if (promptOut.trim()) {
          injectSteps.push({ ephemeralMessage: promptOut.trim() });
        }
      } catch (e) {
        logDebug(`Prompt inject failed: ${e.message}`);
      }
    }

    // Format output for Antigravity injectSteps
    let outputJson = {};
    if (injectSteps.length > 0) {
      outputJson = { injectSteps };
    }

    const outputStr = JSON.stringify(outputJson);
    logDebug(`Outputting: ${outputStr}`);
    console.log(outputStr);
  } catch (err) {
    logDebug(`Unhandled error in wrapper: ${err.stack}`);
    console.log(JSON.stringify({}));
  }
}

main();
