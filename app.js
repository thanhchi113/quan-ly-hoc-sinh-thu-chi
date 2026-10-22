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
      centerName: 'LỚP TOÁN ANH CHÍ',
      bankBin: 'BIDV',
      bankAccountNo: '8601774789',
      bankAccountName: 'HKD TRUNG TAM HUYNH THANH CHI',
      defaultPeriod: 'Tháng 10/2026',
      adminPassword: '123456',
      teacherPhone: '0905957716',
      customQrUrl: ''
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
let currentAdminTab = 'classbook';
let selectedClassbookClass = '';
let currentCalendarBrush = 'cycle'; // 'cycle' | 1 | 2 | 3 | 0
let uploadedReceiptBase64 = '';
let financeBarChartInstance = null;
let tuitionPieChartInstance = null;

function bootstrapApp() {
  enableSourceProtection();
  lucide.createIcons();
  initAppUI();

  // Nếu đã cấu hình link Google Sheet thì tự động tải dữ liệu mới nhất về & bật lắng nghe biến động số dư
  const gasUrl = getGasUrl();
  if (gasUrl) {
    syncFromGoogleSheet(false);
    startLiveBankPolling();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}

// Bảo vệ mã nguồn (chỉ chặn F12 / Ctrl+U / Ctrl+Shift+I), vẫn cho phép Ctrl+A, Ctrl+C, Ctrl+V, chọn chữ và chuột phải trong ô nhập liệu
function enableSourceProtection() {
  document.addEventListener('contextmenu', e => {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
    const isAuth = sessionStorage.getItem(STORAGE_KEYS.ADMIN_AUTH) === 'true';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || isAuth) {
      return true; // Cho phép chuột phải bình thường trong ô nhập liệu và khi Quản lý đăng nhập
    }
    e.preventDefault();
  });

  document.addEventListener('keydown', e => {
    const key = (e.key || '').toUpperCase();
    // Chỉ chặn F12, Ctrl+U (View Source), Ctrl+Shift+I/J (DevTools)
    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && ['I', 'J'].includes(key)) ||
      (e.ctrlKey && key === 'U')
    ) {
      e.preventDefault();
      return false;
    }
  });

  // Hỗ trợ nhấn Ctrl + V để dán trực tiếp ảnh Mã QR (trong tab Cài đặt) hoặc ảnh Biên lai (trong Modal Thanh toán)
  document.addEventListener('paste', e => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (!file) continue;
        const payModal = document.getElementById('payment-modal');
        if (payModal && !payModal.classList.contains('hidden')) {
          processReceiptFile(file);
          e.preventDefault();
          return;
        }
        if (currentMode === 'admin' && currentAdminTab === 'settings') {
          processCustomQrFile(file);
          e.preventDefault();
          return;
        }
      }
    }
  });
}

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

  // Render toàn bộ giao diện Quản lý (ẩn cho đến khi đăng nhập)
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

  // Render Sổ Theo Dõi Lớp Học, Dashboard, Bảng Học sinh, Bảng Thu Chi
  renderAdminClassbook();
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
    showToast('Mật khẩu quản trị không đúng!', 'error');
  }
}

function handleAdminLogout() {
  sessionStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
  showToast('Đã đăng xuất khỏi phiên Quản lý.', 'info');
  checkAdminAuthStatus();
}

function switchAdminTab(tabName) {
  currentAdminTab = tabName;
  const tabs = ['classbook', 'dashboard', 'students', 'finance', 'settings'];
  tabs.forEach(t => {
    const contentEl = document.getElementById('admin-tab-' + t);
    const btnEl = document.getElementById('tab-btn-' + t);
    if (!contentEl || !btnEl) return;
    if (t === tabName) {
      contentEl.classList.remove('hidden');
      btnEl.className = 'admin-tab-btn flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition bg-blue-600 text-white';
    } else {
      contentEl.classList.add('hidden');
      btnEl.className = 'admin-tab-btn flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition text-slate-600 hover:bg-slate-100';
    }
  });

  if (tabName === 'classbook') {
    renderAdminClassbook();
  } else if (tabName === 'dashboard') {
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
  const inputEl = document.getElementById('parent-search-input');
  const rawQuery = (inputEl ? inputEl.value : '').trim();
  const container = document.getElementById('parent-results-container');
  if (!container) return;

  if (!rawQuery) {
    container.innerHTML = '';
    if (showNotification) {
      showToast('Vui lòng nhập Tên học sinh, Mã HS hoặc Số điện thoại để tra cứu!', 'warning');
    }
    return;
  }

  const q = removeVietnameseTones(rawQuery.toLowerCase()).replace(/\s+/g, ' ').trim();
  const cleanPhoneQuery = rawQuery.replace(/[^0-9]/g, '').replace(/^0+/, '');

  // Chặn từ khóa "tất cả" hoặc chỉ gõ 1 ký tự để bảo mật danh sách lớp
  if (q === 'tat ca' || q === 'all' || q.length < 2) {
    if (showNotification) {
      showToast('Vui lòng nhập ít nhất 2 ký tự (Tên học sinh, Mã HS hoặc SĐT) để tra cứu!', 'warning');
    }
    return;
  }

  const matched = (appState.students || []).filter(s => {
    const code = removeVietnameseTones((s.studentCode || '').toLowerCase()).trim();
    const name = removeVietnameseTones((s.fullName || '').toLowerCase()).replace(/\s+/g, ' ').trim();
    const parent = removeVietnameseTones((s.parentName || '').toLowerCase()).replace(/\s+/g, ' ').trim();
    const phone = String(s.parentPhone || '').replace(/[^0-9]/g, '').replace(/^0+/, '');

    const matchCode = code && code.includes(q);
    const matchName = name && name.includes(q);
    const matchParent = parent && parent.includes(q);
    const matchPhone = cleanPhoneQuery.length >= 3 && phone && phone.includes(cleanPhoneQuery);

    return matchCode || matchName || matchParent || matchPhone;
  });

  if (matched.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
        <div class="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <i data-lucide="search-x" class="w-6 h-6"></i>
        </div>
        <h3 class="font-bold text-slate-800">Không tìm thấy học sinh phù hợp với "${escapeHtml(rawQuery)}"</h3>
        <p class="text-xs text-slate-500">Vui lòng kiểm tra lại <strong>Tên học sinh</strong>, <strong>Mã học sinh</strong> (VD: HS001) hoặc <strong>Số điện thoại phụ huynh</strong>.</p>
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
function openPaymentModal(studentRecordId = '') {
  const student = studentRecordId ? appState.students.find(s => s.id === studentRecordId) : null;

  uploadedReceiptBase64 = '';
  clearReceiptPreview();

  const stg = appState.settings;
  const feeAmount = student ? student.tuitionFee : 600000;
  const memo = student ? buildTransferMemo(student) : 'HP HOC SINH';
  const qrUrl = stg.customQrUrl
    ? stg.customQrUrl
    : buildVietQrUrl(stg.bankBin, stg.bankAccountNo, stg.bankAccountName, feeAmount, memo);

  document.getElementById('pay-student-record-id').value = student ? student.id : '';
  document.getElementById('pay-modal-qr-img').src = qrUrl;
  document.getElementById('pay-modal-bank').textContent = stg.bankBin || 'BIDV';
  document.getElementById('pay-modal-owner').textContent = stg.bankAccountName || 'HKD TRUNG TAM HUYNH THANH CHI';
  document.getElementById('pay-modal-acc').textContent = stg.bankAccountNo || '8601774789';
  document.getElementById('pay-modal-amount-text').textContent = formatCurrency(feeAmount);
  document.getElementById('pay-modal-memo').textContent = memo;

  const infoBanner = document.getElementById('pay-student-info-banner');
  const fullNameInput = document.getElementById('pay-form-student-fullname');

  if (student) {
    if (infoBanner) infoBanner.classList.remove('hidden');
    document.getElementById('pay-form-student-name').textContent = student.fullName;
    document.getElementById('pay-form-student-code').textContent = student.studentCode;
    document.getElementById('pay-form-class').textContent = student.className;
    document.getElementById('pay-form-period').textContent = student.period;
    if (fullNameInput) fullNameInput.value = ''; // Để trống bắt buộc Phụ huynh tự gõ xác nhận tên học sinh
    document.getElementById('pay-form-payer').value = student.parentName || '';
    document.getElementById('pay-form-phone').value = student.parentPhone || '';
    document.getElementById('pay-form-amount').value = student.tuitionFee || 0;
  } else {
    if (infoBanner) infoBanner.classList.add('hidden');
    if (fullNameInput) fullNameInput.value = '';
    document.getElementById('pay-form-payer').value = '';
    document.getElementById('pay-form-phone').value = '';
    document.getElementById('pay-form-amount').value = '';
  }

  document.getElementById('pay-form-note').value = '';
  document.getElementById('payment-modal').classList.remove('hidden');
  setTimeout(() => {
    if (fullNameInput) fullNameInput.focus();
  }, 100);
  lucide.createIcons();
}

function handleParentTypedStudentName(typedName) {
  const cleanTyped = removeVietnameseTones((typedName || '').trim().toLowerCase());
  const stg = appState.settings;
  const currentRecordId = document.getElementById('pay-student-record-id').value;

  // Nếu phụ huynh mở form trực tiếp (chưa chọn học sinh), tự động tìm học sinh khớp tên để lấy mã QR & số tiền
  let matched = currentRecordId ? appState.students.find(s => s.id === currentRecordId) : null;
  if (!matched && cleanTyped.length >= 3) {
    matched = (appState.students || []).find(s =>
      removeVietnameseTones((s.fullName || '').toLowerCase()).includes(cleanTyped)
    );
  }

  const feeAmount = matched ? matched.tuitionFee : (Number(document.getElementById('pay-form-amount').value) || 0);
  const cleanUpper = removeVietnameseTones(typedName || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim();
  const memo = matched
    ? `HP ${matched.studentCode} ${cleanUpper || removeVietnameseTones(matched.fullName).toUpperCase()}`.substring(0, 45)
    : `HP ${cleanUpper || 'HOC SINH'}`.substring(0, 45);

  document.getElementById('pay-modal-memo').textContent = memo;
  if (matched) {
    document.getElementById('pay-modal-amount-text').textContent = formatCurrency(matched.tuitionFee);
    if (!document.getElementById('pay-form-amount').value) {
      document.getElementById('pay-form-amount').value = matched.tuitionFee;
    }
  }
  if (!stg.customQrUrl) {
    document.getElementById('pay-modal-qr-img').src = buildVietQrUrl(
      stg.bankBin,
      stg.bankAccountNo,
      stg.bankAccountName,
      feeAmount,
      memo
    );
  }
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
  const bin = encodeURIComponent((bankBin || 'BIDV').trim());
  const acc = encodeURIComponent((accountNo || '8601774789').trim());
  const name = encodeURIComponent((accountName || 'HKD TRUNG TAM HUYNH THANH CHI').trim());
  const amt = Number(amount) || 0;
  const info = encodeURIComponent((addInfo || 'HOC PHI').trim());
  return `https://img.vietqr.io/image/${bin}-${acc}-compact2.png?amount=${amt}&addInfo=${info}&accountName=${name}`;
}

// Xử lý kéo thả & chọn ảnh biên lai bên Phụ huynh
function handleReceiptDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  const zone = document.getElementById('receipt-dropzone');
  if (zone) zone.classList.add('border-blue-600', 'bg-blue-50');
}

function handleReceiptDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  const zone = document.getElementById('receipt-dropzone');
  if (zone) zone.classList.remove('border-blue-600', 'bg-blue-50');
}

function handleReceiptDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  handleReceiptDragLeave(event);
  const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) processReceiptFile(file);
}

function handleReceiptFileSelect(event) {
  const file = event.target.files && event.target.files[0];
  if (file) processReceiptFile(file);
}

function processReceiptFile(file) {
  if (!file.type || !file.type.startsWith('image/')) {
    showToast('Vui lòng chọn file định dạng hình ảnh (JPG, PNG)!', 'warning');
    return;
  }
  compressImageFile(file, 900, 0.78, (base64Url) => {
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
  const fullNameInput = document.getElementById('pay-form-student-fullname');
  const typedStudentName = (fullNameInput ? fullNameInput.value : '').trim();

  if (!typedStudentName) {
    showToast('Vui lòng bắt buộc điền Họ và tên học sinh trước khi gửi xác nhận!', 'error');
    if (fullNameInput) fullNameInput.focus();
    return;
  }

  const studentRecordId = document.getElementById('pay-student-record-id').value;
  let student = studentRecordId ? appState.students.find(s => s.id === studentRecordId) : null;

  // Nếu chưa có studentRecordId, tìm học sinh khớp tên phụ huynh vừa gõ
  if (!student) {
    const cleanTyped = removeVietnameseTones(typedStudentName.toLowerCase()).replace(/\s+/g, ' ').trim();
    student = (appState.students || []).find(s =>
      removeVietnameseTones((s.fullName || '').toLowerCase()).replace(/\s+/g, ' ').trim().includes(cleanTyped)
    );
  }

  const payerName = document.getElementById('pay-form-payer').value.trim() || ('PH em ' + typedStudentName);
  const parentPhone = document.getElementById('pay-form-phone').value.trim() || (student ? student.parentPhone : '');
  const amount = Number(document.getElementById('pay-form-amount').value) || (student ? student.tuitionFee : 0);
  const note = document.getElementById('pay-form-note').value.trim();
  const nowStr = getCurrentDateTimeString();

  // Nếu học sinh chưa có trong danh sách lớp, tự động tạo bản ghi học sinh trạng thái Chờ duyệt để Quản lý thấy
  if (!student) {
    const nextNum = (appState.students.length + 1).toString().padStart(3, '0');
    student = {
      id: 'ST_' + Date.now(),
      studentCode: 'HS' + nextNum,
      fullName: typedStudentName,
      className: selectedClassbookClass || '12 2K8',
      parentName: payerName,
      parentPhone: parentPhone,
      period: appState.settings.defaultPeriod || 'Tháng 10/2026',
      tuitionFee: amount || 600000,
      status: 'Chờ duyệt',
      receiptUrl: uploadedReceiptBase64 || '',
      updatedAt: nowStr,
      note: note || 'Phụ huynh điền tên xác nhận trên Web'
    };
    appState.students.unshift(student);
  }

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
    studentName: typedStudentName,
    className: student.className,
    period: student.period,
    amount: amount,
    parentPhone: parentPhone,
    payerName: payerName,
    note: note || `Phụ huynh xác nhận chuyển khoản cho HS: ${typedStudentName}`,
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
  const nextNum = (appState.students.length + 1).toString().padStart(3, '0');
  const rawCode = document.getElementById('stu-form-code').value.trim().toUpperCase();
  const studentCode = rawCode || ('HS' + nextNum);
  const fullName = document.getElementById('stu-form-name').value.trim();
  const className = document.getElementById('stu-form-class').value.trim() || selectedClassbookClass || '12 2K8';
  const period = document.getElementById('stu-form-period').value.trim() || appState.settings.defaultPeriod || 'Tháng 10/2026';
  const parentName = document.getElementById('stu-form-parent').value.trim();
  const parentPhone = document.getElementById('stu-form-phone').value.trim();
  const tuitionFee = Number(document.getElementById('stu-form-fee').value) || 0;
  const status = document.getElementById('stu-form-status').value || 'Chưa đóng';
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
  const type = document.getElementById('trans-form-type').value || 'Thu';
  const date = document.getElementById('trans-form-date').value || new Date().toISOString().slice(0, 10);
  const category = document.getElementById('trans-form-category').value || (type === 'Thu' ? 'Thu học phí' : 'Khác');
  const amount = Number(document.getElementById('trans-form-amount').value) || 0;
  const description = document.getElementById('trans-form-desc').value.trim() || category;
  const studentCode = document.getElementById('trans-form-student-code').value.trim().toUpperCase();
  const method = document.getElementById('trans-form-method').value || 'Chuyển khoản';

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
// TAB 4: ĐỒNG BỘ 2 CHIỀU GOOGLE SHEETS & CÀI ĐẶT VIETQR / MÃ QR RIÊNG
// ============================================================================
function populateSettingsForm() {
  const stg = appState.settings || {};
  document.getElementById('setting-gas-url').value = getGasUrl();
  document.getElementById('setting-auto-sync').checked = isAutoSyncEnabled();

  document.getElementById('setting-center-name').value = stg.centerName || 'LỚP TOÁN ANH CHÍ';
  document.getElementById('setting-default-period').value = stg.defaultPeriod || 'Tháng 10/2026';
  document.getElementById('setting-bank-bin').value = stg.bankBin || 'BIDV';
  document.getElementById('setting-bank-acc').value = stg.bankAccountNo || '8601774789';
  document.getElementById('setting-bank-owner').value = stg.bankAccountName || 'HKD TRUNG TAM HUYNH THANH CHI';
  document.getElementById('setting-teacher-phone').value = stg.teacherPhone || '0905957716';
  document.getElementById('setting-admin-pass').value = stg.adminPassword || '123456';

  updateQrPreviewInSettings();
}

function updateQrPreviewInSettings() {
  const bin = document.getElementById('setting-bank-bin')?.value || 'BIDV';
  const acc = document.getElementById('setting-bank-acc')?.value || '8601774789';
  const owner = document.getElementById('setting-bank-owner')?.value || 'HKD TRUNG TAM HUYNH THANH CHI';
  const customQr = appState.settings.customQrUrl || '';

  const qrImg = document.getElementById('setting-qr-preview');
  const qrText = document.getElementById('setting-qr-preview-text');
  const modeBadge = document.getElementById('setting-qr-mode-badge');
  const subText = document.getElementById('setting-qr-preview-sub');
  const clearBtn = document.getElementById('btn-clear-custom-qr');

  if (customQr) {
    if (qrImg) qrImg.src = customQr;
    if (modeBadge) {
      modeBadge.textContent = 'ĐANG SỬ DỤNG ẢNH MÃ QR RIÊNG CỦA BẠN';
      modeBadge.className = 'inline-block px-2 py-0.5 rounded bg-emerald-600 text-white font-semibold text-[10px]';
    }
    if (qrText) qrText.textContent = `${bin} - ${acc} (${owner})`;
    if (subText) subText.textContent = 'Hệ thống đang hiển thị trực tiếp ảnh mã QR do bạn tải lên cho Phụ huynh quét.';
    if (clearBtn) clearBtn.classList.remove('hidden');
  } else {
    if (qrImg) qrImg.src = buildVietQrUrl(bin, acc, owner, 1500000, 'HP T10 HS001');
    if (modeBadge) {
      modeBadge.textContent = 'XEM TRƯỚC MÃ VIETQR TỰ ĐỘNG';
      modeBadge.className = 'inline-block px-2 py-0.5 rounded bg-blue-600 text-white font-semibold text-[10px]';
    }
    if (qrText) qrText.textContent = `${bin} - ${acc} (${owner})`;
    if (subText) subText.textContent = 'Khi phụ huynh tra cứu, mã QR sẽ tự động gắn đúng số tiền học phí và mã học sinh.';
    if (clearBtn) clearBtn.classList.add('hidden');
  }
}

function handleCustomQrDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  const zone = document.getElementById('custom-qr-dropzone');
  if (zone) zone.classList.add('border-blue-600', 'bg-blue-100/70');
}

function handleCustomQrDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  const zone = document.getElementById('custom-qr-dropzone');
  if (zone) zone.classList.remove('border-blue-600', 'bg-blue-100/70');
}

function handleCustomQrDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  handleCustomQrDragLeave(event);
  const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) processCustomQrFile(file);
}

function handleCustomQrFileSelect(event) {
  const file = event.target.files && event.target.files[0];
  if (file) processCustomQrFile(file);
}

function processCustomQrFile(file) {
  if (!file.type || !file.type.startsWith('image/')) {
    showToast('Vui lòng chọn file hình ảnh Mã QR (JPG, PNG)!', 'warning');
    return;
  }
  compressImageFile(file, 800, 0.85, (base64Url) => {
    appState.settings.customQrUrl = base64Url;
    updateQrPreviewInSettings();
    saveStateToLocal();
    triggerAutoSyncIfNeeded('Đã tải lên ảnh Mã QR riêng của bạn & đồng bộ thành công!');
  });
}

function clearCustomQrImage() {
  appState.settings.customQrUrl = '';
  const fileInput = document.getElementById('setting-custom-qr-file');
  if (fileInput) fileInput.value = '';
  updateQrPreviewInSettings();
  saveStateToLocal();
  triggerAutoSyncIfNeeded('Đã chuyển về chế độ tạo mã VietQR tự động!');
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

// ============================================================================
// PHÂN HỆ MỚI: SỔ THEO DÕI LỚP HỌC & LỊCH DẠY TÔ MÀU (CHUẨN MẪU)
// ============================================================================
const DAY_LABELS = {
  1: 'THỨ 2',
  2: 'THỨ 3',
  3: 'THỨ 4',
  4: 'THỨ 5',
  5: 'THỨ 6',
  6: 'THỨ 7',
  0: 'CHỦ NHẬT'
};

function getDefaultClassScheduleConfig(className) {
  return {
    className: className || '12 2K8',
    subject: 'Toán',
    periodLabel: appState.settings?.defaultPeriod || 'Tháng 10-11/2026',
    batchLabel: 'ĐỢT SỐ 5',
    status: 'Đang diễn ra',
    startDate: '2026-05-04',
    endDate: '2026-06-28',
    daysOfWeek: [1, 3, 5, 0], // Thứ 2, Thứ 4, Thứ 6, Chủ Nhật (giống hệt ảnh mẫu)
    sessionStates: {} // { '2026-05-04': 1, '2026-05-06': 2, ... }
  };
}

function getClassSchedulesMap() {
  let map = {};
  try {
    if (appState.settings && appState.settings.classSchedulesJson) {
      map = JSON.parse(appState.settings.classSchedulesJson) || {};
    }
  } catch (e) {
    map = {};
  }

  // Đảm bảo mọi lớp đang có trong danh sách học sinh đều có cấu hình lịch
  const studentClasses = Array.from(
    new Set((appState.students || []).map(s => (s.className || '').trim()).filter(Boolean))
  );

  // Nếu chưa có lớp nào, tạo sẵn lớp mẫu '12 2K8'
  if (studentClasses.length === 0 && Object.keys(map).length === 0) {
    map['12 2K8'] = getDefaultClassScheduleConfig('12 2K8');
  }

  studentClasses.forEach(cls => {
    if (!map[cls]) {
      map[cls] = getDefaultClassScheduleConfig(cls);
    }
  });

  return map;
}

function saveClassSchedulesMap(map, syncMsg = '') {
  if (!appState.settings) appState.settings = {};
  appState.settings.classSchedulesJson = JSON.stringify(map);
  saveStateToLocal();
  if (syncMsg) {
    triggerAutoSyncIfNeeded(syncMsg);
  } else {
    const gasUrl = getGasUrl();
    if (gasUrl && isAutoSyncEnabled()) {
      syncAllToGoogleSheet(false);
    }
  }
}

function setCalendarBrush(brushMode) {
  currentCalendarBrush = brushMode;
  const modes = ['cycle', 1, 2, 3, 0];
  modes.forEach(m => {
    const btn = document.getElementById('brush-btn-' + m);
    if (!btn) return;
    if (String(m) === String(brushMode)) {
      btn.classList.add('ring-2', 'ring-offset-1', 'ring-blue-600', 'opacity-100');
      btn.classList.remove('opacity-80');
    } else {
      btn.classList.remove('ring-2', 'ring-offset-1', 'ring-blue-600', 'opacity-100');
      btn.classList.add('opacity-80');
    }
  });
}

function selectClassbookClass(className) {
  selectedClassbookClass = className;
  renderAdminClassbook();
}

function renderAdminClassbook() {
  const pillsContainer = document.getElementById('classbook-class-pills');
  if (!pillsContainer) return;

  const map = getClassSchedulesMap();
  const classNames = Object.keys(map);

  if (!selectedClassbookClass || !map[selectedClassbookClass]) {
    selectedClassbookClass = classNames[0] || '12 2K8';
  }

  // 1. Render các nút chọn lớp
  pillsContainer.innerHTML = classNames
    .map(cls => {
      const isSelected = cls === selectedClassbookClass;
      const count = (appState.students || []).filter(s => s.className === cls).length;
      return `
        <button
          type="button"
          onclick="selectClassbookClass('${escapeAttr(cls)}')"
          class="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
            isSelected
              ? 'bg-[#1f3d6e] text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }"
        >
          <span>${escapeHtml(cls)}</span>
          <span class="px-1.5 py-0.2 rounded-full text-[10px] ${
            isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
          }">${count} HS</span>
        </button>
      `;
    })
    .join('');

  const cfg = map[selectedClassbookClass] || getDefaultClassScheduleConfig(selectedClassbookClass);

  // 2. Render thông tin Metadata của Lớp
  document.getElementById('cb-meta-classname').textContent = cfg.className;
  document.getElementById('cb-meta-subject').textContent = cfg.subject || 'Toán';
  document.getElementById('cb-meta-period').textContent = cfg.periodLabel || 'Tháng 10-11/2026';
  document.getElementById('cb-meta-daterange').textContent =
    cfg.startDate && cfg.endDate ? `(${formatShortDateVN(cfg.startDate)} → ${formatShortDateVN(cfg.endDate)})` : '';
  document.getElementById('cb-meta-status').textContent = cfg.status || 'Đang diễn ra';

  // 3. Lọc học sinh thuộc lớp này
  const classStudents = (appState.students || []).filter(s => s.className === selectedClassbookClass);
  const totalCount = classStudents.length;
  const paidStudents = classStudents.filter(s => s.status === 'Đã hoàn thành');
  const paidCount = paidStudents.length;
  const paidRate = totalCount > 0 ? ((paidCount / totalCount) * 100).toFixed(1).replace('.', ',') + '%' : '0%';

  const totalExpected = classStudents.reduce((sum, s) => sum + (Number(s.tuitionFee) || 0), 0);
  const totalCollected = paidStudents.reduce((sum, s) => sum + (Number(s.tuitionFee) || 0), 0);
  const totalMissing = Math.max(0, totalExpected - totalCollected);

  // Cập nhật 4 ô KPI lớn
  document.getElementById('cb-kpi-total-students').textContent = totalCount;
  document.getElementById('cb-kpi-paid-rate').textContent = paidRate;
  document.getElementById('cb-kpi-collected').textContent = formatCurrency(totalCollected);
  document.getElementById('cb-kpi-missing').textContent = formatCurrency(totalMissing);

  // Cập nhật dòng TỔNG CỘNG của bảng học sinh bên trái
  document.getElementById('cb-sum-expected').textContent = formatCurrency(totalExpected);
  document.getElementById('cb-sum-paid-count').textContent = `${paidCount} em`;
  document.getElementById('cb-sum-collected').textContent = formatCurrency(totalCollected);
  document.getElementById('cb-sum-missing').textContent = formatCurrency(totalMissing);

  // 4. Render Bảng Học sinh bên trái
  const stTbody = document.getElementById('cb-students-tbody');
  if (classStudents.length === 0) {
    stTbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-8 text-center text-slate-400 text-xs">
          Chưa có học sinh nào trong lớp <strong>${escapeHtml(selectedClassbookClass)}</strong>.
          <button onclick="openStudentModalForCurrentClass()" class="text-blue-600 font-bold hover:underline ml-1 cursor-pointer">+ Thêm học sinh ngay</button>
        </td>
      </tr>
    `;
  } else {
    stTbody.innerHTML = classStudents
      .map((s, idx) => {
        const isPaid = s.status === 'Đã hoàn thành';
        const isPending = s.status === 'Chờ duyệt';
        const statusCellClass = isPaid
          ? 'bg-emerald-100 text-emerald-800 font-bold'
          : isPending
          ? 'bg-amber-100 text-amber-800 font-bold'
          : 'bg-rose-50 text-rose-700 font-semibold';

        return `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-2 px-2 text-center font-semibold text-slate-600">${idx + 1}</td>
            <td class="py-2 px-3">
              <div class="font-bold text-slate-900">${escapeHtml(s.fullName)}</div>
              <div class="text-[11px] text-slate-400 font-mono">${escapeHtml(s.studentCode)} • SĐT: ${escapeHtml(s.parentPhone)}</div>
            </td>
            <td class="py-2 px-2.5 text-right font-semibold text-slate-800">
              ${formatCurrency(s.tuitionFee)}
            </td>
            <td class="py-2 px-2 text-center">
              <input
                type="checkbox"
                ${isPaid ? 'checked' : ''}
                onchange="toggleClassbookPaidCheckbox('${s.id}', this.checked)"
                class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                title="Tích chọn để xác nhận đã hoàn thành học phí"
              />
            </td>
            <td class="py-2 px-2 text-center ${statusCellClass}">
              <select
                onchange="quickChangeStudentStatus('${s.id}', this.value)"
                class="bg-transparent text-xs font-bold text-center focus:outline-none cursor-pointer w-full"
              >
                <option value="Đã hoàn thành" ${isPaid ? 'selected' : ''}>Đã hoàn thành</option>
                <option value="Chờ duyệt" ${isPending ? 'selected' : ''}>Chờ duyệt</option>
                <option value="Chưa đóng" ${!isPaid && !isPending ? 'selected' : ''}>Chưa đóng</option>
              </select>
            </td>
            <td class="py-1.5 px-2">
              <div class="flex items-center gap-1">
                <input
                  type="text"
                  value="${escapeAttr(s.note || '')}"
                  placeholder="Ghi chú (CK/Tiền mặt)..."
                  onchange="updateClassbookStudentNote('${s.id}', this.value)"
                  class="w-full px-1.5 py-1 text-xs border border-transparent hover:border-slate-300 focus:border-blue-500 rounded bg-transparent focus:bg-white focus:outline-none"
                />
                ${
                  s.receiptUrl
                    ? `<button onclick="openReceiptViewer('${escapeAttr(s.receiptUrl)}', 'Biên lai ${escapeAttr(s.fullName)}')" title="Xem ảnh biên lai" class="text-blue-600 hover:text-blue-800 shrink-0 cursor-pointer"><i data-lucide="image" class="w-3.5 h-3.5"></i></button>`
                    : ''
                }
              </div>
            </td>
            <td class="py-2 px-1.5 text-center">
              <div class="inline-flex items-center gap-1">
                <button onclick="openStudentModal('${s.id}')" title="Sửa" class="p-1 text-slate-500 hover:text-blue-600 cursor-pointer">
                  <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="deleteStudentRecord('${s.id}')" title="Xóa" class="p-1 text-slate-400 hover:text-rose-600 cursor-pointer">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  // 5. Render Bảng Lịch Học & Điểm Danh Buổi Dạy bên phải
  renderClassbookScheduleTable(cfg);
  lucide.createIcons();
}

function toggleClassbookPaidCheckbox(studentId, isChecked) {
  const s = appState.students.find(item => item.id === studentId);
  if (!s) return;
  const newStatus = isChecked ? 'Đã hoàn thành' : 'Chưa đóng';
  if (isChecked && !s.note) {
    s.note = 'Đã chuyển khoản';
  }
  quickChangeStudentStatus(studentId, newStatus);
}

function updateClassbookStudentNote(studentId, newNote) {
  const s = appState.students.find(item => item.id === studentId);
  if (!s) return;
  s.note = newNote.trim();
  s.updatedAt = getCurrentDateTimeString();
  saveStateToLocal();
  triggerAutoSyncIfNeeded('Đã lưu ghi chú học sinh!');
}

function generateScheduleWeeks(startDateStr, endDateStr, daysOfWeek) {
  const activeDays = Array.isArray(daysOfWeek) && daysOfWeek.length > 0 ? daysOfWeek : [1, 3, 5, 0];
  // Sắp xếp thứ tự cột từ Thứ 2 (1) -> Thứ 7 (6) -> Chủ Nhật (0)
  const orderedCols = [1, 2, 3, 4, 5, 6, 0].filter(d => activeDays.includes(d));

  const start = new Date((startDateStr || '2026-05-04') + 'T00:00:00');
  const end = new Date((endDateStr || '2026-06-28') + 'T00:00:00');
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return { orderedCols, weeks: [], totalSessions: 0 };
  }

  // Tìm ngày Thứ 2 đầu tuần của startDate
  const startDay = start.getDay(); // 0..6
  const diffToMonday = startDay === 0 ? -6 : 1 - startDay;
  const firstMonday = new Date(start);
  firstMonday.setDate(start.getDate() + diffToMonday);

  const weeks = [];
  let totalSessions = 0;
  let curMonday = new Date(firstMonday);
  let safetyCount = 0;

  while (curMonday <= end && safetyCount < 60) {
    safetyCount++;
    const rowCells = [];
    let hasAnyInRange = false;

    orderedCols.forEach(dayNum => {
      const offset = dayNum === 0 ? 6 : dayNum - 1;
      const cellDate = new Date(curMonday);
      cellDate.setDate(curMonday.getDate() + offset);

      if (cellDate >= start && cellDate <= end) {
        hasAnyInRange = true;
        totalSessions++;
        const yyyy = cellDate.getFullYear();
        const mm = String(cellDate.getMonth() + 1).padStart(2, '0');
        const dd = String(cellDate.getDate()).padStart(2, '0');
        const dateKey = `${yyyy}-${mm}-${dd}`;
        const label = `${cellDate.getDate()}/${cellDate.getMonth() + 1}`;
        rowCells.push({ dateKey, label, inRange: true });
      } else {
        rowCells.push({ dateKey: '', label: '', inRange: false });
      }
    });

    if (hasAnyInRange) {
      weeks.push(rowCells);
    }
    curMonday.setDate(curMonday.getDate() + 7);
  }

  return { orderedCols, weeks, totalSessions };
}

function renderClassbookScheduleTable(cfg) {
  const thead = document.getElementById('cb-schedule-thead');
  const tbody = document.getElementById('cb-schedule-tbody');
  if (!thead || !tbody) return;

  const { orderedCols, weeks, totalSessions } = generateScheduleWeeks(
    cfg.startDate,
    cfg.endDate,
    cfg.daysOfWeek
  );

  const states = cfg.sessionStates || {};
  let taughtCount = 0;
  let confirmedCount = 0;

  weeks.forEach(row => {
    row.forEach(cell => {
      if (cell.inRange && cell.dateKey) {
        const st = Number(states[cell.dateKey] || 0);
        if (st === 1) taughtCount++;
        if (st === 2) confirmedCount++;
      }
    });
  });

  const colCount = Math.max(1, orderedCols.length);

  thead.innerHTML = `
    <tr class="sheet-navy-header font-bold text-xs uppercase">
      <th colspan="${colCount}" class="py-2.5 px-2">
        SỐ BUỔI HỌC CỦA ${escapeHtml(cfg.periodLabel || 'THÁNG 10-11/2026')}
      </th>
      <th class="py-2.5 px-2 w-24">
        ${escapeHtml(cfg.batchLabel || 'ĐỢT SỐ 5')}
      </th>
    </tr>
    <tr class="sheet-navy-header font-bold text-[11px] uppercase">
      ${orderedCols.map(d => `<th class="py-2 px-1.5">${DAY_LABELS[d]}</th>`).join('')}
      <th class="py-2 px-1.5">TỔNG SỐ BUỔI</th>
    </tr>
    <tr class="bg-slate-100 font-extrabold text-xs border-b-2 border-slate-400">
      <td colspan="${colCount}" class="py-2 px-2 text-center uppercase text-slate-800">
        TỔNG CỘNG SỐ BUỔI DẠY
      </td>
      <td class="py-2 px-2 text-center text-blue-700">
        <div>${totalSessions} buổi</div>
        <div class="text-[10px] font-semibold text-emerald-700">
          Đã dạy: ${taughtCount + confirmedCount}/${totalSessions}
        </div>
      </td>
    </tr>
  `;

  if (weeks.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${colCount + 1}" class="py-8 text-center text-slate-400 text-xs">
          Chưa có ngày học trong khoảng đã chọn. Hãy bấm <strong>"Cài đặt Lịch học"</strong> để chọn Từ ngày &rarr; Đến ngày.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = weeks
    .map((row, wIdx) => {
      // Đếm số buổi đã dạy trong tuần này
      let weekDone = 0;
      const cellsHtml = row
        .map(cell => {
          if (!cell.inRange) {
            return `<td class="py-2 px-1.5 bg-slate-50 text-slate-300">-</td>`;
          }
          const st = Number(states[cell.dateKey] || 0);
          if (st === 1 || st === 2) weekDone++;
          const prefix = st === 1 ? '✓ ' : st === 2 ? '★ ' : st === 3 ? '✕ ' : '';
          const titleTip =
            st === 1
              ? 'Đã dạy (Bấm để đổi màu xác nhận)'
              : st === 2
              ? 'Đã xác nhận / Chốt (Bấm để đổi)'
              : st === 3
              ? 'Nghỉ / Bù (Bấm để xóa màu)'
              : 'Chưa dạy (Bấm để tô màu Đã dạy)';

          return `
            <td
              onclick="toggleSessionDateState('${escapeAttr(cfg.className)}', '${cell.dateKey}')"
              title="${titleTip}"
              class="py-2.5 px-1.5 session-cell session-state-${st} text-xs"
            >
              ${prefix}${cell.label}
            </td>
          `;
        })
        .join('');

      return `
        <tr>
          ${cellsHtml}
          <td class="py-2 px-1.5 text-[11px] font-semibold text-slate-500 bg-slate-50/60">
            Tuần ${wIdx + 1} (${weekDone}b)
          </td>
        </tr>
      `;
    })
    .join('');
}

// Bấm vào ô ngày trên bảng lịch để tô màu Đã dạy / Xác nhận / Nghỉ
function toggleSessionDateState(className, dateKey) {
  if (!dateKey) return;
  const map = getClassSchedulesMap();
  const cfg = map[className] || getDefaultClassScheduleConfig(className);
  if (!cfg.sessionStates) cfg.sessionStates = {};

  const currentSt = Number(cfg.sessionStates[dateKey] || 0);
  let nextSt = 0;

  if (currentCalendarBrush === 'cycle') {
    nextSt = (currentSt + 1) % 4; // 0 -> 1 (Xanh lá) -> 2 (Cam xác nhận) -> 3 (Đỏ nghỉ) -> 0
  } else {
    const targetBrush = Number(currentCalendarBrush);
    nextSt = currentSt === targetBrush ? 0 : targetBrush;
  }

  if (nextSt === 0) {
    delete cfg.sessionStates[dateKey];
  } else {
    cfg.sessionStates[dateKey] = nextSt;
  }

  map[className] = cfg;
  saveClassSchedulesMap(map);
}

// Mở Modal cài đặt Lớp & Lịch học (Từ ngày -> Đến ngày, Tháng, Các thứ trong tuần)
function openClassScheduleModal(isNew = false) {
  const modal = document.getElementById('class-schedule-modal');
  const title = document.getElementById('cs-modal-title');
  const delBtn = document.getElementById('btn-delete-class-schedule');
  const map = getClassSchedulesMap();

  document.getElementById('cs-form-is-new').value = isNew ? 'true' : 'false';

  if (isNew) {
    title.textContent = 'Tạo Lớp Học & Lịch Dạy Mới';
    delBtn.classList.add('hidden');
    document.getElementById('cs-form-old-name').value = '';
    document.getElementById('cs-form-classname').value = '';
    document.getElementById('cs-form-subject').value = 'Toán';
    document.getElementById('cs-form-period').value = appState.settings?.defaultPeriod || 'Tháng 10-11/2026';
    document.getElementById('cs-form-batch').value = 'ĐỢT SỐ 1';
    document.getElementById('cs-form-status').value = 'Đang diễn ra';
    document.getElementById('cs-form-start-date').value = '2026-10-01';
    document.getElementById('cs-form-end-date').value = '2026-11-30';
    document.querySelectorAll('.cs-day-checkbox').forEach(cb => {
      cb.checked = [1, 3, 5, 0].includes(Number(cb.value));
    });
  } else {
    const cfg = map[selectedClassbookClass] || getDefaultClassScheduleConfig(selectedClassbookClass);
    title.textContent = `Cài Đặt Lịch Học - Lớp ${cfg.className}`;
    delBtn.classList.remove('hidden');
    document.getElementById('cs-form-old-name').value = cfg.className;
    document.getElementById('cs-form-classname').value = cfg.className;
    document.getElementById('cs-form-subject').value = cfg.subject || 'Toán';
    document.getElementById('cs-form-period').value = cfg.periodLabel || 'Tháng 10-11/2026';
    document.getElementById('cs-form-batch').value = cfg.batchLabel || 'ĐỢT SỐ 5';
    document.getElementById('cs-form-status').value = cfg.status || 'Đang diễn ra';
    document.getElementById('cs-form-start-date').value = cfg.startDate || '2026-05-04';
    document.getElementById('cs-form-end-date').value = cfg.endDate || '2026-06-28';
    const activeDays = cfg.daysOfWeek || [1, 3, 5, 0];
    document.querySelectorAll('.cs-day-checkbox').forEach(cb => {
      cb.checked = activeDays.includes(Number(cb.value));
    });
  }

  modal.classList.remove('hidden');
}

function closeClassScheduleModal() {
  document.getElementById('class-schedule-modal').classList.add('hidden');
}

function saveClassScheduleForm(event) {
  event.preventDefault();
  const isNew = document.getElementById('cs-form-is-new').value === 'true';
  const oldName = document.getElementById('cs-form-old-name').value.trim();
  const className = document.getElementById('cs-form-classname').value.trim() || 'Lớp mới';
  const subject = document.getElementById('cs-form-subject').value.trim() || 'Toán';
  const periodLabel = document.getElementById('cs-form-period').value.trim() || appState.settings?.defaultPeriod || 'Tháng 10-11/2026';
  const batchLabel = document.getElementById('cs-form-batch').value.trim() || 'ĐỢT SỐ 1';
  const status = document.getElementById('cs-form-status').value || 'Đang diễn ra';
  const startDate = document.getElementById('cs-form-start-date').value || '2026-05-04';
  const endDate = document.getElementById('cs-form-end-date').value || '2026-06-28';

  const daysOfWeek = [];
  document.querySelectorAll('.cs-day-checkbox:checked').forEach(cb => {
    daysOfWeek.push(Number(cb.value));
  });

  if (daysOfWeek.length === 0) {
    showToast('Vui lòng tích chọn ít nhất 1 Thứ học trong tuần!', 'warning');
    return;
  }

  const map = getClassSchedulesMap();
  const existingStates = (!isNew && oldName && map[oldName]?.sessionStates) ? map[oldName].sessionStates : {};

  if (!isNew && oldName && oldName !== className) {
    delete map[oldName];
    // Đổi tên lớp cho các học sinh thuộc lớp cũ
    (appState.students || []).forEach(s => {
      if (s.className === oldName) {
        s.className = className;
      }
    });
  }

  map[className] = {
    className,
    subject,
    periodLabel,
    batchLabel,
    status,
    startDate,
    endDate,
    daysOfWeek,
    sessionStates: existingStates
  };

  selectedClassbookClass = className;
  closeClassScheduleModal();
  saveClassSchedulesMap(map, `Đã cập nhật lịch học lớp "${className}"!`);
}

function deleteCurrentClassSchedule() {
  if (!selectedClassbookClass) return;
  if (!confirm(`Bạn có chắc muốn xóa cấu hình lịch của lớp "${selectedClassbookClass}"?`)) return;
  const map = getClassSchedulesMap();
  delete map[selectedClassbookClass];
  selectedClassbookClass = Object.keys(map)[0] || '';
  closeClassScheduleModal();
  saveClassSchedulesMap(map, 'Đã xóa lịch lớp học.');
}

function openStudentModalForCurrentClass() {
  openStudentModal('');
  if (selectedClassbookClass) {
    document.getElementById('stu-form-class').value = selectedClassbookClass;
    const map = getClassSchedulesMap();
    if (map[selectedClassbookClass]?.periodLabel) {
      document.getElementById('stu-form-period').value = map[selectedClassbookClass].periodLabel;
    }
  }
}

function formatShortDateVN(isoDate) {
  if (!isoDate) return '';
  const parts = String(isoDate).split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// ============================================================================
// TỰ ĐỘNG CẬP NHẬT KHI CÓ TIỀN CHUYỂN VÀO STK NGÂN HÀNG (AUTO-BANK WEBHOOK & POLLING)
// ============================================================================
let livePollingTimer = null;

function startLiveBankPolling() {
  if (livePollingTimer) clearInterval(livePollingTimer);
  const checkbox = document.getElementById('setting-live-polling');
  const isEnabled = checkbox ? checkbox.checked : true;
  if (!isEnabled) return;

  const webhookDisplay = document.getElementById('bank-webhook-url-display');
  if (webhookDisplay && getGasUrl()) {
    webhookDisplay.textContent = getGasUrl();
  }

  livePollingTimer = setInterval(async () => {
    const gasUrl = getGasUrl();
    if (!gasUrl) return;
    try {
      const prevPaidSet = new Set(
        (appState.students || [])
          .filter(s => s.status === 'Đã hoàn thành')
          .map(s => s.studentCode + '_' + s.period)
      );

      const res = await fetch(`${gasUrl}?action=getAll&t=${Date.now()}`, {
        method: 'GET',
        redirect: 'follow'
      });
      const json = await res.json();
      if (json && json.success && json.data) {
        const nextState = mergeServerData(json.data);
        const newlyPaid = (nextState.students || []).filter(
          s => s.status === 'Đã hoàn thành' && !prevPaidSet.has(s.studentCode + '_' + s.period)
        );

        if (newlyPaid.length > 0) {
          appState = nextState;
          saveStateToLocal();
          newlyPaid.forEach(st => {
            showToast(
              `🔔 NHẬN TIỀN TỰ ĐỘNG: Học sinh ${st.fullName} (${st.studentCode}) vừa hoàn thành học phí (${formatCurrency(st.tuitionFee)})!`,
              'success'
            );
          });
        }
      }
    } catch (e) {
      // Bỏ qua lỗi mạng tạm thời khi polling ngầm
    }
  }, 15000);
}

function toggleLiveBankPolling(enabled) {
  if (enabled) {
    startLiveBankPolling();
    showToast('Đã bật tự động kiểm tra giao dịch chuyển khoản mới (15 giây/lần)!', 'success');
  } else {
    if (livePollingTimer) clearInterval(livePollingTimer);
    livePollingTimer = null;
    showToast('Đã tạm dừng tự động kiểm tra giao dịch ngầm.', 'info');
  }
}

async function simulateIncomingBankTransfer() {
  const contentInput = document.getElementById('sim-bank-content');
  const amountInput = document.getElementById('sim-bank-amount');
  const rawContent = (contentInput?.value || '').trim();
  const amount = Number(amountInput?.value) || 0;

  if (!rawContent) {
    showToast('Vui lòng nhập nội dung chuyển khoản giả lập (VD: HP HS001 NGUYEN MINH ANH)!', 'warning');
    return;
  }

  const cleanContent = removeVietnameseTones(rawContent).toUpperCase();
  const nowStr = getCurrentDateTimeString();
  const todayDate = new Date().toISOString().slice(0, 10);

  // Tìm học sinh khớp Mã HS, Họ tên hoặc SĐT trong nội dung chuyển khoản
  let matchedStudent = null;
  for (const s of appState.students || []) {
    const code = removeVietnameseTones(s.studentCode || '').toUpperCase().trim();
    const name = removeVietnameseTones(s.fullName || '').toUpperCase().trim();
    const phone = String(s.parentPhone || '').replace(/[^0-9]/g, '');

    if (
      (code && code.length >= 3 && cleanContent.includes(code)) ||
      (name && name.length >= 6 && cleanContent.includes(name)) ||
      (phone && phone.length >= 8 && cleanContent.includes(phone))
    ) {
      matchedStudent = s;
      break;
    }
  }

  if (!matchedStudent) {
    showToast('Không tìm thấy Học sinh nào có Mã HS hoặc Họ tên khớp với nội dung: "' + rawContent + '"', 'error');
    return;
  }

  const finalAmount = amount > 0 ? amount : matchedStudent.tuitionFee;
  matchedStudent.status = 'Đã hoàn thành';
  matchedStudent.updatedAt = nowStr;
  matchedStudent.note = `Đã chuyển khoản tự động (${formatCurrency(finalAmount)})`;

  // Cập nhật các yêu cầu chờ duyệt của HS này (nếu có) thành Đã duyệt
  (appState.paymentRequests || []).forEach(r => {
    if (r.studentCode === matchedStudent.studentCode && r.status === 'Chờ duyệt') {
      r.status = 'Đã duyệt';
      r.reviewedAt = nowStr;
    }
  });

  // Thêm phiếu thu tự động vào Sổ Thu - Chi
  appState.transactions.unshift({
    id: 'GD_AUTO_' + Date.now(),
    date: todayDate,
    type: 'Thu',
    category: 'Thu học phí',
    amount: finalAmount,
    description: `Tự động xác nhận CK Ngân hàng: ${matchedStudent.studentCode} - ${matchedStudent.fullName} (${rawContent})`,
    studentCode: matchedStudent.studentCode,
    method: 'Chuyển khoản (Auto)',
    receiptUrl: '',
    createdBy: 'Hệ thống Auto-Bank'
  });

  saveStateToLocal();
  await triggerAutoSyncIfNeeded(
    `⚡ TỰ ĐỘNG XÁC NHẬN: Đã nhận ${formatCurrency(finalAmount)} từ nội dung "${rawContent}" -> Học sinh ${matchedStudent.fullName} đã chuyển sang ĐÃ HOÀN THÀNH!`
  );
}
