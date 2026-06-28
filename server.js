const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const BACKEND_URL = process.env.XIAGUO_BACKEND_URL || "http://127.0.0.1:8787";
const STATIC_INDEX = path.join(ROOT, "index.html");

function send(res, status, payload, type = "application/json;charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS"
  });
  res.end(Buffer.isBuffer(payload) || typeof payload === "string" ? payload : JSON.stringify(payload));
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html;charset=utf-8",
    ".js": "text/javascript;charset=utf-8",
    ".css": "text/css;charset=utf-8",
    ".json": "application/json;charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".md": "text/markdown;charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2"
  }[ext] || "application/octet-stream";
}

function isStaticPath(pathname) {
  return !pathname.startsWith("/api/");
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function proxyToBackend(req, res, pathname) {
  const url = new URL(req.url, BACKEND_URL);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      headers.set(key, value.join(","));
    } else {
      headers.set(key, value);
    }
  }
  headers.delete("host");

  const init = {
    method: req.method,
    headers
  };

  if (!["GET", "HEAD", "OPTIONS"].includes(req.method || "GET")) {
    init.body = await readRequestBody(req);
  }

  const backendResponse = await fetch(url, init);
  const body = Buffer.from(await backendResponse.arrayBuffer());
  const responseHeaders = {};
  backendResponse.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  res.writeHead(backendResponse.status, responseHeaders);
  res.end(body);
}

function serveStatic(req, res, pathname) {
  const candidate = pathname === "/" ? STATIC_INDEX : path.join(ROOT, pathname);
  const resolved = path.resolve(candidate);
  if (!resolved.startsWith(ROOT)) {
    return send(res, 403, { error: "forbidden" });
  }
  fs.readFile(resolved, (error, data) => {
    if (error) {
      if (pathname !== "/") return send(res, 404, "Not found", "text/plain;charset=utf-8");
      fs.readFile(STATIC_INDEX, (indexError, indexData) => {
        if (indexError) return send(res, 404, "Not found", "text/plain;charset=utf-8");
        send(res, 200, indexData, contentTypeFor(STATIC_INDEX));
      });
      return;
    }
    send(res, 200, data, contentTypeFor(resolved));
  });
}

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return send(res, 204, "");
  }
  const requestUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = requestUrl.pathname;
  try {
    if (pathname.startsWith("/api/")) {
      return await proxyToBackend(req, res, pathname);
    }
    return serveStatic(req, res, pathname);
  } catch (error) {
    console.error("Request failed:", error);
    return send(res, 502, { error: String(error.message || error) });
  }
}).listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
  console.log(`Xiaguo frontend server running at http://${displayHost}:${PORT}`);
  console.log(`Proxying API requests to ${BACKEND_URL}`);
});
