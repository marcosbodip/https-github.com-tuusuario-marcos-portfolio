const form = document.querySelector('#access');
const password = document.querySelector('#password');
const button = form.querySelector('button');
const status = document.querySelector('#status');

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
    if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('Invalid decryption key');
    const bytes = Uint8Array.from(hex.match(/../g), (pair) => Number.parseInt(pair, 16));
    const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt']);
    const html = new TextDecoder().decode(await decrypt(await loadEncrypted('instronic.html'), key));

    status.textContent = 'Cargando la animática…';
    const video = await decrypt(await loadEncrypted('instronic-animatica.mp4'), key);
    const url = URL.createObjectURL(new Blob([video], { type: 'video/mp4' }));
    password.value = '';
    document.open();
    document.write(html.replace('src="/instronic-animatica.mp4"', `src="${url}"`));
    document.close();
  } catch {
    status.textContent = 'No se pudo abrir la propuesta. Vuelve a intentarlo.';
  } finally {
    button.disabled = false;
  }
});
