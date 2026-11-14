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
    { name: 'AES-GCM', iv: file.subarray(16, 28) },
    key,
    file.subarray(28)
  );
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  status.textContent = 'Abriendo la propuesta…';
  try {
    const page = await loadEncrypted('instronic.html');
    const material = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password.value.trim()), 'PBKDF2', false, ['deriveKey']
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: page.subarray(0, 16), iterations: 600000, hash: 'SHA-256' },
      material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    let html;
    try {
      html = new TextDecoder().decode(await decrypt(page, key));
    } catch (error) {
      if (error.name !== 'OperationError') throw error;
      status.textContent = 'Contraseña incorrecta.';
      password.select();
      return;
    }

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
