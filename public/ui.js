// Presentation only: audio, session lifecycle and invitation tokens stay in their modules.
const $ = id => document.getElementById(id);
const room = Boolean($('setup'));
const icons = {
  home: '<path d="m3 10 9-7 9 7v10H15v-7H9v7H3z"/>',
  history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  settings: '<path d="m9 3-1 3-3 1v4l2 1-2 2 2 4 3-1 2 3 4-2v-3l3-1v-4l-3-1V6l-4-3z"/><circle cx="12" cy="12" r="3"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 6"/>',
  link: '<path d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/>',
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
document.body.classList.add('new-ui', room ? 'room-ui' : 'single-ui');
const main = document.querySelector('main');
if (!room) {
  // Keep the existing select as the session engine's source of truth.
  const select = $('language-pair');
  const buttons = [...document.querySelectorAll('[data-pair]')];
  function syncPair() {
    buttons.forEach(button => {
      button.disabled = select.disabled;
      button.setAttribute('aria-pressed', String(button.dataset.pair === select.value));
    });
  }
  buttons.forEach(button => button.addEventListener('click', () => {
    if (select.disabled || select.value === button.dataset.pair) return;
    select.value = button.dataset.pair;
    select.dispatchEvent(new Event('change'));
  }));
  select.addEventListener('change', syncPair);
  new MutationObserver(syncPair).observe(select, { attributes: true, attributeFilter: ['disabled'] });
  syncPair();
} else {
  const bar = document.createElement('div');
  bar.className = 'app-bar';
  bar.innerHTML = '<a href="/" class="back-link" aria-label="Về trang chủ">‹</a><div><strong id="screen-title">Song Ngữ</strong><small id="screen-subtitle">Nói tự nhiên. Hiểu ngay.</small></div><span class="app-mark">言</span>';
  main.prepend(bar);
  $('screen-title').textContent = 'Phòng gọi hai thiết bị'; $('screen-subtitle').textContent = 'Việt ↔ Trung · Thử nghiệm';
  document.querySelector('.intro h1').innerHTML = 'Ở xa, vẫn<br>hiểu nhau.';
  document.querySelector('.intro p').textContent = 'Tạo phòng và gửi link mời cho người kia để trò chuyện Việt ↔ Trung.';
  const waiting = document.createElement('div'); waiting.className = 'waiting-visual';
  waiting.innerHTML = `<div class="invite-orb">${icon('link')}</div><h2>Chờ người kia tham gia</h2><p>Đã có 1/2 người tham gia</p><small>Cuộc trò chuyện sẵn sàng khi cả hai đã kết nối.</small>`;
  $('invite-panel').before(waiting);
  const history = document.querySelector('.history'); $('call').insertBefore(history, $('call').querySelector('.control-area'));
  const update = () => {
    document.body.classList.toggle('in-call', !$('call').hidden);
    document.body.classList.toggle('is-waiting', !$('call').hidden && ['waiting', 'connecting'].includes(document.body.dataset.phase));
  };
  new MutationObserver(update).observe($('call'), { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['data-phase'] });
  update();
}

// Show the actual processing services before the user starts recording.
fetch('/api/health').then(response => response.ok ? response.json() : null).then(health => {
  if (!health) return;
  const legacyProvider = ['OpenRouter', '9Router'].includes(health.provider) ? health.provider : 'nhà cung cấp AI';
  const message = health.engine === 'hybrid'
    ? health.provider === 'Cloudflare'
      ? 'Âm thanh và văn bản được gửi đến Cloudflare để nhận dạng và dịch; bản dịch được gửi Google để đọc.'
      : `Âm thanh được gửi OpenAI để nhận dạng; văn bản gửi ${legacyProvider} để dịch và Google để đọc.`
    : 'Âm thanh được gửi đến OpenAI để nhận dạng và dịch.';
  document.querySelectorAll('[data-ai-privacy]').forEach(element => {
    element.textContent = `${message} Không lưu bản ghi trên máy chủ.`;
  });
}).catch(() => { /* Keep the generic privacy notice if the service is unreachable. */ });
