/**
 * ============================================================================
 * EDUPAY & SHEETSYNC - LOGIC ỨNG DỤNG QUẢN LÝ HỌC SINH, THU CHI & PHỤ HUYNH
 * Hỗ trợ:
 * - Đồng bộ 2 chiều với Google Sheets qua Google Apps Script Webhook API
 * - Hoạt động mượt mà ở cả chế độ LocalStorage & Cloud Google Sheets
 * - Tạo mã VietQR tự động theo từng học sinh
 * - Đính kèm ảnh biên lai chuyển khoản (tự động nén nhẹ & tải lên Google Drive)
 * ============================================================================
 */

/**
 * Điền link Google Apps Script Web App URL (đuôi /exec) vào biến DEFAULT_GAS_WEBAPP_URL bên dưới
 * trước khi đẩy lên GitHub Pages để TẤT CẢ điện thoại của Phụ huynh & Học sinh khi truy cập
 * link web đều tự động kết nối thẳng vào Google Sheet của bạn!
 */
const DEFAULT_GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbz6CZ6W-WRxFP67uj3or2arPYHc_VLqCUQsG8L5vNMI4DNAqDquBT7OFvR7FRTvjYcx6w/exec';

const STORAGE_KEYS = {
  STATE: 'edupay_app_state_v1',
  GAS_URL: 'edupay_gas_webapp_url',
  AUTO_SYNC: 'edupay_auto_sync_enabled',
  ADMIN_AUTH: 'edupay_admin_authenticated'
};

// Ảnh biên lai mẫu dạng SVG Data URI để người dùng xem thử ngay lập tức
const SAMPLE_RECEIPT_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="420" height="580" viewBox="0 0 420 580">
  <rect width="420" height="580" rx="24" fill="#f8fafc"/>
  <rect x="20" y="20" width="380" height="540" rx="18" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <circle cx="210" cy="80" r="30" fill="#d1fae5"/>
  <path d="M196 80 L206 90 L226 70" stroke="#059669" stroke-width="5" fill="none" stroke-linecap="round"/>
  <text x="210" y="135" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#0f172a">CHUYỂN KHOẢN THÀNH CÔNG</text>
  <text x="210" y="172" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#059669">1.500.000 VND</text>
  <text x="210" y="198" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#64748b">22/10/2026 - 15:42:18</text>
  <line x1="45" y1="225" x2="375" y2="225" stroke="#e2e8f0" stroke-dasharray="4 4"/>
  <text x="50" y="260" font-family="Arial, sans-serif" font-size="13" fill="#64748b">Người nhận:</text>
  <text x="370" y="260" text-anchor="end" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#0f172a">NGUYEN VAN A</text>
  <text x="50" y="295" font-family="Arial, sans-serif" font-size="13" fill="#64748b">Ngân hàng nhận:</text>
  <text x="370" y="295" text-anchor="end" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#0f172a">MB Bank - 090123456789</text>
  <text x="50" y="330" font-family="Arial, sans-serif" font-size="13" fill="#64748b">Người chuyển:</text>
  <text x="370" y="330" text-anchor="end" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#0f172a">TRAN VAN HUNG (PH HS002)</text>
  <text x="50" y="365" font-family="Arial, sans-serif" font-size="13" fill="#64748b">Nội dung CK:</text>
  <text x="370" y="365" text-anchor="end" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#2563eb">HP T10 HS002 TRAN GIA HUY</text>
  <text x="50" y="400" font-family="Arial, sans-serif" font-size="13" fill="#64748b">Mã giao dịch:</text>
  <text x="370" y="400" text-anchor="end" font-family=" monospace" font-size="13" fill="#334155">FT262958891203</text>
  <rect x="45" y="445" width="330" height="75" rx="12" fill="#eff6ff"/>
  <text x="210" y="478" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#1e40af">BIÊN LAI ĐIỆN TỬ ĐÍNH KÈM TRÊN WEB APP</text>
  <text x="210" y="500" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#3b82f6">Đã đồng bộ Google Sheets &amp; Google Drive</text>
</svg>`);

// Khởi tạo dữ liệu mẫu ban đầu
function getInitialDemoState() {
  return {
    settings: {
      centerName: 'Lớp Học & Trung Tâm Luyện Thi Ánh Dương',
      bankBin: 'MB',
      bankAccountNo: '090123456789',
      bankAccountName: 'NGUYEN VAN A',
      defaultPeriod: 'Tháng 10/2026',
      adminPassword: '123456',
      teacherPhone: '0901234567'
    },
    students: [
      {
        id: 'ST_1001',
        studentCode: 'HS001',
        fullName: 'Nguyễn Minh Anh',
        className: 'Toán 12A - Luyện Thi ĐH',
        parentName: 'Chị Nguyễn Thị Lan',
        parentPhone: '0901234567',
        period: 'Tháng 10/2026',
        tuitionFee: 1500000,
        status: 'Chưa đóng',
        receiptUrl: '',
        updatedAt: '2026-10-20 08:30',
        note: 'Học ca T3 - T5 - CN'
      },
      {
        id: 'ST_1002',
        studentCode: 'HS002',
        fullName: 'Trần Gia Huy',
        className: 'Toán 12A - Luyện Thi ĐH',
        parentName: 'Anh Trần Văn Hùng',
        parentPhone: '0912345678',
        period: 'Tháng 10/2026',
        tuitionFee: 1500000,
        status: 'Chờ duyệt',
        receiptUrl: SAMPLE_RECEIPT_SVG,
        updatedAt: '2026-10-22 15:43',
        note: 'Phụ huynh vừa gửi biên lai chuyển khoản'
      },
      {
        id: 'ST_1003',
        studentCode: 'HS003',
        fullName: 'Lê Hoàng Bảo Ngọc',
        className: 'Toán 11B - Nâng Cao',
        parentName: 'Chị Lê Thu Hà',
        parentPhone: '0987654321',
        period: 'Tháng 10/2026',
        tuitionFee: 1200000,
        status: 'Đã hoàn thành',
        receiptUrl: SAMPLE_RECEIPT_SVG,
        updatedAt: '2026-10-18 19:20',
        note: 'Đã đóng đủ đầu tháng'
      },
      {
        id: 'ST_1004',
        studentCode: 'HS004',
        fullName: 'Phạm Quốc Khánh',
        className: 'Toán 10A - Cơ Bản & Ôn Tập',
        parentName: 'Anh Phạm Minh Tuấn',
        parentPhone: '0933445566',
        period: 'Tháng 10/2026',
        tuitionFee: 1000000,
        status: 'Chưa đóng',
        receiptUrl: '',
        updatedAt: '2026-10-15 10:00',
        note: 'Hẹn đóng ngày 25/10'
      },
      {
        id: 'ST_1005',
        studentCode: 'HS005',
        fullName: 'Vũ Phương Thảo',
        className: 'Toán 11B - Nâng Cao',
        parentName: 'Chị Hoàng Mai',
        parentPhone: '0977889900',
        period: 'Tháng 10/2026',
        tuitionFee: 1200000,
        status: 'Đã hoàn thành',
        receiptUrl: '',
        updatedAt: '2026-10-19 20:15',
        note: 'Thu tiền mặt tại lớp'
      }
    ],
    transactions: [
      {
        id: 'GD_2001',
        date: '2026-10-18',
        type: 'Thu',
        category: 'Thu học phí',
        amount: 1200000,
        description: 'Thu học phí Tháng 10/2026 - HS003 Lê Hoàng Bảo Ngọc',
        studentCode: 'HS003',
        method: 'Chuyển khoản',
        receiptUrl: SAMPLE_RECEIPT_SVG,
        createdBy: 'Quản lý (Duyệt CK)'
      },
      {
        id: 'GD_2002',
        date: '2026-10-19',
        type: 'Thu',
        category: 'Thu học phí',
        amount: 1200000,
        description: 'Thu học phí Tháng 10/2026 - HS005 Vũ Phương Thảo',
        studentCode: 'HS005',
        method: 'Tiền mặt',
        receiptUrl: '',
        createdBy: 'Quản lý'
      },
      {
        id: 'GD_2003',
        date: '2026-10-20',
        type: 'Chi',
        category: 'Chi in ấn / tài liệu',
        amount: 450000,
        description: 'In đề cương và chuyên đề ôn thi tháng 10 cho khối 11 & 12',
        studentCode: '',
        method: 'Chuyển khoản',
        receiptUrl: '',
        createdBy: 'Quản lý'
      },
      {
        id: 'GD_2004',
        date: '2026-10-21',
        type: 'Chi',
        category: 'Chi thuê phòng / điện nước',
        amount: 600000,
        description: 'Thanh toán tiền điện nước và vệ sinh phòng học tháng 10',
        studentCode: '',
        method: 'Chuyển khoản',
        receiptUrl: '',
        createdBy: 'Quản lý'
      }
    ],
    paymentRequests: [
      {
        id: 'YC_3001',
        submittedAt: '2026-10-22 15:43',
        studentRecordId: 'ST_1002',
        studentCode: 'HS002',
        studentName: 'Trần Gia Huy',
        className: 'Toán 12A - Luyện Thi ĐH',
        period: 'Tháng 10/2026',
        amount: 1500000,
        parentPhone: '0912345678',
        payerName: 'Anh Trần Văn Hùng (Bố cháu Huy)',
        note: 'Gia đình vừa chuyển khoản học phí tháng 10 cho cháu Huy nhờ thầy/cô kiểm tra giúp ạ.',
        receiptUrl: SAMPLE_RECEIPT_SVG,
        status: 'Chờ duyệt',
        reviewedAt: ''
      }
    ]
  };
}

// Biến trạng thái toàn cục
let appState = loadStateFromLocal();
let currentMode = 'parent'; // 'parent' | 'admin'
let currentAdminTab = 'dashboard';
let uploadedReceiptBase64 = '';
let financeBarChartInstance = null;
let tuitionPieChartInstance = null;

// Khởi chạy khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  initAppUI();

  // Nếu đã cấu hình link Google Sheet thì tự động tải dữ liệu mới nhất về
  const gasUrl = getGasUrl();
  if (gasUrl) {
    syncFromGoogleSheet(false);
  }
});

function loadStateFromLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STATE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.students && parsed.transactions && parsed.settings) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Không đọc được LocalStorage, dùng dữ liệu mẫu:', e);
  }
  const initial = getInitialDemoState();
  localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(initial));
  return initial;
}

function saveStateToLocal() {
  localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(appState));
  refreshAllViews();
}

function getGasUrl() {
  return (localStorage.getItem(STORAGE_KEYS.GAS_URL) || DEFAULT_GAS_WEBAPP_URL || '').trim();
}

function isAutoSyncEnabled() {
  const val = localStorage.getItem(STORAGE_KEYS.AUTO_SYNC);
  return val === null ? true : val === 'true';
}

function initAppUI() {
  // Cập nhật trạng thái kết nối Sheet trên Header
  updateSyncStatusBanner();

  // Đổ dữ liệu cài đặt vào form
  populateSettingsForm();

  // Mặc định hiển thị danh sách tra cứu mẫu cho Phụ huynh để dễ quan sát
  quickParentSearch('Tất cả');

  // Render toàn bộ giao diện Quản lý
  refreshAllViews();
}

function refreshAllViews() {
  // Header
  document.getElementById('header-center-name').textContent =
    appState.settings.centerName || 'Quản Lý Lớp Học & Học Phí';

  // Đếm số yêu cầu chờ duyệt
  const pendingCount = (appState.paymentRequests || []).filter(r => r.status === 'Chờ duyệt').length;
  const navBadge = document.getElementById('nav-pending-badge');
  const tabBadge = document.getElementById('tab-pending-count');

  if (pendingCount > 0) {
    navBadge.textContent = pendingCount;
    navBadge.classList.remove('hidden');
    tabBadge.textContent = pendingCount;
    tabBadge.classList.remove('hidden');
  } else {
    navBadge.classList.add('hidden');
    tabBadge.classList.add('hidden');
  }

  // Cập nhật các bộ lọc Lớp và Kỳ học phí
  populateStudentFilterDropdowns();

  // Render Dashboard, Bảng Học sinh, Bảng Thu Chi
  renderAdminDashboard();
  renderAdminStudents();
  renderAdminTransactions();

  // Nếu đang có tìm kiếm bên Phụ huynh thì làm mới lại kết quả
  const currentSearch = document.getElementById('parent-search-input').value.trim();
  if (currentSearch) {
    handleParentSearch(false);
  }

  lucide.createIcons();
}

// ============================================================================
// CHUYỂN ĐỔI GIỮA CỔNG PHỤ HUYNH & CỔNG QUẢN LÝ
// ============================================================================
function switchAppMode(mode) {
  currentMode = mode;
  const parentView = document.getElementById('parent-view');
  const adminView = document.getElementById('admin-view');
  const btnParent = document.getElementById('btn-mode-parent');
  const btnAdmin = document.getElementById('btn-mode-admin');

  if (mode === 'parent') {
    parentView.classList.remove('hidden');
    adminView.classList.add('hidden');
    btnParent.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition bg-white text-blue-600 shadow-xs';
    btnAdmin.className = 'relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition text-slate-600 hover:text-slate-900';
  } else {
    parentView.classList.add('hidden');
    adminView.classList.remove('hidden');
    btnAdmin.className = 'relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition bg-white text-blue-600 shadow-xs';
    btnParent.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition text-slate-600 hover:text-slate-900';

    checkAdminAuthStatus();
  }
  lucide.createIcons();
}

function checkAdminAuthStatus() {
  const isAuth = sessionStorage.getItem(STORAGE_KEYS.ADMIN_AUTH) === 'true';
  const loginBox = document.getElementById('admin-login-box');
  const workspace = document.getElementById('admin-workspace');

  if (isAuth) {
    loginBox.classList.add('hidden');
    workspace.classList.remove('hidden');
    refreshAllViews();
  } else {
    loginBox.classList.remove('hidden');
    workspace.classList.add('hidden');
  }
}

function handleAdminLogin(e) {
  e.preventDefault();
  const inputPass = document.getElementById('admin-password-input').value.trim();
  const actualPass = String(appState.settings.adminPassword || '123456').trim();

  if (inputPass === actualPass) {
    sessionStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, 'true');
    document.getElementById('admin-password-input').value = '';
    showToast('Đăng nhập Quản lý thành công!', 'success');
    checkAdminAuthStatus();
  } else {
    showToast('Mật khẩu không đúng! (Mặc định: 123456)', 'error');
  }
}

function handleAdminLogout() {
  sessionStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
  showToast('Đã đăng xuất khỏi phiên Quản lý.', 'info');
  checkAdminAuthStatus();
}

function switchAdminTab(tabName) {
  currentAdminTab = tabName;
  const tabs = ['dashboard', 'students', 'finance', 'settings'];
  tabs.forEach(t => {
    const contentEl = document.getElementById('admin-tab-' + t);
    const btnEl = document.getElementById('tab-btn-' + t);
    if (t === tabName) {
      contentEl.classList.remove('hidden');
      btnEl.className = 'admin-tab-btn flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition bg-blue-600 text-white';
    } else {
      contentEl.classList.add('hidden');
      btnEl.className = 'admin-tab-btn flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition text-slate-600 hover:bg-slate-100';
    }
  });

  if (tabName === 'dashboard') {
    renderAdminDashboard();
  } else if (tabName === 'settings') {
    populateSettingsForm();
  }
  lucide.createIcons();
}

// ============================================================================
// PHÂN HỆ 1: TRA CỨU HỌC PHÍ & GỬI XÁC NHẬN CHUYỂN KHOẢN CHO PHỤ HUYNH / HS
// ============================================================================
function quickParentSearch(keyword) {
  const input = document.getElementById('parent-search-input');
  input.value = keyword;
  handleParentSearch(false);
}

function handleParentSearch(showNotification = true) {
  const rawQuery = document.getElementById('parent-search-input').value.trim();
  const container = document.getElementById('parent-results-container');

  if (!rawQuery) {
    container.innerHTML = '';
    if (showNotification) showToast('Vui lòng nhập Mã học sinh, SĐT hoặc Họ tên để tra cứu!', 'warning');
    return;
  }

  const q = removeVietnameseTones(rawQuery.toLowerCase());
  const isAll = rawQuery.toLowerCase() === 'tất cả' || rawQuery.toLowerCase() === 'tat ca';

  const matched = (appState.students || []).filter(s => {
    if (isAll) return true;
    const code = removeVietnameseTones((s.studentCode || '').toLowerCase());
    const name = removeVietnameseTones((s.fullName || '').toLowerCase());
    const phone = (s.parentPhone || '').replace(/\s+/g, '');
    const parent = removeVietnameseTones((s.parentName || '').toLowerCase());
    return code.includes(q) || name.includes(q) || phone.includes(rawQuery) || parent.includes(q);
  });

  if (matched.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
        <div class="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <i data-lucide="search-x" class="w-6 h-6"></i>
        </div>
        <h3 class="font-bold text-slate-800">Không tìm thấy thông tin học sinh phù hợp</h3>
        <p class="text-xs text-slate-500">Vui lòng kiểm tra lại Mã học sinh (VD: HS001), Số điện thoại phụ huynh hoặc liên hệ giáo viên (${escapeHtml(appState.settings.teacherPhone || '')}).</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = `
    <div class="flex items-center justify-between px-1">
      <h3 class="font-bold text-slate-800 text-sm sm:text-base">
        Kết quả tra cứu (${matched.length} bản ghi học phí)
      </h3>
      <span class="text-xs text-slate-500">Bấm vào nút Thanh toán để lấy mã QR & gửi biên lai</span>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${matched.map(s => renderParentStudentCard(s)).join('')}
    </div>
  `;
  lucide.createIcons();
}

function renderParentStudentCard(s) {
  const badgeClass = getStatusBadgeClass(s.status);
  const statusIcon =
    s.status === 'Đã hoàn thành'
      ? 'check-circle-2'
      : s.status === 'Chờ duyệt'
      ? 'clock'
      : 'alert-circle';

  let actionAreaHtml = '';
  if (s.status === 'Chưa đóng') {
    actionAreaHtml = `
      <button
        onclick="openPaymentModal('${s.id}')"
        class="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 shadow-sm shadow-blue-200 cursor-pointer"
      >
        <i data-lucide="qr-code" class="w-4 h-4"></i>
        <span>Quét Mã QR & Gửi Xác Nhận Đã Chuyển Khoản</span>
      </button>
    `;
  } else if (s.status === 'Chờ duyệt') {
    actionAreaHtml = `
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-2">
        <div class="flex items-center justify-between">
          <span class="font-semibold flex items-center gap-1.5">
            <i data-lucide="clock" class="w-4 h-4 text-amber-600"></i>
            Đã gửi xác nhận chuyển khoản - Đang chờ duyệt
          </span>
          ${
            s.receiptUrl
              ? `<button onclick="openReceiptViewer('${escapeAttr(s.receiptUrl)}', 'Biên lai ${escapeAttr(s.fullName)}')" class="text-blue-600 font-semibold hover:underline cursor-pointer">Xem biên lai</button>`
              : ''
          }
        </div>
        <div class="flex items-center justify-between pt-1 border-t border-amber-200/60">
          <span class="text-[11px] text-amber-700">Cập nhật lúc: ${escapeHtml(s.updatedAt || 'Vừa xong')}</span>
          <button onclick="openPaymentModal('${s.id}')" class="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer">
            Gửi lại / Bổ sung ảnh biên lai
          </button>
        </div>
      </div>
    `;
  } else {
    actionAreaHtml = `
      <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i data-lucide="badge-check" class="w-5 h-5 text-emerald-600 shrink-0"></i>
          <div>
            <p class="font-bold text-emerald-800">Đã hoàn thành học phí kỳ này</p>
            <p class="text-[11px] text-emerald-600">Xác nhận lúc: ${escapeHtml(s.updatedAt || '')}</p>
          </div>
        </div>
        ${
          s.receiptUrl
            ? `<button onclick="openReceiptViewer('${escapeAttr(s.receiptUrl)}', 'Biên lai ${escapeAttr(s.fullName)}')" class="px-2.5 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-700 font-semibold hover:bg-emerald-100 cursor-pointer shrink-0">Xem biên lai</button>`
            : ''
        }
      </div>
    `;
  }

  return `
    <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs hover:shadow-md transition flex flex-col justify-between gap-4">
      <div class="space-y-3">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-mono font-bold text-xs border border-blue-200">
                ${escapeHtml(s.studentCode)}
              </span>
              <h4 class="font-bold text-slate-900 text-base">${escapeHtml(s.fullName)}</h4>
            </div>
            <p class="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <i data-lucide="book-open" class="w-3.5 h-3.5 text-slate-400"></i>
              <span>${escapeHtml(s.className)}</span>
            </p>
          </div>

          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${badgeClass}">
            <i data-lucide="${statusIcon}" class="w-3.5 h-3.5"></i>
            <span>${escapeHtml(s.status)}</span>
          </span>
        </div>

        <div class="bg-slate-50 rounded-xl p-3.5 border border-slate-100 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span class="text-slate-400 block">Phụ huynh:</span>
            <span class="font-semibold text-slate-700">${escapeHtml(s.parentName || '---')} (${escapeHtml(maskPhone(s.parentPhone))})</span>
          </div>
          <div>
            <span class="text-slate-400 block">Kỳ thu học phí:</span>
            <span class="font-bold text-indigo-700">${escapeHtml(s.period)}</span>
          </div>
          <div class="col-span-2 pt-2 border-t border-slate-200/70 flex items-center justify-between">
            <span class="text-slate-500 font-medium">Số tiền học phí cần đóng:</span>
            <span class="text-base sm:text-lg font-extrabold text-slate-900">${formatCurrency(s.tuitionFee)}</span>
          </div>
        </div>

        ${s.note ? `<p class="text-xs text-slate-500 italic">Ghi chú: ${escapeHtml(s.note)}</p>` : ''}
      </div>

      <div>
        ${actionAreaHtml}
      </div>
    </div>
  `;
}

// Mở Modal Quét QR & Xác nhận chuyển khoản
function openPaymentModal(studentRecordId) {
  const student = appState.students.find(s => s.id === studentRecordId);
  if (!student) return;

  uploadedReceiptBase64 = '';
  clearReceiptPreview();

  const stg = appState.settings;
  const memo = buildTransferMemo(student);
  const qrUrl = buildVietQrUrl(stg.bankBin, stg.bankAccountNo, stg.bankAccountName, student.tuitionFee, memo);

  document.getElementById('pay-student-record-id').value = student.id;
  document.getElementById('pay-modal-qr-img').src = qrUrl;
  document.getElementById('pay-modal-bank').textContent = stg.bankBin;
  document.getElementById('pay-modal-owner').textContent = stg.bankAccountName;
  document.getElementById('pay-modal-acc').textContent = stg.bankAccountNo;
  document.getElementById('pay-modal-amount-text').textContent = formatCurrency(student.tuitionFee);
  document.getElementById('pay-modal-memo').textContent = memo;

  document.getElementById('pay-form-student-name').textContent = student.fullName;
  document.getElementById('pay-form-student-code').textContent = student.studentCode;
  document.getElementById('pay-form-class').textContent = student.className;
  document.getElementById('pay-form-period').textContent = student.period;

  document.getElementById('pay-form-payer').value = student.parentName || ('PH em ' + student.fullName);
  document.getElementById('pay-form-phone').value = student.parentPhone || '';
  document.getElementById('pay-form-amount').value = student.tuitionFee || 0;
  document.getElementById('pay-form-note').value = '';

  document.getElementById('payment-modal').classList.remove('hidden');
  lucide.createIcons();
}

function closePaymentModal() {
  document.getElementById('payment-modal').classList.add('hidden');
}

function buildTransferMemo(student) {
  const cleanName = removeVietnameseTones(student.fullName || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '');
  const cleanCode = (student.studentCode || 'HS').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `HP ${cleanCode} ${cleanName}`.substring(0, 45).trim();
}

function buildVietQrUrl(bankBin, accountNo, accountName, amount, addInfo) {
  const bin = encodeURIComponent((bankBin || 'MB').trim());
  const acc = encodeURIComponent((accountNo || '090123456789').trim());
  const name = encodeURIComponent((accountName || 'NGUYEN VAN A').trim());
  const amt = Number(amount) || 0;
  const info = encodeURIComponent((addInfo || 'HOC PHI').trim());
  return `https://img.vietqr.io/image/${bin}-${acc}-compact2.png?amount=${amt}&addInfo=${info}&accountName=${name}`;
}

// Xử lý chọn & nén ảnh biên lai
function handleReceiptFileSelect(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  compressImageFile(file, 900, 0.76, (base64Url) => {
    uploadedReceiptBase64 = base64Url;
    const previewBox = document.getElementById('pay-receipt-preview-box');
    const previewImg = document.getElementById('pay-receipt-preview-img');
    previewImg.src = base64Url;
    previewBox.classList.remove('hidden');
    showToast('Đã đính kèm ảnh biên lai chuyển khoản!', 'success');
  });
}

function clearReceiptPreview() {
  uploadedReceiptBase64 = '';
  const fileInput = document.getElementById('pay-form-receipt-file');
  if (fileInput) fileInput.value = '';
  const previewBox = document.getElementById('pay-receipt-preview-box');
  if (previewBox) previewBox.classList.add('hidden');
}

function compressImageFile(file, maxDimension, quality, callback) {
  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      let width = img.width;
      let height = img.height;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      callback(dataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Phụ huynh bấm nút "Xác nhận đã chuyển khoản"
async function submitParentPaymentConfirm(event) {
  event.preventDefault();
  const studentRecordId = document.getElementById('pay-student-record-id').value;
  const student = appState.students.find(s => s.id === studentRecordId);
  if (!student) return;

  const payerName = document.getElementById('pay-form-payer').value.trim();
  const parentPhone = document.getElementById('pay-form-phone').value.trim();
  const amount = Number(document.getElementById('pay-form-amount').value) || student.tuitionFee;
  const note = document.getElementById('pay-form-note').value.trim();
  const nowStr = getCurrentDateTimeString();

  const submitBtn = document.getElementById('btn-submit-parent-pay');
  const originalBtnHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> <span>Đang gửi xác nhận...</span>`;
  lucide.createIcons();

  const newRequest = {
    id: 'YC_' + Date.now(),
    submittedAt: nowStr,
    studentRecordId: student.id,
    studentCode: student.studentCode,
    studentName: student.fullName,
    className: student.className,
    period: student.period,
    amount: amount,
    parentPhone: parentPhone,
    payerName: payerName,
    note: note || 'Phụ huynh xác nhận đã chuyển khoản trên App',
    receiptUrl: uploadedReceiptBase64 || student.receiptUrl || '',
    receiptBase64: uploadedReceiptBase64 || '',
    status: 'Chờ duyệt',
    reviewedAt: ''
  };

  // Cập nhật ngay trên trạng thái ứng dụng
  appState.paymentRequests.unshift(newRequest);
  if (student.status !== 'Đã hoàn thành') {
    student.status = 'Chờ duyệt';
  }
  if (uploadedReceiptBase64) {
    student.receiptUrl = uploadedReceiptBase64;
  }
  student.updatedAt = nowStr;

  saveStateToLocal();

  // Nếu có cấu hình Google Sheet -> Đẩy trực tiếp lên Sheet & Google Drive
  const gasUrl = getGasUrl();
  if (gasUrl) {
    try {
      const response = await postToGas(gasUrl, {
        action: 'submitParentPayment',
        request: newRequest
      });
      if (response && response.success && response.data) {
        appState = mergeServerData(response.data);
        saveStateToLocal();
      }
      showToast('Đã gửi xác nhận & cập nhật lên Google Sheet thành công!', 'success');
    } catch (err) {
      console.warn('Lỗi gửi lên Sheet, đã lưu cục bộ:', err);
      showToast('Đã ghi nhận xác nhận thanh toán! (Đang lưu trên máy)', 'success');
    }
  } else {
    showToast('Đã gửi xác nhận chuyển khoản thành công! Trạng thái đã chuyển sang "Chờ duyệt".', 'success');
  }

  submitBtn.disabled = false;
  submitBtn.innerHTML = originalBtnHtml;
  closePaymentModal();
  handleParentSearch(false);
}

// ============================================================================
// PHÂN HỆ 2: QUẢN LÝ DASHBOARD & DUYỆT CHUYỂN KHOẢN
// ============================================================================
function renderAdminDashboard() {
  const transactions = appState.transactions || [];
  const students = appState.students || [];
  const requests = appState.paymentRequests || [];

  // 1. Tính KPI Thu - Chi
  const incomeList = transactions.filter(t => t.type === 'Thu');
  const expenseList = transactions.filter(t => t.type === 'Chi');
  const totalIncome = incomeList.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const totalExpense = expenseList.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const netBalance = totalIncome - totalExpense;

  document.getElementById('kpi-total-income').textContent = formatCurrency(totalIncome);
  document.getElementById('kpi-income-sub').textContent = `${incomeList.length} phiếu thu đã ghi nhận`;

  document.getElementById('kpi-total-expense').textContent = formatCurrency(totalExpense);
  document.getElementById('kpi-expense-sub').textContent = `${expenseList.length} phiếu chi đã ghi nhận`;

  const netEl = document.getElementById('kpi-net-balance');
  netEl.textContent = formatCurrency(netBalance);
  netEl.className = `text-2xl font-extrabold mt-2 ${netBalance >= 0 ? 'text-blue-600' : 'text-rose-600'}`;

  // 2. Tính KPI Học phí
  const paidCount = students.filter(s => s.status === 'Đã hoàn thành').length;
  const pendingCount = students.filter(s => s.status === 'Chờ duyệt').length;
  const unpaidCount = students.filter(s => s.status === 'Chưa đóng').length;

  document.getElementById('kpi-tuition-progress').textContent = `${paidCount} / ${students.length} HS`;
  document.getElementById('kpi-tuition-sub').textContent = `${pendingCount} chờ duyệt • ${unpaidCount} chưa đóng`;

  // 3. Render danh sách Yêu cầu xác nhận chuyển khoản từ Phụ huynh
  const pendingReqs = requests.filter(r => r.status === 'Chờ duyệt');
  document.getElementById('pending-box-badge').textContent = `${pendingReqs.length} chờ duyệt`;

  const pendingListEl = document.getElementById('pending-requests-list');
  if (pendingReqs.length === 0) {
    pendingListEl.innerHTML = `
      <div class="py-8 text-center text-slate-400 space-y-1">
        <i data-lucide="check-check" class="w-8 h-8 mx-auto text-emerald-500"></i>
        <p class="text-sm font-semibold text-slate-600">Tuyệt vời! Không có yêu cầu chuyển khoản nào đang chờ duyệt.</p>
        <p class="text-xs">Khi phụ huynh hoặc học sinh gửi thông tin chuyển khoản trên cổng tra cứu, thông báo sẽ hiện ngay tại đây.</p>
      </div>
    `;
  } else {
    pendingListEl.innerHTML = pendingReqs
      .map(
        req => `
      <div class="bg-amber-50/40 rounded-xl p-4 border border-amber-200/80 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div class="flex items-start gap-3.5">
          ${
            req.receiptUrl
              ? `<img
                  onclick="openReceiptViewer('${escapeAttr(req.receiptUrl)}', 'Biên lai ${escapeAttr(req.studentName)}')"
                  src="${escapeAttr(req.receiptUrl)}"
                  alt="Biên lai"
                  class="w-16 h-20 rounded-lg object-cover border border-amber-300 cursor-pointer hover:opacity-90 shrink-0 bg-white"
                  title="Bấm để phóng to ảnh biên lai"
                />`
              : `<div class="w-16 h-20 rounded-lg bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-[10px] text-slate-400 shrink-0 text-center p-1">
                  <i data-lucide="file-text" class="w-5 h-5 mb-1"></i>Không ảnh
                </div>`
          }
          <div class="space-y-1 text-xs">
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-mono font-bold">${escapeHtml(req.studentCode)}</span>
              <span class="font-bold text-slate-900 text-sm">${escapeHtml(req.studentName)}</span>
              <span class="text-slate-500">• ${escapeHtml(req.className)}</span>
              <span class="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">${escapeHtml(req.period)}</span>
            </div>
            <p class="text-slate-700">
              Người chuyển: <strong>${escapeHtml(req.payerName || 'Phụ huynh')}</strong> (${escapeHtml(req.parentPhone)})
              — Số tiền báo chuyển: <strong class="text-emerald-700 text-sm">${formatCurrency(req.amount)}</strong>
            </p>
            <p class="text-slate-500 italic">"${escapeHtml(req.note || 'Không có ghi chú')}"</p>
            <p class="text-[11px] text-slate-400">Gửi lúc: ${escapeHtml(req.submittedAt)}</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end shrink-0">
          ${
            req.receiptUrl
              ? `<button
                  onclick="openReceiptViewer('${escapeAttr(req.receiptUrl)}', 'Biên lai ${escapeAttr(req.studentName)}')"
                  class="px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <i data-lucide="eye" class="w-4 h-4"></i>
                  <span>Xem biên lai</span>
                </button>`
              : ''
          }
          <button
            onclick="handleReviewPaymentRequest('${req.id}', 'Từ chối')"
            class="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <i data-lucide="x-circle" class="w-4 h-4"></i>
            <span>Chưa nhận được</span>
          </button>
          <button
            onclick="handleReviewPaymentRequest('${req.id}', 'Đã duyệt')"
            class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <i data-lucide="check-circle" class="w-4 h-4"></i>
            <span>Duyệt (Đã nhận tiền)</span>
          </button>
        </div>
      </div>
    `
      )
      .join('');
  }

  // 4. Vẽ biểu đồ
  renderDashboardCharts(totalIncome, totalExpense, paidCount, pendingCount, unpaidCount);
  lucide.createIcons();
}

// Quản lý bấm Duyệt hoặc Từ chối yêu cầu chuyển khoản của Phụ huynh
async function handleReviewPaymentRequest(requestId, decision) {
  const req = appState.paymentRequests.find(r => r.id === requestId);
  if (!req) return;

  const nowStr = getCurrentDateTimeString();
  const todayDate = new Date().toISOString().slice(0, 10);

  req.status = decision;
  req.reviewedAt = nowStr;

  // Tìm bản ghi học sinh tương ứng
  const student = appState.students.find(
    s =>
      s.id === req.studentRecordId ||
      (s.studentCode === req.studentCode && s.period === req.period)
  );

  let createdTransaction = null;

  if (decision === 'Đã duyệt') {
    if (student) {
      student.status = 'Đã hoàn thành';
      if (req.receiptUrl) student.receiptUrl = req.receiptUrl;
      student.updatedAt = nowStr;
    }

    // Tự động ghi 1 phiếu Thu vào Sổ Thu - Chi
    createdTransaction = {
      id: 'GD_' + Date.now(),
      date: todayDate,
      type: 'Thu',
      category: 'Thu học phí',
      amount: Number(req.amount) || (student ? student.tuitionFee : 0),
      description: `Thu học phí ${req.period} - ${req.studentCode} ${req.studentName} (${req.payerName})`,
      studentCode: req.studentCode,
      method: 'Chuyển khoản',
      receiptUrl: req.receiptUrl || '',
      createdBy: 'Quản lý (Duyệt CK)'
    };
    appState.transactions.unshift(createdTransaction);
  } else {
    if (student) {
      student.status = 'Chưa đóng';
      student.updatedAt = nowStr;
    }
  }

  saveStateToLocal();

  // Đồng bộ lên Google Sheet nếu đã kết nối
  const gasUrl = getGasUrl();
  if (gasUrl && isAutoSyncEnabled()) {
    try {
      await postToGas(gasUrl, {
        action: 'approvePaymentRequest',
        requestId: req.id,
        status: decision,
        reviewedAt: nowStr,
        transaction: createdTransaction
      });
      showToast(
        decision === 'Đã duyệt'
          ? `Đã duyệt học phí em ${req.studentName} & đồng bộ lên Google Sheet!`
          : `Đã chuyển trạng thái em ${req.studentName} về Chưa đóng.`,
        decision === 'Đã duyệt' ? 'success' : 'warning'
      );
      return;
    } catch (e) {
      console.warn('Lỗi đồng bộ duyệt CK:', e);
    }
  }

  showToast(
    decision === 'Đã duyệt'
      ? `Đã duyệt thành công! Học sinh ${req.studentName} đã chuyển sang "Đã hoàn thành" và ghi vào Sổ Thu Chi.`
      : `Đã từ chối yêu cầu. Trạng thái của ${req.studentName} đã quay về "Chưa đóng".`,
    decision === 'Đã duyệt' ? 'success' : 'warning'
  );
}

function renderDashboardCharts(totalIncome, totalExpense, paidCount, pendingCount, unpaidCount) {
  const barCtx = document.getElementById('financeBarChart');
  const pieCtx = document.getElementById('tuitionPieChart');
  if (!barCtx || !pieCtx) return;

  // Tính tổng thu học phí vs thu khác vs các khoản chi
  const tuitionIncome = (appState.transactions || [])
    .filter(t => t.type === 'Thu' && t.category === 'Thu học phí')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const otherIncome = Math.max(0, totalIncome - tuitionIncome);

  if (financeBarChartInstance) financeBarChartInstance.destroy();
  financeBarChartInstance = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels: ['Thu học phí', 'Thu khác', 'Tổng Chi', 'Tồn quỹ thực tế'],
      datasets: [
        {
          label: 'Số tiền (VNĐ)',
          data: [tuitionIncome, otherIncome, totalExpense, Math.max(0, totalIncome - totalExpense)],
          backgroundColor: ['#10b981', '#34d399', '#f43f5e', '#3b82f6'],
          borderRadius: 8
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function (val) {
              return (val / 1000000).toFixed(1) + 'M';
            }
          }
        }
      }
    }
  });

  if (tuitionPieChartInstance) tuitionPieChartInstance.destroy();
  tuitionPieChartInstance = new Chart(pieCtx, {
    type: 'doughnut',
    data: {
      labels: ['Đã hoàn thành', 'Chờ duyệt', 'Chưa đóng'],
      datasets: [
        {
          data: [paidCount, pendingCount, unpaidCount],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

// ============================================================================
// TAB 2: QUẢN LÝ DANH SÁCH HỌC SINH & HỌC PHÍ
// ============================================================================
function populateStudentFilterDropdowns() {
  const classSelect = document.getElementById('filter-student-class');
  const periodSelect = document.getElementById('filter-student-period');
  if (!classSelect || !periodSelect) return;

  const currentClass = classSelect.value || 'ALL';
  const currentPeriod = periodSelect.value || 'ALL';

  const classes = Array.from(new Set((appState.students || []).map(s => s.className).filter(Boolean)));
  const periods = Array.from(new Set((appState.students || []).map(s => s.period).filter(Boolean)));

  classSelect.innerHTML =
    `<option value="ALL">Tất cả lớp (${classes.length})</option>` +
    classes.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');

  periodSelect.innerHTML =
    `<option value="ALL">Tất cả kỳ học phí (${periods.length})</option>` +
    periods.map(p => `<option value="${escapeAttr(p)}">${escapeHtml(p)}</option>`).join('');

  if (classes.includes(currentClass)) classSelect.value = currentClass;
  if (periods.includes(currentPeriod)) periodSelect.value = currentPeriod;
}

function getFilteredStudents() {
  const q = removeVietnameseTones((document.getElementById('filter-student-search')?.value || '').trim().toLowerCase());
  const classFilter = document.getElementById('filter-student-class')?.value || 'ALL';
  const periodFilter = document.getElementById('filter-student-period')?.value || 'ALL';
  const statusFilter = document.getElementById('filter-student-status')?.value || 'ALL';

  return (appState.students || []).filter(s => {
    if (classFilter !== 'ALL' && s.className !== classFilter) return false;
    if (periodFilter !== 'ALL' && s.period !== periodFilter) return false;
    if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
    if (q) {
      const hay = removeVietnameseTones(
        `${s.studentCode} ${s.fullName} ${s.parentName} ${s.parentPhone} ${s.className}`.toLowerCase()
      );
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderAdminStudents() {
  const tbody = document.getElementById('admin-students-tbody');
  if (!tbody) return;

  const list = getFilteredStudents();

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="py-10 text-center text-slate-400 text-sm">
          Không tìm thấy học sinh nào khớp với bộ lọc hiện tại.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list
    .map(s => {
      const badgeClass = getStatusBadgeClass(s.status);
      return `
        <tr class="hover:bg-slate-50/80 transition">
          <td class="py-3.5 px-4 font-mono font-bold text-xs text-blue-700">
            ${escapeHtml(s.studentCode)}
          </td>
          <td class="py-3.5 px-4">
            <div class="font-bold text-slate-900">${escapeHtml(s.fullName)}</div>
            <div class="text-xs text-slate-500">${escapeHtml(s.className)}</div>
            ${s.note ? `<div class="text-[11px] text-slate-400 italic mt-0.5">${escapeHtml(s.note)}</div>` : ''}
          </td>
          <td class="py-3.5 px-4">
            <div class="text-slate-800 font-medium text-xs">${escapeHtml(s.parentName || '---')}</div>
            <a href="tel:${escapeAttr(s.parentPhone)}" class="text-xs text-blue-600 hover:underline font-mono">
              ${escapeHtml(s.parentPhone)}
            </a>
          </td>
          <td class="py-3.5 px-4">
            <span class="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-semibold text-xs">
              ${escapeHtml(s.period)}
            </span>
          </td>
          <td class="py-3.5 px-4 text-right font-bold text-slate-900">
            ${formatCurrency(s.tuitionFee)}
          </td>
          <td class="py-3.5 px-4 text-center">
            <select
              onchange="quickChangeStudentStatus('${s.id}', this.value)"
              class="px-2.5 py-1 rounded-full text-xs font-bold cursor-pointer focus:outline-none ${badgeClass}"
            >
              <option value="Chưa đóng" ${s.status === 'Chưa đóng' ? 'selected' : ''}>Chưa đóng</option>
              <option value="Chờ duyệt" ${s.status === 'Chờ duyệt' ? 'selected' : ''}>Chờ duyệt</option>
              <option value="Đã hoàn thành" ${s.status === 'Đã hoàn thành' ? 'selected' : ''}>Đã hoàn thành</option>
            </select>
          </td>
          <td class="py-3.5 px-4 text-center">
            ${
              s.receiptUrl
                ? `<button
                    onclick="openReceiptViewer('${escapeAttr(s.receiptUrl)}', 'Biên lai ${escapeAttr(s.fullName)}')"
                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold cursor-pointer"
                  >
                    <i data-lucide="image" class="w-3.5 h-3.5"></i>
                    <span>Xem</span>
                  </button>`
                : `<span class="text-xs text-slate-300">---</span>`
            }
          </td>
          <td class="py-3.5 px-4 text-right">
            <div class="inline-flex items-center gap-1">
              <button
                onclick="openPaymentModal('${s.id}')"
                title="Lấy mã VietQR của học sinh này"
                class="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
              >
                <i data-lucide="qr-code" class="w-4 h-4"></i>
              </button>
              <button
                onclick="openStudentModal('${s.id}')"
                title="Chỉnh sửa thông tin"
                class="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <i data-lucide="edit-3" class="w-4 h-4"></i>
              </button>
              <button
                onclick="deleteStudentRecord('${s.id}')"
                title="Xóa bản ghi"
                class="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition cursor-pointer"
              >
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  lucide.createIcons();
}

// Đổi nhanh trạng thái học phí trực tiếp trên bảng Quản lý
function quickChangeStudentStatus(studentId, newStatus) {
  const student = appState.students.find(s => s.id === studentId);
  if (!student) return;

  const oldStatus = student.status;
  student.status = newStatus;
  student.updatedAt = getCurrentDateTimeString();

  // Nếu chuyển sang "Đã hoàn thành", kiểm tra xem đã có phiếu thu học phí cho HS này trong kỳ chưa
  if (newStatus === 'Đã hoàn thành' && oldStatus !== 'Đã hoàn thành') {
    const alreadyRecorded = (appState.transactions || []).some(
      t =>
        t.type === 'Thu' &&
        t.studentCode === student.studentCode &&
        t.description.includes(student.period)
    );

    if (!alreadyRecorded) {
      appState.transactions.unshift({
        id: 'GD_' + Date.now(),
        date: new Date().toISOString().slice(0, 10),
        type: 'Thu',
        category: 'Thu học phí',
        amount: Number(student.tuitionFee) || 0,
        description: `Thu học phí ${student.period} - ${student.studentCode} ${student.fullName}`,
        studentCode: student.studentCode,
        method: 'Chuyển khoản',
        receiptUrl: student.receiptUrl || '',
        createdBy: 'Quản lý'
      });
    }

    // Đồng thời đánh dấu yêu cầu chờ duyệt (nếu có) thành Đã duyệt
    (appState.paymentRequests || []).forEach(r => {
      if (
        (r.studentRecordId === student.id || r.studentCode === student.studentCode) &&
        r.status === 'Chờ duyệt'
      ) {
        r.status = 'Đã duyệt';
        r.reviewedAt = student.updatedAt;
      }
    });
  }

  saveStateToLocal();
  triggerAutoSyncIfNeeded(`Đã cập nhật trạng thái ${student.fullName} sang "${newStatus}"!`);
}

// Thêm / Sửa học sinh Modal
function openStudentModal(studentId = '') {
  const modal = document.getElementById('student-modal');
  const title = document.getElementById('student-modal-title');

  if (studentId) {
    const s = appState.students.find(item => item.id === studentId);
    if (!s) return;
    title.textContent = 'Chỉnh Sửa Thông Tin Học Sinh';
    document.getElementById('stu-form-id').value = s.id;
    document.getElementById('stu-form-code').value = s.studentCode;
    document.getElementById('stu-form-name').value = s.fullName;
    document.getElementById('stu-form-class').value = s.className;
    document.getElementById('stu-form-period').value = s.period;
    document.getElementById('stu-form-parent').value = s.parentName;
    document.getElementById('stu-form-phone').value = s.parentPhone;
    document.getElementById('stu-form-fee').value = s.tuitionFee;
    document.getElementById('stu-form-status').value = s.status;
    document.getElementById('stu-form-note').value = s.note || '';
  } else {
    title.textContent = 'Thêm Học Sinh Mới';
    const nextNum = (appState.students.length + 1).toString().padStart(3, '0');
    document.getElementById('stu-form-id').value = '';
    document.getElementById('stu-form-code').value = 'HS' + nextNum;
    document.getElementById('stu-form-name').value = '';
    document.getElementById('stu-form-class').value = '';
    document.getElementById('stu-form-period').value = appState.settings.defaultPeriod || 'Tháng 10/2026';
    document.getElementById('stu-form-parent').value = '';
    document.getElementById('stu-form-phone').value = '';
    document.getElementById('stu-form-fee').value = 1200000;
    document.getElementById('stu-form-status').value = 'Chưa đóng';
    document.getElementById('stu-form-note').value = '';
  }

  modal.classList.remove('hidden');
}

function closeStudentModal() {
  document.getElementById('student-modal').classList.add('hidden');
}

function saveStudentForm(event) {
  event.preventDefault();
  const id = document.getElementById('stu-form-id').value;
  const studentCode = document.getElementById('stu-form-code').value.trim().toUpperCase();
  const fullName = document.getElementById('stu-form-name').value.trim();
  const className = document.getElementById('stu-form-class').value.trim();
  const period = document.getElementById('stu-form-period').value.trim();
  const parentName = document.getElementById('stu-form-parent').value.trim();
  const parentPhone = document.getElementById('stu-form-phone').value.trim();
  const tuitionFee = Number(document.getElementById('stu-form-fee').value) || 0;
  const status = document.getElementById('stu-form-status').value;
  const note = document.getElementById('stu-form-note').value.trim();
  const nowStr = getCurrentDateTimeString();

  if (id) {
    const idx = appState.students.findIndex(s => s.id === id);
    if (idx !== -1) {
      appState.students[idx] = {
        ...appState.students[idx],
        studentCode,
        fullName,
        className,
        period,
        parentName,
        parentPhone,
        tuitionFee,
        status,
        note,
        updatedAt: nowStr
      };
    }
  } else {
    appState.students.unshift({
      id: 'ST_' + Date.now(),
      studentCode,
      fullName,
      className,
      period,
      parentName,
      parentPhone,
      tuitionFee,
      status,
      receiptUrl: '',
      updatedAt: nowStr,
      note
    });
  }

  closeStudentModal();
  saveStateToLocal();
  triggerAutoSyncIfNeeded(id ? 'Đã cập nhật thông tin học sinh!' : 'Đã thêm học sinh mới!');
}

function deleteStudentRecord(studentId) {
  const s = appState.students.find(item => item.id === studentId);
  if (!s) return;
  if (!confirm(`Bạn có chắc muốn xóa học sinh "${s.fullName} (${s.studentCode}) - ${s.period}"?`)) return;

  appState.students = appState.students.filter(item => item.id !== studentId);
  saveStateToLocal();
  triggerAutoSyncIfNeeded('Đã xóa bản ghi học sinh.');
}

// Tạo kỳ thu học phí tháng mới hàng loạt
function openBatchPeriodModal() {
  document.getElementById('batch-new-period').value = '';
  document.getElementById('batch-period-modal').classList.remove('hidden');
}

function closeBatchPeriodModal() {
  document.getElementById('batch-period-modal').classList.add('hidden');
}

function handleCreateBatchPeriod(event) {
  event.preventDefault();
  const newPeriod = document.getElementById('batch-new-period').value.trim();
  if (!newPeriod) return;

  // Lấy danh sách học sinh duy nhất theo studentCode
  const uniqueMap = new Map();
  (appState.students || []).forEach(s => {
    if (!uniqueMap.has(s.studentCode)) {
      uniqueMap.set(s.studentCode, s);
    }
  });

  let addedCount = 0;
  const nowStr = getCurrentDateTimeString();

  uniqueMap.forEach(s => {
    const exists = appState.students.some(
      item => item.studentCode === s.studentCode && item.period.toLowerCase() === newPeriod.toLowerCase()
    );
    if (!exists) {
      appState.students.unshift({
        id: 'ST_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        studentCode: s.studentCode,
        fullName: s.fullName,
        className: s.className,
        parentName: s.parentName,
        parentPhone: s.parentPhone,
        period: newPeriod,
        tuitionFee: s.tuitionFee,
        status: 'Chưa đóng',
        receiptUrl: '',
        updatedAt: nowStr,
        note: ''
      });
      addedCount++;
    }
  });

  appState.settings.defaultPeriod = newPeriod;
  closeBatchPeriodModal();
  saveStateToLocal();
  triggerAutoSyncIfNeeded(`Đã khởi tạo kỳ "${newPeriod}" cho ${addedCount} học sinh!`);
}

// ============================================================================
// TAB 3: QUẢN LÝ SỔ THU - CHI
// ============================================================================
function getFilteredTransactions() {
  const q = removeVietnameseTones((document.getElementById('filter-trans-search')?.value || '').trim().toLowerCase());
  const typeFilter = document.getElementById('filter-trans-type')?.value || 'ALL';
  const catFilter = document.getElementById('filter-trans-category')?.value || 'ALL';

  return (appState.transactions || []).filter(t => {
    if (typeFilter !== 'ALL' && t.type !== typeFilter) return false;
    if (catFilter !== 'ALL' && t.category !== catFilter) return false;
    if (q) {
      const hay = removeVietnameseTones(`${t.id} ${t.description} ${t.category} ${t.studentCode}`.toLowerCase());
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderAdminTransactions() {
  const tbody = document.getElementById('admin-transactions-tbody');
  if (!tbody) return;

  const list = getFilteredTransactions();

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="py-10 text-center text-slate-400 text-sm">
          Chưa có giao dịch Thu - Chi nào khớp với bộ lọc.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list
    .map(t => {
      const isIncome = t.type === 'Thu';
      return `
        <tr class="hover:bg-slate-50/80 transition">
          <td class="py-3.5 px-4">
            <div class="font-mono font-bold text-xs text-slate-700">${escapeHtml(t.id)}</div>
            <div class="text-xs text-slate-400">${escapeHtml(t.date)}</div>
          </td>
          <td class="py-3.5 px-4">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
              isIncome ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }">
              ${isIncome ? '+ Thu' : '- Chi'}
            </span>
          </td>
          <td class="py-3.5 px-4 font-semibold text-xs text-slate-700">
            ${escapeHtml(t.category)}
          </td>
          <td class="py-3.5 px-4">
            <div class="text-slate-900 font-medium text-xs sm:text-sm">${escapeHtml(t.description)}</div>
            ${
              t.studentCode
                ? `<span class="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 font-mono text-[11px]">Mã HS: ${escapeHtml(t.studentCode)}</span>`
                : ''
            }
          </td>
          <td class="py-3.5 px-4 text-right font-extrabold ${isIncome ? 'text-emerald-600' : 'text-rose-600'}">
            ${isIncome ? '+' : '-'}${formatCurrency(t.amount)}
          </td>
          <td class="py-3.5 px-4 text-center text-xs text-slate-600">
            ${escapeHtml(t.method || 'Chuyển khoản')}
          </td>
          <td class="py-3.5 px-4 text-center">
            ${
              t.receiptUrl
                ? `<button
                    onclick="openReceiptViewer('${escapeAttr(t.receiptUrl)}', 'Chứng từ ${escapeAttr(t.id)}')"
                    class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold cursor-pointer"
                  >
                    <i data-lucide="image" class="w-3.5 h-3.5"></i>
                    <span>Xem</span>
                  </button>`
                : `<span class="text-xs text-slate-300">---</span>`
            }
          </td>
          <td class="py-3.5 px-4 text-right">
            <button
              onclick="deleteTransactionRecord('${t.id}')"
              title="Xóa phiếu thu/chi"
              class="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition cursor-pointer"
            >
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  lucide.createIcons();
}

function openTransactionModal(defaultType = 'Thu') {
  document.getElementById('trans-form-id').value = '';
  document.getElementById('trans-form-type').value = defaultType;
  document.getElementById('trans-form-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('trans-form-category').value =
    defaultType === 'Thu' ? 'Thu học phí' : 'Chi thuê phòng / điện nước';
  document.getElementById('trans-form-amount').value = '';
  document.getElementById('trans-form-desc').value = '';
  document.getElementById('trans-form-student-code').value = '';
  document.getElementById('trans-form-method').value = 'Chuyển khoản';

  updateTransactionModalTheme(defaultType);
  document.getElementById('transaction-modal').classList.remove('hidden');
}

function updateTransactionModalTheme(type) {
  const header = document.getElementById('trans-modal-header');
  const title = document.getElementById('trans-modal-title');
  if (type === 'Thu') {
    header.className = 'px-6 py-4 bg-emerald-600 text-white flex items-center justify-between';
    title.textContent = 'Ghi Phiếu Thu Mới (+)';
  } else {
    header.className = 'px-6 py-4 bg-rose-600 text-white flex items-center justify-between';
    title.textContent = 'Ghi Phiếu Chi Mới (-)';
  }
}

function closeTransactionModal() {
  document.getElementById('transaction-modal').classList.add('hidden');
}

function saveTransactionForm(event) {
  event.preventDefault();
  const type = document.getElementById('trans-form-type').value;
  const date = document.getElementById('trans-form-date').value;
  const category = document.getElementById('trans-form-category').value;
  const amount = Number(document.getElementById('trans-form-amount').value) || 0;
  const description = document.getElementById('trans-form-desc').value.trim();
  const studentCode = document.getElementById('trans-form-student-code').value.trim().toUpperCase();
  const method = document.getElementById('trans-form-method').value;

  appState.transactions.unshift({
    id: 'GD_' + Date.now(),
    date,
    type,
    category,
    amount,
    description,
    studentCode,
    method,
    receiptUrl: '',
    createdBy: 'Quản lý'
  });

  closeTransactionModal();
  saveStateToLocal();
  triggerAutoSyncIfNeeded(`Đã ghi phiếu ${type} (${formatCurrency(amount)}) thành công!`);
}

function deleteTransactionRecord(transId) {
  if (!confirm('Bạn có chắc muốn xóa giao dịch Thu/Chi này khỏi sổ quỹ?')) return;
  appState.transactions = appState.transactions.filter(t => t.id !== transId);
  saveStateToLocal();
  triggerAutoSyncIfNeeded('Đã xóa giao dịch khỏi Sổ Thu - Chi.');
}

// ============================================================================
// TAB 4: ĐỒNG BỘ 2 CHIỀU GOOGLE SHEETS & CÀI ĐẶT VIETQR
// ============================================================================
function populateSettingsForm() {
  const stg = appState.settings || {};
  document.getElementById('setting-gas-url').value = getGasUrl();
  document.getElementById('setting-auto-sync').checked = isAutoSyncEnabled();

  document.getElementById('setting-center-name').value = stg.centerName || '';
  document.getElementById('setting-default-period').value = stg.defaultPeriod || 'Tháng 10/2026';
  document.getElementById('setting-bank-bin').value = stg.bankBin || 'MB';
  document.getElementById('setting-bank-acc').value = stg.bankAccountNo || '';
  document.getElementById('setting-bank-owner').value = stg.bankAccountName || '';
  document.getElementById('setting-teacher-phone').value = stg.teacherPhone || '';
  document.getElementById('setting-admin-pass').value = stg.adminPassword || '123456';

  updateQrPreviewInSettings();
}

function updateQrPreviewInSettings() {
  const bin = document.getElementById('setting-bank-bin')?.value || 'MB';
  const acc = document.getElementById('setting-bank-acc')?.value || '090123456789';
  const owner = document.getElementById('setting-bank-owner')?.value || 'NGUYEN VAN A';

  const qrImg = document.getElementById('setting-qr-preview');
  const qrText = document.getElementById('setting-qr-preview-text');
  if (qrImg) {
    qrImg.src = buildVietQrUrl(bin, acc, owner, 1200000, 'HP T10 HS001');
  }
  if (qrText) {
    qrText.textContent = `${bin} - ${acc} (${owner})`;
  }
}

function saveGasUrlConfig() {
  const url = document.getElementById('setting-gas-url').value.trim();
  const autoSync = document.getElementById('setting-auto-sync').checked;

  localStorage.setItem(STORAGE_KEYS.GAS_URL, url);
  localStorage.setItem(STORAGE_KEYS.AUTO_SYNC, String(autoSync));
  updateSyncStatusBanner();

  if (url) {
    showToast('Đã lưu link Google Sheet! Đang kiểm tra đồng bộ...', 'info');
    syncFromGoogleSheet(true);
  } else {
    showToast('Đã chuyển về chế độ lưu trữ Local trên trình duyệt.', 'info');
  }
}

function saveGeneralSettings(event) {
  event.preventDefault();
  appState.settings = {
    ...appState.settings,
    centerName: document.getElementById('setting-center-name').value.trim(),
    defaultPeriod: document.getElementById('setting-default-period').value.trim(),
    bankBin: document.getElementById('setting-bank-bin').value,
    bankAccountNo: document.getElementById('setting-bank-acc').value.trim(),
    bankAccountName: document.getElementById('setting-bank-owner').value.trim().toUpperCase(),
    teacherPhone: document.getElementById('setting-teacher-phone').value.trim(),
    adminPassword: document.getElementById('setting-admin-pass').value.trim() || '123456'
  };

  saveStateToLocal();
  triggerAutoSyncIfNeeded('Đã lưu cài đặt Ngân hàng VietQR & Lớp học!');
}

function updateSyncStatusBanner(lastSyncTimeStr = '') {
  const url = getGasUrl();
  const dot = document.getElementById('sync-status-dot');
  const text = document.getElementById('sync-status-text');
  const quickBtn = document.getElementById('btn-quick-sync');

  if (url) {
    dot.className = 'w-2 h-2 rounded-full bg-emerald-500 inline-block';
    text.textContent = lastSyncTimeStr
      ? `Đã đồng bộ Google Sheet (${lastSyncTimeStr})`
      : 'Đã kết nối Google Sheet (2 chiều)';
    quickBtn.classList.remove('hidden');
  } else {
    dot.className = 'w-2 h-2 rounded-full bg-amber-500 inline-block';
    text.textContent = 'Chế độ Local Demo (Vào Quản lý -> Cài đặt để gắn Google Sheet)';
  }
}

// Đọc dữ liệu từ Google Sheet về Web App (Pull)
async function syncFromGoogleSheet(showUserToast = true) {
  const gasUrl = getGasUrl();
  if (!gasUrl) {
    if (showUserToast) {
      showToast('Bạn chưa dán link Google Apps Script Web App URL trong mục Cài đặt!', 'warning');
      if (currentMode === 'admin') switchAdminTab('settings');
    }
    return;
  }

  const syncIcon = document.getElementById('icon-quick-sync');
  if (syncIcon) syncIcon.classList.add('animate-spin');

  try {
    const res = await fetch(`${gasUrl}?action=getAll&t=${Date.now()}`, {
      method: 'GET',
      redirect: 'follow'
    });
    const json = await res.json();

    if (json && json.success && json.data) {
      // Nếu Google Sheet đang hoàn toàn trống (mới tạo lần đầu), hỏi hoặc tự đẩy dữ liệu hiện tại lên
      const sheetData = json.data;
      const isEmptySheet =
        (!sheetData.students || sheetData.students.length === 0) &&
        (!sheetData.transactions || sheetData.transactions.length === 0);

      if (isEmptySheet && appState.students.length > 0) {
        await syncAllToGoogleSheet(false);
        if (showUserToast) {
          showToast('Sheet mới: Đã khởi tạo các bảng và đẩy dữ liệu từ App lên Google Sheet!', 'success');
        }
      } else {
        appState = mergeServerData(sheetData);
        saveStateToLocal();
        if (showUserToast) {
          showToast('Đã tải dữ liệu mới nhất từ Google Sheet về App!', 'success');
        }
      }

      const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      updateSyncStatusBanner(timeStr);
    } else {
      throw new Error(json?.message || 'Phản hồi không hợp lệ từ Google Sheet');
    }
  } catch (err) {
    console.error('Lỗi đồng bộ từ Google Sheet:', err);
    if (showUserToast) {
      showToast('Không thể kết nối tới Google Sheet. Hãy kiểm tra URL Web App (/exec) và quyền Anyone!', 'error');
    }
  } finally {
    if (syncIcon) syncIcon.classList.remove('animate-spin');
  }
}

// Đẩy toàn bộ dữ liệu từ Web App lên Google Sheet (Push)
async function syncAllToGoogleSheet(showUserToast = true) {
  const gasUrl = getGasUrl();
  if (!gasUrl) {
    if (showUserToast) {
      showToast('Vui lòng nhập URL Google Apps Script trong mục Cài đặt trước!', 'warning');
      if (currentMode === 'admin') switchAdminTab('settings');
    }
    return;
  }

  try {
    if (showUserToast) showToast('Đang đồng bộ dữ liệu lên Google Sheet...', 'info');
    const json = await postToGas(gasUrl, {
      action: 'syncAllToSheet',
      students: appState.students,
      transactions: appState.transactions,
      paymentRequests: appState.paymentRequests,
      settings: appState.settings
    });

    if (json && json.success) {
      const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      updateSyncStatusBanner(timeStr);
      if (showUserToast) {
        showToast('Đã cập nhật toàn bộ dữ liệu lên Google Sheet thành công!', 'success');
      }
    } else {
      throw new Error(json?.message || 'Lỗi ghi Sheet');
    }
  } catch (err) {
    console.error('Lỗi ghi Google Sheet:', err);
    if (showUserToast) {
      showToast('Lỗi khi đẩy dữ liệu lên Google Sheet: ' + err.message, 'error');
    }
  }
}

async function triggerAutoSyncIfNeeded(toastMessage) {
  showToast(toastMessage, 'success');
  const gasUrl = getGasUrl();
  if (gasUrl && isAutoSyncEnabled()) {
    await syncAllToGoogleSheet(false);
  }
}

// Hàm gửi POST tới Google Apps Script tránh lỗi CORS Preflight (sử dụng text/plain)
async function postToGas(gasUrl, payloadObj) {
  const response = await fetch(gasUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(payloadObj)
  });
  return await response.json();
}

function normalizePeriodValue(val) {
  const s = String(val || '').trim();
  if (!s) return 'Tháng 10/2026';
  if (s.includes('GMT') || /^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `Tháng ${mm}/${yyyy}`;
    }
  }
  return s;
}

function mergeServerData(serverData) {
  const students = Array.isArray(serverData.students)
    ? serverData.students.map(st => ({ ...st, period: normalizePeriodValue(st.period) }))
    : appState.students;
  const paymentRequests = Array.isArray(serverData.paymentRequests)
    ? serverData.paymentRequests.map(rq => ({ ...rq, period: normalizePeriodValue(rq.period) }))
    : appState.paymentRequests;
  const mergedSettings = {
    ...appState.settings,
    ...(serverData.settings || {})
  };
  mergedSettings.defaultPeriod = normalizePeriodValue(mergedSettings.defaultPeriod);

  return {
    students,
    transactions: Array.isArray(serverData.transactions) ? serverData.transactions : appState.transactions,
    paymentRequests,
    settings: mergedSettings
  };
}

// ============================================================================
// TIỆN ÍCH: XEM BIÊN LAI, XUẤT EXCEL/CSV, COPY, TOAST
// ============================================================================
function openReceiptViewer(url, title) {
  if (!url) return;
  document.getElementById('receipt-viewer-title').textContent = title || 'Ảnh biên lai chuyển khoản';
  document.getElementById('receipt-viewer-img').src = url;
  document.getElementById('receipt-viewer-link').href = url;
  document.getElementById('receipt-viewer-modal').classList.remove('hidden');
}

function closeReceiptViewer() {
  document.getElementById('receipt-viewer-modal').classList.add('hidden');
}

function exportStudentsCSV() {
  const headers = ['Mã HS', 'Họ Tên', 'Lớp', 'Phụ Huynh', 'SĐT Phụ Huynh', 'Kỳ Học Phí', 'Mức Học Phí', 'Trạng Thái', 'Cập Nhật Lúc', 'Ghi Chú'];
  const rows = (appState.students || []).map(s => [
    s.studentCode,
    s.fullName,
    s.className,
    s.parentName,
    s.parentPhone,
    s.period,
    s.tuitionFee,
    s.status,
    s.updatedAt,
    s.note
  ]);
  downloadCsvFile('Danh_Sach_Hoc_Sinh_Hoc_Phi.csv', headers, rows);
}

function exportTransactionsCSV() {
  const headers = ['Mã GD', 'Ngày', 'Loại', 'Danh Mục', 'Số Tiền', 'Nội Dung', 'Mã HS', 'Phương Thức', 'Người Tạo'];
  const rows = (appState.transactions || []).map(t => [
    t.id,
    t.date,
    t.type,
    t.category,
    t.amount,
    t.description,
    t.studentCode,
    t.method,
    t.createdBy
  ]);
  downloadCsvFile('So_Thu_Chi_Lop_Hoc.csv', headers, rows);
}

function downloadCsvFile(filename, headers, rows) {
  const bom = '\uFEFF';
  const csvContent =
    bom +
    [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  showToast(`Đã tải xuống file ${filename}!`, 'success');
}

function resetDemoData() {
  if (!confirm('Khôi phục lại bộ dữ liệu mẫu ban đầu? Các thay đổi chưa lưu lên Sheet sẽ bị đặt lại.')) return;
  appState = getInitialDemoState();
  saveStateToLocal();
  showToast('Đã khôi phục dữ liệu mẫu thành công!', 'success');
}

function copyTextById(elementId) {
  const text = document.getElementById(elementId)?.textContent || '';
  navigator.clipboard.writeText(text.trim());
  showToast(`Đã sao chép: ${text}`, 'success');
}

async function copyGasCodeToClipboard() {
  try {
    const res = await fetch('google-apps-script/Code.gs');
    if (res.ok) {
      const codeText = await res.text();
      await navigator.clipboard.writeText(codeText);
      showToast('Đã copy toàn bộ mã Code.gs (gắn sẵn ID Sheet của bạn)! Hãy dán vào Google Sheet -> Apps Script.', 'success');
      return;
    }
  } catch (e) {
    // Fallback nếu mở trực tiếp bằng file://
  }
  showToast('Bạn có thể mở file google-apps-script/Code.gs trong thư mục dự án để copy toàn bộ mã!', 'info');
}

/**
 * Tự động tạo Repository, đẩy toàn bộ mã nguồn (kèm cấu hình Google Sheet & VietQR hiện tại)
 * lên GitHub và kích hoạt GitHub Pages chỉ với 1 cú nhấp chuột
 */
async function autoDeployToGitHubPages() {
  const repoInput = document.getElementById('gh-repo-name');
  const tokenInput = document.getElementById('gh-token-input');
  const btn = document.getElementById('btn-auto-github');
  const resultBox = document.getElementById('gh-deploy-result');

  const repoName = (repoInput?.value || 'quan-ly-hoc-sinh-thu-chi').trim().replace(/\s+/g, '-');
  const token = (tokenInput?.value || '').trim();

  if (!token) {
    showToast('Vui lòng dán mã GitHub Token (ghp_...) để hệ thống đẩy code lên tài khoản của bạn!', 'warning');
    tokenInput?.focus();
    return;
  }

  const origHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> <span>Đang đẩy code lên GitHub & bật GitHub Pages...</span>`;
  lucide.createIcons();

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json'
  };

  try {
    // 1. Lấy thông tin tài khoản GitHub
    const userRes = await fetch('https://api.github.com/user', { headers });
    if (!userRes.ok) {
      throw new Error('Mã GitHub Token không hợp lệ hoặc đã hết hạn.');
    }
    const userData = await userRes.json();
    const owner = userData.login;

    // 2. Kiểm tra hoặc Tạo Repository mới
    const checkRepoRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, { headers });
    if (checkRepoRes.status === 404) {
      const createRes = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: repoName,
          description: 'Hệ thống Quản lý Học sinh, Học phí VietQR & Thu Chi đồng bộ Google Sheets 2 chiều',
          private: false,
          auto_init: true
        })
      });
      if (!createRes.ok) {
        const errJson = await createRes.json();
        throw new Error(errJson.message || 'Không thể tạo repository trên GitHub.');
      }
      // Chờ 1.5s để GitHub khởi tạo nhánh mặc định
      await new Promise(r => setTimeout(r, 1500));
    }

    // 3. Lấy nội dung các file hiện tại và nhúng cấu hình Google Sheet URL + Cài đặt hiện tại
    const filesToUpload = ['index.html', 'styles.css', 'app.js', 'google-apps-script/Code.gs', 'HUONG_DAN_CAI_DAT.md'];
    const currentGasUrl = getGasUrl();

    for (const filePath of filesToUpload) {
      const localRes = await fetch(filePath + '?t=' + Date.now());
      if (!localRes.ok) continue;
      let textContent = await localRes.text();

      // Nếu là app.js, nhúng sẵn DEFAULT_GAS_WEBAPP_URL để mọi điện thoại Phụ huynh đều tự động kết nối
      if (filePath === 'app.js' && currentGasUrl) {
        textContent = textContent.replace(
          /const DEFAULT_GAS_WEBAPP_URL = '.*?';/,
          `const DEFAULT_GAS_WEBAPP_URL = '${currentGasUrl}';`
        );
      }

      // Kiểm tra xem file đã tồn tại trên repo chưa để lấy sha
      let existingSha = undefined;
      const fileCheck = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}`, { headers });
      if (fileCheck.ok) {
        const existingData = await fileCheck.json();
        existingSha = existingData.sha;
      }

      const base64Content = btoa(unescape(encodeURIComponent(textContent)));
      const putBody = {
        message: `Cập nhật ${filePath} từ hệ thống EduPay`,
        content: base64Content
      };
      if (existingSha) putBody.sha = existingSha;

      const putRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(putBody)
      });

      if (!putRes.ok) {
        const putErr = await putRes.json();
        throw new Error(`Lỗi tải file ${filePath}: ${putErr.message}`);
      }
    }

    // 4. Bật GitHub Pages tự động trên nhánh main
    await fetch(`https://api.github.com/repos/${owner}/${repoName}/pages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source: {
          branch: 'main',
          path: '/'
        }
      })
    });

    const pagesUrl = `https://${owner}.github.io/${repoName}/`;
    const repoUrl = `https://github.com/${owner}/${repoName}`;

    resultBox.classList.remove('hidden');
    resultBox.innerHTML = `
      <p class="font-bold text-emerald-300">✅ Đã đẩy lên GitHub & bật GitHub Pages thành công!</p>
      <p>🔗 Kho mã nguồn: <a href="${repoUrl}" target="_blank" class="underline text-white font-semibold">${repoUrl}</a></p>
      <p>🌐 Link Web gửi Phụ huynh (hoạt động sau ~45 giây): <a href="${pagesUrl}" target="_blank" class="underline text-amber-300 font-bold">${pagesUrl}</a></p>
    `;
    showToast('Đã đẩy toàn bộ ứng dụng lên GitHub Pages thành công!', 'success');
  } catch (err) {
    console.error(err);
    showToast('Lỗi đẩy GitHub: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHtml;
    lucide.createIcons();
  }
}

function getStatusBadgeClass(status) {
  if (status === 'Đã hoàn thành') return 'badge-paid';
  if (status === 'Chờ duyệt') return 'badge-pending';
  return 'badge-unpaid';
}

function formatCurrency(val) {
  const num = Number(val) || 0;
  return num.toLocaleString('vi-VN') + ' ₫';
}

function maskPhone(phone) {
  const p = String(phone || '').trim();
  if (p.length < 7) return p;
  return p.slice(0, 4) + '***' + p.slice(-3);
}

function getCurrentDateTimeString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function removeVietnameseTones(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  return escapeHtml(str);
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const colors = {
    success: 'bg-emerald-600 text-white',
    error: 'bg-rose-600 text-white',
    warning: 'bg-amber-500 text-white',
    info: 'bg-slate-900 text-white'
  };

  const toast = document.createElement('div');
  toast.className = `pointer-events-auto px-4 py-3 rounded-xl shadow-lg text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 animate-fade-in ${
    colors[type] || colors.info
  }`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button onclick="this.parentElement.remove()" class="opacity-75 hover:opacity-100 text-xs font-bold cursor-pointer">✕</button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 4200);
}
