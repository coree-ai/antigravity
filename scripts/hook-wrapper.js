#!/usr/bin/env node
const fs = require("fs");
const { spawn } = require("child_process");

const COREE_VERSION = "0.15.0";
const INJECT_TIMEOUT_MS = 115000;

function logDebug(msg) {
	console.error(`[coree-hook] ${msg}`);
}

function runInject(args) {
	return new Promise((resolve) => {
		logDebug(
			`spawn npx @coree-ai/coree@${COREE_VERSION} inject ${args.join(" ")}`,
		);
		const child = spawn(
			"npx",
			["--yes", `@coree-ai/coree@${COREE_VERSION}`, "inject", ...args],
			{
				env: process.env,
				stdio: ["ignore", "pipe", "pipe"],
			},
		);

		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d) => {
			stdout += d;
		});
		child.stderr.on("data", (d) => {
			stderr += d;
		});

		const timer = setTimeout(() => {
			child.unref();
			child.stdout.removeAllListeners();
			child.stderr.removeAllListeners();
			logDebug(
				`inject ${args[0]} timed out after ${INJECT_TIMEOUT_MS}ms; letting npx finish in background`,
			);
			resolve("");
		}, INJECT_TIMEOUT_MS);

		child.on("close", (code) => {
			clearTimeout(timer);
			if (stderr) logDebug(stderr.trim());
			if (code !== 0) {
				logDebug(`inject ${args[0]} exited with code ${code}`);
				resolve("");
			} else {
				resolve(stdout.trim());
			}
		});

		child.on("error", (err) => {
			clearTimeout(timer);
			logDebug(`spawn error for inject ${args[0]}: ${err.message}`);
			resolve("");
		});
	});
}

async function main() {
	try {
		let inputStr = "";
		try {
			inputStr = fs.readFileSync(0, "utf8");
		} catch (_e) {
			// no stdin
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
		const seqNumber =
			inputJson.sequenceNumber ?? inputJson.invocationSequenceNumber;

		logDebug(`transcriptPath: ${transcriptPath}, sequenceNumber: ${seqNumber}`);

		let userPrompt = "";
		if (transcriptPath && fs.existsSync(transcriptPath)) {
			const lines = fs.readFileSync(transcriptPath, "utf8").trim().split("\n");
			for (let i = lines.length - 1; i >= 0; i--) {
				try {
					const step = JSON.parse(lines[i]);
					if (step.type === "USER_INPUT" && step.content) {
						userPrompt = step.content;
						break;
					}
				} catch (_e) {
					// ignore
				}
			}
		}

		logDebug(`Extracted userPrompt: "${userPrompt}"`);

		const injectSteps = [];

		if (seqNumber === 0) {
			logDebug("Running inject --type session");
			const sessionOut = await runInject(["--type", "session"]);
			if (sessionOut) {
				injectSteps.push({ ephemeralMessage: sessionOut });
			}
		} else if (seqNumber == null) {
			logDebug(
				"Skipping session inject: sequenceNumber missing (schema change or parse failure)",
			);
		}

		if (userPrompt) {
			logDebug("Running inject --type prompt");
			const promptOut = await runInject([
				"--type",
				"prompt",
				"--query",
				userPrompt,
			]);
			if (promptOut) {
				injectSteps.push({ ephemeralMessage: promptOut });
			}
		}

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

main().catch((e) => {
	console.error(e);
	console.log("{}");
});
