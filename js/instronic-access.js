const form = document.querySelector('#access');
const password = document.querySelector('#password');
const button = form.querySelector('button');
const status = document.querySelector('#status');
const sessionKeyName = 'instronic-access-key';

async function loadEncrypted(name) {
  const response = await fetch(`/assets/instronic-private/${name}.enc`);
  if (!response.ok) throw new Error('Could not load encrypted file');
  return new Uint8Array(await response.arrayBuffer());
}

function decrypt(file, key) {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: file.subarray(0, 12) },
    key,
    file.subarray(12)
  );
}

async function mountInstronicStream(video, manifest, read, position, controls) {
  const controller = new AbortController();
  const { signal } = controller;
  const source = new MediaSource();
  const objectUrl = URL.createObjectURL(source);

  function waitFor(target, event) {
    return new Promise((resolve, reject) => {
      const listeners = new AbortController();
      const options = { signal: listeners.signal, once: true };
      const finish = error => {
        listeners.abort();
        signal.removeEventListener('abort', cancelled);
        if (error) reject(error);
        else resolve();
      };
      const cancelled = () => finish(signal.reason);
      signal.addEventListener('abort', cancelled, { once: true });
      target.addEventListener(event, () => finish(), options);
      target.addEventListener('error', () => finish(new Error('Media source error')), options);
    });
  }

  const opened = waitFor(source, 'sourceopen');
  video.src = objectUrl;
  let buffer;
  let busy = false;

  async function editBuffer(action) {
    action();
    await waitFor(buffer, 'updateend');
  }

  async function append(file) {
    const bytes = await read(file, signal);
    signal.throwIfAborted();
    await editBuffer(() => buffer.appendBuffer(bytes));
  }

  async function fill() {
    if (busy || signal.aborted || source.readyState !== 'open') return;
    busy = true;
    try {
      for (;;) {
        const time = Math.min(video.currentTime, manifest.duration - .05);
        const ranges = Array.from({length: buffer.buffered.length}, (_, i) => [buffer.buffered.start(i), buffer.buffered.end(i)]);
        const stale = ranges.find(([start, end]) => end < time - .25 || start > time + 6);
        if (stale && (stale[1] < time - 2 || stale[0] > time + 6)) {
          await editBuffer(() => buffer.remove(...stale));
          continue;
        }
        const current = ranges.find(([start, end]) => start <= time + .06 && end > time);
        const boundary = manifest.segments.findLast(part => part.start < time - 2)?.start ?? 0;
        if (current && boundary > current[0] + .1) {
          await editBuffer(() => buffer.remove(current[0], boundary));
          continue;
        }
        if (current && (video.paused && !video.seeking || current[1] >= time + 4 || current[1] >= manifest.duration - .06)) break;
        const target = current ? current[1] + .055 : time;
        const segment = manifest.segments.find(part => part.end > target);
        if (!segment) break;
        if (current && segment.end < current[1] + .08) break;
        await append(segment.file);
      }
      controls.status.textContent = '';
    } catch (error) {
      if (!signal.aborted) {
        console.warn('Instronic stream stopped', error.message);
        controls.onError();
      }
    } finally {
      busy = false;
    }
  }

  function release() {
    controller.abort();
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }

  try {
    await opened;
    buffer = source.addSourceBuffer(manifest.type);
    await append(manifest.init);
    source.duration = manifest.duration;
    const initial = manifest.segments.find(part => part.end > position) || manifest.segments[0];
    await append(initial.file);
    if (position) video.currentTime = position;
    for (const event of ['timeupdate', 'play', 'waiting', 'seeking']) {
      video.addEventListener(event, () => void fill(), {signal});
    }
    return release;
  } catch (error) {
    release();
    throw error;
  }
}

async function showProposalVideo(key, masters) {
  if (document.readyState === 'loading') {
    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, {once:true}));
  }
  let releaseActive;
  let loading = false;
  const videos = [...document.querySelectorAll('video[data-encrypted-video]')];
  const triggers = videos.map(video => video.closest('figure').querySelector('[data-video-load]'));
  const positions = videos.map(() => 0);

  function install(index, startPlaying) {
    const video = videos[index];
    const message = video.closest('figure').querySelector('[data-video-status]');
    const manifest = masters.index[index];
    if (loading || video.hasAttribute('src')) return;
    if (!window.MediaSource?.isTypeSupported(manifest.type)) {
      message.textContent = 'Este navegador no puede abrir el máster fragmentado. Prueba Chrome o Edge.';
      return;
    }
    loading = true;
    releaseActive?.();
    releaseActive = undefined;
    for (const trigger of triggers) trigger.disabled = true;
    if (startPlaying) message.textContent = 'Cargando vídeo…';
    void mountInstronicStream(video, manifest, masters.read, positions[index], {
      status:message,
      onError() {
        releaseActive?.();
        releaseActive = undefined;
        message.textContent = 'No se pudo cargar este tramo. Pulsa Reproducir para reintentar.';
      }
    }).then(release => {
      releaseActive = () => { positions[index] = video.currentTime; release(); };
      message.textContent = '';
      if (startPlaying) void video.play().catch(() => {});
    }).catch(error => {
      console.warn('Instronic stream failed to start', error.message);
      message.textContent = 'No se pudo abrir el vídeo. Pulsa Reproducir para reintentar.';
    }).finally(() => {
      loading = false;
      for (const trigger of triggers) trigger.disabled = false;
    });
  }

  for (const [index, trigger] of triggers.entries()) {
    trigger.addEventListener('click', () => install(index, true));
  }
  install(0, false);
}

async function prepareMasters(key) {
  const response = await fetch('/instronic-master-index.json');
  if (!response.ok) throw new Error('Master index unavailable');
  const index = await response.json();
  const pending = new Map();
  const download = async (file, signal) => {
    const response = await fetch('/instronic-media/' + file + '.enc', {signal});
    if (!response.ok) throw new Error('Master fragment unavailable');
    return decrypt(new Uint8Array(await response.arrayBuffer()), key);
  };
  for (const file of [index[0].init, index[0].segments[0].file]) {
    const task = download(file);
    pending.set(file, task);
    void task.catch(() => {});
  }
  await Promise.race([
    Promise.allSettled(pending.values()),
    new Promise(resolve => setTimeout(resolve, 3000)),
  ]);
  return {
    index,
    async read(file, signal) {
      if (!pending.has(file)) return download(file, signal);
      const task = pending.get(file);
      pending.delete(file);
      try { return await task; }
      catch { return download(file, signal); }
    }
  };
}

async function openProposal(hex) {
  if (typeof hex !== 'string' || !/^[0-9a-f]{64}$/i.test(hex)) throw new Error('Invalid decryption key');
  const bytes = Uint8Array.from(hex.match(/../g), (pair) => Number.parseInt(pair, 16));
  const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt']);
  const [html, masters] = await Promise.all([
    loadEncrypted('instronic.html').then(file => decrypt(file, key)).then(bytes => new TextDecoder().decode(bytes)),
    prepareMasters(key),
  ]);
  try {
    sessionStorage.setItem(sessionKeyName, hex);
  } catch {
    // Access still works when the browser disables storage.
  }
  password.value = '';
  document.open();
  document.write(html);
  document.close();
  void showProposalVideo(key, masters);
}

function setAccessLoading(loading) {
  button.disabled = loading;
  password.readOnly = loading;
  if (loading) status.textContent = 'Abriendo la entrega…';
}

async function restoreAccess() {
  let savedKey;
  try {
    savedKey = sessionStorage.getItem(sessionKeyName);
  } catch {
    return;
  }
  if (!savedKey) return;
  setAccessLoading(true);
  try {
    await openProposal(savedKey);
  } catch {
    try { sessionStorage.removeItem(sessionKeyName); } catch {}
    status.textContent = '';
  } finally {
    setAccessLoading(false);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  let navigating = false;
  setAccessLoading(true);
  try {
    const response = await fetch('/api/instronic-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value.trim() })
    });
    if (response.status === 401) {
      status.textContent = 'Contraseña incorrecta.';
      password.select();
      return;
    }
    if (!response.ok) throw new Error('Access service unavailable');
    const { key: hex } = await response.json();
    if (typeof hex !== 'string' || !/^[0-9a-f]{64}$/i.test(hex)) throw new Error('Invalid decryption key');
    try {
      sessionStorage.setItem(sessionKeyName, hex);
      password.value = '';
      window.location.reload();
      navigating = true;
      return;
    } catch {
      // Keep access available if this browser blocks session storage.
    }
    await openProposal(hex);
  } catch {
    status.textContent = 'No se pudo abrir la entrega. Vuelve a intentarlo.';
  } finally {
    if (!navigating) setAccessLoading(false);
  }
});

void restoreAccess();
