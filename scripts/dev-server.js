const { spawn } = require("node:child_process");

const PYTHON = process.env.PYTHON || "python";
const NODE = process.execPath;
const BACKEND_PORT = process.env.BACKEND_PORT || "8787";

function startProcess(command, args, name) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
    env: process.env
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`${name} exited with signal ${signal}`);
    } else {
      console.log(`${name} exited with code ${code}`);
    }
  });
  return child;
}

async function waitForBackend(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Backend did not become ready at ${url}`);
}

async function main() {
  let backend = null;
  let proxy = null;

  const shutdown = async () => {
    if (proxy && !proxy.killed) proxy.kill();
    if (backend && !backend.killed) backend.kill();
  };

  process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
  process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

  backend = startProcess(PYTHON, ["-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", BACKEND_PORT], "backend");
  await waitForBackend(`http://127.0.0.1:${BACKEND_PORT}/api/health`);
  proxy = startProcess(NODE, ["server.js"], "proxy");

  backend.on("exit", (code) => {
    if (proxy && !proxy.killed) proxy.kill();
    process.exit(code ?? 0);
  });
  proxy.on("exit", (code) => {
    if (backend && !backend.killed) backend.kill();
    process.exit(code ?? 0);
  });

  console.log("Xiaguo stack ready on http://127.0.0.1:3000");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

