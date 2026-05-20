import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { copyFile, mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { basename, extname, join, normalize, relative, resolve } from "node:path";
import { Readable } from "node:stream";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const rootDir = process.cwd();
const projectsAssetsDir = resolve(rootDir, "assets", "projects");
const projectsDataFile = resolve(rootDir, "data", "projects.js");
const projectsBackupFile = resolve(rootDir, "data", "projects.backup.js");
const projectsTempFile = resolve(rootDir, "data", "projects.tmp.js");
const port = Number(process.env.PORT || 3000);
const adminCookieName = "mb_admin_auth";
const adminCode = process.env.ADMIN_CODE || "";
const adminSessionSecret = process.env.ADMIN_SESSION_SECRET || randomBytes(32).toString("hex");
const autoGitPush = process.env.AUTO_GIT_PUSH === "true";
const execFileAsync = promisify(execFile);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webm": "video/webm"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { ok: false, error: message });
}

function sendHtml(response, statusCode, html, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(html);
}

function hashValue(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(cookieHeader
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const separatorIndex = item.indexOf("=");
      const key = separatorIndex >= 0 ? item.slice(0, separatorIndex) : item;
      const value = separatorIndex >= 0 ? item.slice(separatorIndex + 1) : "";
      try {
        return [key, decodeURIComponent(value)];
      } catch {
        return [key, ""];
      }
    }));
}

function signAdminSession(value) {
  return `${value}.${hashValue(`${value}:${adminSessionSecret}`)}`;
}

function verifyAdminSession(token = "") {
  const [value, signature] = token.split(".");

  if (!value || !signature) {
    return false;
  }

  return safeEqual(signature, hashValue(`${value}:${adminSessionSecret}`));
}

function isAdminAuthenticated(request) {
  if (process.env.LOCAL_ADMIN_BYPASS === "true" && isLocalRequest(request)) {
    return true;
  }

  const cookies = parseCookies(request.headers.cookie || "");
  return verifyAdminSession(cookies[adminCookieName]);
}

function isLocalRequest(request) {
  const host = String(request.headers.host || "").split(":")[0].toLowerCase();
  const remoteAddress = request.socket.remoteAddress || "";

  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    remoteAddress === "127.0.0.1" ||
    remoteAddress === "::1" ||
    remoteAddress === "::ffff:127.0.0.1"
  );
}

function getCookieSecurity(request) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const isHttps = request.socket.encrypted || forwardedProto === "https";
  return isHttps ? "; Secure" : "";
}

function sendAdminLogin(response, request, message = "") {
  const safeMessage = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  sendHtml(response, 401, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin access - Marcos Bodi</title>
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>
  <main class="admin-auth-page">
    <form class="admin-auth-card" method="post" action="/__admin-login">
      <h1>Admin</h1>
      <label>Access code
        <input name="code" type="password" autocomplete="current-password" autofocus required>
      </label>
      <button type="submit">Enter</button>
      ${safeMessage ? `<p class="admin-auth-error">${safeMessage}</p>` : ""}
    </form>
  </main>
</body>
</html>`, {
    "Set-Cookie": `${adminCookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${getCookieSecurity(request)}`
  });
}

function sendAdminSession(response, request) {
  const sessionToken = signAdminSession("admin");

  response.writeHead(303, {
    "Location": "/admin.html",
    "Set-Cookie": `${adminCookieName}=${encodeURIComponent(sessionToken)}; HttpOnly; SameSite=Strict; Path=/${getCookieSecurity(request)}`
  });
  response.end();
}

function isAdminStaticPath(pathname) {
  return pathname === "/admin.html" || pathname === "/admin" || pathname === "/js/admin.js";
}

function isAdminApiPath(pathname) {
  return pathname.startsWith("/__") && pathname !== "/__admin-login" && pathname !== "/__admin-logout";
}

function isBlockedStaticPath(requestPath) {
  const normalizedPath = requestPath.replace(/\\/g, "/");
  const baseName = basename(normalizedPath);

  return (
    baseName.startsWith(".") ||
    normalizedPath === "/README.md" ||
    normalizedPath === "/package.json" ||
    normalizedPath === "/server.mjs" ||
    normalizedPath.endsWith(".log") ||
    normalizedPath.endsWith(".backup.js") ||
    normalizedPath.endsWith(".tmp.js")
  );
}

function getStaticCacheControl(requestPath) {
  const normalizedPath = requestPath.replace(/\\/g, "/");
  const extension = extname(normalizedPath).toLowerCase();

  if (normalizedPath === "/data/projects.js" || extension === ".html") {
    return "no-store";
  }

  if (normalizedPath.startsWith("/assets/")) {
    return "public, max-age=86400";
  }

  if ([".css", ".js"].includes(extension)) {
    return "public, max-age=3600";
  }

  return "no-store";
}

function cleanSlug(slug) {
  const value = decodeURIComponent(slug || "").trim();

  if (!/^[a-z0-9][a-z0-9-]*$/i.test(value)) {
    throw new Error("Invalid project slug");
  }

  return value;
}

function cleanFileName(fileName) {
  const value = decodeURIComponent(fileName || "").trim();

  if (!value || value.includes("/") || value.includes("\\") || value !== normalize(value)) {
    throw new Error("Invalid file name");
  }

  return value;
}

function safeProjectDir(slug) {
  const dir = resolve(projectsAssetsDir, cleanSlug(slug));
  const scope = relative(projectsAssetsDir, dir);

  if (scope.startsWith("..") || scope === "") {
    throw new Error("Invalid project path");
  }

  return dir;
}

function safeProjectFile(slug, fileName) {
  const dir = safeProjectDir(slug);
  const file = resolve(dir, cleanFileName(fileName));
  const scope = relative(dir, file);

  if (scope.startsWith("..") || scope === "") {
    throw new Error("Invalid asset path");
  }

  return file;
}

async function listProjectFiles(slug) {
  const dir = safeProjectDir(slug);

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return {
      exists: true,
      files: entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { exists: false, files: [] };
    }

    throw error;
  }
}

function getProjectMediaFiles(project) {
  return new Set([
    project?.media?.cover?.file,
    project?.media?.main?.file,
    ...(project?.media?.secondary || []).map((item) => item?.file),
    ...(project?.media?.hidden || []).map((item) => item?.file)
  ].filter(Boolean));
}

function validateProjectsPayload(projects) {
  if (!Array.isArray(projects)) {
    return "Invalid projects data";
  }

  if (!projects.length) {
    return "Refusing to save an empty project list";
  }

  const seenSlugs = new Set();

  for (const project of projects) {
    if (!project?.slug || !/^[a-z0-9][a-z0-9-]*$/i.test(project.slug)) {
      return "Every project needs a valid slug";
    }

    if (seenSlugs.has(project.slug)) {
      return `Duplicate project slug: ${project.slug}`;
    }

    seenSlugs.add(project.slug);

    if (!project?.title) {
      return `Project ${project.slug} needs a title`;
    }

    if (!project?.media?.cover?.file || !project?.media?.main?.file) {
      return `Project ${project.slug} needs cover and main media`;
    }
  }

  return "";
}

async function pruneUnusedProjectAssets(projects) {
  for (const project of projects) {
    if (!project?.slug) {
      continue;
    }

    const usedFiles = getProjectMediaFiles(project);
    const { exists, files } = await listProjectFiles(project.slug);

    if (!exists) {
      continue;
    }

    await Promise.all(files
      .filter((file) => !usedFiles.has(file))
      .map((file) => rm(safeProjectFile(project.slug, file), { force: true })));
  }
}

async function validateProjectAssets(projects) {
  for (const project of projects) {
    const usedFiles = Array.from(getProjectMediaFiles(project));
    const { exists, files } = await listProjectFiles(project.slug);

    if (!exists) {
      return `Missing assets folder for ${project.slug}`;
    }

    const availableFiles = new Set(files);
    const missingFiles = usedFiles.filter((file) => !availableFiles.has(file));

    if (missingFiles.length) {
      return `Project ${project.slug} references missing asset file${missingFiles.length === 1 ? "" : "s"}: ${missingFiles.join(", ")}. Import those files in this project or remove them from its media list.`;
    }
  }

  return "";
}

async function findAssetByName(fileName, preferredSlugs = []) {
  const checkedSlugs = new Set();
  const orderedSlugs = [];

  for (const slug of preferredSlugs) {
    if (slug && !checkedSlugs.has(slug)) {
      checkedSlugs.add(slug);
      orderedSlugs.push(slug);
    }
  }

  const folders = await readdir(projectsAssetsDir, { withFileTypes: true });

  for (const folder of folders) {
    if (folder.isDirectory() && !checkedSlugs.has(folder.name)) {
      checkedSlugs.add(folder.name);
      orderedSlugs.push(folder.name);
    }
  }

  for (const slug of orderedSlugs) {
    const candidate = safeProjectFile(slug, fileName);

    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return "";
}

async function resolveMissingProjectAssets(projects, assetSlugMap = []) {
  const sourceByTargetSlug = new Map();

  if (Array.isArray(assetSlugMap)) {
    for (const item of assetSlugMap) {
      if (item?.to && item?.from) {
        sourceByTargetSlug.set(item.to, item.from);
      }
    }
  }

  for (const project of projects) {
    await mkdir(safeProjectDir(project.slug), { recursive: true });

    const { files } = await listProjectFiles(project.slug);
    const availableFiles = new Set(files);
    const usedFiles = Array.from(getProjectMediaFiles(project));
    const preferredSlugs = [
      sourceByTargetSlug.get(project.slug),
      project.slug
    ].filter(Boolean);

    for (const file of usedFiles) {
      if (availableFiles.has(file)) {
        continue;
      }

      const source = await findAssetByName(file, preferredSlugs);

      if (source) {
        await copyFile(source, safeProjectFile(project.slug, file));
        availableFiles.add(file);
      }
    }
  }
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function mergeProjectDirs(fromDir, toDir) {
  await mkdir(toDir, { recursive: true });

  if (!(await pathExists(fromDir))) {
    return;
  }

  const entries = await readdir(fromDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const target = join(toDir, entry.name);
    await rm(target, { force: true });
    await rename(join(fromDir, entry.name), target);
  }

  await rm(fromDir, { recursive: true, force: true });
}

async function copyProjectDir(fromDir, toDir) {
  await mkdir(toDir, { recursive: true });

  if (!(await pathExists(fromDir))) {
    return;
  }

  const entries = await readdir(fromDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    await copyFile(join(fromDir, entry.name), join(toDir, entry.name));
  }
}

async function prepareProjectAssetFolders(projects, assetSlugMap = []) {
  const finalSlugs = new Set(projects.map((project) => cleanSlug(project.slug)));
  const folderMoves = Array.isArray(assetSlugMap) ? assetSlugMap : [];

  for (const project of projects) {
    await mkdir(safeProjectDir(project.slug), { recursive: true });
  }

  for (const item of folderMoves) {
    if (!item?.from || !item?.to || item.from === item.to) {
      continue;
    }

    const fromSlug = cleanSlug(item.from);
    const toSlug = cleanSlug(item.to);
    const fromDir = safeProjectDir(fromSlug);
    const toDir = safeProjectDir(toSlug);

    if (finalSlugs.has(fromSlug)) {
      await copyProjectDir(fromDir, toDir);
    } else {
      await mergeProjectDirs(fromDir, toDir);
    }
  }
}

async function runGit(args) {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd: rootDir,
    timeout: 120000,
    windowsHide: true
  });

  return `${stdout || ""}${stderr || ""}`.trim();
}

async function publishSavedChanges() {
  if (!autoGitPush) {
    return "";
  }

  await runGit(["rev-parse", "--is-inside-work-tree"]);
  await runGit(["add", "data/projects.js", "assets/projects"]);

  const status = await runGit(["status", "--porcelain", "--", "data/projects.js", "assets/projects"]);

  if (!status) {
    return "No Git changes to publish.";
  }

  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  await runGit(["commit", "-m", `Update portfolio projects ${timestamp}`]);
  await runGit(["push"]);
  return "Changes pushed to Git.";
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function readTextBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function readFormData(request) {
  const protocol = request.socket.encrypted ? "https" : "http";
  const host = request.headers.host || `localhost:${port}`;
  const webRequest = new Request(`${protocol}://${host}${request.url}`, {
    method: request.method,
    headers: request.headers,
    body: Readable.toWeb(request),
    duplex: "half"
  });

  return webRequest.formData();
}

async function serveStatic(request, response, pathname) {
  const requestPath = pathname === "/" ? "/index.html" : pathname;

  if (isBlockedStaticPath(requestPath)) {
    sendError(response, 404, "Not found");
    return;
  }

  const filePath = resolve(rootDir, `.${decodeURIComponent(requestPath)}`);
  const scope = relative(rootDir, filePath);

  if (scope.startsWith("..")) {
    sendError(response, 403, "Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      sendError(response, 404, "Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": fileStat.size,
      "Cache-Control": getStaticCacheControl(requestPath)
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(response, 404, "Not found");
      return;
    }

    sendError(response, 500, "Static file failed");
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || `localhost:${port}`}`);
  const pathname = url.pathname;

  try {
    if (request.method === "GET" && pathname === "/__health") {
      sendJson(response, 200, {
        ok: true,
        adminEnabled: Boolean(adminCode)
      });
      return;
    }

    if (request.method === "POST" && pathname === "/__admin-login") {
      const body = await readTextBody(request);
      const code = new URLSearchParams(body).get("code") || "";

      if (!adminCode) {
        sendAdminLogin(response, request, "Set ADMIN_CODE before using the local admin");
        return;
      }

      if (safeEqual(hashValue(code), hashValue(adminCode))) {
        sendAdminSession(response, request);
        return;
      }

      sendAdminLogin(response, request, "Invalid access code");
      return;
    }

    if (request.method === "GET" && pathname === "/__admin-logout") {
      sendAdminLogin(response, request);
      return;
    }

    if ((isAdminStaticPath(pathname) || isAdminApiPath(pathname)) && !isAdminAuthenticated(request)) {
      if (request.method === "GET" && isAdminStaticPath(pathname)) {
        sendAdminLogin(response, request);
        return;
      }

      sendError(response, 401, "Admin access code required");
      return;
    }

    if (request.method === "GET" && pathname === "/admin") {
      response.writeHead(302, { Location: "/admin.html" });
      response.end();
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/__assets/")) {
      const slug = pathname.replace("/__assets/", "");
      sendJson(response, 200, { ok: true, ...(await listProjectFiles(slug)) });
      return;
    }

    if (request.method === "POST" && pathname.startsWith("/__ensure-project/")) {
      const slug = pathname.replace("/__ensure-project/", "");
      await mkdir(safeProjectDir(slug), { recursive: true });
      sendJson(response, 200, { ok: true, ...(await listProjectFiles(slug)) });
      return;
    }

    if (request.method === "POST" && pathname === "/__rename-project") {
      const { from, to } = await readJsonBody(request);
      const toDir = safeProjectDir(to);
      await mkdir(toDir, { recursive: true });

      try {
        if (from && from !== to) {
          await mergeProjectDirs(safeProjectDir(from), toDir);
        }
      } catch (error) {
        sendJson(response, 200, {
          ok: true,
          warning: error.message,
          ...(await listProjectFiles(to))
        });
        return;
      }

      sendJson(response, 200, { ok: true, ...(await listProjectFiles(to)) });
      return;
    }

    if (request.method === "POST" && pathname.startsWith("/__upload/")) {
      const slug = pathname.replace("/__upload/", "");
      const dir = safeProjectDir(slug);
      const formData = await readFormData(request);
      await mkdir(dir, { recursive: true });

      for (const file of formData.getAll("media")) {
        if (!file?.name) {
          continue;
        }

        const target = safeProjectFile(slug, file.name);
        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(target, buffer);
      }

      sendJson(response, 200, { ok: true, ...(await listProjectFiles(slug)) });
      return;
    }

    if (request.method === "DELETE" && pathname.startsWith("/__asset/")) {
      const parts = pathname.replace("/__asset/", "").split("/");
      const slug = parts.shift();
      const fileName = parts.join("/");
      await rm(safeProjectFile(slug, fileName), { force: true });
      sendJson(response, 200, { ok: true, ...(await listProjectFiles(slug)) });
      return;
    }

    if (request.method === "DELETE" && pathname.startsWith("/__project-assets/")) {
      const slug = pathname.replace("/__project-assets/", "");
      await rm(safeProjectDir(slug), { recursive: true, force: true });
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && pathname === "/__save-projects") {
      const { projects, assetSlugMap } = await readJsonBody(request);

      const payloadError = validateProjectsPayload(projects);

      if (payloadError) {
        sendError(response, 400, payloadError);
        return;
      }

      await prepareProjectAssetFolders(projects, assetSlugMap);
      await resolveMissingProjectAssets(projects, assetSlugMap);

      const assetError = await validateProjectAssets(projects);

      if (assetError) {
        sendError(response, 400, assetError);
        return;
      }

      const nextProjectsFile = `window.PORTFOLIO_PROJECTS = ${JSON.stringify(projects, null, 2)};\n`;

      try {
        await copyFile(projectsDataFile, projectsBackupFile);
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }

      await writeFile(projectsTempFile, nextProjectsFile);
      await rename(projectsTempFile, projectsDataFile);
      await pruneUnusedProjectAssets(projects);

      try {
        const publishMessage = await publishSavedChanges();
        sendJson(response, 200, { ok: true, publishMessage });
      } catch (error) {
        sendJson(response, 200, {
          ok: true,
          warning: `Site saved locally, but Git publish failed: ${error.message}`
        });
      }
      return;
    }

    await serveStatic(request, response, pathname);
  } catch (error) {
    sendError(response, 500, error.message || "Server error");
  }
}

await mkdir(projectsAssetsDir, { recursive: true });

createServer((request, response) => {
  handleRequest(request, response);
}).listen(port, () => {
  console.log(`Portfolio admin running at http://localhost:${port}`);
  console.log(adminCode ? "Admin access enabled" : "Admin access disabled: set ADMIN_CODE to enable it");
  console.log(autoGitPush ? "Auto Git push enabled" : "Auto Git push disabled");
});
