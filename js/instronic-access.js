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

async function showProposalVideo(key) {
  if (document.readyState === 'loading') {
    await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }
  const video = document.querySelector('.proposal-media video');
  const message = document.querySelector('#proposal-video-status');
  message.textContent = ' · Cargando vídeo…';
  try {
    const isPhone = matchMedia('(max-width: 699px), (max-width: 1000px) and (max-height: 600px) and (orientation: landscape)').matches;
    const file = isPhone ? 'instronic-final-mobile.mp4' : 'instronic-final.mp4';
    const bytes = await decrypt(await loadEncrypted(file), key);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
    video.addEventListener('loadedmetadata', () => { message.textContent = ''; }, { once: true });
    video.addEventListener('error', () => { message.textContent = ' · No se pudo reproducir el vídeo.'; }, { once: true });
    video.src = url;
    void video.play().catch(() => {});
  } catch {
    message.textContent = ' · No se pudo cargar el vídeo. Recarga la página para intentarlo de nuevo.';
  }
}

async function openProposal(hex) {
  if (typeof hex !== 'string' || !/^[0-9a-f]{64}$/i.test(hex)) throw new Error('Invalid decryption key');
  const bytes = Uint8Array.from(hex.match(/../g), (pair) => Number.parseInt(pair, 16));
  const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt']);
  const html = new TextDecoder().decode(await decrypt(await loadEncrypted('instronic.html'), key));
  try {
    sessionStorage.setItem(sessionKeyName, hex);
  } catch {
    // Access still works when the browser disables storage.
  }
  password.value = '';
  document.open();
  document.write(html);
  document.close();
  void showProposalVideo(key);
}

async function restoreAccess() {
  let savedKey;
  try {
    savedKey = sessionStorage.getItem(sessionKeyName);
  } catch {
    return;
  }
  if (!savedKey) return;
  form.hidden = true;
  try {
    await openProposal(savedKey);
  } catch {
    try { sessionStorage.removeItem(sessionKeyName); } catch {}
    form.hidden = false;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  status.textContent = 'Abriendo la propuesta…';
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
    // Open through the same document-load path as a refresh after authentication.
    try {
      sessionStorage.setItem(sessionKeyName, hex);
      window.location.reload();
      return;
    } catch {
      // Browsers with storage disabled can still open the proposal directly.
    }
    await openProposal(hex);
  } catch {
    status.textContent = 'No se pudo abrir la propuesta. Vuelve a intentarlo.';
  } finally {
    button.disabled = false;
  }
});

void restoreAccess();
