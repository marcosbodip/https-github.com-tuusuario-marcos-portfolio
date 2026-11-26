for (const player of document.querySelectorAll('[data-screen-player]')) {
  const video = player.querySelector('video');
  const viewButtons = [...player.querySelectorAll('[data-screen-view]')];
  const picker = player.querySelector('[data-screen-picker]');
  const choices = [...picker.querySelectorAll('[data-screen-choice]')];
  const stage = player.querySelector('.animatic-stage');
  const play = player.querySelector('[data-crop-play]');
  const seek = player.querySelector('[data-crop-seek]');
  const time = player.querySelector('[data-crop-time]');

  function formatTime(seconds) {
    const whole = Math.floor(seconds);
    return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
  }

  function updateControls() {
    const ready = Number.isFinite(video.duration);
    seek.disabled = !ready;
    seek.max = ready ? video.duration : 0;
    seek.value = video.currentTime;
    time.textContent = formatTime(video.currentTime) + (ready ? ' / ' + formatTime(video.duration) : '');
    seek.setAttribute('aria-valuetext', formatTime(video.currentTime));
    play.textContent = video.paused ? 'Reproducir' : 'Pausar';
  }

  function selectScreen(button) {
    const { x, y, width, height } = button.dataset;
    for (const choice of choices) choice.setAttribute('aria-pressed', String(choice === button));
    stage.style.setProperty('--screen-aspect', width / height);
    stage.style.setProperty('--screen-video-width', (5184 / width * 100) + '%');
    stage.style.setProperty('--screen-video-left', (-x / width * 100) + '%');
    stage.style.setProperty('--screen-video-top', (-y / height * 100) + '%');
  }

  for (const choice of choices) choice.addEventListener('click', () => selectScreen(choice));
  selectScreen(choices[0]);

  for (const button of viewButtons) {
    button.addEventListener('click', () => {
      const view = button.dataset.screenView;
      player.classList.toggle('is-cropped', view === 'crop');
      player.classList.toggle('is-isolated', view === 'isolated');
      picker.hidden = view !== 'isolated';
      for (const viewButton of viewButtons) {
        viewButton.setAttribute('aria-pressed', String(viewButton === button));
      }
      updateControls();
    });
  }

  play.addEventListener('click', () => {
    if (!video.hasAttribute('src')) return;
    if (video.paused) void video.play().catch(() => updateControls());
    else video.pause();
  });
  seek.addEventListener('input', () => { video.currentTime = Number(seek.value); });
  for (const event of ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended', 'emptied']) {
    video.addEventListener(event, updateControls);
  }
  updateControls();
}
