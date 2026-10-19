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
const bar = document.createElement('div');
bar.className = 'app-bar';
bar.innerHTML = '<a href="/" class="back-link" aria-label="Về trang chủ">‹</a><div><strong id="screen-title">Song Ngữ</strong><small id="screen-subtitle">Nói tự nhiên. Hiểu ngay.</small></div><span class="app-mark">言</span>';
main.prepend(bar);

if (!room) {
  const home = document.createElement('section');
  home.id = 'home-view';
  home.innerHTML = `<div class="home-heading"><span class="eyebrow">SONG NGỮ · KẾT NỐI MỖI NGÀY</span><h1>Dịch giọng nói<br>hai chiều</h1><p>Nói tự nhiên. Hiểu ngay.<br>Kết nối không rào cản ngôn ngữ.</p></div>
    <div class="hello-art" aria-hidden="true"><span class="hello vi">Xin chào!</span><span class="hello zh">你好!</span><span class="hello en">Hello!</span><div class="voice-orb">${icon('mic')}</div><span class="art-caption">Một lời chào. Thêm gần nhau.</span></div>
    <div class="mode-options"><button id="choose-single" class="mode-card"><span class="mode-icon">${icon('people')}</span><span><strong>Dùng chung một thiết bị</strong><small>Hai người nói luân phiên<br>trên cùng một điện thoại</small></span><b aria-hidden="true">›</b></button>
    <a href="/room" class="mode-card"><span class="mode-icon">${icon('link')}</span><span><strong>Phòng gọi hai thiết bị</strong><small><span class="beta">Thử nghiệm</span> · Gửi link mời<br>để trò chuyện từ xa</small></span><b aria-hidden="true">›</b></a></div>`;
  bar.after(home);
  const choices = document.createElement('section'); choices.id = 'choice-view';
  choices.innerHTML = '<h1>Dùng chung một thiết bị</h1><p>Chọn ngôn ngữ để bắt đầu</p><div class="pair-options" role="group" aria-label="Cặp ngôn ngữ"><button class="pair-card" data-pair="vi-zh" aria-pressed="true"><span class="flags">🇻🇳 <i>↔</i> 🇨🇳</span><strong>Việt ↔ Trung</strong><small>Dịch hai chiều, tự nhận diện</small><span class="radio-mark"></span></button><button class="pair-card" data-pair="vi-en" aria-pressed="false"><span class="flags">🇻🇳 <i>↔</i> 🇬🇧</span><strong>Việt ↔ Anh</strong><small>Dịch hai chiều, tự nhận diện</small><span class="radio-mark"></span></button></div><p class="permission-note">Khi bắt đầu, ứng dụng sẽ xin quyền micro. Âm thanh gửi OpenAI; chế độ hybrid gửi văn bản đến 9Router để dịch và Google để đọc.</p><button id="begin-conversation" class="primary-action">Bắt đầu</button>';
  home.after(choices);
  choices.querySelectorAll('.flags').forEach((flags, index) => {
    flags.innerHTML = `<span class="flag vn" aria-label="Việt Nam">★</span><i aria-hidden="true">↔</i><span class="flag ${index ? 'uk' : 'cn'}" aria-label="${index ? 'Anh' : 'Trung Quốc'}">${index ? '✚' : '★'}</span>`;
  });
  const nav = document.createElement('nav'); nav.className = 'bottom-nav'; nav.setAttribute('aria-label', 'Điều hướng chính');
  nav.innerHTML = ['home', 'history', 'settings'].map((name, i) => `<button data-view="${name}">${icon(name)}<span>${['Trang chủ', 'Lịch sử', 'Cài đặt'][i]}</span></button>`).join('');
  main.append(nav);
  document.querySelector('.history').id = 'history-view';
  const clearHistory = document.createElement('button'); clearHistory.className = 'delete-history'; clearHistory.textContent = 'Xóa toàn bộ nội dung';
  clearHistory.addEventListener('click', () => { if (!$('clear').disabled && confirm('Xóa nội dung cuộc trò chuyện trong phiên này?')) $('clear').click(); });
  $('history-view').append(clearHistory);
  const titles = { home: ['Song Ngữ', 'Nói tự nhiên. Hiểu ngay.'], choice: ['', ''], conversation: ['Trò chuyện', 'Việt ↔ Trung'], history: ['Lịch sử phiên', 'Chỉ lưu trong tab này'], settings: ['Cài đặt', 'Phù hợp với không gian của bạn'] };
  function show(view) {
    // Leaving the microphone screen must never leave an invisible recording running.
    if (view !== 'conversation' && $('language-pair').disabled) $('start').click();
    document.body.dataset.view = view;
    for (const [id, key] of [['home-view', 'home'], ['choice-view', 'choice'], ['translator-workspace', 'conversation'], ['history-view', 'history'], ['settings', 'settings']]) $(id).hidden = view !== key;
    $('screen-title').textContent = titles[view][0];
    $('screen-subtitle').textContent = view === 'conversation' ? $('language-pair').selectedOptions[0].textContent : titles[view][1];
    nav.querySelectorAll('button').forEach(button => button.setAttribute('aria-current', button.dataset.view === view ? 'page' : 'false'));
    clearHistory.disabled = $('clear').disabled;
    window.scrollTo(0, 0);
  }
  nav.addEventListener('click', event => { const button = event.target.closest('[data-view]'); if (button) show(button.dataset.view); });
  bar.querySelector('a').addEventListener('click', event => { event.preventDefault(); show('home'); });
  $('choose-single').addEventListener('click', () => show($('language-pair').disabled ? 'conversation' : 'choice'));
  choices.querySelectorAll('[data-pair]').forEach(button => button.addEventListener('click', () => {
    if ($('language-pair').disabled) return;
    $('language-pair').value = button.dataset.pair; $('language-pair').dispatchEvent(new Event('change'));
    choices.querySelectorAll('[data-pair]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  }));
  $('begin-conversation').addEventListener('click', () => { show('conversation'); if (!$('language-pair').disabled) $('start').click(); });
  // Notices remain visible even when the user is on another screen.
  main.insertBefore($('notice'), nav);
  show('home');
} else {
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
