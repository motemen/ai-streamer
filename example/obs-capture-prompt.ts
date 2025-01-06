import { Command } from "commander";
import OBSWebSocket from "obs-websocket-js";

const program = new Command();

program
  .requiredOption("--obs-url <url>", "OBS WebSocket URL")
  .option("--obs-password <password>", "OBS WebSocket password")
  .requiredOption("--source-name <name>", "OBS source name")
  .requiredOption("--prompt <prompt>", "Prompt for the AI")
  .option("--wait-milliseconds <ms>", "Wait time in milliseconds", "1000")
  .requiredOption("--server-url <url>", "Server URL for the API");

program.parse(process.argv);

const options = program.opts();

async function startOBSCapture() {
  const obs = new OBSWebSocket();
  await obs.connect(options.obsUrl, options.obsPassword);

  while (true) {
    await new Promise((resolve) =>
      setTimeout(resolve, parseInt(options.waitMilliseconds))
    );

    try {
      const resp = await obs.call("GetSourceScreenshot", {
        sourceName: options.sourceName,
        imageWidth: 480,
        imageFormat: "png",
      });

      const response = await fetch(`${options.serverUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: options.prompt,
          imageURL: resp.imageData, // "data:image/png;base64,..."
        }),
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
    } catch (err) {
      console.error("GetSourceScreenshot", err);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

startOBSCapture().catch((err) => {
  console.error("Failed to start OBS capture", err);
  process.exit(1);
});
