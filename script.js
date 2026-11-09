/* ============================================================
   TIẾT KIỆM TIỀN - Made in VN 🇻🇳 by Nguyễn Chí Dự (HRGBVNGM)
   v2: Ví điện tử · Nhiều quỹ (10) · Avatar · Giờ VN · MK mạnh
   ============================================================ */
'use strict';

/* ---------- Helpers ---------- */
const $ = id => document.getElementById(id);
const fmt = n => (n || 0).toLocaleString('vi-VN') + ' ₫';
const nowMs = () => Date.now();
const dayMs = 86400000;
const pad = n => String(n).padStart(2, '0');
const fmtTime = ms => { const d = new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtDate = ms => { const d = new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const parseDate = s => new Date(s + 'T00:00:00').getTime();
const uid = () => Math.random().toString(36).slice(2, 9);
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const GOAL_ICONS = { 'Mua thứ cần thiết':'🛒','Mua điện thoại':'📱','Mua đồ cần thiết':'👕','Mua laptop':'💻','Du lịch':'✈️','Học phí / khóa học':'📚','Dự phòng khẩn cấp':'🛡️','Mua xe máy':'🏍️','Mục tiêu tự do':'⭐' };
const MAX_FUNDS = 10;

/* ---------- Storage ---------- */
const LSK = {
  USERS: 'tk_users',
  SESSION: 'tk_session',
  dataKey: u => 'tk_data_' + u
};
const loadUsers = () => JSON.parse(localStorage.getItem(LSK.USERS) || '{}');
const saveUsers = u => localStorage.setItem(LSK.USERS, JSON.stringify(u));
const hash = s => btoa(unescape(encodeURIComponent('🧂' + s + '🧂')));

/* ---------- Global state ---------- */
let currentUser = null;
let users = {};
let state = null;              // {wallet, avatar, funds[], history[], pending[], lastActivity, lastSave}
let selectedFundId = null;
let saveTimer = null, pendingTimer = null, pingTimer = null, clockTimer = null;
let isSaving = false, savingCancelled = false;

const defaultState = () => ({ wallet: 0, avatar: '', funds: [], history: [], pending: [], lastActivity: nowMs(), lastSave: 0 });

/* ============================================================
   TOAST SYSTEM
   ============================================================ */
function toast(msg, type = 'info', duration = 3200) {
  const icons = { success: '✅', error: '❌', info: '💡', warn: '⚠️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="t-icon">${icons[type] || '💡'}</span><span>${msg}</span>`;
  $('toastContainer').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, duration);
}

/* ============================================================
   VIETNAM REAL-TIME CLOCK (GMT+7)
   ============================================================ */
function tickClock() {
  try {
    const t = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    $('vnClock').textContent = '🕒 ' + t.replace(',', ' ·') + ' (GMT+7)';
  } catch {
    const d = new Date();
    $('vnClock').textContent = `🕒 ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
}
function startClock() {
  clearInterval(clockTimer);
  tickClock();
  clockTimer = setInterval(tickClock, 1000);
}

/* ============================================================
   AUTH
   ============================================================ */
function initAuth() {
  users = loadUsers();
  $('tabLogin').onclick = () => switchTab('login');
  $('tabRegister').onclick = () => switchTab('register');
  $('btnLogin').onclick = doLogin;
  $('btnRegister').onclick = doRegister;
  $('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('regPass2').addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
  $('regPass').addEventListener('input', checkStrength);

  const sess = sessionStorage.getItem(LSK.SESSION) || localStorage.getItem(LSK.SESSION);
  if (sess && users[sess]) enterApp(sess);
}

function switchTab(tab) {
  $('tabLogin').classList.toggle('active', tab === 'login');
  $('tabRegister').classList.toggle('active', tab === 'register');
  $('loginForm').classList.toggle('hidden', tab !== 'login');
  $('registerForm').classList.toggle('hidden', tab !== 'register');
  authMsg('');
}

function authMsg(msg, ok = false) {
  const el = $('authMsg');
  if (!msg) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.className = 'auth-msg ' + (ok ? 'ok' : 'error');
  el.textContent = msg;
}

/* --- Password strength --- */
function strengthScore(p) {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return s;
}
function isStrongPassword(p) {
  return p.length >= 8 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p);
}
function checkStrength() {
  const p = $('regPass').value;
  const fill = $('strengthFill'), label = $('strengthLabel');
  if (!p) { fill.style.width = '0%'; label.textContent = 'Độ mạnh mật khẩu'; return; }
  const s = strengthScore(p);
  const strong = isStrongPassword(p);
  const pct = Math.min(100, s * 20);
  fill.style.width = pct + '%';
  fill.style.background = strong ? 'linear-gradient(90deg,#00e676,#00cec9)' : (s <= 2 ? '#ff5252' : '#ffd54f');
  label.textContent = strong ? '💪 Mật khẩu mạnh — có thể đăng ký' : '⚠️ Mật khẩu yếu — cần ≥8 ký tự, HOA, thường, số và ký tự đặc biệt';
  label.style.color = strong ? '#7dffb0' : '#ff9a9a';
}

function shakeCard() {
  const card = $('authCard');
  card.classList.remove('shake');
  void card.offsetWidth;
  card.classList.add('shake');
  setTimeout(() => card.classList.remove('shake'), 600);
}

function doRegister() {
  const u = $('regUser').value.trim();
  const g = $('regGmail').value.trim().toLowerCase();
  const p = $('regPass').value;
  const p2 = $('regPass2').value;

  if (u.length < 3) { shakeCard(); return authMsg('❌ Tên đăng nhập tối thiểu 3 ký tự!'); }
  if (/\s/.test(u)) { shakeCard(); return authMsg('❌ Tên đăng nhập không được có khoảng trắng!'); }
  if (!/^[a-z0-9._%+-]+@gmail\.com$/.test(g)) { shakeCard(); return authMsg('❌ Gmail không hợp lệ! Bắt buộc nhập đúng định dạng ...@gmail.com'); }

  /* strong password enforcement */
  if (!isStrongPassword(p)) {
    shakeCard();
    toast('🚫 Mật khẩu quá yếu! Cần ≥8 ký tự gồm chữ HOA, chữ thường, số và ký tự đặc biệt.', 'error', 4500);
    return authMsg('❌ Mật khẩu yếu! Yêu cầu: ≥8 ký tự, có HOA, thường, số, ký tự đặc biệt.');
  }
  if (p !== p2) { shakeCard(); return authMsg('❌ Xác nhận mật khẩu không khớp!'); }

  const usersNow = loadUsers();
  if (usersNow[u]) { shakeCard(); return authMsg('❌ Tên đăng nhập đã tồn tại!'); }
  if (Object.values(usersNow).some(x => x.gmail === g)) { shakeCard(); return authMsg('❌ Gmail này đã được dùng đăng ký tài khoản khác!'); }

  usersNow[u] = { pass: hash(p), gmail: g, createdAt: nowMs() };
  saveUsers(usersNow);
  authMsg('✅ Đăng ký thành công! Hãy đăng nhập.', true);
  toast('🎉 Tạo tài khoản thành công!', 'success');
  setTimeout(() => switchTab('login'), 900);
  $('regUser').value = $('regGmail').value = $('regPass').value = $('regPass2').value = '';
  $('strengthFill').style.width = '0%'; $('strengthLabel').textContent = 'Độ mạnh mật khẩu'; $('strengthLabel').style.color = '';
}

function doLogin() {
  const u = $('loginUser').value.trim();
  const p = $('loginPass').value;
  const usersNow = loadUsers();
  const acc = usersNow[u];
  if (!acc || acc.pass !== hash(p)) { shakeCard(); return authMsg('❌ Sai tên đăng nhập hoặc mật khẩu!'); }
  sessionStorage.setItem(LSK.SESSION, u);
  localStorage.setItem(LSK.SESSION, u);
  enterApp(u);
}

function doLogout() {
  stopTimers();
  sessionStorage.removeItem(LSK.SESSION);
  localStorage.removeItem(LSK.SESSION);
  currentUser = null; state = null; selectedFundId = null;
  $('appScreen').classList.add('hidden');
  $('authScreen').classList.remove('hidden');
  $('loginPass').value = '';
  authMsg('');
}

/* ============================================================
   AVATAR UPLOAD (resize để nhẹ, lưu localStorage)
   ============================================================ */
function initAvatar() {
  $('avatarInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('❌ File phải là hình ảnh!', 'error');
    if (file.size > 5 * 1024 * 1024) return toast('❌ Ảnh quá lớn (tối đa 5MB)!', 'error');
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const min = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
        state.avatar = canvas.toDataURL('image/jpeg', 0.82);
        persist();
        renderAvatar();
        toast('📷 Đã cập nhật avatar!', 'success');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });
}
function renderAvatar() {
  const img = $('avatarImg');
  img.src = state && state.avatar ? state.avatar : defaultAvatar(currentUser);
}
function defaultAvatar(name) {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 96, 96);
  grad.addColorStop(0, '#6c5ce7'); grad.addColorStop(1, '#00cec9');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 96, 96);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 42px Segoe UI';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(((name || '?')[0] || '?').toUpperCase(), 48, 52);
  return c.toDataURL();
}

/* ============================================================
   APP ENTRY / LOAD
   ============================================================ */
function enterApp(user) {
  currentUser = user;
  $('authScreen').classList.add('hidden');
  $('appScreen').classList.remove('hidden');
  $('userName').textContent = user;

  loadState();
  checkInactivityReset();
  migrateLegacy();
  if (state.funds.length && !selectedFundId) selectedFundId = state.funds[0].id;
  checkPending(true);
  renderAll();

  startClock();
  startAutoSave();
  startPendingLoop();
  startPingLoop();
  initAvatar();
  toast(`👋 Chào mừng trở lại, ${user}!`, 'success');
}

function loadState() {
  try {
    const raw = localStorage.getItem(LSK.dataKey(currentUser));
    state = raw ? Object.assign(defaultState(), JSON.parse(raw)) : defaultState();
    if (!Array.isArray(state.funds)) state.funds = [];
    if (!Array.isArray(state.pending)) state.pending = [];
    if (!Array.isArray(state.history)) state.history = [];
  } catch { state = defaultState(); }
}

/* Convert dữ liệu v1 (1 quỹ duy nhất) sang v2 */
function migrateLegacy() {
  if (state.goalType && !state.funds.some(f => f.goalType === state.goalType)) {
    state.funds.push({
      id: uid(), goalType: state.goalType, goalAmount: state.goalAmount || 0,
      saved: state.saved || 0, startDate: state.startDate || todayStr(),
      endDate: state.endDate || todayStr(), createdAt: state.createdAt || nowMs(),
      successShown: !!state.successShown, failShown: !!state.failShown
    });
    delete state.goalType; delete state.goalAmount; delete state.saved;
    delete state.startDate; delete state.endDate;
    delete state.successShown; delete state.failShown; delete state.createdAt;
    persist();
  }
}

function persist() {
  if (!state || !currentUser) return;
  state.lastActivity = nowMs();
  state.lastSave = nowMs();
  try { localStorage.setItem(LSK.dataKey(currentUser), JSON.stringify(state)); } catch {}
}

/* ============================================================
   7-DAY AUTO RESET
   ============================================================ */
function checkInactivityReset() {
  if (nowMs() - state.lastActivity > 7 * dayMs) {
    const total = state.funds.reduce((s, f) => s + f.saved, 0);
    state = defaultState();
    persist();
    toast('🔄 7 ngày không hoạt động — toàn bộ quỹ đã reset về 0!', 'warn', 5000);
    showResult(false, '⏰ Quỹ đã tự reset!',
      `Bạn không cập nhật trong 7 ngày. Toàn bộ ${fmt(total)} trong các quỹ đã về 0 và ví được giữ nguyên.`);
  }
}

/* ============================================================
   WALLET
   ============================================================ */
function topupWallet() {
  const amount = parseInt($('topupAmount').value, 10);
  if (!amount || amount < 1000) return toast('⚠️ Số tiền nạp ví tối thiểu 1.000 ₫!', 'warn');
  state.wallet += amount;
  state.history.unshift({ id: uid(), amount, time: nowMs(), mode: 'topup', status: 'done' });
  persist();
  $('topupAmount').value = '';
  toast(`💳 Đã nạp ${fmt(amount)} vào ví!`, 'success');
  renderAll();
}

/* ============================================================
   FUNDS (tối đa 10, không trùng)
   ============================================================ */
const selFund = () => state.funds.find(f => f.id === selectedFundId) || null;

function startPlan() {
  const goalType = $('goalType').value;
  const goalAmount = parseInt($('goalAmount').value, 10);
  const startAmount = parseInt($('startAmount').value, 10) || 0;
  const startDate = $('startDate').value;
  const endDate = $('endDate').value;

  if (state.funds.length >= MAX_FUNDS) return toast(`🚫 Đã đạt giới hạn ${MAX_FUNDS} quỹ! Hãy xóa quỹ cũ trước.`, 'error');
  if (!goalType) return toast('⚠️ Vui lòng chọn mục tiêu tiết kiệm!', 'warn');
  if (state.funds.some(f => f.goalType === goalType)) return toast(`❌ Quỹ "${goalType}" đã tồn tại — không cho phép trùng lặp!`, 'error');
  if (!goalAmount || goalAmount < 1000) return toast('⚠️ Số tiền mục tiêu tối thiểu 1.000 ₫!', 'warn');
  if (!startDate || !endDate) return toast('⚠️ Vui lòng chọn ngày bắt đầu và kết thúc!', 'warn');
  if (parseDate(endDate) < parseDate(startDate)) return toast('❌ Ngày kết thúc phải sau ngày bắt đầu!', 'error');
  if (startAmount > 0 && startAmount > state.wallet) return toast(`❌ Ví không đủ! Cần ${fmt(startAmount)} nhưng ví chỉ có ${fmt(state.wallet)}`, 'error');

  if (startAmount > 0) {
    state.wallet -= startAmount;
    state.history.unshift({ id: uid(), amount: startAmount, time: nowMs(), mode: 'start', status: 'done' });
  }
  const fund = {
    id: uid(), goalType, goalAmount, saved: startAmount,
    startDate, endDate, createdAt: nowMs(), successShown: false, failShown: false
  };
  state.funds.push(fund);
  selectedFundId = fund.id;
  persist();
  hideSetup();
  renderAll();
  toast(`🎯 Đã tạo quỹ "${goalType}"! (${state.funds.length}/${MAX_FUNDS})`, 'success');
}

function deleteFund(id) {
  const f = state.funds.find(x => x.id === id);
  if (!f) return;
  askConfirm('🗑️ Xóa quỹ?',
    `Quỹ "${f.goalType}" sẽ bị xóa. Số tiền ${fmt(f.saved)} trong quỹ sẽ tự động hoàn về ví.`,
    () => {
      state.wallet += f.saved;
      state.pending = state.pending.filter(p => p.fundId !== id);
      state.funds = state.funds.filter(x => x.id !== id);
      if (selectedFundId === id) selectedFundId = state.funds.length ? state.funds[0].id : null;
      persist();
      renderAll();
      toast(`🗑️ Đã xóa quỹ và hoàn ${fmt(f.saved)} về ví!`, 'info');
    });
}

/* ============================================================
   DATE LOGIC
   ============================================================ */
function updateDateInfo() {
  const s = $('startDate').value, e = $('endDate').value;
  const box = $('dateInfo');
  if (!s || !e) { box.innerHTML = '<span class="date-info-chip">⏳ Chọn ngày để hệ thống tự tính</span>'; return; }
  if (parseDate(e) < parseDate(s)) { box.innerHTML = '<span class="date-info-chip" style="border-color:rgba(255,82,82,.4);color:#ff9a9a">❌ Ngày kết thúc phải sau ngày bắt đầu</span>'; return; }
  const total = Math.round((parseDate(e) - parseDate(s)) / dayMs) + 1;
  const months = (total / 30).toFixed(1);
  box.innerHTML =
    `<span class="date-info-chip">📅 Tổng: ${total} ngày</span>` +
    `<span class="date-info-chip">🗓️ Khoảng: ${months} tháng</span>` +
    `<span class="date-info-chip">🌙 Ngày đầu tiên không tính tiền — bắt đầu tính từ ngày hôm sau</span>`;
}

/* ============================================================
   ADD MONEY FROM WALLET (3 modes)
   ============================================================ */
const MODE_LABELS = { instant: '⚡ Ngay lập tức', afterHour: '⏳ Đếm ngược 1 tiếng', scheduled: '🕒 Theo lịch hẹn', start: '🚀 Tiền khởi tạo', topup: '💳 Nạp ví', refund: '💸 Hoàn tiền' };

function addMoney() {
  const fund = selFund();
  if (!fund) return;
  const amount = parseInt($('addAmount').value, 10);
  if (!amount || amount < 1000) return toast('⚠️ Số tiền nạp tối thiểu 1.000 ₫!', 'warn');
  if (amount > state.wallet) return toast(`❌ Ví không đủ! Cần ${fmt(amount)} nhưng ví chỉ có ${fmt(state.wallet)}`, 'error');

  const mode = document.querySelector('input[name="addMode"]:checked').value;

  if (mode === 'instant') {
    state.wallet -= amount;
    fund.saved += amount;
    state.history.unshift({ id: uid(), amount, time: nowMs(), mode: 'instant', status: 'done', fundId: fund.id });
    toast(`⚡ Đã chuyển ${fmt(amount)} từ ví vào quỹ!`, 'success');
    afterBalanceChange(fund);
  } else {
    let readyAt;
    if (mode === 'afterHour') {
      readyAt = nowMs() + 3600000;
    } else {
      const v = $('scheduleTime').value;
      if (!v) return toast('⚠️ Vui lòng chọn thởi gian cộng tiền!', 'warn');
      readyAt = new Date(v).getTime();
      if (readyAt <= nowMs()) return toast('❌ Thởi gian hẹn phải ở tương lai!', 'error');
    }
    const createdAt = nowMs();
    state.pending.push({ id: uid(), fundId: fund.id, amount, mode, readyAt, createdAt });
    state.history.unshift({ id: uid(), amount, time: createdAt, mode, status: 'pending', readyAt, fundId: fund.id });
    toast(`📌 Đã hẹn cộng ${fmt(amount)} — ${fmtTime(readyAt)}`, 'info');
    persist();
  }
  $('addAmount').value = '';
  renderAll();
}

function afterBalanceChange(fund) {
  if (fund.saved >= fund.goalAmount && !fund.successShown) {
    fund.successShown = true;
    persist();
    showResult(true, '🎉 Chúc mừng!',
      `Bạn đã tiết kiệm đủ ${fmt(fund.goalAmount)} cho mục tiêu "${fund.goalType}"! Hãy tự thưởng cho mình nhé! ✨`);
  }
  checkFailCondition(fund);
  persist();
  renderAll();
}

function checkFailCondition(fund) {
  if (!fund || fund.successShown || fund.failShown) return;
  const today = parseDate(todayStr());
  if (parseDate(fund.endDate) < today && fund.saved < fund.goalAmount) {
    fund.failShown = true;
    persist();
    showResult(false, '😢 Tiết kiệm chưa đạt!',
      `Quỹ "${fund.goalType}" đã quá hạn mà mới có ${fmt(fund.saved)}/${fmt(fund.goalAmount)}. Cố gắng hơn ở quỹ tiếp theo nhé! 💪`);
  }
}

/* --- 4 nút xử lý: 1) Không tiết kiệm nữa  2) Hoàn tiền --- */
function stopSaving() {
  const fund = selFund();
  if (!fund) return;
  askConfirm('🛑 Ngừng tiết kiệm?',
    `Bạn sẽ NGỪNG tiết kiệm quỹ "${fund.goalType}". Toàn bộ ${fmt(fund.saved)} trong quỹ sẽ reset về 0 (không hoàn lại ví). Tiếp tục?`,
    () => {
      const lost = fund.saved;
      fund.saved = 0;
      state.pending = state.pending.filter(p => p.fundId !== fund.id);
      persist();
      renderAll();
      toast(`🛑 Đã ngừng tiết kiệm "${fund.goalType}" — ${fmt(lost)} đã reset về 0!`, 'warn', 4500);
    });
}

function refundFund() {
  const fund = selFund();
  if (!fund) return;
  if (fund.saved <= 0) return toast('⚠️ Quỹ này chưa có tiền để hoàn!', 'warn');
  askConfirm('💸 Hoàn tiền về ví?',
    `An toàn 100% — ${fmt(fund.saved)} trong quỹ "${fund.goalType}" sẽ được chuyển toàn bộ về ví của bạn.`,
    () => {
      const amt = fund.saved;
      state.wallet += amt;
      fund.saved = 0;
      state.history.unshift({ id: uid(), amount: amt, time: nowMs(), mode: 'refund', status: 'done', fundId: fund.id });
      persist();
      renderAll();
      toast(`💸 Đã hoàn ${fmt(amt)} về ví an toàn!`, 'success');
    });
}

/* ---------- Pending loop + countdown ---------- */
function startPendingLoop() {
  clearInterval(pendingTimer);
  pendingTimer = setInterval(() => { checkPending(false); renderPendingCountdowns(); }, 1000);
}

function checkPending(silent) {
  if (!state.pending.length) { if (!silent) renderPending(); return; }
  const t = nowMs();
  const due = state.pending.filter(p => p.readyAt <= t);
  if (!due.length) { if (!silent) renderPending(); return; }
  state.pending = state.pending.filter(p => p.readyAt > t);
  due.forEach(p => {
    const fund = state.funds.find(f => f.id === p.fundId);
    if (!fund) return;
    state.wallet -= p.amount;
    fund.saved += p.amount;
    const h = state.history.find(x => x.status === 'pending' && x.amount === p.amount && x.time === p.createdAt && x.fundId === p.fundId);
    if (h) h.status = 'done';
    else state.history.unshift({ id: uid(), amount: p.amount, time: t, mode: p.mode, status: 'done', fundId: fund.id });
    toast(`💰 ${fmt(p.amount)} vừa được cộng vào quỹ "${fund.goalType}"!`, 'success');
  });
  const f = selFund();
  if (f) afterBalanceChange(f); else { persist(); renderAll(); }
}

function cancelPending(id) {
  const p = state.pending.find(x => x.id === id);
  state.pending = state.pending.filter(x => x.id !== id);
  if (p) toast(`🗑️ Đã hủy lệnh cộng ${fmt(p.amount)} — tiền chưa trừ ví`, 'info');
  persist();
  renderAll();
}

function fmtCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}`;
}

function renderPendingCountdowns() {
  document.querySelectorAll('[data-cd]').forEach(el => {
    const p = state.pending.find(x => x.id === el.dataset.cd);
    el.textContent = p ? fmtCountdown(p.readyAt - nowMs()) : '--:--:--';
  });
}

/* ============================================================
   AUTO SAVE (random 5s – 30s, non-continuous)
   ============================================================ */
function startAutoSave() {
  clearTimeout(saveTimer);
  scheduleNextSave();
}
function scheduleNextSave() {
  clearTimeout(saveTimer);
  const delay = rand(5000, 30000);
  if ($('nextSaveTime')) $('nextSaveTime').textContent = fmtTime(nowMs() + delay);
  saveTimer = setTimeout(runAutoSave, delay);
}
function runAutoSave() {
  isSaving = true; savingCancelled = false;
  const overlay = $('savingOverlay');
  overlay.classList.remove('hidden');
  const fill = $('saveProgressFill');
  let pct = 0;
  fill.style.width = '0%';
  const iv = setInterval(() => {
    if (savingCancelled) {
      clearInterval(iv);
      overlay.classList.add('hidden');
      isSaving = false;
      toast('🚫 Lưu dữ liệu đã bị hủy do bạn rời khỏi trang!', 'warn');
      scheduleNextSave();
      return;
    }
    pct += rand(12, 22);
    if (pct >= 100) {
      pct = 100;
      clearInterval(iv);
      persist();
      $('lastSaveTime').textContent = fmtTime(nowMs());
      setTimeout(() => {
        overlay.classList.add('hidden');
        isSaving = false;
        toast('💾 Dữ liệu đã được lưu thành công!', 'success', 2200);
        scheduleNextSave();
      }, 350);
    }
    fill.style.width = pct + '%';
  }, 300);
}
window.addEventListener('beforeunload', () => { if (isSaving) savingCancelled = true; });
document.addEventListener('visibilitychange', () => { if (document.hidden && isSaving) savingCancelled = true; });

/* ============================================================
   PING SYSTEM
   ============================================================ */
async function measurePing() {
  const badge = $('pingBadge');
  const t0 = performance.now();
  try {
    await fetch('https://www.gstatic.com/generate_204', { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(4000) });
    const ms = Math.round(performance.now() - t0);
    badge.textContent = `🌐 Ping: ${ms}ms`;
    badge.className = 'ping-badge ' + (ms < 300 ? 'good' : 'bad');
  } catch {
    badge.textContent = '🌐 Ping: offline / mạng yếu';
    badge.className = 'ping-badge bad';
  }
}
function startPingLoop() {
  clearInterval(pingTimer);
  measurePing();
  pingTimer = setInterval(measurePing, 15000);
}

/* ============================================================
   RENDER
   ============================================================ */
function showSetup() {
  $('setupCard').classList.remove('hidden');
  $('btnCancelSetup').classList.toggle('hidden', state.funds.length === 0);
  $('dashboard').classList.add('hidden');
}
function hideSetup() {
  $('setupCard').classList.add('hidden');
  $('goalType').value = ''; $('goalAmount').value = ''; $('startAmount').value = '';
  $('startDate').value = ''; $('endDate').value = '';
  updateDateInfo();
}

function renderAll() {
  renderAvatar();
  $('walletBalance').textContent = fmt(state.wallet);
  $('walletHint').textContent = fmt(state.wallet);

  /* fund tabs */
  const hasFunds = state.funds.length > 0;
  $('fundListCard').classList.toggle('hidden', !hasFunds);
  $('fundCount').textContent = state.funds.length;
  if (hasFunds) {
    $('fundTabs').innerHTML = state.funds.map(f => `
      <button class="fund-tab ${f.id === selectedFundId ? 'active' : ''}" data-fund="${f.id}">
        <span>${GOAL_ICONS[f.goalType] || '🎯'}</span> ${f.goalType}
        <span data-delfund="${f.id}" class="ft-del" title="Xóa quỹ">✖</span>
      </button>`).join('');
    $('fundTabs').querySelectorAll('[data-fund]').forEach(b => {
      b.onclick = e => {
        if (e.target.dataset.delfund) return;
        selectedFundId = b.dataset.fund;
        renderAll();
      };
    });
    $('fundTabs').querySelectorAll('[data-delfund]').forEach(b => {
      b.onclick = e => { e.stopPropagation(); deleteFund(b.dataset.delfund); };
    });
  }

  /* dashboard theo quỹ đang chọn */
  const fund = selFund();
  $('dashboard').classList.toggle('hidden', !fund);
  /* ẩn màn hình thiết lập nếu đang xem một quỹ */
  $('setupCard').classList.toggle('hidden', !!fund);
  if (fund) { renderDashboard(fund); renderPending(); }
  renderHistory();
}

function renderDashboard(fund) {
  $('displayGoalName').textContent = fund.goalType;
  $('displayGoalType').textContent = GOAL_ICONS[fund.goalType] || '🎯';
  $('displayGoalPeriod').textContent = `${fmtDate(parseDate(fund.startDate))} → ${fmtDate(parseDate(fund.endDate))}`;
  $('displaySaved').textContent = fmt(fund.saved);
  $('displayTarget').textContent = fmt(fund.goalAmount);

  const pct = Math.min(100, Math.round(fund.saved / fund.goalAmount * 100));
  $('progressFill').style.width = pct + '%';
  $('progressPercent').textContent = pct + '%';
  $('progressRemain').textContent = 'Còn lại: ' + fmt(Math.max(0, fund.goalAmount - fund.saved));

  /* day counting: first day doesn't count, money counts from next day */
  const today = parseDate(todayStr());
  const start = parseDate(fund.startDate);
  const end = parseDate(fund.endDate);
  let note;
  if (today <= start) {
    const days = Math.round((end - start) / dayMs) + 1;
    $('statDays').textContent = days;
    $('statMonths').textContent = (days / 30).toFixed(1);
    note = '🌙 Hôm nay không tính tiền — bắt đầu tính từ ngày mai';
  } else {
    const counted = Math.round((Math.min(today, end) - start) / dayMs);
    $('statDays').textContent = counted;
    $('statMonths').textContent = (counted / 30).toFixed(1);
    note = today > end ? '🏁 Đã quá hạn tiết kiệm' : '📈 Đang trong thởi gian tiết kiệm';
  }
  $('statNote').innerHTML = note;
}

function renderPending() {
  const fund = selFund();
  const box = $('pendingList');
  const list = fund ? state.pending.filter(p => p.fundId === fund.id) : [];
  if (!list.length) { box.innerHTML = ''; return; }
  box.innerHTML = '<div style="font-size:12px;font-weight:700;color:var(--text-dim);margin-top:4px">⏳ Đang chờ cộng tiền (đếm ngược):</div>' +
    list.map(p => `
      <div class="pending-item pending">
        <span class="p-amount">${fmt(p.amount)}</span>
        <span class="p-time">${MODE_LABELS[p.mode]} · <b data-cd="${p.id}">--:--:--</b><br>${fmtTime(p.readyAt)}</span>
        <button data-cancel="${p.id}" title="Hủy">✖️</button>
      </div>`).join('');
  box.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => cancelPending(b.dataset.cancel));
  renderPendingCountdowns();
}

function renderHistory() {
  const list = $('historyList');
  if (!state.history.length) {
    list.innerHTML = '<li class="history-empty">Chưa có giao dịch nào</li>';
    return;
  }
  list.innerHTML = state.history.slice(0, 50).map(h => `
    <li class="history-item">
      <span>${MODE_LABELS[h.mode] || '💰'} ${h.status === 'pending' ? '<span style="color:var(--gold)">(chờ)</span>' : ''}</span>
      <span style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
        <span class="h-amount ${h.mode === 'refund' || h.mode === 'topup' ? 'minus' : ''}">${h.mode === 'refund' || h.mode === 'topup' ? '·' : '+'}${fmt(h.amount)}</span>
        <span class="h-time">${fmtTime(h.time)}</span>
      </span>
    </li>`).join('');
}

/* ============================================================
   POPUPS
   ============================================================ */
function showResult(success, title, desc) {
  $('resultPopup').className = 'popup result-popup ' + (success ? 'success' : 'fail');
  $('resultIcon').textContent = success ? '🎉' : '💔';
  $('resultTitle').textContent = title;
  $('resultDesc').textContent = desc;
  $('resultOverlay').classList.remove('hidden');
}
$('btnResultClose').onclick = () => $('resultOverlay').classList.add('hidden');

/* ---------- Confirm modal ---------- */
let confirmCb = null;
function askConfirm(title, desc, cb) {
  $('confirmTitle').textContent = title;
  $('confirmDesc').textContent = desc;
  confirmCb = cb;
  $('confirmModal').classList.remove('hidden');
}
$('btnConfirmNo').onclick = () => { $('confirmModal').classList.add('hidden'); confirmCb = null; };
$('btnConfirmYes').onclick = () => { $('confirmModal').classList.add('hidden'); if (confirmCb) confirmCb(); confirmCb = null; };

/* ============================================================
   SETTINGS
   ============================================================ */
function openSettings() {
  $('lastSaveTime').textContent = state.lastSave ? fmtTime(state.lastSave) : '--';
  $('settingsModal').classList.remove('hidden');
}
function cancelPlan() {
  const total = state.funds.reduce((s, f) => s + f.saved, 0);
  askConfirm('🗑️ Hủy bỏ toàn bộ tiết kiệm?',
    `Toàn bộ ${state.funds.length} quỹ (chứa ${fmt(total)}) và tiền trong ví ${fmt(state.wallet)} sẽ bị XÓA VĨNH VIỄN. Không thể hoàn tác!`,
    () => {
      state = defaultState();
      selectedFundId = null;
      persist();
      $('settingsModal').classList.add('hidden');
      renderAll();
      toast('🗑️ Đã xóa toàn bộ dữ liệu tiết kiệm!', 'error', 4200);
    });
}

/* ============================================================
   TIMERS MGMT
   ============================================================ */
function stopTimers() {
  clearTimeout(saveTimer);
  clearInterval(pendingTimer);
  clearInterval(pingTimer);
  clearInterval(clockTimer);
}

/* ============================================================
   EVENT BINDING
   ============================================================ */
$('btnStartPlan').onclick = startPlan;
$('startDate').onchange = updateDateInfo;
$('endDate').onchange = updateDateInfo;
$('btnAddMoney').onclick = addMoney;
$('btnTopup').onclick = topupWallet;
$('btnStopSaving').onclick = stopSaving;
$('btnRefund').onclick = refundFund;
$('btnSettings').onclick = openSettings;
$('btnCloseSettings').onclick = () => $('settingsModal').classList.add('hidden');
$('btnCancelPlan').onclick = cancelPlan;
$('btnLogout').onclick = doLogout;
$('btnNewFund').onclick = () => {
  if (state.funds.length >= MAX_FUNDS) return toast(`🚫 Đã đạt giới hạn ${MAX_FUNDS} quỹ!`, 'error');
  selectedFundId = null;
  showSetup();
};
$('btnCancelSetup').onclick = () => {
  hideSetup();
  if (state.funds.length) { selectedFundId = state.funds[0].id; renderAll(); }
  else showSetup();
};
document.querySelectorAll('input[name="addMode"]').forEach(r => {
  r.onchange = () => {
    const v = document.querySelector('input[name="addMode"]:checked').value;
    $('scheduleField').classList.toggle('hidden', v !== 'scheduled');
  };
});
(() => { const t = todayStr(); $('startDate').min = t; $('endDate').min = t; })();

/* close overlays on backdrop click */
[$('settingsModal'), $('confirmModal')].forEach(ov => {
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.add('hidden'); });
});

/* ---------- BOOT ---------- */
initAuth();
