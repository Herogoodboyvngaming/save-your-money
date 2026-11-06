/* =========================================================
   💰 Tiết Kiệm Tiền — Made in VN 🇻🇳
   Made by : Nguyễn Chí Dự (HRGBVNGM) ✨⭐✨
   Hệ thống:
   - Auth localStorage thật
   - Popup chúc mừng khi đạt đủ tiến trình, popup thất bại khi quá hạn chưa đạt
   - Nút "Hủy bỏ tiết kiệm" trong Cài đặt: xóa toàn bộ tiền trong quỹ
   - Dò ping tự động
   - Lưu TỰ ĐỘNG theo mốc thời gian NGẪU NHIÊN, KHÔNG LIÊN TỤC
     (chạy độc lập, không bị thao tác của user reset lịch lưu)
   - NGÀY ĐẦU TIẾT KIỆM KHÔNG TÍNH TIỀN — tiền nạp trong ngày đầu
     sẽ được tính từ 0h ngày hôm sau
   - Tự động tính số ngày còn lại và quy đổi ra THÁNG bên dưới
   - Reset sau 7 ngày không cập nhật
   ========================================================= */
"use strict";

/* ---------- Hằng số ---------- */
const LS_USERS = "tk_users";
const LS_SESSION = "tk_session";
const INACTIVE_DAYS = 7;
const MIN_DEPOSIT = 10000; // 💰 nạp tối thiểu 10.000₫, dưới mức này KHÔNG cho
// Lưu tự động: mốc NGẪU NHIÊN 15s – 90s, KHÔNG liên tục,
// mỗi lần lưu xong mới rút thăm mốc kế tiếp
const SAVE_MIN_MS = 15000;
const SAVE_MAX_MS = 90000;
const DAY_MS = 86400000;
const GOAL_LABELS = {
  can_thiet: "🛒 Mua thứ cần thiết",
  dien_thoai: "📱 Mua điện thoại",
  do_can_thiet: "👕 Mua đồ cần thiết",
  laptop: "💻 Mua laptop",
  xe_may: "🏍️ Mua xe máy",
  du_lich: "✈️ Du lịch",
  hoc_tap: "🎓 Học tập"
};

/* ---------- Utils ---------- */
const $ = (id) => document.getElementById(id);
const fmt = (n) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n);
const fmtTime = (ts) => new Date(ts).toLocaleString("vi-VN", { hour12: false });
const fmtDate = (ts) => new Date(ts).toLocaleDateString("vi-VN");
// 0h00 của một ngày bất kỳ (ms) — dùng để so ngày chuẩn xác
const dayStart = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

function hashStr(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return "h" + h.toString(36) + "_" + str.length;
}

let toastTimer = null;
const TOAST_ICONS = { success: "✅", warn: "⚠️", error: "⛔" };
function toast(msg, type = "success") {
  const t = $("toast");
  t.textContent = (TOAST_ICONS[type] || "💬") + " " + msg;
  t.className = "toast show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), 3000);
}

/* ---------- Trạng thái ---------- */
let currentUser = null;
let data = null;
let saveTimer = null;        // timer lưu tự động độc lập
let isSaving = false;
let pendingSnapshot = null;

/* =========================================================
   AUTH
   ========================================================= */
function getUsers() {
  try { return JSON.parse(localStorage.getItem(LS_USERS)) || {}; }
  catch { return {}; }
}
function saveUsers(users) { localStorage.setItem(LS_USERS, JSON.stringify(users)); }

let authMode = "login";
$("tabLogin").addEventListener("click", () => setAuthMode("login"));
$("tabRegister").addEventListener("click", () => setAuthMode("register"));

function setAuthMode(mode) {
  authMode = mode;
  $("tabLogin").classList.toggle("active", mode === "login");
  $("tabRegister").classList.toggle("active", mode === "register");
  $("authSubmit").textContent = mode === "login" ? "Đăng nhập" : "Đăng ký 🚀";
  $("authError").textContent = "";
}

$("authForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const user = $("authUser").value.trim().toLowerCase();
  const pass = $("authPass").value;
  const users = getUsers();

  if (user.length < 3) return ($("authError").textContent = "Tên đăng nhập tối thiểu 3 ký tự.");
  if (pass.length < 4) return ($("authError").textContent = "Mật khẩu tối thiểu 4 ký tự.");

  if (authMode === "register") {
    if (users[user]) return ($("authError").textContent = "Tên đăng nhập đã tồn tại!");
    users[user] = { hash: hashStr(user + "::" + pass), created: Date.now() };
    saveUsers(users);
    toast("🎉 Đăng ký thành công! Mở đăng nhập nha.", "success");
    setAuthMode("login");
  } else {
    if (!users[user]) return ($("authError").textContent = "Tài khoản không tồn tại!");
    if (users[user].hash !== hashStr(user + "::" + pass))
      return ($("authError").textContent = "Sai mật khẩu rồi bạn ơi!");
    localStorage.setItem(LS_SESSION, user);
    startApp(user);
  }
});

$("btnLogout").addEventListener("click", () => {
  stopAutoSave();
  localStorage.removeItem(LS_SESSION);
  currentUser = null;
  data = null;
  $("appScreen").classList.add("hidden");
  $("authScreen").classList.remove("hidden");
  $("authPass").value = "";
});

/* =========================================================
   DỮ LIỆU
   ========================================================= */
const dataKey = () => "tk_data_" + currentUser;

function defaultData() {
  return {
    amounts: [],            // [{value, at, countFrom}]
    goalType: "can_thiet",
    goalCustom: "",
    goalAmount: 0,
    startDate: "",
    endDate: "",
    lastUpdate: Date.now()
  };
}

function loadData() {
  try { data = JSON.parse(localStorage.getItem(dataKey())) || defaultData(); }
  catch { data = defaultData(); }

  // Migrate dữ liệu cũ thiếu countFrom → tính ngay lúc nạp
  data.amounts.forEach(a => { if (a.countFrom === undefined) a.countFrom = a.at; });

  // Reset nếu quá 7 ngày không cập nhật
  if (Date.now() - (data.lastUpdate || 0) > INACTIVE_DAYS * DAY_MS) {
    data = defaultData();
    persistNow();
    toast(`🔄 Hệ thống đã reset — bạn im lặng quá ${INACTIVE_DAYS} ngày rồi!`, "warn");
  }
}

function persistNow() {
  data.lastUpdate = Date.now();
  localStorage.setItem(dataKey(), JSON.stringify(data));
}

/* =========================================================
   💵 QUY TẮC TÍNH TIỀN:
   - Ngày bắt đầu tiết kiệm (startDate) KHÔNG tính tiền
   - Tiền nạp trong ngày đầu → chờ đến 0h ngày HÔM SAU mới được tính
   - Tiền nạp từ ngày thứ 2 trở đi → tính ngay
   ========================================================= */
function computeCountFrom(atMs) {
  // ⏳ QUY TẮC MỚI: tiền tiết kiệm KHÔNG tính trong ngày nạp,
  // chỉ được tính từ 0h00 ngày HÔM SAU (kể cả ngày đầu tiết kiệm)
  return dayStart(atMs) + DAY_MS;
}

function isCounted(a) { return a.countFrom <= dayStart(Date.now()); }

function totalSaved() { return data.amounts.filter(isCounted).reduce((s, a) => s + a.value, 0); }
function pendingAmount() { return data.amounts.filter(a => !isCounted(a)).reduce((s, a) => s + a.value, 0); }

/* =========================================================
   GIAO DIỆN
   ========================================================= */
function render() {
  const total = totalSaved();
  $("totalMoney").textContent = fmt(total);
  $("statCount").textContent = data.amounts.length;
  $("statLast").textContent = fmtTime(data.lastUpdate);

  const goalName = data.goalType === "khac"
    ? (data.goalCustom || "✨ Mục tiêu riêng")
    : (GOAL_LABELS[data.goalType] || "—");
  $("statGoal").textContent = data.goalAmount > 0 ? `${goalName} (${fmt(data.goalAmount)})` : goalName;

  const pct = data.goalAmount > 0 ? Math.min(100, Math.round((total / data.goalAmount) * 100)) : 0;
  $("progressFill").style.width = pct + "%";
  $("progressPct").textContent = pct + "%";
  $("progressHint").textContent = data.goalAmount > 0
    ? (pct >= 100 ? "🎉 Chúc mừng! Bạn đã hoàn thành mục tiêu tiết kiệm!"
                  : `Bạn đã tiết kiệm được ${pct}% — cố lên!`)
    : "Nạp tiền để bắt đầu hành trình nhé!";

  // 🗓️ Tự động tính ngày = tháng - năm: hiện SỐ NGÀY, dưới là THÁNG
  if (data.endDate) {
    const daysLeft = Math.max(0, Math.ceil((dayStart(new Date(data.endDate).getTime()) - dayStart(Date.now())) / DAY_MS));
    $("statDays").textContent = daysLeft;
    const monthsLeft = daysLeft / 30; // quy đổi ngày → tháng (30 ngày = 1 tháng)
    $("statMonths").textContent = daysLeft === 0
      ? "Hết hạn hôm nay!"
      : `≈ ${monthsLeft < 1 ? monthsLeft.toFixed(2) : monthsLeft.toFixed(1)} tháng`;
  } else {
    $("statDays").textContent = "—";
    $("statMonths").textContent = "—";
  }

  // Ghi chú tiền đang chờ tính + bật panel 2 phương án
  const pend = pendingAmount();
  $("countNote").textContent = pend > 0
    ? `⏳ ${fmt(pend)} đang chờ — tiền nạp hôm nay sẽ tính từ 0h ngày mai`
    : "";
  // ⏳ Có tiền đang chờ → hiện panel 2 phương án (không tiết kiệm nữa / hoàn tiền)
  const pa = $("pendingActions");
  if (pend > 0) {
    $("pendingTotal").textContent = fmt(pend);
    pa.classList.remove("hidden");
  } else {
    pa.classList.add("hidden");
  }

  // Lịch sử
  const list = $("historyList");
  if (!data.amounts.length) {
    list.innerHTML = '<li class="empty">Chưa có giao dịch nào.</li>';
  } else {
    list.innerHTML = data.amounts.slice(-30).reverse().map(a => {
      const wait = !isCounted(a);
      return `<li><span class="time">${fmtTime(a.at)}${wait ? ' <span class="pending">⏳ tính từ ' + fmtDate(a.countFrom) + '</span>' : ""}</span><span class="amt">+${fmt(a.value)}</span></li>`;
    }).join("");
  }

  $("goalSelect").value = data.goalType;
  $("customGoalField").style.display = data.goalType === "khac" ? "block" : "none";
  $("customGoal").value = data.goalCustom || "";
  $("goalAmount").value = data.goalAmount || "";
  $("startDate").value = data.startDate || "";
  $("endDate").value = data.endDate || "";

  // 🎉 Kiểm tra kết quả tiết kiệm (chúc mừng / thất bại)
  checkGoalResult();
}

/* =========================================================
   ➕ NẠP TIỀN — nhân lên khi trùng + quy tắc ngày đầu không tính
   ========================================================= */
$("btnAdd").addEventListener("click", () => {
  const raw = parseFloat($("inputAmount").value);

  if (!raw || raw < MIN_DEPOSIT) return toast(`⚠️ Số tiền tối thiểu là ${fmt(MIN_DEPOSIT)}, dưới mức này không cho nạp!`, "error");

  const value = raw;
  const at = Date.now();
  const countFrom = computeCountFrom(at);
  data.amounts.push({ value, at, countFrom });

  if (countFrom > at) {
    toast(`💸 Đã nạp ${fmt(value)} — tiền nạp hôm nay chưa tính, sẽ tự động cộng vào quỹ từ 0h ngày mai (${fmtDate(countFrom)})!`, "warn");
  } else {
    toast(`💸 Đã nạp ${fmt(value)} vào quỹ!`, "success");
  }

  $("inputAmount").value = "";
  render();
  persistNow(); // ghi ngay cho chắc, còn bản lưu tự động vẫn chạy theo mốc riêng
});

/* =========================================================
   🎯 MỤC TIÊU + NGÀY BẮT ĐẦU / KẾT THÚC
   ========================================================= */
$("goalSelect").addEventListener("change", () => {
  $("customGoalField").style.display = $("goalSelect").value === "khac" ? "block" : "none";
});

$("btnSaveGoal").addEventListener("click", () => {
  // 🚫 Đã có mục tiêu rồi mà còn bấm lưu thêm → TỪ CHỐI liền
  if (data.goalAmount > 0) {
    toast("🚫 Từ chối! Bạn đã có mục tiêu tiết kiệm rồi, không cho lưu thêm!", "error");
    return;
  }
  const goalAmount = parseFloat($("goalAmount").value) || 0;
  const start = $("startDate").value;
  const end = $("endDate").value;

  if (goalAmount < 1000) return toast("⚠️ Số tiền mục tiêu tối thiểu 1.000₫", "error");
  if (start && end && new Date(end) < new Date(start))
    return toast("⚠️ Ngày kết thúc phải sau ngày bắt đầu!", "error");

  data.goalType = $("goalSelect").value;
  data.goalCustom = $("customGoal").value.trim();
  data.goalAmount = goalAmount;
  data.startDate = start;
  data.endDate = end;

  // Tính lại countFrom cho các khoản cũ theo quy tắc ngày đầu không tính
  data.amounts.forEach(a => { a.countFrom = computeCountFrom(a.at); });

  render();
  persistNow();
  toast("🎯 Đã lưu mục tiêu tiết kiệm!", "success");
});

/* =========================================================
   🗑️ RESET THỦ CÔNG
   ========================================================= */
$("btnReset").addEventListener("click", () => {
  if (!data.amounts.length) return toast("⚠️ Không có tiền nào trong quỹ để hủy!", "error");
  if (!confirm("🚫 Hủy bỏ tiết kiệm? Toàn bộ tiền trong quỹ sẽ bị xóa (tài khoản & mục tiêu vẫn giữ lại)!")) return;
  data.amounts = [];
  render();
  persistNow();
  toast("🚫 Đã hủy bỏ tiết kiệm — toàn bộ tiền trong quỹ đã bị xóa!", "warn");
});

/* =========================================================
   ⏳ 2 PHƯƠNG ÁN CHO TIỀN ĐANG CHỜ
   ========================================================= */

// 🛑 Không tiết kiệm nữa → reset TOÀN BỘ tiền nạp vào quỹ về 0
$("btnQuitSaving").addEventListener("click", () => {
  if (!data.amounts.length) return toast("⚠️ Không có tiền nào trong quỹ để reset!", "error");
  if (!confirm("🛑 Bạn quyết định KHÔNG TIẾT KIỆM nữa? Toàn bộ tiền nạp vào quỹ sẽ bị reset về 0!")) return;
  data.amounts = [];
  render();
  persistNow();
  toast("🛑 Đã dừng tiết kiệm — toàn bộ tiền nạp reset về 0!", "warn");
});

// 💰 Hoàn tiền → hệ thống trả lại tiền đang chờ cho người dùng
$("btnRefund").addEventListener("click", () => {
  const pending = data.amounts.filter(a => !isCounted(a));
  if (!pending.length) return toast("⚠️ Không có khoản nào đang chờ để hoàn!", "error");
  const refundTotal = pending.reduce((s, a) => s + a.value, 0);
  if (!confirm(`💰 Hệ thống sẽ hoàn lại ${fmt(refundTotal)} về ví của bạn. Tiếp tục?`)) return;
  // Chỉ hoàn các khoản đang chờ, giữ nguyên tiền đã tính trong quỹ
  data.amounts = data.amounts.filter(isCounted);
  render();
  persistNow();
  toast(`💰 Hoàn tiền thành công! ${fmt(refundTotal)} đã quay về ví của bạn.`, "success");
});

/* =========================================================
   ☠️ HỦY BỎ TOÀN BỘ — xóa dữ liệu VÀ tài khoản (vùng nguy hiểm)
   ========================================================= */
$("btnDestroy").addEventListener("click", () => {
  if (!confirm("⚠️ CẢNH BÁO NGUY HIỂM: Hành động này xóa TRẮNG dữ liệu tiết kiệm VÀ TÀI KHOẢN của bạn vĩnh viễn!")) return;
  if (!confirm("☠️ Xác nhận LẦN CUỐI: Không thể hoàn tác. Chắc chắn hủy bỏ toàn bộ?")) return;
  const user = currentUser;
  stopAutoSave();
  localStorage.removeItem(dataKey());          // xóa dữ liệu tiết kiệm
  const users = getUsers();
  delete users[user];                           // xóa tài khoản
  saveUsers(users);
  localStorage.removeItem(LS_SESSION);
  currentUser = null;
  data = null;
  $("appScreen").classList.add("hidden");
  $("authScreen").classList.remove("hidden");
  $("authPass").value = "";
  $("authUser").value = "";
  toast("☠️ Đã hủy bỏ toàn bộ dữ liệu và tài khoản!", "error");
});

/* =========================================================
   🎉 POPUP CHÚC MỪNG / THẤT BẠI — theo dõi tiến trình tự động
   ========================================================= */
let winShown = false, failShown = false;

function showResult(type, icon, title, text) {
  const modal = $("resultModal");
  modal.querySelector(".modal").className = "modal glass result-modal " + type;
  $("resultIcon").textContent = icon;
  $("resultTitle").textContent = title;
  $("resultText").textContent = text;
  modal.classList.remove("hidden");
}

$("btnResultClose").addEventListener("click", () => {
  $("resultModal").classList.add("hidden");
});

// Tự động phát hiện kết quả mỗi lần render: đủ tiến trình → chúc mừng,
// quá hạn mà chưa đủ → thất bại
function checkGoalResult() {
  if (!data || data.goalAmount <= 0) return;
  const total = totalSaved();
  if (total >= data.goalAmount) {
    if (!winShown) {
      winShown = true;
      showResult("success", "🎉", "Chúc mừng bạn!",
        `Bạn đã hoàn thành mục tiêu ${fmt(data.goalAmount)}! Tổng tiền tiết kiệm hiện tại: ${fmt(total)}. Bạn thật tuyệt vời, tiếp tục phát huy nhé!`);
    }
    failShown = false;
  } else if (data.endDate && dayStart(new Date(data.endDate)) < dayStart(Date.now())) {
    if (!failShown) {
      failShown = true;
      const pct = Math.round((total / data.goalAmount) * 100);
      showResult("fail", "😢", "Tiếc quá, chưa đạt mục tiêu!",
        `Thời hạn tiết kiệm đã kết thúc nhưng bạn mới đạt ${fmt(total)} / ${fmt(data.goalAmount)} (${pct}%). Đừng nản, hãy đặt mục tiêu mới và cố gắng hơn nhé!`);
    }
    winShown = false;
  } else {
    winShown = false;
    failShown = false;
  }
}

/* =========================================================
   💾 LƯU TỰ ĐỘNG — MỐC THỜI GIAN NGẪU NHIÊN, KHÔNG LIÊN TỤC
   - Timer chạy ĐỘC LẬP: user thao tác bao nhiêu cũng không reset lịch
   - Mỗi lần lưu xong → rút thăm mốc tiếp theo (15s–90s ngẫu nhiên)
   - Khi đang lưu: hiện popup cảnh báo; user thoát → HỦY bản lưu đó
   ========================================================= */
function scheduleAutoSave() {
  clearTimeout(saveTimer);
  const delay = SAVE_MIN_MS + Math.random() * (SAVE_MAX_MS - SAVE_MIN_MS);
  saveTimer = setTimeout(runAutoSave, delay);
}

function stopAutoSave() { clearTimeout(saveTimer); isSaving = false; }

function runAutoSave() {
  isSaving = true;
  pendingSnapshot = JSON.stringify(data);

  const modal = $("saveModal");
  modal.classList.remove("hidden");

  setTimeout(() => {
    if (!isSaving) return; // đã bị hủy do user thoát
    localStorage.setItem(dataKey(), pendingSnapshot);
    pendingSnapshot = null;
    isSaving = false;
    modal.classList.add("hidden");
    toast("💾 Hệ thống đã lưu dữ liệu thành công!", "success");
    scheduleAutoSave(); // rút thăm mốc ngẫu nhiên tiếp theo
  }, 2500);
}

// User THOÁT khi đang lưu → HỦY BỎ lần lưu này
window.addEventListener("beforeunload", (e) => {
  if (isSaving) {
    isSaving = false;
    pendingSnapshot = null;
    e.preventDefault();
    e.returnValue = "⚠️ Hệ thống đang lưu, thoát ngay sẽ HỦY bản lưu này!";
  }
});

// Tab bị ẩn đột ngột khi đang lưu → hủy luôn
document.addEventListener("visibilitychange", () => {
  if (document.hidden && isSaving) {
    isSaving = false;
    pendingSnapshot = null;
    $("saveModal").classList.add("hidden");
    toast("⚠️ Phát hiện bạn rời đi — lần lưu này đã bị HỦY!", "error");
    scheduleAutoSave();
  }
});

/* =========================================================
   📡 DÒ PING TỰ ĐỘNG
   ========================================================= */
async function checkPing() {
  const dot = $("pingDot"), txt = $("pingText");
  if (!navigator.onLine) {
    dot.className = "ping-dot offline";
    txt.textContent = "Mất kết nối mạng!";
    return;
  }
  const start = performance.now();
  try {
    await fetch(location.href.split("#")[0], { method: "HEAD", cache: "no-store" });
    const ms = Math.round(performance.now() - start);
    dot.className = "ping-dot " + (ms < 300 ? "online" : "warn");
    txt.textContent = `Ping: ${ms}ms`;
  } catch {
    dot.className = "ping-dot offline";
    txt.textContent = "Mất kết nối!";
  }
}
setInterval(checkPing, 10000);

// 🌅 TỰ ĐỘNG PHÁT HIỆN QUA NGÀY MỚI → cập nhật lại số tiền được tính
let lastKnownDay = dayStart(Date.now());
setInterval(() => {
  const today = dayStart(Date.now());
  if (today !== lastKnownDay) {
    lastKnownDay = today; // trời sáng, qua ngày mới rồi!
    render(); // tiền nạp hôm qua giờ được tính vào tổng tự động
    toast("🌅 Qua ngày mới! Hệ thống đã tự động cập nhật lại số tiền tiết kiệm của bạn.", "success");
  }
}, 30000); // kiểm tra mỗi 30 giây
window.addEventListener("online", checkPing);
window.addEventListener("offline", checkPing);

/* =========================================================
   KHỞI ĐỘNG
   ========================================================= */
function startApp(user) {
  currentUser = user;
  loadData();
  $("helloName").textContent = user;
  $("authScreen").classList.add("hidden");
  $("appScreen").classList.remove("hidden");
  render();
  checkPing();
  scheduleAutoSave(); // lịch lưu tự động chạy riêng, ngẫu nhiên
  toast(`👋 Chào mừng ${user} quay lại!`, "success");
}

(function init() {
  const session = localStorage.getItem(LS_SESSION);
  if (session && getUsers()[session]) startApp(session);
})();
