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
const DEFAULT_GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyXFB8UgPDiZXxZtHF6bxGFWe0I3Voc1Ecke1DUi1Jp2P6LeD3Ss1etOKqbOBIctR5YTg/exec';

const STORAGE_KEYS = {
  STATE: 'edupay_app_state_v2',
  SANDBOX_STATE: 'edupay_sandbox_draft_state_v2',
  UNDO_STACK: 'edupay_undo_stack_v2',
  REDO_STACK: 'edupay_redo_stack_v2',
  DIRTY_SYNC: 'edupay_dirty_pending_sync',
  UI_VIEW: 'edupay_ui_view_state_v1',
  GAS_URL: 'edupay_gas_webapp_url',
  AUTO_SYNC: 'edupay_auto_sync_enabled',
  ADMIN_AUTH: 'edupay_admin_authenticated',
  SANDBOX_AUTH: 'edupay_sandbox_authenticated'
};

var appState = null;
var _bootedFromEmptyStorage = false;

// Chỉ chuyển đổi các icon chưa render hoặc vừa đổi data-lucide thay vì quét lại toàn bộ SVG trên trang
if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function' && !lucide.__optimizedCreateIcons) {
  const rawCreateIcons = lucide.createIcons.bind(lucide);
  lucide.createIcons = function optimizedCreateIcons(opts = {}) {
    const root = (opts && (opts.root || (opts.nodes && opts.nodes[0]))) || document;
    const attr = (opts && opts.nameAttr) || 'data-lucide';
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const pending = root.querySelectorAll(`[${attr}]`);
    if (!pending.length) return;
    rawCreateIcons({ ...opts, root });
    const rendered = root.querySelectorAll(`svg[${attr}]`);
    for (let i = 0; i < rendered.length; i++) {
      rendered[i].removeAttribute(attr);
    }
  };
  lucide.__optimizedCreateIcons = true;
}

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
  <text x="370" y="365" text-anchor="end" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#1d5fbf">HP T10 HS002 TRAN GIA HUY</text>
  <text x="50" y="400" font-family="Arial, sans-serif" font-size="13" fill="#64748b">Mã giao dịch:</text>
  <text x="370" y="400" text-anchor="end" font-family="Arial, sans-serif" font-size="13" fill="#334155">FT262958891203</text>
  <rect x="45" y="445" width="330" height="75" rx="12" fill="#eff6ff"/>
  <text x="210" y="478" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#1e40af">BIÊN LAI ĐIỆN TỬ ĐÍNH KÈM TRÊN WEB APP</text>
  <text x="210" y="500" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#1d5fbf">Đã đồng bộ Google Sheets &amp; Google Drive</text>
</svg>`);

// Danh sách các lớp nháp / học sinh nháp cần tự động loại bỏ khỏi hệ thống
const DRAFT_CLASS_NAMES = new Set([
  'Toán 12A - Luyện Thi ĐH',
  'Toán 11B - Nâng Cao',
  'Toán 10A - Cơ Bản & Ôn Tập',
  '12 2K8 (Mẫu)',
  'Sheet mẫu'
]);

const DRAFT_STUDENT_IDS = new Set([
  'ST_1001',
  'ST_1002',
  'ST_1003',
  'ST_1004',
  'ST_1005',
  'ST_1792670780546', // Uyen (nháp)
  'ST_1792670290901', // abc
  'ST_1792684869622'  // abcd
]);

const DRAFT_STUDENT_NAMES = new Set([
  'nguyễn minh anh',
  'trần gia huy',
  'lê hoàng bảo ngọc',
  'phạm quốc khánh',
  'vũ phương thảo'
]);

function getExactAmountsMap(stateObj) {
  const defaultMap = {
    ST_1792759143949: 5000,
    HS100: 5000,
    ST_1792759460958: 5000,
    HS101: 5000,
    YC_STK_1792759710531: 5000
  };
  try {
    const raw = (stateObj || appState)?.settings?.exactAmountsJson;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return { ...defaultMap, ...parsed };
      }
    }
  } catch (e) {}
  return defaultMap;
}

function recordExactSmallAmount(stateObj, idKey, codeKey, vndAmount) {
  // Hỗ trợ cách gọi rút gọn recordExactSmallAmount(idKey, vndAmount) để tránh lỗi TypeError làm hỏng thao tác lưu
  if (stateObj === null || typeof stateObj !== 'object') {
    if (codeKey === undefined && vndAmount === undefined) {
      vndAmount = idKey;
      idKey = stateObj;
      codeKey = '';
    } else {
      vndAmount = codeKey;
      codeKey = idKey;
      idKey = stateObj;
    }
    stateObj = appState;
  }
  const target = stateObj || appState;
  if (!target || typeof target !== 'object') return;
  if (!target.settings) target.settings = {};
  const map = getExactAmountsMap(target);
  const num = Number(vndAmount);
  if (!isNaN(num) && num >= 0 && num < 20000) {
    if (idKey) map[String(idKey).trim()] = num;
    if (codeKey) map[String(codeKey).trim().toUpperCase()] = num;
  } else {
    if (idKey && map[String(idKey).trim()] !== undefined && num >= 20000) {
      delete map[String(idKey).trim()];
    }
    if (codeKey && map[String(codeKey).trim().toUpperCase()] !== undefined && num >= 20000) {
      delete map[String(codeKey).trim().toUpperCase()];
    }
  }
  target.settings.exactAmountsJson = JSON.stringify(map);
}

function getDeletedClassesSet(stateObj) {
  const set = new Set();
  try {
    const raw = stateObj?.settings?.deletedClassesJson;
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        arr.forEach(c => {
          const clean = String(c || '').trim();
          if (clean) set.add(clean);
        });
      }
    }
  } catch (e) {}
  return set;
}

function markClassAsDeletedInState(className) {
  const clean = String(className || '').trim();
  if (!clean) return;
  if (!appState.settings) appState.settings = {};
  const set = getDeletedClassesSet(appState);
  set.add(clean);
  appState.settings.deletedClassesJson = JSON.stringify(Array.from(set));
}

function unmarkClassAsDeletedInState(className) {
  const clean = String(className || '').trim();
  if (!clean || !appState.settings?.deletedClassesJson) return;
  const set = getDeletedClassesSet(appState);
  if (set.has(clean)) {
    set.delete(clean);
    appState.settings.deletedClassesJson = JSON.stringify(Array.from(set));
  }
}

function isSimulatedBankTestItem(item) {
  if (!item) return false;
  if (item.isTest === true || item.isTest === 'true') return true;
  const idStr = String(item.id || '');
  if (idStr.includes('SEPAY_STK_') || idStr.includes('TEST_STK_')) return true;
  const textStr = String(item.description || item.note || item.category || '');
  if (textStr.includes('TEST THỬ STK') || textStr.includes('Test thử STK')) return true;
  const createdByStr = String(item.createdBy || item.payerName || '');
  if (createdByStr.includes('Test Thử STK') || createdByStr.includes('Test thử STK')) return true;
  return false;
}

function stripRedundantTestPrefix(text) {
  return String(text || '')
    .replace(/^\s*\[TEST THỬ STK[^\]]*\]\s*/gi, '')
    .replace(/^\[TEST THỬ STK[^\]]*\]\s*/gi, '')
    .trim();
}

function isDraftBankAccountNumber(accStr, stateObj = appState) {
  const clean = String(accStr || '').trim().toUpperCase();
  const stg = (stateObj || appState)?.settings || {};
  const activeAcc = String(stg.bankAccountNo || '').trim().toUpperCase();
  if (activeAcc && clean === activeAcc) return false;
  return clean === '5801434567' || clean === '962478SJJ2';
}

function isActiveBankAccountDraft(stateObj = appState) {
  const stg = (stateObj || appState)?.settings || {};
  return stg.activeBankProfileId === 'TEST_BIDV' || isDraftBankAccountNumber(stg.bankAccountNo);
}

function getDraftBankTxIdsSet(stateObj = appState) {
  const set = new Set();
  try {
    const raw = (stateObj || appState)?.settings?.draftBankTxIdsJson;
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) arr.forEach(id => id && set.add(String(id).trim()));
  } catch (e) {}
  return set;
}

function markDraftBankTx(stateObj, txId) {
  const target = stateObj || appState;
  const cleanId = String(txId || '').trim();
  if (!target || !cleanId) return;
  if (!target.settings) target.settings = {};
  const set = getDraftBankTxIdsSet(target);
  if (!set.has(cleanId)) {
    set.add(cleanId);
    target.settings.draftBankTxIdsJson = JSON.stringify(Array.from(set));
  }
}

function isDraftBankTransaction(tx, stateObj = appState) {
  if (!tx || isSimulatedBankTestItem(tx)) return false;
  if (tx.isDraftBank === true || tx.isDraftBank === 'true') return true;
  const txId = String(tx.id || '').trim();
  if (txId && getDraftBankTxIdsSet(stateObj).has(txId)) return true;

  const stg = (stateObj || appState)?.settings || {};
  const activeAcc = String(stg.bankAccountNo || '').trim();
  const txAcc = String(tx.bankAccountNo || '').trim();
  if (activeAcc && (txAcc === activeAcc || String(tx.description || '').includes(activeAcc))) {
    return false;
  }

  const hay = `${tx.method || ''} ${tx.description || ''} ${tx.bankAccountNo || ''}`;
  return /STK\s*Nh[aá]p/i.test(hay);
}

function isDraftPaymentRequest(req, stateObj = appState) {
  if (!req || isSimulatedBankTestItem(req)) return false;
  if (req.isDraftBank === true || req.isDraftBank === 'true') return true;
  const hay = `${req.note || ''} ${req.payerName || ''} ${req.bankAccountNo || ''}`;
  return /5801434567|962478SJJ2|STK\s*Nh[aá]p/i.test(hay);
}

function getDraftTxIncludeMap(stateObj = appState) {
  try {
    const raw = (stateObj || appState)?.settings?.draftTxIncludeJson;
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (e) {}
  return {};
}

function isDraftTxIncludedInMain(tx, stateObj = appState) {
  if (!tx) return false;
  return getDraftTxIncludeMap(stateObj)[String(tx.id || '').trim()] === true;
}

function getExcludedTxIdsSet(stateObj = appState) {
  const set = new Set();
  try {
    const raw = (stateObj || appState)?.settings?.excludedTxIdsJson;
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) arr.forEach(id => id && set.add(String(id).trim()));
  } catch (e) {}
  return set;
}

function getTxCustomTagsMap(stateObj = appState) {
  try {
    const raw = (stateObj || appState)?.settings?.txCustomTagsJson;
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (e) {}
  return {};
}

function isTransactionExcludedFromSystem(tx, stateObj = appState) {
  if (!tx) return false;
  if (tx.isExcluded === true || tx.isExcluded === 'true') return true;
  const txId = String(tx.id || '').trim();
  return Boolean(txId && getExcludedTxIdsSet(stateObj).has(txId));
}

function getTransactionTagLabel(tx, stateObj = appState) {
  if (!tx) return '';
  const txId = String(tx.id || '').trim();
  const map = getTxCustomTagsMap(stateObj);
  const custom = String(tx.customTag || (txId ? map[txId] : '') || '').trim();
  if (custom) return custom;
  if (isTransactionExcludedFromSystem(tx, stateObj)) return 'Không ghi nhận hệ thống';
  return '';
}

function setTransactionExcludedInState(tx, isExcluded, customTag = undefined, stateObj = appState) {
  const target = stateObj || appState;
  if (!target || !tx || !tx.id) return;
  if (!target.settings) target.settings = {};
  const txId = String(tx.id).trim();
  const excludedSet = getExcludedTxIdsSet(target);
  const tagsMap = { ...getTxCustomTagsMap(target) };

  if (isExcluded) {
    excludedSet.add(txId);
    tx.isExcluded = true;
    const finalTag = String(
      customTag !== undefined && customTag !== ''
        ? customTag
        : tagsMap[txId] || tx.customTag || 'Không ghi nhận hệ thống'
    ).trim();
    tagsMap[txId] = finalTag;
    tx.customTag = finalTag;
  } else {
    excludedSet.delete(txId);
    delete tx.isExcluded;
    if (customTag !== undefined) {
      const cleanTag = String(customTag || '').trim();
      if (cleanTag && cleanTag !== 'Không ghi nhận hệ thống') {
        tagsMap[txId] = cleanTag;
        tx.customTag = cleanTag;
      } else {
        delete tagsMap[txId];
        delete tx.customTag;
      }
    } else if (tagsMap[txId] === 'Không ghi nhận hệ thống') {
      delete tagsMap[txId];
      delete tx.customTag;
    }
  }

  target.settings.excludedTxIdsJson = JSON.stringify(Array.from(excludedSet));
  target.settings.txCustomTagsJson = JSON.stringify(tagsMap);
}

function isCountedInMainFinance(tx, stateObj = appState) {
  if (!tx || isSimulatedBankTestItem(tx)) return false;
  if (isTransactionExcludedFromSystem(tx, stateObj)) return false;
  if (isDraftBankTransaction(tx, stateObj)) return isDraftTxIncludedInMain(tx, stateObj);
  return true;
}

function buildSepayTxSignature(dateStr, amount, textStr, isDraftFlag = false) {
  const amt = typeof normalizeStoredVnd === 'function' ? normalizeStoredVnd(amount) || Number(amount) || 0 : Number(amount) || 0;
  if (!amt) return '';
  const raw = String(textStr || '');
  const ndMatch = raw.match(/\|\s*ND:\s*(.+)$/i) || raw.match(/Tự động lưu (?:CK|GD)[^:]*:\s*(.+)$/i);
  const core = removeVietnameseTones(String(ndMatch ? ndMatch[1] : raw).toLowerCase())
    .replace(/\[stk\s*nhap[^\]]*\]/g, '')
    .replace(/[^a-z0-9]/g, '');
  if (!core) return '';
  const accTag = isDraftFlag ? 'DRAFT_' : 'MAIN_';
  return `SIG_${accTag}${String(dateStr || '').slice(0, 10)}_${amt}_${core.slice(0, 48)}`;
}

function getDeletedTxIdsSet(stateObj = appState) {
  const set = new Set();
  try {
    const raw = (stateObj || appState)?.settings?.deletedTxIdsJson;
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) arr.forEach(k => k && set.add(String(k).trim()));
  } catch (e) {}
  return set;
}

function extractTxDedupKeys(tx, stateObj = appState) {
  if (!tx) return [];
  if (typeof tx === 'string') {
    const clean = tx.trim();
    const rawSuffix = clean.replace(/^GD_SEPAY_/, '').replace(/^GD_/, '');
    return [clean, rawSuffix ? `GD_${rawSuffix}` : '', rawSuffix ? `GD_SEPAY_${rawSuffix}` : ''].filter(Boolean);
  }
  const keys = [];
  const tid = String(tx.id || '').trim();
  if (tid) {
    keys.push(tid);
    const rawSuffix = tid.replace(/^GD_SEPAY_/, '').replace(/^GD_/, '');
    if (rawSuffix) {
      keys.push(`GD_${rawSuffix}`, `GD_SEPAY_${rawSuffix}`);
    }
  }
  const isSepayOrAuto =
    tid.startsWith('GD_SEPAY_') ||
    /^GD_[0-9a-f]{8}-/i.test(tid) ||
    String(tx.createdBy || '').includes('SePay');
  if (isSepayOrAuto) {
    const isDraft = typeof isDraftBankTransaction === 'function' ? isDraftBankTransaction(tx, stateObj) : false;
    const sig = buildSepayTxSignature(tx.date, tx.amount, tx.description, isDraft);
    // Chỉ thêm chữ ký nội dung vào danh sách xóa khi là giao dịch STK Nháp hoặc nội dung có mã tham chiếu số dài (>=6 chữ số)
    if (sig && (isDraft || /\d{6,}/.test(String(tx.description || '')))) {
      keys.push(sig);
    }
  }
  return Array.from(new Set(keys.filter(Boolean)));
}

function isTransactionMarkedDeleted(tx, deletedSet, stateObj = appState) {
  const set = deletedSet instanceof Set ? deletedSet : getDeletedTxIdsSet(stateObj);
  if (set.size === 0 || !tx) return false;
  return extractTxDedupKeys(tx, stateObj).some(k => set.has(k));
}

function extractPaymentRequestSyncBlockKeys(reqOrId) {
  if (!reqOrId) return [];
  const rawId = typeof reqOrId === 'string' ? reqOrId.trim() : String(reqOrId.id || '').trim();
  const cleanId = rawId.replace(/^REQ::/i, '').trim();
  if (!cleanId) return [];
  const suffix = cleanId.replace(/^(?:YC_STK_SEPAY_|YC_SEPAY_|YC_STK_|YC_|GD_SEPAY_|GD_|SEPAY_)+/i, '').trim();
  const keys = [
    cleanId,
    `DEL_REQ::${cleanId}`
  ];
  if (suffix) {
    keys.push(
      `GD_${suffix}`,
      `GD_SEPAY_${suffix}`,
      `SEPAY_${suffix}`,
      `YC_STK_${suffix}`,
      `YC_STK_SEPAY_${suffix}`,
      `YC_SEPAY_${suffix}`,
      `DEL_REQ::YC_STK_${suffix}`,
      `DEL_REQ::YC_STK_SEPAY_${suffix}`,
      `DEL_REQ::YC_SEPAY_${suffix}`
    );
  }
  return Array.from(new Set(keys.filter(Boolean)));
}

function isPaymentRequestMarkedDeleted(req, deletedSet) {
  if (!req) return true;
  const set = deletedSet instanceof Set ? deletedSet : getDeletedTxIdsSet();
  const reqId = String(req.id || '').trim();
  if (!reqId) return false;
  if (set.has(reqId) || set.has(`DEL_REQ::${reqId}`)) return true;
  const suffix = reqId.replace(/^(?:YC_STK_SEPAY_|YC_SEPAY_|YC_STK_|YC_)+/i, '').trim();
  if (suffix && (set.has(`DEL_REQ::YC_STK_SEPAY_${suffix}`) || set.has(`DEL_REQ::YC_SEPAY_${suffix}`) || set.has(`DEL_REQ::YC_STK_${suffix}`))) {
    return true;
  }
  return false;
}

function blockPaymentRequestIdsFromSync(reqItems, stateObj = appState) {
  const target = stateObj || appState;
  if (!target) return;
  if (!target.settings) target.settings = {};
  const list = Array.isArray(reqItems) ? reqItems : [reqItems];
  const delSet = getDeletedTxIdsSet(target);
  list.forEach(item => {
    extractPaymentRequestSyncBlockKeys(item).forEach(k => {
      delSet.add(k);
      if (typeof markBankTxAsNotified === 'function') markBankTxAsNotified(k);
    });
  });
  const capped = Array.from(delSet).slice(-500);
  target.settings.deletedTxIdsJson = JSON.stringify(capped);
}

function markTransactionsAsDeletedInState(txItems, stateObj = appState) {
  const target = stateObj || appState;
  if (!target || !Array.isArray(txItems) || txItems.length === 0) return;
  if (!target.settings) target.settings = {};
  const delSet = getDeletedTxIdsSet(target);
  const incMap = { ...getDraftTxIncludeMap(target) };
  let incChanged = false;
  txItems.forEach(item => {
    extractTxDedupKeys(item).forEach(k => delSet.add(k));
    const tid = typeof item === 'string' ? item.trim() : String(item?.id || '').trim();
    if (tid && incMap[tid] !== undefined) {
      delete incMap[tid];
      incChanged = true;
    }
  });
  // shortcut: cap deleted ledger at 500 keys so CaiDat cell stays well under Google Sheets 50k-char cell limit, upgrade to dedicated sheet if >500 SePay rows are deleted
  const capped = Array.from(delSet).slice(-500);
  target.settings.deletedTxIdsJson = JSON.stringify(capped);
  if (incChanged) {
    target.settings.draftTxIncludeJson = JSON.stringify(incMap);
  }
}

function formatCompactMethodHtml(methodStr, isTestTx = false, isDraftTx = false) {
  if (isTestTx) {
    return `<div class="leading-tight text-center">
      <div class="inline-flex items-center justify-center gap-1 text-[11px] font-extrabold text-amber-900">
        <i data-lucide="flask-conical" class="w-3 h-3 shrink-0"></i>
        <span>Test STK</span>
      </div>
      <div class="text-xs font-bold text-amber-700">(0 ₫)</div>
    </div>`;
  }
  if (isDraftTx) {
    return `<div class="leading-tight text-center">
      <div class="inline-flex items-center justify-center gap-1 text-[11px] font-extrabold text-amber-900">
        <i data-lucide="tag" class="w-3 h-3 shrink-0"></i>
        <span>STK Nháp</span>
      </div>
      <div class="text-xs font-bold text-amber-700">(5801434567)</div>
    </div>`;
  }
  const raw = String(methodStr || 'Chuyển khoản').trim();
  const parenMatch = raw.match(/^([^(]+)\(([^)]+)\)$/);
  if (parenMatch) {
    return `<div class="leading-tight text-center">
      <div class="text-xs font-bold text-slate-700">${escapeHtml(parenMatch[1].trim())}</div>
      <div class="text-xs font-semibold text-slate-500">(${escapeHtml(parenMatch[2].trim())})</div>
    </div>`;
  }
  const slashParts = raw.split(/\s*\/\s*/);
  if (slashParts.length === 2) {
    return `<div class="leading-tight text-center">
      <div class="text-xs font-bold text-slate-700">${escapeHtml(slashParts[0])}</div>
      <div class="text-xs font-semibold text-slate-500">${escapeHtml(slashParts[1])}</div>
    </div>`;
  }
  return `<span class="text-xs font-semibold text-slate-700">${escapeHtml(raw)}</span>`;
}

function purgeDraftDataFromState(state) {
  if (!state) return state;
  const userDeletedClasses = getDeletedClassesSet(state);
  const exactAmountsMap = getExactAmountsMap(state);

  if (Array.isArray(state.students)) {
    const filtered = state.students.filter(s => {
      if (!s) return false;
      const cls = String(s.className || '').trim();
      const idStr = String(s.id || '').trim();
      const nameLower = String(s.fullName || '').trim().toLowerCase();
      if (DRAFT_CLASS_NAMES.has(cls) || userDeletedClasses.has(cls)) return false;
      if (DRAFT_STUDENT_IDS.has(idStr)) return false;
      if (idStr.startsWith('ST_100') && DRAFT_STUDENT_NAMES.has(nameLower)) return false;
      return true;
    });

    // Khôi phục lại học sinh nếu trước đó bị nút bấm Test STK mô phỏng đổi sang Đã hoàn thành
    // và chuẩn hóa mức học phí (tránh nhân đôi 1000 đối với các số tiền nhỏ như 5.000 ₫)
    filtered.forEach(s => {
      const noteStr = String(s.note || '');
      if (
        noteStr.includes('SEPAY_STK_') ||
        noteStr.includes('TEST_STK_') ||
        noteStr.includes('TEST THỬ STK')
      ) {
        if (s.status === 'Đã hoàn thành' || s.status === 'Chờ duyệt') {
          s.status = 'Chưa đóng';
        }
        s.note = '';
      }
      const codeUpper = String(s.studentCode || '').trim().toUpperCase();
      const idStr = String(s.id || '').trim();
      const hasExact =
        Object.prototype.hasOwnProperty.call(exactAmountsMap, idStr) ||
        Object.prototype.hasOwnProperty.call(exactAmountsMap, codeUpper);
      const exactOverride = Object.prototype.hasOwnProperty.call(exactAmountsMap, idStr)
        ? exactAmountsMap[idStr]
        : exactAmountsMap[codeUpper];
      if (hasExact && exactOverride === 0 && Number(s.tuitionFee) === 0) {
        s.tuitionFee = 0;
      } else if (exactOverride && (Number(s.tuitionFee) === exactOverride * 1000 || Number(s.tuitionFee) === exactOverride)) {
        s.tuitionFee = exactOverride;
      } else if (s.tuitionFee !== undefined && s.tuitionFee !== null && Number(s.tuitionFee) >= 0) {
        s.tuitionFee = normalizeStoredVnd(s.tuitionFee);
      }
      if (s.tuitionFee >= 0 && s.tuitionFee < 20000) {
        recordExactSmallAmount(state, idStr, codeUpper, s.tuitionFee);
      }
    });

    // Loại bỏ bản ghi học sinh bị nhân đôi (chỉ gộp khi trùng ID hoặc trùng cả Mã HS lẫn Tên+Lớp, tránh mất học sinh mới)
    const byKey = new Map();
    filtered.forEach(s => {
      const idStr = String(s.id || '').trim();
      const code = String(s.studentCode || '').trim().toUpperCase();
      const nameCls = `${String(s.fullName || '').trim().toLowerCase()}__${String(s.className || '').trim().toLowerCase()}`;
      const key = code && nameCls !== '__' ? `${code}__${nameCls}` : code || nameCls || idStr;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, s);
      } else {
        const isCurrentReal = idStr.startsWith('ST_REAL_');
        const isExistingReal = String(existing.id || '').startsWith('ST_REAL_');
        if (isCurrentReal && !isExistingReal) {
          if (existing.status === 'Đã hoàn thành' && s.status !== 'Đã hoàn thành') {
            s.status = 'Đã hoàn thành';
            if (!s.note && existing.note) s.note = existing.note;
          }
          byKey.set(key, s);
        } else if (!isCurrentReal && isExistingReal) {
          if (s.status === 'Đã hoàn thành' && existing.status !== 'Đã hoàn thành') {
            existing.status = 'Đã hoàn thành';
            if (!existing.note && s.note) existing.note = s.note;
          }
        }
      }
    });

    state.students = Array.from(byKey.values());
  }

  // Tạo map học sinh hiện tại theo studentCode để loại bỏ các giao dịch GD_REAL_* mồ côi của lớp/học sinh cũ đã xóa
  const activeStudentByCode = new Map();
  (state.students || []).forEach(s => {
    const c = String(s.studentCode || '').trim().toUpperCase();
    if (c) activeStudentByCode.set(c, s);
  });

  const deletedTxSet = getDeletedTxIdsSet(state);
  const obsoleteDuplicateIds = new Set([
    'GD_2001',
    'GD_2002',
    'GD_2003',
    'GD_2004',
    'GD_1792670474591',
    'GD_AUTO_1792671282156',
    'GD_SEPAY_1792682673415',
    'GD_SEPAY_1792684994950',
    'GD_SEPAY_93133086',
    'GD_SEPAY_93064923',
    'GD_SEPAY_93071812',
    'GD_SEPAY_93071920',
    'GD_SEPAY_93106960',
    'GD_SEPAY_93116969',
    'GD_SEPAY_93054252',
    'GD_SEPAY_93117528',
    'GD_SEPAY_93060156',
    'GD_SEPAY_92867281',
    'GD_SEPAY_92868034',
    'GD_SEPAY_92878122'
  ]);
  const obsoleteTestReqIds = [
    'YC_STK_SEPAY_92867281',
    'YC_STK_SEPAY_92868034',
    'YC_STK_SEPAY_92878122',
    'YC_SEPAY_92867281',
    'YC_SEPAY_92868034',
    'YC_SEPAY_92878122'
  ];
  let deletedSetMutated = false;
  obsoleteDuplicateIds.forEach(id => {
    extractTxDedupKeys(id, state).forEach(k => {
      if (!deletedTxSet.has(k)) {
        deletedTxSet.add(k);
        deletedSetMutated = true;
      }
    });
  });
  obsoleteTestReqIds.forEach(reqId => {
    extractPaymentRequestSyncBlockKeys(reqId).forEach(k => {
      if (!deletedTxSet.has(k)) {
        deletedTxSet.add(k);
        deletedSetMutated = true;
      }
    });
  });

  if (Array.isArray(state.paymentRequests)) {
    const seenReqIds = new Set();
    state.paymentRequests = state.paymentRequests
      .filter(r => {
        if (!r) return false;
        const reqId = String(r.id || '').trim();
        if (reqId) {
          if (seenReqIds.has(reqId)) return false;
          if (isPaymentRequestMarkedDeleted(r, deletedTxSet)) return false;
          seenReqIds.add(reqId);
          // Đánh dấu mã GD_SEPAY_<num> tương ứng vào deletedTxSet để Code.gs không tự động tạo lặp lại mỗi 10s
          const suffix = reqId.replace(/^(?:YC_STK_SEPAY_|YC_SEPAY_|YC_STK_|YC_)+/i, '').trim();
          if (suffix && /^\d+$/.test(suffix)) {
            [`GD_${suffix}`, `GD_SEPAY_${suffix}`, `SEPAY_${suffix}`].forEach(k => {
              if (!deletedTxSet.has(k)) {
                deletedTxSet.add(k);
                deletedSetMutated = true;
              }
            });
          }
        }
        const cls = String(r.className || '').trim();
        const recId = String(r.studentRecordId || '').trim();
        const nameLower = String(r.studentName || '').trim().toLowerCase();
        const noteStr = String(r.note || '');
        if (DRAFT_CLASS_NAMES.has(cls) || userDeletedClasses.has(cls)) return false;
        if (DRAFT_STUDENT_IDS.has(recId)) return false;
        if (recId.startsWith('ST_100') && DRAFT_STUDENT_NAMES.has(nameLower)) return false;
        if (
          r.status === 'Chờ duyệt' &&
          (noteStr.includes('Phụ huynh đã mở mã QR chuyển khoản học phí trên Web') ||
            noteStr.includes('Phụ huynh mở QR trên Web & chọn học sinh'))
        ) {
          return false;
        }
        return true;
      })
      .map(r => {
        const cleanedNote = String(r.note || '').replace(
          /(?:\s*•\s*(?:\[STK[^\]]*\]\s*)?✅\s*Đã ghi nhận chuyển tiền thành công vào STK)+/g,
          ''
        );
        if (isSimulatedBankTestItem(r)) {
          const normTestAmt = normalizeStoredVnd(r.testDisplayAmount || r.amount || 600000) || 600000;
          return {
            ...r,
            isTest: true,
            testDisplayAmount: normTestAmt,
            amount: 0,
            note: cleanedNote.includes('TEST THỬ STK')
              ? cleanedNote
              : `[TEST THỬ STK - Không cộng tiền vào Web] ${cleanedNote}`
          };
        }
        const reqId = String(r.id || '').trim();
        const reqCode = String(r.studentCode || '').trim().toUpperCase();
        const exactOverride = exactAmountsMap[reqId] || exactAmountsMap[reqCode];
        let fixedAmt = r.amount ? normalizeStoredVnd(r.amount) : 600000;
        if (exactOverride && (fixedAmt === exactOverride * 1000 || fixedAmt === exactOverride)) {
          fixedAmt = exactOverride;
        }
        if (fixedAmt > 0 && fixedAmt < 20000) {
          recordExactSmallAmount(state, reqId, reqCode, fixedAmt);
        }
        return {
          ...r,
          note: cleanedNote,
          amount: fixedAmt
        };
      });
  }

  if (deletedSetMutated) {
    if (!state.settings) state.settings = {};
    state.settings.deletedTxIdsJson = JSON.stringify(Array.from(deletedTxSet).slice(-500));
  }
  if (state.settings && state.settings.sepayApiToken) {
    state.settings.sepayApiToken = '';
  }

  if (Array.isArray(state.transactions)) {
    // Thu thập chữ ký của các giao dịch UUID từ SePay_GiaoDich để ưu tiên giữ bản ghi UUID có đầy đủ ngày giờ
    const uuidSepaySigs = new Set();
    const uuidWinnerByUuid = new Map();
    for (const item of state.transactions) {
      if (!item) continue;
      const tid = String(item.id || '').trim();
      if (obsoleteDuplicateIds.has(tid) || isTransactionMarkedDeleted(item, deletedTxSet, state)) continue;
      const uuidMatch = tid.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (uuidMatch) {
        const uKey = uuidMatch[0].toLowerCase();
        const prev = uuidWinnerByUuid.get(uKey);
        if (!prev) {
          uuidWinnerByUuid.set(uKey, tid);
        } else {
          const prevHasStu = Boolean(state.transactions.find(x => x && x.id === prev)?.studentCode);
          const curHasStu = Boolean(item.studentCode);
          if (curHasStu && !prevHasStu) uuidWinnerByUuid.set(uKey, tid);
        }
        const sig = buildSepayTxSignature(item.date, item.amount, item.description, isDraftBankTransaction(item, state));
        if (sig) uuidSepaySigs.add(sig);
      }
    }
    const seenNumericSepaySigs = new Set();
    const seenUuids = new Set();
    state.transactions = state.transactions
      .filter(t => {
        if (!t) return false;
        const txId = String(t.id || '').trim();
        if (obsoleteDuplicateIds.has(txId)) return false;
        if (isTransactionMarkedDeleted(t, deletedTxSet, state)) return false;

        const uuidMatch = txId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (uuidMatch) {
          const uKey = uuidMatch[0].toLowerCase();
          const winnerId = uuidWinnerByUuid.get(uKey);
          if (winnerId && winnerId !== txId) return false;
          if (seenUuids.has(uKey)) return false;
          seenUuids.add(uKey);
        } else if (/^GD_SEPAY_\d+$/i.test(txId) && !isSimulatedBankTestItem(t)) {
          const sig = buildSepayTxSignature(t.date, t.amount, t.description, isDraftBankTransaction(t, state));
          if (sig) {
            if (uuidSepaySigs.has(sig) || seenNumericSepaySigs.has(sig)) return false;
            seenNumericSepaySigs.add(sig);
          }
        }
        // Loại bỏ các giao dịch GD_REAL_* của các lớp cũ đã bị xóa hoặc mã HS cũ đã bị tái sử dụng cho học sinh mới
        if (txId.startsWith('GD_REAL_')) {
          const desc = String(t.description || '');
          for (const delCls of userDeletedClasses) {
            if (delCls && desc.includes(delCls)) return false;
          }
          const txCode = String(t.studentCode || '').trim().toUpperCase();
          if (txCode) {
            const curStu = activeStudentByCode.get(txCode);
            if (!curStu) return false;
            const curNameClean = removeVietnameseTones(String(curStu.fullName || '').toLowerCase()).trim();
            const descClean = removeVietnameseTones(desc.toLowerCase());
            if (curNameClean && !descClean.includes(curNameClean)) {
              return false;
            }
          }
        }
        return true;
      })
      .map(t => {
        if (isSimulatedBankTestItem(t)) {
          const normTestAmt = normalizeStoredVnd(t.testDisplayAmount || t.amount || 600000) || 600000;
          return {
            ...t,
            isTest: true,
            testDisplayAmount: normTestAmt,
            amount: 0,
            category: 'Test thử STK',
            method: 'Test thử STK (0₫)',
            description: String(t.description || '').includes('TEST THỬ STK')
              ? t.description
              : `[TEST THỬ STK - Không cộng tiền vào Web] ${t.description || ''}`
          };
        }
        const txId = String(t.id || '').trim();
        const txCode = String(t.studentCode || '').trim().toUpperCase();
        const exactOverride = exactAmountsMap[txId] || exactAmountsMap[txCode];
        let fixedAmount = t.amount ? normalizeStoredVnd(t.amount) : 0;
        if (exactOverride && (fixedAmount === exactOverride * 1000 || fixedAmount === exactOverride)) {
          fixedAmount = exactOverride;
        }
        if (txId === 'GD_1792727462168' && fixedAmount === 0) {
          fixedAmount = 600000;
        }
        if (fixedAmount > 0 && fixedAmount < 20000) {
          recordExactSmallAmount(state, txId, txCode, fixedAmount);
        }
        if (isDraftBankTransaction(t, state)) {
          markDraftBankTx(state, txId);
        }
        return {
          ...t,
          amount: fixedAmount
        };
      });
  }

  if (state.settings) {
    // Nếu thông báo gần nhất là từ nút bấm Test STK (SEPAY_STK_ / TEST_STK_), gắn cờ isTest = true và KHÔNG cộng tiền vào sepayBalance
    if (state.settings.lastBankAlertJson) {
      try {
        const alertObj = JSON.parse(state.settings.lastBankAlertJson);
        if (alertObj && alertObj.amount) {
          const aid = String(alertObj.id || '');
          const isRawSepay = Boolean(
            alertObj.rawVnd || aid.startsWith('GD_SEPAY_') || aid.startsWith('SEPAY_')
          );
          alertObj.amount = isRawSepay ? Number(alertObj.amount) || 0 : fromShortMoney(alertObj.amount);
        }
        if (
          alertObj &&
          (alertObj.isTest ||
            String(alertObj.id || '').includes('SEPAY_STK_') ||
            String(alertObj.id || '').includes('TEST_STK_'))
        ) {
          alertObj.isTest = true;
          alertObj.testTag = 'TEST THỬ STK (Không cộng tiền vào Web)';
          // Chỉ hoàn lại 1 lần duy nhất phần tiền Test nếu webhook Test đã lỡ cộng vào số dư (không ghi đè số dư Quản lý đã sửa tay)
          if (
            !alertObj.balanceReverted &&
            alertObj.balance !== undefined &&
            String(state.settings.sepayBalance || '') === String(alertObj.balance)
          ) {
            const reverted = Number(alertObj.balance) - (Number(alertObj.amount) || 0);
            if (isFinite(reverted)) state.settings.sepayBalance = String(Math.max(0, reverted));
          }
          alertObj.balanceReverted = true;
          state.settings.lastBankAlertJson = JSON.stringify(alertObj);
        } else if (alertObj) {
          state.settings.lastBankAlertJson = JSON.stringify(alertObj);
        }
      } catch (e) {}
    }
    if (state.settings.sepayBalance === '63002000') {
      state.settings.sepayBalance = '0';
    }
    if (state.settings.classSchedulesJson) {
      try {
        const map = JSON.parse(state.settings.classSchedulesJson) || {};
        Object.keys(map).forEach(cls => {
          const cleanCls = cls.trim();
          if (DRAFT_CLASS_NAMES.has(cleanCls) || userDeletedClasses.has(cleanCls)) {
            delete map[cls];
          }
        });
        state.settings.classSchedulesJson = JSON.stringify(map);
      } catch (e) {}
    }
    if (state.settings.classHistoryJson) {
      try {
        const hist = JSON.parse(state.settings.classHistoryJson);
        if (Array.isArray(hist)) {
          const cleanedHist = hist
            .filter(h => !DRAFT_CLASS_NAMES.has(String(h.className || '').trim()))
            .map(h => ({
              ...h,
              studentsSnapshot: (h.studentsSnapshot || [])
                .filter(
                  s => !DRAFT_STUDENT_IDS.has(String(s.id || '')) && !DRAFT_STUDENT_NAMES.has(String(s.fullName || '').trim().toLowerCase())
                )
                .map(s => ({
                  ...s,
                  tuitionFee:
                    s.tuitionFee !== undefined && s.tuitionFee !== null && String(s.tuitionFee).trim() !== ''
                      ? fromShortMoney(s.tuitionFee)
                      : 600000
                }))
            }));
          state.settings.classHistoryJson = JSON.stringify(cleanedHist);
        }
      } catch (e) {}
    }
  }

  return state;
}

// Khởi tạo dữ liệu từ Google Sheet thực tế của Lớp Toán Anh Chí (17 lớp / ca học, 130 học sinh)
function getInitialDemoState() {
  return {
  "settings": {
    "centerName": "LỚP TOÁN ANH CHÍ",
    "bankBin": "BIDV",
    "bankAccountNo": "8601774789",
    "bankAccountName": "HKD TRUNG TAM HUYNH THANH CHI",
    "defaultPeriod": "Tháng 9-10/2026",
    "adminPassword": "336699",
    "teacherPhone": "0905957716",
    "customQrUrl": "",
    "sepayBalance": "0",
    "autoApproveBankTransfer": "true",
    "classSchedulesJson": "{\"9 2K12\":{\"className\":\"9 2K12\",\"subject\":\"Toán 9\",\"periodLabel\":\"Tháng 9-10/2026\",\"batchLabel\":\"ĐỢT 3\",\"status\":\"Đang diễn ra\",\"startDate\":\"2026-09-17\",\"endDate\":\"2026-10-10\",\"daysOfWeek\":[2,4,6],\"sessionStates\":{\"2026-09-17\":1,\"2026-09-19\":1,\"2026-09-22\":1,\"2026-09-26\":1,\"2026-10-01\":1,\"2026-10-06\":1,\"2026-10-08\":1,\"2026-10-10\":1}},\"12B 2K9\":{\"className\":\"12B 2K9\",\"subject\":\"Toán 12\",\"periodLabel\":\"Tháng 10/2026\",\"batchLabel\":\"ĐỢT 6\",\"status\":\"Đang diễn ra\",\"startDate\":\"2026-10-22\",\"endDate\":\"2026-11-26\",\"daysOfWeek\":[2,4,6],\"sessionStates\":{\"2026-10-22\":1,\"2026-10-24\":1,\"2026-10-27\":1},\"rolledOverAt\":\"2026-10-28 21:00\"},\"12A 2K9\":{\"className\":\"12A 2K9\",\"subject\":\"Toán 12\",\"periodLabel\":\"Tháng 10/2026\",\"batchLabel\":\"ĐỢT 6\",\"status\":\"Đang diễn ra\",\"startDate\":\"2026-10-23\",\"endDate\":\"2026-11-27\",\"daysOfWeek\":[1,3,5],\"sessionStates\":{},\"rolledOverAt\":\"2026-10-26 11:09\"},\"11B 2K10\":{\"className\":\"11B 2K10\",\"subject\":\"Toán 11\",\"periodLabel\":\"Tháng 9-10/2026\",\"batchLabel\":\"ĐỢT 4\",\"status\":\"Đang diễn ra\",\"startDate\":\"2026-10-03\",\"endDate\":\"2026-10-24\",\"daysOfWeek\":[2,4,6],\"sessionStates\":{\"2026-10-03\":1,\"2026-10-06\":1,\"2026-10-08\":1,\"2026-10-10\":1,\"2026-10-13\":1,\"2026-10-15\":1,\"2026-10-17\":1,\"2026-10-20\":1,\"2026-10-22\":1,\"2026-10-24\":1}},\"11A 2K10\":{\"className\":\"11A 2K10\",\"subject\":\"Toán 11\",\"periodLabel\":\"Tháng 9-10/2026\",\"batchLabel\":\"ĐỢT 4\",\"status\":\"Đang diễn ra\",\"startDate\":\"2026-10-02\",\"endDate\":\"2026-10-23\",\"daysOfWeek\":[1,3,5],\"sessionStates\":{\"2026-10-02\":1,\"2026-10-05\":1,\"2026-10-07\":1,\"2026-10-09\":1,\"2026-10-12\":1,\"2026-10-14\":1,\"2026-10-16\":1,\"2026-10-19\":1,\"2026-10-21\":1,\"2026-10-23\":1}},\"10A 2K11\":{\"className\":\"10A 2K11\",\"subject\":\"Toán 10\",\"periodLabel\":\"Tháng 9-10/2026\",\"batchLabel\":\"ĐỢT 3\",\"status\":\"Đang diễn ra\",\"startDate\":\"2026-09-21\",\"endDate\":\"2026-10-19\",\"daysOfWeek\":[1,3,5],\"sessionStates\":{\"2026-09-21\":1,\"2026-09-25\":1,\"2026-09-28\":1,\"2026-09-30\":1,\"2026-10-02\":1,\"2026-10-05\":1,\"2026-10-07\":1,\"2026-10-09\":1,\"2026-10-12\":1,\"2026-10-14\":1,\"2026-10-16\":1,\"2026-10-19\":1}},\"7 2K14\":{\"className\":\"7 2K14\",\"subject\":\"Toán 7\",\"periodLabel\":\"Tháng 9-10/2026\",\"batchLabel\":\"ĐỢT 3\",\"status\":\"Đang diễn ra\",\"startDate\":\"2026-09-25\",\"endDate\":\"2026-10-09\",\"daysOfWeek\":[1,3,5],\"sessionStates\":{\"2026-09-25\":1,\"2026-09-28\":1,\"2026-09-30\":1,\"2026-10-02\":1,\"2026-10-05\":1,\"2026-10-07\":1,\"2026-10-09\":1}},\"7 Onl\":{\"className\":\"7 Onl\",\"subject\":\"Toán 7\",\"periodLabel\":\"Tháng 9-10/2026\",\"batchLabel\":\"ĐỢT 3\",\"status\":\"Đang diễn ra\",\"startDate\":\"2025-08-22\",\"endDate\":\"2026-01-18\",\"daysOfWeek\":[1,3,5],\"sessionStates\":{\"2025-08-22\":1,\"2025-08-25\":1,\"2025-08-27\":1,\"2025-08-29\":1,\"2025-09-01\":1,\"2025-09-03\":1,\"2025-09-05\":1,\"2025-09-08\":1,\"2025-09-10\":1,\"2025-09-12\":1,\"2025-09-15\":1,\"2025-09-17\":1,\"2025-09-19\":1,\"2025-09-22\":1}},\"12 nháp\":{\"className\":\"12 nháp\",\"subject\":\"Toán 12\",\"periodLabel\":\"Tháng 9-10/2026\",\"batchLabel\":\"ĐỢT SỐ 1\",\"status\":\"Đang diễn ra\",\"startDate\":\"2026-10-01\",\"endDate\":\"2026-11-30\",\"daysOfWeek\":[1,3,5,0],\"sessionStates\":{}},\"10B 2K11\":{\"className\":\"10B 2K11\",\"subject\":\"Toán 10\",\"periodLabel\":\"Tháng 9-10/2026\",\"batchLabel\":\"ĐỢT 3\",\"status\":\"Đang diễn ra\",\"startDate\":\"2026-09-26\",\"endDate\":\"2026-10-20\",\"daysOfWeek\":[2,4,6],\"sessionStates\":{\"2026-09-26\":1,\"2026-09-29\":1,\"2026-10-01\":1,\"2026-10-03\":1,\"2026-10-06\":1,\"2026-10-08\":1,\"2026-10-10\":1,\"2026-10-13\":1,\"2026-10-15\":1,\"2026-10-17\":1,\"2026-10-20\":1}},\"10C 2K11\":{\"className\":\"10C 2K11\",\"subject\":\"Toán 10\",\"periodLabel\":\"Tháng 9-10/2026\",\"batchLabel\":\"ĐỢT 2\",\"status\":\"Đang diễn ra\",\"startDate\":\"2026-09-29\",\"endDate\":\"2026-10-10\",\"daysOfWeek\":[2,4,6],\"sessionStates\":{\"2026-09-29\":1,\"2026-10-01\":1,\"2026-10-03\":1,\"2026-10-06\":1,\"2026-10-08\":1,\"2026-10-10\":1}},\"8A 2K13\":{\"className\":\"8A 2K13\",\"subject\":\"Toán 8\",\"periodLabel\":\"Tháng 9-10/2026\",\"batchLabel\":\"ĐỢT SỐ 1\",\"status\":\"Đang diễn ra\",\"startDate\":\"2026-10-02\",\"endDate\":\"2026-11-30\",\"daysOfWeek\":[1,3,5,0],\"sessionStates\":{}},\"8B 2K13\":{\"className\":\"8B 2K13\",\"subject\":\"Toán 8\",\"periodLabel\":\"Tháng 9-10/2026\",\"batchLabel\":\"ĐỢT SỐ 1\",\"status\":\"Đang diễn ra\",\"startDate\":\"2026-08-01\",\"endDate\":\"2026-10-31\",\"daysOfWeek\":[2,4,6],\"sessionStates\":{}},\"12D\":{\"className\":\"12D\",\"subject\":\"Toán 12\",\"periodLabel\":\"Tháng 9-10/2026\",\"batchLabel\":\"ĐỢT SỐ 1\",\"status\":\"Đang diễn ra\",\"startDate\":\"2026-10-01\",\"endDate\":\"2026-11-30\",\"daysOfWeek\":[1,3,5,0],\"sessionStates\":{}}}",
    "classHistoryJson": "[{\"id\":\"HIST_1792987987983\",\"archivedAt\":\"2026-10-26 11:13\",\"className\":\"12B 2K9\",\"subject\":\"Toán 12\",\"periodLabel\":\"Tháng 9-10/2026\",\"batchLabel\":\"ĐỢT 5\",\"startDate\":\"2026-09-26\",\"endDate\":\"2026-10-22\",\"daysOfWeek\":[2,4,6],\"sessionStates\":{\"2026-09-26\":1,\"2026-09-29\":1,\"2026-10-01\":1,\"2026-10-03\":1,\"2026-10-06\":1,\"2026-10-08\":1,\"2026-10-10\":1,\"2026-10-13\":1,\"2026-10-15\":1,\"2026-10-17\":1,\"2026-10-20\":1,\"2026-10-22\":1},\"checkedSessions\":12,\"totalStudents\":10,\"paidCount\":7,\"totalExpected\":6000000,\"totalCollected\":4200000,\"totalMissing\":1800000,\"studentsSnapshot\":[{\"id\":\"ST_REAL_001\",\"studentCode\":\"HS001\",\"fullName\":\"Quốc Việt\",\"className\":\"12B 2K9\",\"parentName\":\"\",\"parentPhone\":\"\",\"period\":\"Tháng 9-10/2026\",\"tuitionFee\":600000,\"status\":\"Chưa đóng\",\"receiptUrl\":\"\",\"updatedAt\":\"Sun Oct 25 2026 20:51:00 GMT+0700 (Indochina Time)\",\"note\":\"\"},{\"id\":\"ST_REAL_002\",\"studentCode\":\"HS002\",\"fullName\":\"Đăng Quang\",\"className\":\"12B 2K9\",\"parentName\":\"\",\"parentPhone\":\"\",\"period\":\"Tháng 9-10/2026\",\"tuitionFee\":600000,\"status\":\"Đã hoàn thành\",\"receiptUrl\":\"\",\"updatedAt\":\"2026-10-26 11:12\",\"note\":\"Đã chuyển khoản học phí\"},{\"id\":\"ST_REAL_003\",\"studentCode\":\"HS003\",\"fullName\":\"Rum\",\"className\":\"12B 2K9\",\"parentName\":\"\",\"parentPhone\":\"\",\"period\":\"Tháng 9-10/2026\",\"tuitionFee\":600000,\"status\":\"Đã hoàn thành\",\"receiptUrl\":\"\",\"updatedAt\":\"2026-10-26 11:12\",\"note\":\"Đã chuyển khoản học phí\"},{\"id\":\"ST_REAL_004\",\"studentCode\":\"HS004\",\"fullName\":\"Châu Hiểu Nhiên\",\"className\":\"12B 2K9\",\"parentName\":\"\",\"parentPhone\":\"\",\"period\":\"Tháng 9-10/2026\",\"tuitionFee\":600000,\"status\":\"Chưa đóng\",\"receiptUrl\":\"\",\"updatedAt\":\"Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)\",\"note\":\"\"},{\"id\":\"ST_REAL_005\",\"studentCode\":\"HS005\",\"fullName\":\"Ngọc Uyên\",\"className\":\"12B 2K9\",\"parentName\":\"\",\"parentPhone\":\"\",\"period\":\"Tháng 9-10/2026\",\"tuitionFee\":600000,\"status\":\"Đã hoàn thành\",\"receiptUrl\":\"\",\"updatedAt\":\"2026-10-26 11:12\",\"note\":\"Đã thanh toán\"},{\"id\":\"ST_REAL_006\",\"studentCode\":\"HS006\",\"fullName\":\"Đặng Hân\",\"className\":\"12B 2K9\",\"parentName\":\"\",\"parentPhone\":\"\",\"period\":\"Tháng 9-10/2026\",\"tuitionFee\":600000,\"status\":\"Đã hoàn thành\",\"receiptUrl\":\"\",\"updatedAt\":\"2026-10-26 11:12\",\"note\":\"Đã thanh toán\"},{\"id\":\"ST_REAL_007\",\"studentCode\":\"HS007\",\"fullName\":\"Tuệ Nhi\",\"className\":\"12B 2K9\",\"parentName\":\"\",\"parentPhone\":\"\",\"period\":\"Tháng 9-10/2026\",\"tuitionFee\":600000,\"status\":\"Đã hoàn thành\",\"receiptUrl\":\"\",\"updatedAt\":\"2026-10-26 11:12\",\"note\":\"Đã thanh toán\"},{\"id\":\"ST_REAL_008\",\"studentCode\":\"HS008\",\"fullName\":\"Nhật Phi\",\"className\":\"12B 2K9\",\"parentName\":\"\",\"parentPhone\":\"\",\"period\":\"Tháng 9-10/2026\",\"tuitionFee\":600000,\"status\":\"Chưa đóng\",\"receiptUrl\":\"\",\"updatedAt\":\"Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)\",\"note\":\"\"},{\"id\":\"ST_REAL_009\",\"studentCode\":\"HS009\",\"fullName\":\"Bảo Thy\",\"className\":\"12B 2K9\",\"parentName\":\"\",\"parentPhone\":\"\",\"period\":\"Tháng 9-10/2026\",\"tuitionFee\":600000,\"status\":\"Đã hoàn thành\",\"receiptUrl\":\"\",\"updatedAt\":\"Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)\",\"note\":\"Đã chuyển khoản học phí\"},{\"id\":\"ST_REAL_010\",\"studentCode\":\"HS010\",\"fullName\":\"Khánh Vy\",\"className\":\"12B 2K9\",\"parentName\":\"\",\"parentPhone\":\"\",\"period\":\"Tháng 9-10/2026\",\"tuitionFee\":600000,\"status\":\"Đã hoàn thành\",\"receiptUrl\":\"\",\"updatedAt\":\"2026-10-26 11:12\",\"note\":\"Đã chuyển khoản\"}]},{\"id\":\"HIST_1792987783284\",\"archivedAt\":\"2026-10-26 11:09\",\"className\":\"12A 2K9\",\"subject\":\"Toán 12\",\"periodLabel\":\"Tháng 9-10/2026\",\"batchLabel\":\"ĐỢT 5\",\"startDate\":\"2026-09-23\",\"endDate\":\"2026-10-23\",\"daysOfWeek\":[1,3,5],\"sessionStates\":{\"2026-09-23\":1,\"2026-09-28\":1,\"2026-09-30\":1,\"2026-10-02\":1,\"2026-10-07\":1,\"2026-10-09\":1,\"2026-10-12\":1,\"2026-10-14\":1,\"2026-10-16\":1,\"2026-10-19\":1,\"2026-10-21\":1,\"2026-10-23\":1},\"checkedSessions\":12,\"totalStudents\":6,\"paidCount\":5,\"totalExpected\":3600000,\"totalCollected\":3000000,\"totalMissing\":600000,\"studentsSnapshot\":[{\"id\":\"ST_REAL_011\",\"studentCode\":\"HS011\",\"fullName\":\"Hoàng Như\",\"className\":\"12A 2K9\",\"parentName\":\"\",\"parentPhone\":\"\",\"period\":\"Tháng 9-10/2026\",\"tuitionFee\":600000,\"status\":\"Đã hoàn thành\",\"receiptUrl\":\"\",\"updatedAt\":\"2026-10-26 11:09\",\"note\":\"\"},{\"id\":\"ST_REAL_012\",\"studentCode\":\"HS012\",\"fullName\":\"Gia Khánh\",\"className\":\"12A 2K9\",\"parentName\":\"\",\"parentPhone\":\"\",\"period\":\"Tháng 9-10/2026\",\"tuitionFee\":600000,\"status\":\"Đã hoàn thành\",\"receiptUrl\":\"\",\"updatedAt\":\"2026-10-26 11:09\",\"note\":\"\"},{\"id\":\"ST_REAL_013\",\"studentCode\":\"HS013\",\"fullName\":\"Tùng\",\"className\":\"12A 2K9\",\"parentName\":\"\",\"parentPhone\":\"\",\"period\":\"Tháng 9-10/2026\",\"tuitionFee\":600000,\"status\":\"Đã hoàn thành\",\"receiptUrl\":\"\",\"updatedAt\":\"2026-10-26 11:09\",\"note\":\"\"},{\"id\":\"ST_REAL_014\",\"studentCode\":\"HS014\",\"fullName\":\"Bảo An\",\"className\":\"12A 2K9\",\"parentName\":\"\",\"parentPhone\":\"\",\"period\":\"Tháng 9-10/2026\",\"tuitionFee\":600000,\"status\":\"Đã hoàn thành\",\"receiptUrl\":\"\",\"updatedAt\":\"2026-10-26 11:09\",\"note\":\"\"},{\"id\":\"ST_REAL_015\",\"studentCode\":\"HS015\",\"fullName\":\"Thủy Tiên\",\"className\":\"12A 2K9\",\"parentName\":\"\",\"parentPhone\":\"\",\"period\":\"Tháng 9-10/2026\",\"tuitionFee\":600000,\"status\":\"Chưa đóng\",\"receiptUrl\":\"\",\"updatedAt\":\"Sun Oct 25 2026 20:12:00 GMT+0700 (Indochina Time)\",\"note\":\"\"},{\"id\":\"ST_REAL_016\",\"studentCode\":\"HS016\",\"fullName\":\"Lâm Anh\",\"className\":\"12A 2K9\",\"parentName\":\"\",\"parentPhone\":\"\",\"period\":\"Tháng 9-10/2026\",\"tuitionFee\":600000,\"status\":\"Đã hoàn thành\",\"receiptUrl\":\"\",\"updatedAt\":\"2026-10-26 11:09\",\"note\":\"\"}]}]",
    "studentMetaJson": "{\"HS001\":{\"startDate\":\"2026-09-26\"},\"HS002\":{\"startDate\":\"2026-09-26\"},\"HS003\":{\"startDate\":\"2026-09-26\"},\"HS004\":{\"startDate\":\"2026-09-26\"},\"HS005\":{\"startDate\":\"2026-09-26\"},\"HS006\":{\"startDate\":\"2026-09-26\"},\"HS007\":{\"startDate\":\"2026-09-26\"},\"HS008\":{\"startDate\":\"2026-09-26\"},\"HS009\":{\"startDate\":\"2026-09-26\"},\"HS010\":{\"startDate\":\"2026-09-26\"},\"HS011\":{\"startDate\":\"2026-09-23\"},\"HS012\":{\"startDate\":\"2026-09-23\"},\"HS013\":{\"startDate\":\"2026-09-23\"},\"HS014\":{\"startDate\":\"2026-09-23\"},\"HS015\":{\"startDate\":\"2026-09-23\"},\"HS016\":{\"startDate\":\"2026-09-23\"},\"HS017\":{\"startDate\":\"2026-10-03\"},\"HS018\":{\"startDate\":\"2026-10-03\"},\"HS019\":{\"startDate\":\"2026-10-03\"},\"HS020\":{\"startDate\":\"2026-10-03\"},\"HS021\":{\"startDate\":\"2026-10-03\"},\"HS022\":{\"startDate\":\"2026-10-03\"},\"HS023\":{\"startDate\":\"2026-10-03\"},\"HS024\":{\"startDate\":\"2026-10-03\"},\"HS025\":{\"startDate\":\"2026-10-03\"},\"HS026\":{\"startDate\":\"2026-10-03\"},\"HS027\":{\"startDate\":\"2026-10-03\"},\"HS028\":{\"startDate\":\"2026-10-03\"},\"HS029\":{\"startDate\":\"2026-10-03\"},\"HS030\":{\"startDate\":\"2026-10-03\"},\"HS031\":{\"startDate\":\"2026-10-03\"},\"HS032\":{\"startDate\":\"2026-10-03\"},\"HS033\":{\"startDate\":\"2026-10-03\"},\"HS034\":{\"startDate\":\"2026-10-03\"},\"HS035\":{\"startDate\":\"2026-10-03\"},\"HS036\":{\"startDate\":\"2026-10-03\"},\"HS037\":{\"startDate\":\"2026-10-03\"},\"HS038\":{\"startDate\":\"2026-10-02\"},\"HS039\":{\"startDate\":\"2026-10-02\"},\"HS040\":{\"startDate\":\"2026-10-02\"},\"HS041\":{\"startDate\":\"2026-10-02\"},\"HS042\":{\"startDate\":\"2026-10-02\"},\"HS043\":{\"startDate\":\"2026-10-02\"},\"HS044\":{\"startDate\":\"2026-10-02\"},\"HS045\":{\"startDate\":\"2026-10-02\"},\"HS046\":{\"startDate\":\"2026-10-02\"},\"HS047\":{\"startDate\":\"2026-10-02\"},\"HS048\":{\"startDate\":\"2026-10-02\"},\"HS049\":{\"startDate\":\"2026-10-02\"},\"HS050\":{\"startDate\":\"2026-10-02\"},\"HS051\":{\"startDate\":\"2026-10-02\"},\"HS052\":{\"startDate\":\"2026-09-21\"},\"HS053\":{\"startDate\":\"2026-09-21\"},\"HS054\":{\"startDate\":\"2026-09-21\"},\"HS055\":{\"startDate\":\"2026-09-21\"},\"HS056\":{\"startDate\":\"2026-09-21\"},\"HS057\":{\"startDate\":\"2026-09-21\"},\"HS058\":{\"startDate\":\"2026-09-21\"},\"HS059\":{\"startDate\":\"2026-09-21\"},\"HS060\":{\"startDate\":\"2026-09-21\"},\"HS061\":{\"startDate\":\"2026-09-21\"},\"HS062\":{\"startDate\":\"2026-09-26\"},\"HS063\":{\"startDate\":\"2026-09-26\"},\"HS064\":{\"startDate\":\"2026-09-26\"},\"HS065\":{\"startDate\":\"2026-09-26\"},\"HS066\":{\"startDate\":\"2026-09-26\"},\"HS067\":{\"startDate\":\"2026-09-26\"},\"HS068\":{\"startDate\":\"2026-09-26\"},\"HS069\":{\"startDate\":\"2026-09-26\"},\"HS070\":{\"startDate\":\"2026-09-26\"},\"HS071\":{\"startDate\":\"2026-09-26\"},\"HS072\":{\"startDate\":\"2026-09-26\"},\"HS073\":{\"startDate\":\"2026-09-26\"},\"HS074\":{\"startDate\":\"2026-09-26\"},\"HS075\":{\"startDate\":\"2026-09-26\"},\"HS076\":{\"startDate\":\"2026-09-29\"},\"HS077\":{\"startDate\":\"2026-09-29\"},\"HS078\":{\"startDate\":\"2026-09-29\"},\"HS079\":{\"startDate\":\"2026-09-29\"},\"HS080\":{\"startDate\":\"2026-09-17\"},\"HS081\":{\"startDate\":\"2026-09-17\"},\"HS082\":{\"startDate\":\"2026-01-01\"},\"HS083\":{\"startDate\":\"2026-01-01\"},\"HS084\":{\"startDate\":\"2026-09-25\"},\"HS085\":{\"startDate\":\"2026-09-25\"},\"HS086\":{\"startDate\":\"2026-09-25\"},\"HS087\":{\"startDate\":\"2026-09-25\",\"feeMode\":\"FIXED\"},\"HS088\":{\"startDate\":\"2026-10-23\"},\"HS089\":{\"startDate\":\"2026-07-06\"},\"HS090\":{\"startDate\":\"2026-04-26\"},\"HS091\":{\"startDate\":\"2026-04-26\"},\"HS092\":{\"startDate\":\"2026-04-26\"},\"HS093\":{\"startDate\":\"2026-04-26\"},\"HS094\":{\"startDate\":\"2025-08-22\"},\"HS095\":{\"startDate\":\"2026-05-03\",\"manualPaidBatches\":0},\"HS096\":{\"startDate\":\"2026-10-23\"},\"HS097\":{\"startDate\":\"2026-05-03\"},\"HS098\":{\"startDate\":\"2026-05-03\"},\"HS099\":{\"startDate\":\"2026-05-03\"},\"HS100\":{\"startDate\":\"2026-10-23\",\"manualPaidBatches\":0},\"HS101\":{\"startDate\":\"2026-05-03\",\"manualPaidBatches\":0},\"HS102\":{\"startDate\":\"2026-05-03\"},\"HS103\":{\"startDate\":\"2026-05-05\"},\"HS104\":{\"startDate\":\"2026-05-05\"},\"HS105\":{\"startDate\":\"2026-05-05\"},\"HS106\":{\"startDate\":\"2026-05-05\"},\"HS107\":{\"startDate\":\"2026-05-05\"},\"HS108\":{\"startDate\":\"2026-05-05\"},\"HS109\":{\"startDate\":\"2026-05-05\"},\"HS110\":{\"startDate\":\"2026-05-05\"},\"HS111\":{\"startDate\":\"2026-05-05\"},\"HS112\":{\"startDate\":\"2026-05-05\"},\"HS113\":{\"startDate\":\"2026-05-05\"},\"HS114\":{\"startDate\":\"2026-05-05\"},\"HS115\":{\"startDate\":\"2026-05-05\"},\"HS116\":{\"startDate\":\"2026-05-05\"},\"HS117\":{\"startDate\":\"2026-05-05\"},\"HS118\":{\"startDate\":\"2026-05-05\"},\"HS119\":{\"startDate\":\"2026-05-05\"},\"HS120\":{\"startDate\":\"2026-05-05\"},\"HS121\":{\"startDate\":\"2026-05-05\"},\"HS122\":{\"startDate\":\"2026-05-05\"},\"HS123\":{\"startDate\":\"2026-05-12\"},\"HS124\":{\"startDate\":\"2026-05-12\"},\"HS125\":{\"startDate\":\"2026-05-12\"},\"HS126\":{\"startDate\":\"2026-05-12\"},\"HS127\":{\"startDate\":\"2026-05-06\"},\"HS128\":{\"startDate\":\"2026-05-06\"},\"HS129\":{\"startDate\":\"2026-05-06\"},\"HS130\":{\"startDate\":\"2026-05-06\"},\"HS131\":{\"startDate\":\"2026-10-01\",\"manualPaidBatches\":0,\"transferHistory\":[{\"id\":\"TR_1792952496662\",\"transferredAt\":\"2026-10-26 01:21\",\"mode\":\"NEW_BATCH\",\"fromClass\":\"12 nháp\",\"toClass\":\"12D\",\"startDate\":\"2026-10-01\",\"batchLabel\":\"ĐỢT SỐ 1\",\"periodLabel\":\"Tháng 9-10/2026\",\"dateRange\":\"01/10/2026 → 30/11/2026\",\"tuitionFee\":5000,\"status\":\"Chưa đóng\",\"note\":\"\"}]},\"HS132\":{\"startDate\":\"2026-10-01\",\"manualPaidBatches\":0},\"HS133\":{\"startDate\":\"2026-10-01\",\"manualPaidBatches\":0},\"HS134\":{\"startDate\":\"2026-10-01\",\"manualPaidBatches\":0},\"HS135\":{\"startDate\":\"2026-10-01\",\"manualPaidBatches\":0},\"HS136\":{\"startDate\":\"2026-01-01\",\"manualPaidBatches\":0},\"HS137\":{\"startDate\":\"2026-10-02\",\"manualPaidBatches\":0},\"HS138\":{\"startDate\":\"2026-08-01\",\"manualPaidBatches\":0},\"HS139\":{\"startDate\":\"2025-08-22\",\"manualPaidBatches\":0,\"feeMode\":\"PER_SESSION\",\"perSessionRate\":150000,\"lastSessionCount\":14}}",
    "deletedClassesJson": "[\"12 2K8 (Ca 2 - T3,5,7,CN)\",\"12 2K8 (Ca 1 - T2,4,6,CN)\",\"6 (Ca 1 - T4-5)\",\"9 2K11 (Ca 2 - T2,4,6)\",\"9 2K11 (Ca 1 - T3,5,7)\",\"12 2K9 (Ca 1 - T3,5,7)\",\"12 2K9 (Ca 2 - T2,4,6)\",\"11 2K10 (Ca 1 - T3,5,7)\",\"11 2K10 (Ca 2 - T2,4,6)\",\"10 2K11 (Ca 1 - T2,4,6)\",\"10 2K11 (Ca 3 - Đợt 2)\",\"10 2K11 (Ca 2 - T3,5,7)\",\"7 2K14 (Ca 2 - T7-8)\",\"7 2K14 (Ca 1 - T9-10)\",\"6 (Na và Nin)\",\"11B1\",\"10A2\",\"10A1\",\"10AB 2K11\",\"8 2K13\",\"8B 2k13\"]",
    "exactAmountsJson": "{\"ST_1792759143949\":5000,\"HS100\":5000,\"ST_1792759460958\":5000,\"HS101\":5000,\"YC_STK_1792759710531\":5000,\"ST_1792772564014\":5000,\"HS131\":5000,\"ST_1792772572149\":5000,\"HS132\":5000,\"ST_1792830254167\":10000,\"HS133\":10000,\"ST_1792830646018\":5000,\"HS134\":5000,\"ST_1792854291574\":5000,\"HS135\":5000,\"ST_1792938304725\":0,\"HS138\":0,\"GD_f242a99e-082f-4f02-a5c5-a9830efe19c5\":3000,\"GD_99531315-1ccc-410f-a4a9-4c0b9e6d7b59\":7000,\"GD_a03e0891-9f99-4a6b-a9c0-e413a77182fb\":11000,\"GD_SEPAY_dea21157-86bb-4d4b-800b-7575d95eca20\":3000,\"GD_e8a5f2cc-04f4-4b1a-84c1-9725bb24a554\":2000,\"GD_SEPAY_8e809d08-f9c3-4dff-8046-8a799096d934\":5000,\"GD_SEPAY_711bdb9b-b7b0-4fd7-8c87-b4bba7e9fa79\":5000,\"GD_SEPAY_4f472a3e-5c21-4b9e-a431-1c0c5c9f286b\":5000,\"GD_SEPAY_62b4853d-d098-459c-8e29-eac50d513881\":10000,\"GD_SEPAY_1c8deae5-e25e-4f6c-8d15-fd4fa31741cf\":5000}",
    "dismissedNotifIdsJson": "[\"GD_1792936777067\",\"GD_1792936402245\",\"GD_1792936393856\",\"GD_1792936290375\",\"GD_5c44b4be-751b-4e28-ae00-0e8b47eaad90\",\"GD_1792934741181\",\"GD_1792934740649\",\"GD_f242a99e-082f-4f02-a5c5-a9830efe19c5\",\"GD_SEPAY_2b73f513-c00b-45d8-980c-a02d496578d0\",\"GD_99531315-1ccc-410f-a4a9-4c0b9e6d7b59\",\"GD_a03e0891-9f99-4a6b-a9c0-e413a77182fb\",\"GD_SEPAY_dea21157-86bb-4d4b-800b-7575d95eca20\",\"GD_e8a5f2cc-04f4-4b1a-84c1-9725bb24a554\",\"GD_SEPAY_8e809d08-f9c3-4dff-8046-8a799096d934\",\"GD_SEPAY_711bdb9b-b7b0-4fd7-8c87-b4bba7e9fa79\",\"GD_SEPAY_4f472a3e-5c21-4b9e-a431-1c0c5c9f286b\",\"GD_SEPAY_62b4853d-d098-459c-8e29-eac50d513881\",\"GD_SEPAY_1c8deae5-e25e-4f6c-8d15-fd4fa31741cf\"]",
    "processedSepayTxIdsJson": "[\"GD_SEPAY_c71e29bb-aba2-4ecc-a4a0-a73ae1129a09\",\"c71e29bb-aba2-4ecc-a4a0-a73ae1129a09\",\"GD_SEPAY_63c5b2ac-4ab9-4c85-be22-90f1ef8c4a91\",\"63c5b2ac-4ab9-4c85-be22-90f1ef8c4a91\",\"GD_SEPAY_6c9436ae-0d8f-4e55-b0f5-4a9a6456d47d\",\"6c9436ae-0d8f-4e55-b0f5-4a9a6456d47d\",\"GD_SEPAY_2239bce8-0e79-42c1-beae-7091d66bfb3f\",\"2239bce8-0e79-42c1-beae-7091d66bfb3f\",\"GD_SEPAY_b813a2a1-785c-41ef-957c-34116f0211e3\",\"b813a2a1-785c-41ef-957c-34116f0211e3\",\"GD_SEPAY_2bc94cbd-7f6c-4212-8499-552cec0359a0\",\"2bc94cbd-7f6c-4212-8499-552cec0359a0\",\"GD_SEPAY_a9334a2a-07ec-4e55-a4b3-259e63cf1a6c\",\"a9334a2a-07ec-4e55-a4b3-259e63cf1a6c\",\"GD_981b9925-f579-4630-b895-21f02d6535a7\",\"981b9925-f579-4630-b895-21f02d6535a7\",\"GD_1793177555806\",\"1793177555806\",\"GD_1793177562852\",\"1793177562852\",\"GD_1793177565146\",\"1793177565146\",\"GD_1793177565793\",\"1793177565793\",\"GD_1793177568634\",\"1793177568634\",\"GD_1793177602573\",\"1793177602573\",\"GD_1793177763170\",\"1793177763170\",\"GD_1793178076565\",\"1793178076565\",\"GD_1792936777067\",\"1792936777067\",\"GD_1792936402245\",\"1792936402245\",\"GD_1792936393856\",\"1792936393856\",\"GD_1792936290375\",\"1792936290375\",\"GD_5c44b4be-751b-4e28-ae00-0e8b47eaad90\",\"5c44b4be-751b-4e28-ae00-0e8b47eaad90\",\"GD_1792934741181\",\"1792934741181\",\"GD_1792934740649\",\"1792934740649\",\"GD_f242a99e-082f-4f02-a5c5-a9830efe19c5\",\"f242a99e-082f-4f02-a5c5-a9830efe19c5\",\"GD_SEPAY_2b73f513-c00b-45d8-980c-a02d496578d0\",\"2b73f513-c00b-45d8-980c-a02d496578d0\",\"GD_99531315-1ccc-410f-a4a9-4c0b9e6d7b59\",\"99531315-1ccc-410f-a4a9-4c0b9e6d7b59\",\"GD_a03e0891-9f99-4a6b-a9c0-e413a77182fb\",\"a03e0891-9f99-4a6b-a9c0-e413a77182fb\",\"GD_SEPAY_dea21157-86bb-4d4b-800b-7575d95eca20\",\"dea21157-86bb-4d4b-800b-7575d95eca20\",\"GD_e8a5f2cc-04f4-4b1a-84c1-9725bb24a554\",\"e8a5f2cc-04f4-4b1a-84c1-9725bb24a554\",\"GD_SEPAY_8e809d08-f9c3-4dff-8046-8a799096d934\",\"8e809d08-f9c3-4dff-8046-8a799096d934\",\"GD_SEPAY_711bdb9b-b7b0-4fd7-8c87-b4bba7e9fa79\",\"711bdb9b-b7b0-4fd7-8c87-b4bba7e9fa79\",\"GD_SEPAY_4f472a3e-5c21-4b9e-a431-1c0c5c9f286b\",\"4f472a3e-5c21-4b9e-a431-1c0c5c9f286b\",\"GD_SEPAY_62b4853d-d098-459c-8e29-eac50d513881\",\"62b4853d-d098-459c-8e29-eac50d513881\",\"GD_SEPAY_1c8deae5-e25e-4f6c-8d15-fd4fa31741cf\",\"1c8deae5-e25e-4f6c-8d15-fd4fa31741cf\",\"GD_SEPAY_e8a5f2cc-04f4-4b1a-84c1-9725bb24a554\",\"GD_SEPAY_a03e0891-9f99-4a6b-a9c0-e413a77182fb\",\"GD_SEPAY_99531315-1ccc-410f-a4a9-4c0b9e6d7b59\",\"GD_SEPAY_f242a99e-082f-4f02-a5c5-a9830efe19c5\",\"GD_SEPAY_5c44b4be-751b-4e28-ae00-0e8b47eaad90\",\"GD_SEPAY_981b9925-f579-4630-b895-21f02d6535a7\"]",
    "_lastSavedAtMs": 1793199229492
  },
  "students": [
    {
      "id": "ST_REAL_001",
      "studentCode": "HS001",
      "fullName": "Quốc Việt",
      "className": "12B 2K9",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "2026-10-28 21:00",
      "note": "",
      "manualStatusUpdatedAt": "2026-10-28 21:00"
    },
    {
      "id": "ST_REAL_002",
      "studentCode": "HS002",
      "fullName": "Đăng Quang",
      "className": "12B 2K9",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "2026-10-28 21:00",
      "note": "",
      "manualStatusUpdatedAt": "2026-10-28 21:00"
    },
    {
      "id": "ST_REAL_003",
      "studentCode": "HS003",
      "fullName": "Rum",
      "className": "12B 2K9",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "2026-10-28 21:00",
      "note": "",
      "manualStatusUpdatedAt": "2026-10-28 21:00"
    },
    {
      "id": "ST_REAL_004",
      "studentCode": "HS004",
      "fullName": "Châu Hiểu Nhiên",
      "className": "12B 2K9",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "2026-10-28 21:00",
      "note": "",
      "manualStatusUpdatedAt": "2026-10-28 21:00"
    },
    {
      "id": "ST_REAL_005",
      "studentCode": "HS005",
      "fullName": "Ngọc Uyên",
      "className": "12B 2K9",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "2026-10-28 21:00",
      "note": "",
      "manualStatusUpdatedAt": "2026-10-28 21:00"
    },
    {
      "id": "ST_REAL_006",
      "studentCode": "HS006",
      "fullName": "Đặng Hân",
      "className": "12B 2K9",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "2026-10-28 21:00",
      "note": "",
      "manualStatusUpdatedAt": "2026-10-28 21:00"
    },
    {
      "id": "ST_REAL_007",
      "studentCode": "HS007",
      "fullName": "Tuệ Nhi",
      "className": "12B 2K9",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "2026-10-28 21:02",
      "note": "Đã nhận CK: +600.000 ₫ (2026-10-28 13:36:14)",
      "manualStatusUpdatedAt": "2026-10-28 21:02"
    },
    {
      "id": "ST_REAL_008",
      "studentCode": "HS008",
      "fullName": "Nhật Phi",
      "className": "12B 2K9",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "2026-10-28 21:00",
      "note": "",
      "manualStatusUpdatedAt": "2026-10-28 21:00"
    },
    {
      "id": "ST_REAL_009",
      "studentCode": "HS009",
      "fullName": "Bảo Thy",
      "className": "12B 2K9",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "2026-10-28 21:00",
      "note": "",
      "manualStatusUpdatedAt": "2026-10-28 21:00"
    },
    {
      "id": "ST_REAL_010",
      "studentCode": "HS010",
      "fullName": "Khánh Vy",
      "className": "12B 2K9",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "2026-10-28 21:00",
      "note": "Đã chuyển khoản",
      "manualStatusUpdatedAt": "2026-10-28 21:00"
    },
    {
      "id": "ST_REAL_011",
      "studentCode": "HS011",
      "fullName": "Hoàng Như",
      "className": "12A 2K9",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "2026-10-26 11:09",
      "note": "",
      "manualStatusUpdatedAt": "2026-10-26 11:09"
    },
    {
      "id": "ST_REAL_012",
      "studentCode": "HS012",
      "fullName": "Gia Khánh",
      "className": "12A 2K9",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "2026-10-26 11:09",
      "note": "",
      "manualStatusUpdatedAt": "2026-10-26 11:09"
    },
    {
      "id": "ST_REAL_013",
      "studentCode": "HS013",
      "fullName": "Tùng",
      "className": "12A 2K9",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "2026-10-26 11:09",
      "note": "",
      "manualStatusUpdatedAt": "2026-10-26 11:09"
    },
    {
      "id": "ST_REAL_014",
      "studentCode": "HS014",
      "fullName": "Bảo An",
      "className": "12A 2K9",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "2026-10-26 11:09",
      "note": "",
      "manualStatusUpdatedAt": "2026-10-26 11:09"
    },
    {
      "id": "ST_REAL_015",
      "studentCode": "HS015",
      "fullName": "Thủy Tiên",
      "className": "12A 2K9",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "2026-10-26 11:09",
      "note": "",
      "manualStatusUpdatedAt": "2026-10-26 11:09"
    },
    {
      "id": "ST_REAL_016",
      "studentCode": "HS016",
      "fullName": "Lâm Anh",
      "className": "12A 2K9",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "2026-10-26 11:09",
      "note": "",
      "manualStatusUpdatedAt": "2026-10-26 11:09"
    },
    {
      "id": "ST_REAL_017",
      "studentCode": "HS017",
      "fullName": "Bảo Nghi",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã nhận CK: +600.000 ₫ (2026-10-25 20:40:14)"
    },
    {
      "id": "ST_REAL_018",
      "studentCode": "HS018",
      "fullName": "Linh Đan",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_019",
      "studentCode": "HS019",
      "fullName": "Nhân",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_020",
      "studentCode": "HS020",
      "fullName": "Nhật Lâm",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_021",
      "studentCode": "HS021",
      "fullName": "Hoàng Ngân",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_022",
      "studentCode": "HS022",
      "fullName": "Trúc Phương",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_023",
      "studentCode": "HS023",
      "fullName": "Bảo Trân",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": ""
    },
    {
      "id": "ST_REAL_024",
      "studentCode": "HS024",
      "fullName": "Gia Huy",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_025",
      "studentCode": "HS025",
      "fullName": "Anh Thi",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_026",
      "studentCode": "HS026",
      "fullName": "Hà My",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_027",
      "studentCode": "HS027",
      "fullName": "Khánh Ngân",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_028",
      "studentCode": "HS028",
      "fullName": "Gia Minh",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_029",
      "studentCode": "HS029",
      "fullName": "Trần Hạnh",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_030",
      "studentCode": "HS030",
      "fullName": "Tường Vy",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": ""
    },
    {
      "id": "ST_REAL_031",
      "studentCode": "HS031",
      "fullName": "Ngọc Hân",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_032",
      "studentCode": "HS032",
      "fullName": "Đức Thắng",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": ""
    },
    {
      "id": "ST_REAL_033",
      "studentCode": "HS033",
      "fullName": "Phương Ngọc",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": ""
    },
    {
      "id": "ST_REAL_034",
      "studentCode": "HS034",
      "fullName": "Vĩnh Khang",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_035",
      "studentCode": "HS035",
      "fullName": "Khánh Vy",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_036",
      "studentCode": "HS036",
      "fullName": "Khánh Quỳnh",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_037",
      "studentCode": "HS037",
      "fullName": "Phương Thảo",
      "className": "11B 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": ""
    },
    {
      "id": "ST_REAL_038",
      "studentCode": "HS038",
      "fullName": "Gia Phát",
      "className": "11A 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã chuyển khoản học phí"
    },
    {
      "id": "ST_REAL_039",
      "studentCode": "HS039",
      "fullName": "Mai Khanh",
      "className": "11A 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": ""
    },
    {
      "id": "ST_REAL_040",
      "studentCode": "HS040",
      "fullName": "Ngọc Nhi",
      "className": "11A 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_041",
      "studentCode": "HS041",
      "fullName": "Như Quỳnh",
      "className": "11A 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_042",
      "studentCode": "HS042",
      "fullName": "Hồng Nhung",
      "className": "11A 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_043",
      "studentCode": "HS043",
      "fullName": "Quỳnh Như",
      "className": "11A 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_044",
      "studentCode": "HS044",
      "fullName": "Quang Tiến",
      "className": "11A 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "2026-10-28 21:07",
      "note": "Đã thanh toán",
      "manualStatusUpdatedAt": "2026-10-28 21:07"
    },
    {
      "id": "ST_REAL_045",
      "studentCode": "HS045",
      "fullName": "Thái Sơn",
      "className": "11A 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": ""
    },
    {
      "id": "ST_REAL_046",
      "studentCode": "HS046",
      "fullName": "Trường Sơn",
      "className": "11A 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_047",
      "studentCode": "HS047",
      "fullName": "Nguyễn Thi",
      "className": "11A 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": ""
    },
    {
      "id": "ST_REAL_048",
      "studentCode": "HS048",
      "fullName": "Khánh Ngọc",
      "className": "11A 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": ""
    },
    {
      "id": "ST_REAL_049",
      "studentCode": "HS049",
      "fullName": "Quỳnh Nghi",
      "className": "11A 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_050",
      "studentCode": "HS050",
      "fullName": "Ngọc Nhi (LQĐ)",
      "className": "11A 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_051",
      "studentCode": "HS051",
      "fullName": "Quỳnh Anh",
      "className": "11A 2K10",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": ""
    },
    {
      "id": "ST_REAL_052",
      "studentCode": "HS052",
      "fullName": "Hoài Giang",
      "className": "10A 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_053",
      "studentCode": "HS053",
      "fullName": "Nhật Duy",
      "className": "10A 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_054",
      "studentCode": "HS054",
      "fullName": "Trương Nhi",
      "className": "10A 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_055",
      "studentCode": "HS055",
      "fullName": "Hồ Kiên",
      "className": "10A 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Sun Oct 25 2026 20:51:00 GMT+0700 (Indochina Time)",
      "note": "Đã chuyển khoản"
    },
    {
      "id": "ST_REAL_056",
      "studentCode": "HS056",
      "fullName": "Quốc Khánh",
      "className": "10A 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_057",
      "studentCode": "HS057",
      "fullName": "Khánh Ny",
      "className": "10A 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": ""
    },
    {
      "id": "ST_REAL_058",
      "studentCode": "HS058",
      "fullName": "Hà Giang",
      "className": "10A 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_059",
      "studentCode": "HS059",
      "fullName": "Huỳnh Huyền",
      "className": "10A 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": ""
    },
    {
      "id": "ST_REAL_060",
      "studentCode": "HS060",
      "fullName": "Nhã Uyên",
      "className": "10A 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_061",
      "studentCode": "HS061",
      "fullName": "Khánh Phương",
      "className": "10A 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_062",
      "studentCode": "HS062",
      "fullName": "Phạm Đ Khoa",
      "className": "10B 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Sun Oct 25 2026 20:53:00 GMT+0700 (Indochina Time)",
      "note": "Đã chuyển khoản"
    },
    {
      "id": "ST_REAL_063",
      "studentCode": "HS063",
      "fullName": "Nguyễn Đ Khoa",
      "className": "10B 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_064",
      "studentCode": "HS064",
      "fullName": "Ngọc Bảo",
      "className": "10B 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_065",
      "studentCode": "HS065",
      "fullName": "Hữu Thời",
      "className": "10B 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_066",
      "studentCode": "HS066",
      "fullName": "Bảo Trân",
      "className": "10B 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_067",
      "studentCode": "HS067",
      "fullName": "Thanh Nhàn",
      "className": "10B 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_068",
      "studentCode": "HS068",
      "fullName": "Phước An",
      "className": "10B 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Sun Oct 25 2026 20:53:00 GMT+0700 (Indochina Time)",
      "note": ""
    },
    {
      "id": "ST_REAL_069",
      "studentCode": "HS069",
      "fullName": "Khánh An",
      "className": "10B 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_070",
      "studentCode": "HS070",
      "fullName": "Diệu Linh",
      "className": "10B 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã chuyển khoản học phí"
    },
    {
      "id": "ST_REAL_071",
      "studentCode": "HS071",
      "fullName": "Thành Nam",
      "className": "10B 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_072",
      "studentCode": "HS072",
      "fullName": "Minh Nguyệt",
      "className": "10B 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_073",
      "studentCode": "HS073",
      "fullName": "Thanh Nhi",
      "className": "10B 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_074",
      "studentCode": "HS074",
      "fullName": "Bảo Trân Sinh",
      "className": "10B 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Sun Oct 25 2026 20:53:00 GMT+0700 (Indochina Time)",
      "note": "Đã chuyển khoản"
    },
    {
      "id": "ST_REAL_075",
      "studentCode": "HS075",
      "fullName": "Thảo Vy",
      "className": "10B 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã chuyển khoản học phí"
    },
    {
      "id": "ST_REAL_076",
      "studentCode": "HS076",
      "fullName": "Ánh Linh",
      "className": "10C 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_077",
      "studentCode": "HS077",
      "fullName": "Ánh Ngọc",
      "className": "10C 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_078",
      "studentCode": "HS078",
      "fullName": "Minh Bảo",
      "className": "10C 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": ""
    },
    {
      "id": "ST_REAL_079",
      "studentCode": "HS079",
      "fullName": "Phan Quý",
      "className": "10C 2K11",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Sun Oct 25 2026 20:59:00 GMT+0700 (Indochina Time)",
      "note": "Đã chuyển khoản"
    },
    {
      "id": "ST_REAL_080",
      "studentCode": "HS080",
      "fullName": "Thịnh",
      "className": "9 2K12",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Sun Oct 25 2026 21:06:00 GMT+0700 (Indochina Time)",
      "note": ""
    },
    {
      "id": "ST_REAL_081",
      "studentCode": "HS081",
      "fullName": "Thanh",
      "className": "9 2K12",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "2026-10-27 12:04",
      "note": "Đã nhận CK: +600.000 ₫ (2026-10-27 12:04:01)",
      "manualStatusUpdatedAt": "2026-10-27 12:04"
    },
    {
      "id": "ST_REAL_083",
      "studentCode": "HS083",
      "fullName": "Phú",
      "className": "8A 2K13",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Sun Oct 25 2026 20:25:00 GMT+0700 (Indochina Time)",
      "note": "Đã chuyển khoản"
    },
    {
      "id": "ST_REAL_084",
      "studentCode": "HS084",
      "fullName": "Phú Quý",
      "className": "7 2K14",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_085",
      "studentCode": "HS085",
      "fullName": "Quỳnh Như",
      "className": "7 2K14",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Fri Oct 23 2026 01:20:00 GMT+0700 (Indochina Time)",
      "note": "Đã thanh toán"
    },
    {
      "id": "ST_REAL_087",
      "studentCode": "HS087",
      "fullName": "Khang",
      "className": "7 2K14",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Mon Oct 26 2026 00:21:00 GMT+0700 (Indochina Time)",
      "note": ""
    },
    {
      "id": "ST_1792772564014",
      "studentCode": "HS131",
      "fullName": "Đô",
      "className": "12D",
      "parentName": "PH em Đô",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 5000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "2026-10-26 01:21",
      "note": "Chuyển từ Lớp 12 nháp"
    },
    {
      "id": "ST_1792772572149",
      "studentCode": "HS132",
      "fullName": "thuần",
      "className": "12 nháp",
      "parentName": "PH em thuần",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 5000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Mon Oct 26 2026 00:49:17 GMT+0700 (Giờ Đông Dương)",
      "note": ""
    },
    {
      "id": "ST_1792830254167",
      "studentCode": "HS133",
      "fullName": "Nguyệt",
      "className": "12 nháp",
      "parentName": "PH em Nguyệt",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 10000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Mon Oct 26 2026 00:49:16 GMT+0700 (Giờ Đông Dương)",
      "note": ""
    },
    {
      "id": "ST_1792830646018",
      "studentCode": "HS134",
      "fullName": "Minh",
      "className": "12 nháp",
      "parentName": "PH em Minh",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 5000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Sat Oct 24 2026 22:50:00 GMT+0700 (Indochina Time)",
      "note": ""
    },
    {
      "id": "ST_1792854291574",
      "studentCode": "HS135",
      "fullName": "Tuấn",
      "className": "12 nháp",
      "parentName": "PH em Tuấn",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 5000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Sat Oct 24 2026 23:00:00 GMT+0700 (Indochina Time)",
      "note": ""
    },
    {
      "id": "ST_1792934734152",
      "studentCode": "HS136",
      "fullName": "Kiệt",
      "className": "8A 2K13",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Đã hoàn thành",
      "receiptUrl": "",
      "updatedAt": "Sun Oct 25 2026 20:25:00 GMT+0700 (Indochina Time)",
      "note": "Đã chuyển khoản"
    },
    {
      "id": "ST_1792934887374",
      "studentCode": "HS137",
      "fullName": "Bảo Ngân",
      "className": "8A 2K13",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 600000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Sun Oct 25 2026 20:29:00 GMT+0700 (Indochina Time)",
      "note": ""
    },
    {
      "id": "ST_1792938304725",
      "studentCode": "HS138",
      "fullName": "Chi",
      "className": "8B 2K13",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 0,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Sun Oct 25 2026 21:25:00 GMT+0700 (Indochina Time)",
      "note": ""
    },
    {
      "id": "ST_1792948831121",
      "studentCode": "HS139",
      "fullName": "Mai Chi",
      "className": "7 Onl",
      "parentName": "",
      "parentPhone": "",
      "period": "Tháng 9-10/2026",
      "tuitionFee": 2100000,
      "status": "Chưa đóng",
      "receiptUrl": "",
      "updatedAt": "Mon Oct 26 2026 00:21:00 GMT+0700 (Indochina Time)",
      "note": ""
    }
  ],
  "transactions": [
    {
      "id": "GD_1793178076565",
      "date": "2026-10-28",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 600000,
      "description": "Thu học phí Tháng 9-10/2026 - HS044 Quang Tiến",
      "studentCode": "HS044",
      "method": "Chuyển khoản",
      "receiptUrl": "",
      "createdBy": "Quản lý"
    },
    {
      "id": "GD_1793177602573",
      "date": "2026-10-28",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 600000,
      "description": "Thu học phí Tháng 10/2026 - HS010 Khánh Vy",
      "studentCode": "HS010",
      "method": "Chuyển khoản",
      "receiptUrl": "",
      "createdBy": "Quản lý"
    },
    {
      "id": "GD_1793177568634",
      "date": "2026-10-28",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 600000,
      "description": "Thu học phí Tháng 9-10/2026 - HS009 Bảo Thy",
      "studentCode": "HS009",
      "method": "Chuyển khoản",
      "receiptUrl": "",
      "createdBy": "Quản lý"
    },
    {
      "id": "GD_1793177565793",
      "date": "2026-10-28",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 600000,
      "description": "Thu học phí Tháng 9-10/2026 - HS006 Đặng Hân",
      "studentCode": "HS006",
      "method": "Chuyển khoản",
      "receiptUrl": "",
      "createdBy": "Quản lý"
    },
    {
      "id": "GD_1793177565146",
      "date": "2026-10-28",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 600000,
      "description": "Thu học phí Tháng 9-10/2026 - HS005 Ngọc Uyên",
      "studentCode": "HS005",
      "method": "Chuyển khoản",
      "receiptUrl": "",
      "createdBy": "Quản lý"
    },
    {
      "id": "GD_1793177562852",
      "date": "2026-10-28",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 600000,
      "description": "Thu học phí Tháng 9-10/2026 - HS003 Rum",
      "studentCode": "HS003",
      "method": "Chuyển khoản",
      "receiptUrl": "",
      "createdBy": "Quản lý"
    },
    {
      "id": "GD_1793177555806",
      "date": "2026-10-28",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 600000,
      "description": "Thu học phí Tháng 9-10/2026 - HS002 Đăng Quang",
      "studentCode": "HS002",
      "method": "Chuyển khoản",
      "receiptUrl": "",
      "createdBy": "Quản lý"
    },
    {
      "id": "GD_981b9925-f579-4630-b895-21f02d6535a7",
      "date": "2026-10-28",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 600000,
      "description": "Tự động lưu CK vào STK: HS007 - Tuệ Nhi (Tháng 10-11/2026) | ND: MBVCB.16755047338.875895.tue nhi.CT tu 1016802656 LE THI THANH THUY toi 96247E8DEZ HO KINH DOANH TRU",
      "studentCode": "HS007",
      "method": "Chuyển khoản STK (Tự động)",
      "receiptUrl": "",
      "createdBy": "Tự động từ STK (SePay)"
    },
    {
      "id": "GD_SEPAY_a9334a2a-07ec-4e55-a4b3-259e63cf1a6c",
      "date": "2026-10-27",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 20000,
      "description": "[STK Nháp 5801434567] Tự động lưu GD SePay (5801434567): HUYNH THANH CHI chuyen tien",
      "studentCode": "",
      "method": "Chuyển khoản STK Nháp",
      "receiptUrl": "",
      "createdBy": "Tự động từ STK (SePay)"
    },
    {
      "id": "GD_SEPAY_2bc94cbd-7f6c-4212-8499-552cec0359a0",
      "date": "2026-10-27",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 50000,
      "description": "Tự động lưu CK SePay: HS061 - Khánh Phương (Tháng 9-10/2026) | ND: 153811640773 0975850637 NGUYEN HUYNH KHANH PHUONG chuyen tien qua MoMo",
      "studentCode": "HS061",
      "method": "Chuyển khoản STK (Tự động)",
      "receiptUrl": "",
      "createdBy": "Tự động từ STK (SePay)"
    },
    {
      "id": "GD_SEPAY_b813a2a1-785c-41ef-957c-34116f0211e3",
      "date": "2026-10-27",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 600000,
      "description": "Tự động lưu CK SePay: HS016 - Lâm Anh (Tháng 9-10/2026) | ND: NGUYEN HUYNH LAM ANH chuyen tien",
      "studentCode": "HS016",
      "method": "Chuyển khoản STK (Tự động)",
      "receiptUrl": "",
      "createdBy": "Tự động từ STK (SePay)"
    },
    {
      "id": "GD_SEPAY_2239bce8-0e79-42c1-beae-7091d66bfb3f",
      "date": "2026-10-27",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 600000,
      "description": "Tự động lưu GD SePay (8601774789): PHAN THI THUY TRINH CHUYEN KHOAN",
      "studentCode": "HS069",
      "method": "Chuyển khoản STK (Tự động)",
      "receiptUrl": "",
      "createdBy": "Tự động từ STK (SePay)"
    },
    {
      "id": "GD_SEPAY_6c9436ae-0d8f-4e55-b0f5-4a9a6456d47d",
      "date": "2026-10-27",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 600000,
      "description": "Tự động lưu CK SePay: HS081 - Thanh (Tháng 9-10/2026) | ND: Thanh Van chuyen khoan nhanh qua Zalo",
      "studentCode": "HS081",
      "method": "Chuyển khoản STK (Tự động)",
      "receiptUrl": "",
      "createdBy": "Tự động từ STK (SePay)"
    },
    {
      "id": "GD_SEPAY_63c5b2ac-4ab9-4c85-be22-90f1ef8c4a91",
      "date": "2026-10-26",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 600000,
      "description": "Tự động lưu GD SePay (8601774789): Thanhvan Tran chuyen khoan nhanh qua Zalo",
      "studentCode": "",
      "method": "Chuyển khoản STK (Tự động)",
      "receiptUrl": "",
      "createdBy": "Tự động từ STK (SePay)"
    },
    {
      "id": "GD_SEPAY_c71e29bb-aba2-4ecc-a4a0-a73ae1129a09",
      "date": "2026-10-26",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 950000,
      "description": "Tự động lưu CK SePay: HS010 - Khánh Vy (Tháng 9-10/2026) | ND: Khanh Vy chuyen khoan nhanh qua Zalo",
      "studentCode": "HS010",
      "method": "Chuyển khoản STK (Tự động)",
      "receiptUrl": "",
      "createdBy": "Tự động từ STK (SePay)"
    },
    {
      "id": "GD_1792936777067",
      "date": "2026-10-25",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 600000,
      "description": "Thu học phí HS079 - Phan Quý (Lớp 10C 2K11 - Tháng 9-10/2026)",
      "studentCode": "HS079",
      "method": "Chuyển khoản",
      "receiptUrl": "",
      "createdBy": "Quản lý"
    },
    {
      "id": "GD_1792936402245",
      "date": "2026-10-25",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 600000,
      "description": "Thu học phí HS074 - Bảo Trân Sinh (Lớp 10B 2K11 - Tháng 9-10/2026)",
      "studentCode": "HS074",
      "method": "Chuyển khoản",
      "receiptUrl": "",
      "createdBy": "Quản lý"
    },
    {
      "id": "GD_1792936393856",
      "date": "2026-10-25",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 600000,
      "description": "Thu học phí HS062 - Phạm Đ Khoa (Lớp 10B 2K11 - Tháng 9-10/2026)",
      "studentCode": "HS062",
      "method": "Chuyển khoản",
      "receiptUrl": "",
      "createdBy": "Quản lý"
    },
    {
      "id": "GD_1792936290375",
      "date": "2026-10-25",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 600000,
      "description": "Thu học phí HS055 - Hồ Kiên (Lớp 10A 2K11 - Tháng 9-10/2026)",
      "studentCode": "HS055",
      "method": "Chuyển khoản",
      "receiptUrl": "",
      "createdBy": "Quản lý"
    },
    {
      "id": "GD_5c44b4be-751b-4e28-ae00-0e8b47eaad90",
      "date": "2026-10-25",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 600000,
      "description": "Tự động lưu CK SePay: HS017 - Bảo Nghi (Tháng 9-10/2026) | ND: MBVCB.16716754463.798969.TRAN THI BICH HANH chuyen tien.CT tu 0051000503735 TRAN THI BICH HANH toi 9",
      "studentCode": "HS017",
      "method": "Chuyển khoản STK (Tự động)",
      "receiptUrl": "",
      "createdBy": "Tự động từ STK (SePay)"
    },
    {
      "id": "GD_1792934741181",
      "date": "2026-10-25",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 600000,
      "description": "Thu học phí HS136 - Kiệt (Lớp 8A 2K13 - Tháng 9-10/2026)",
      "studentCode": "HS136",
      "method": "Chuyển khoản",
      "receiptUrl": "",
      "createdBy": "Quản lý"
    },
    {
      "id": "GD_1792934740649",
      "date": "2026-10-25",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 600000,
      "description": "Thu học phí HS083 - Phú (Lớp 8A 2K13 - Tháng 9-10/2026)",
      "studentCode": "HS083",
      "method": "Chuyển khoản",
      "receiptUrl": "",
      "createdBy": "Quản lý"
    },
    {
      "id": "GD_f242a99e-082f-4f02-a5c5-a9830efe19c5",
      "date": "2026-10-25",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 3000,
      "description": "[STK Nháp 5801434567] Tự động lưu GD SePay (5801434567): HUYNH THANH CHI chuyen tien",
      "studentCode": "",
      "method": "Chuyển khoản STK Nháp",
      "receiptUrl": "",
      "createdBy": "Tự động từ STK (SePay)"
    },
    {
      "id": "GD_SEPAY_2b73f513-c00b-45d8-980c-a02d496578d0",
      "date": "2026-10-25",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 20000,
      "description": "[STK Nháp 5801434567] Tự động lưu GD SePay (5801434567): hoc phi",
      "studentCode": "",
      "method": "Chuyển khoản STK Nháp",
      "receiptUrl": "",
      "createdBy": "Tự động từ STK (SePay)"
    },
    {
      "id": "GD_99531315-1ccc-410f-a4a9-4c0b9e6d7b59",
      "date": "2026-10-25",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 7000,
      "description": "[STK Nháp 5801434567] Tự động lưu GD SePay (5801434567): HUYNH THANH CHI chuyen tien",
      "studentCode": "",
      "method": "Chuyển khoản STK Nháp",
      "receiptUrl": "",
      "createdBy": "Tự động từ STK (SePay)"
    },
    {
      "id": "GD_a03e0891-9f99-4a6b-a9c0-e413a77182fb",
      "date": "2026-10-25",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 11000,
      "description": "[STK Nháp 5801434567] Tự động lưu GD SePay (5801434567): HOC PHI",
      "studentCode": "",
      "method": "Chuyển khoản STK Nháp",
      "receiptUrl": "",
      "createdBy": "Tự động từ STK (SePay)"
    },
    {
      "id": "GD_SEPAY_dea21157-86bb-4d4b-800b-7575d95eca20",
      "date": "2026-10-25",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 3000,
      "description": "[STK Nháp 5801434567] Tự động lưu GD SePay (5801434567): HOC PHI",
      "studentCode": "",
      "method": "Chuyển khoản STK Nháp",
      "receiptUrl": "",
      "createdBy": "Tự động từ STK (SePay)"
    },
    {
      "id": "GD_e8a5f2cc-04f4-4b1a-84c1-9725bb24a554",
      "date": "2026-10-25",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 2000,
      "description": "[STK Nháp 5801434567] Tự động lưu GD SePay (5801434567): HOC PHI",
      "studentCode": "",
      "method": "Chuyển khoản STK Nháp",
      "receiptUrl": "",
      "createdBy": "Tự động từ STK (SePay)"
    },
    {
      "id": "GD_SEPAY_8e809d08-f9c3-4dff-8046-8a799096d934",
      "date": "2026-10-25",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 5000,
      "description": "[STK Nháp 5801434567] Tự động lưu GD SePay (5801434567): HOC PHI",
      "studentCode": "",
      "method": "Chuyển khoản STK Nháp",
      "receiptUrl": "",
      "createdBy": "Tự động từ STK (SePay)"
    },
    {
      "id": "GD_SEPAY_711bdb9b-b7b0-4fd7-8c87-b4bba7e9fa79",
      "date": "2026-10-25",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 5000,
      "description": "[STK Nháp 5801434567] Tự động lưu GD SePay (5801434567): HOC PHI",
      "studentCode": "",
      "method": "Chuyển khoản STK Nháp",
      "receiptUrl": "",
      "createdBy": "Tự động từ STK (SePay)"
    },
    {
      "id": "GD_SEPAY_4f472a3e-5c21-4b9e-a431-1c0c5c9f286b",
      "date": "2026-10-24",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 5000,
      "description": "[STK Nháp 5801434567] Tự động lưu CK SePay: HS132 - thuần (Tháng 9-10/2026) | ND: HP HS132 THUAN",
      "studentCode": "HS132",
      "method": "Chuyển khoản STK Nháp",
      "receiptUrl": "",
      "createdBy": "Tự động từ STK (SePay)"
    },
    {
      "id": "GD_SEPAY_62b4853d-d098-459c-8e29-eac50d513881",
      "date": "2026-10-24",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 10000,
      "description": "[STK Nháp 5801434567] Tự động lưu CK SePay: HS133 - Nguyệt (Tháng 9-10/2026) | ND: HP HS133 NGUYET",
      "studentCode": "HS133",
      "method": "Chuyển khoản STK Nháp",
      "receiptUrl": "",
      "createdBy": "Tự động từ STK (SePay)"
    },
    {
      "id": "GD_SEPAY_1c8deae5-e25e-4f6c-8d15-fd4fa31741cf",
      "date": "2026-10-24",
      "type": "Thu",
      "category": "Thu học phí",
      "amount": 5000,
      "description": "[STK Nháp 5801434567] Tự động lưu CK SePay: HS131 - Đô (Tháng 9-10/2026) | ND: HP HS131 DO",
      "studentCode": "HS131",
      "method": "Chuyển khoản STK Nháp",
      "receiptUrl": "",
      "createdBy": "Tự động từ STK (SePay)"
    }
  ],
  "paymentRequests": []
};
}

function getInitialSandboxDraftState() {
  const sampleClassesConfig = {
    '12A1 - Luyện Thi ĐH (Ca 1 - T2,4,6)': {
      className: '12A1 - Luyện Thi ĐH (Ca 1 - T2,4,6)',
      subject: 'Toán 12',
      periodLabel: 'Tháng 10-11/2026',
      batchLabel: 'ĐỢT 5',
      status: 'Đang diễn ra',
      startDate: '2026-10-01',
      endDate: '2026-10-30',
      daysOfWeek: [1, 3, 5],
      sessionStates: {
        '2026-10-02': 1,
        '2026-10-05': 1,
        '2026-10-07': 1,
        '2026-10-09': 1,
        '2026-10-12': 1,
        '2026-10-14': 3,
        '2026-10-16': 2,
        '2026-10-19': 1,
        '2026-10-21': 1,
        '2026-10-23': 1
      }
    },
    '12A2 - Mục Tiêu 9+ (Ca 2 - T3,5,7)': {
      className: '12A2 - Mục Tiêu 9+ (Ca 2 - T3,5,7)',
      subject: 'Toán 12',
      periodLabel: 'Tháng 10-11/2026',
      batchLabel: 'ĐỢT 5',
      status: 'Đang diễn ra',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      daysOfWeek: [2, 4, 6],
      sessionStates: {
        '2026-10-01': 1,
        '2026-10-03': 1,
        '2026-10-06': 1,
        '2026-10-08': 1,
        '2026-10-10': 1,
        '2026-10-13': 1,
        '2026-10-15': 1,
        '2026-10-17': 1,
        '2026-10-20': 1,
        '2026-10-22': 1
      }
    },
    '11B1 - Toán Nâng Cao (T2,4,6)': {
      className: '11B1 - Toán Nâng Cao (T2,4,6)',
      subject: 'Toán 11',
      periodLabel: 'Tháng 10-11/2026',
      batchLabel: 'ĐỢT 4',
      status: 'Đang diễn ra',
      startDate: '2026-10-02',
      endDate: '2026-10-30',
      daysOfWeek: [1, 3, 5],
      sessionStates: {
        '2026-10-02': 1,
        '2026-10-05': 1,
        '2026-10-07': 1,
        '2026-10-09': 3,
        '2026-10-12': 2,
        '2026-10-14': 1,
        '2026-10-16': 1,
        '2026-10-19': 1,
        '2026-10-21': 1
      }
    },
    '10C1 - Toán Tư Duy (T3,5,7)': {
      className: '10C1 - Toán Tư Duy (T3,5,7)',
      subject: 'Toán 10',
      periodLabel: 'Tháng 10-11/2026',
      batchLabel: 'ĐỢT 3',
      status: 'Đang diễn ra',
      startDate: '2026-10-01',
      endDate: '2026-10-29',
      daysOfWeek: [2, 4, 6],
      sessionStates: {
        '2026-10-01': 1,
        '2026-10-03': 1,
        '2026-10-06': 1,
        '2026-10-08': 1,
        '2026-10-10': 1,
        '2026-10-13': 1,
        '2026-10-15': 1,
        '2026-10-17': 1,
        '2026-10-20': 1
      }
    },
    '9D1 - Luyện Thi Vào 10 (T2,4,6)': {
      className: '9D1 - Luyện Thi Vào 10 (T2,4,6)',
      subject: 'Toán 9',
      periodLabel: 'Tháng 10-11/2026',
      batchLabel: 'ĐỢT 3',
      status: 'Đang diễn ra',
      startDate: '2026-10-02',
      endDate: '2026-10-30',
      daysOfWeek: [1, 3, 5],
      sessionStates: {
        '2026-10-02': 1,
        '2026-10-05': 1,
        '2026-10-07': 1,
        '2026-10-09': 1,
        '2026-10-12': 1,
        '2026-10-14': 1,
        '2026-10-16': 1,
        '2026-10-19': 1
      }
    },
    '8E1 - Toán Bồi Dưỡng (T7,CN)': {
      className: '8E1 - Toán Bồi Dưỡng (T7,CN)',
      subject: 'Toán 8',
      periodLabel: 'Tháng 10-11/2026',
      batchLabel: 'ĐỢT 2',
      status: 'Đang diễn ra',
      startDate: '2026-10-03',
      endDate: '2026-11-01',
      daysOfWeek: [6, 0],
      sessionStates: {
        '2026-10-03': 1,
        '2026-10-04': 1,
        '2026-10-10': 1,
        '2026-10-11': 1,
        '2026-10-17': 1,
        '2026-10-18': 1
      }
    }
  };

  const rawStudents = [
    // Lớp 12A1 (8 HS)
    ['NV001', 'Nguyễn Hoàng Minh Khôi', '12A1 - Luyện Thi ĐH (Ca 1 - T2,4,6)', 'PH Minh Khôi', '0901234501', 800000, 'Đã hoàn thành', 'Đã CK VietQR tự động', '2026-06-01', 5],
    ['NV002', 'Trần Ngọc Bảo Châu', '12A1 - Luyện Thi ĐH (Ca 1 - T2,4,6)', 'PH Bảo Châu', '0901234502', 800000, 'Chờ duyệt', 'Phụ huynh vừa gửi ảnh biên lai', '2026-06-01', 4],
    ['NV003', 'Lê Quốc Thiên Ân', '12A1 - Luyện Thi ĐH (Ca 1 - T2,4,6)', 'PH Thiên Ân', '0901234503', 800000, 'Đã hoàn thành', 'Đã đối soát SePay', '2026-06-05', 5],
    ['NV004', 'Phạm Gia Bảo', '12A1 - Luyện Thi ĐH (Ca 1 - T2,4,6)', 'PH Gia Bảo', '0901234504', 800000, 'Chưa đóng', 'Hẹn cuối tuần chuyển khoản', '2026-06-10', 4],
    ['NV005', 'Vũ Hà My', '12A1 - Luyện Thi ĐH (Ca 1 - T2,4,6)', 'PH Hà My', '0901234505', 800000, 'Đã hoàn thành', 'Đóng 2 đợt liên tiếp', '2026-06-01', 5],
    ['NV006', 'Đặng Tuấn Kiệt', '12A1 - Luyện Thi ĐH (Ca 1 - T2,4,6)', 'PH Tuấn Kiệt', '0901234506', 800000, 'Đã hoàn thành', '', '2026-06-15', 5],
    ['NV007', 'Bùi Phương Thảo', '12A1 - Luyện Thi ĐH (Ca 1 - T2,4,6)', 'PH Phương Thảo', '0901234507', 800000, 'Chưa đóng', '', '2026-07-01', 3],
    ['NV008', 'Hoàng Đức Anh', '12A1 - Luyện Thi ĐH (Ca 1 - T2,4,6)', 'PH Đức Anh', '0901234508', 800000, 'Đã hoàn thành', 'Học sinh giỏi Tỉnh', '2026-06-01', 5],

    // Lớp 12A2 (6 HS)
    ['NV009', 'Ngô Khánh Linh', '12A2 - Mục Tiêu 9+ (Ca 2 - T3,5,7)', 'PH Khánh Linh', '0901234509', 800000, 'Đã hoàn thành', '', '2026-06-02', 5],
    ['NV010', 'Đỗ Minh Quân', '12A2 - Mục Tiêu 9+ (Ca 2 - T3,5,7)', 'PH Minh Quân', '0901234510', 800000, 'Đã hoàn thành', 'Đã CK VietQR', '2026-06-02', 5],
    ['NV011', 'Hồ Ngọc Quỳnh Hương', '12A2 - Mục Tiêu 9+ (Ca 2 - T3,5,7)', 'PH Quỳnh Hương', '0901234511', 800000, 'Chờ duyệt', 'Đang chờ xác nhận biên lai', '2026-06-10', 4],
    ['NV012', 'Dương Hải Đăng', '12A2 - Mục Tiêu 9+ (Ca 2 - T3,5,7)', 'PH Hải Đăng', '0901234512', 800000, 'Đã hoàn thành', '', '2026-06-12', 5],
    ['NV013', 'Lý Thanh Trúc', '12A2 - Mục Tiêu 9+ (Ca 2 - T3,5,7)', 'PH Thanh Trúc', '0901234513', 800000, 'Chưa đóng', '', '2026-07-05', 3],
    ['NV014', 'Trương Gia Huy', '12A2 - Mục Tiêu 9+ (Ca 2 - T3,5,7)', 'PH Gia Huy', '0901234514', 800000, 'Đã hoàn thành', '', '2026-06-02', 5],

    // Lớp 11B1 (6 HS)
    ['NV015', 'Phan Bảo Ngọc', '11B1 - Toán Nâng Cao (T2,4,6)', 'PH Bảo Ngọc', '0901234515', 700000, 'Đã hoàn thành', '', '2026-07-01', 4],
    ['NV016', 'Võ Quốc Khánh', '11B1 - Toán Nâng Cao (T2,4,6)', 'PH Quốc Khánh', '0901234516', 700000, 'Đã hoàn thành', '', '2026-07-01', 4],
    ['NV017', 'Đinh Thùy Dương', '11B1 - Toán Nâng Cao (T2,4,6)', 'PH Thùy Dương', '0901234517', 700000, 'Đã hoàn thành', '', '2026-07-05', 4],
    ['NV018', 'Lương Nhật Minh', '11B1 - Toán Nâng Cao (T2,4,6)', 'PH Nhật Minh', '0901234518', 700000, 'Chưa đóng', 'Xin đóng vào ngày 25', '2026-07-10', 3],
    ['NV019', 'Mai Anh Thư', '11B1 - Toán Nâng Cao (T2,4,6)', 'PH Anh Thư', '0901234519', 700000, 'Đã hoàn thành', '', '2026-07-01', 4],
    ['NV020', 'Tạ Hoàng Nam', '11B1 - Toán Nâng Cao (T2,4,6)', 'PH Hoàng Nam', '0901234520', 700000, 'Đã hoàn thành', '', '2026-07-01', 4],

    // Lớp 10C1 (6 HS)
    ['NV021', 'Nguyễn Lê Thảo Vy', '10C1 - Toán Tư Duy (T3,5,7)', 'PH Thảo Vy', '0901234521', 600000, 'Đã hoàn thành', '', '2026-08-01', 3],
    ['NV022', 'Trần Đình Khang', '10C1 - Toán Tư Duy (T3,5,7)', 'PH Đình Khang', '0901234522', 600000, 'Đã hoàn thành', '', '2026-08-01', 3],
    ['NV023', 'Lê Ngọc Diệp', '10C1 - Toán Tư Duy (T3,5,7)', 'PH Ngọc Diệp', '0901234523', 600000, 'Chưa đóng', '', '2026-08-10', 2],
    ['NV024', 'Phạm Tuấn Dũng', '10C1 - Toán Tư Duy (T3,5,7)', 'PH Tuấn Dũng', '0901234524', 600000, 'Đã hoàn thành', '', '2026-08-01', 3],
    ['NV025', 'Hoàng Kim Ngân', '10C1 - Toán Tư Duy (T3,5,7)', 'PH Kim Ngân', '0901234525', 600000, 'Đã hoàn thành', 'Học sinh mới tháng này', '2026-10-01', 1],
    ['NV026', 'Vũ Minh Triết', '10C1 - Toán Tư Duy (T3,5,7)', 'PH Minh Triết', '0901234526', 600000, 'Đã hoàn thành', '', '2026-08-01', 3],

    // Lớp 9D1 (5 HS)
    ['NV027', 'Đặng Ngọc Ánh', '9D1 - Luyện Thi Vào 10 (T2,4,6)', 'PH Ngọc Ánh', '0901234527', 600000, 'Đã hoàn thành', '', '2026-08-05', 3],
    ['NV028', 'Bùi Quang Vinh', '9D1 - Luyện Thi Vào 10 (T2,4,6)', 'PH Quang Vinh', '0901234528', 600000, 'Đã hoàn thành', '', '2026-08-05', 3],
    ['NV029', 'Đỗ Lan Anh', '9D1 - Luyện Thi Vào 10 (T2,4,6)', 'PH Lan Anh', '0901234529', 600000, 'Chưa đóng', '', '2026-08-15', 2],
    ['NV030', 'Ngô Tấn Phát', '9D1 - Luyện Thi Vào 10 (T2,4,6)', 'PH Tấn Phát', '0901234530', 600000, 'Đã hoàn thành', '', '2026-08-05', 3],
    ['NV031', 'Lê Mỹ Tâm', '9D1 - Luyện Thi Vào 10 (T2,4,6)', 'PH Mỹ Tâm', '0901234531', 600000, 'Đã hoàn thành', '', '2026-08-05', 3],

    // Lớp 8E1 (5 HS)
    ['NV032', 'Trần Khôi Nguyên', '8E1 - Toán Bồi Dưỡng (T7,CN)', 'PH Khôi Nguyên', '0901234532', 500000, 'Đã hoàn thành', '', '2026-09-01', 2],
    ['NV033', 'Phạm Bảo Hân', '8E1 - Toán Bồi Dưỡng (T7,CN)', 'PH Bảo Hân', '0901234533', 500000, 'Đã hoàn thành', '', '2026-09-01', 2],
    ['NV034', 'Nguyễn Thành Đạt', '8E1 - Toán Bồi Dưỡng (T7,CN)', 'PH Thành Đạt', '0901234534', 500000, 'Đã hoàn thành', '', '2026-09-01', 2],
    ['NV035', 'Võ Thiên Kim', '8E1 - Toán Bồi Dưỡng (T7,CN)', 'PH Thiên Kim', '0901234535', 500000, 'Chưa đóng', 'Mới nhập học tuần này', '2026-10-10', 0],
    ['NV036', 'Lý Trọng Nghĩa', '8E1 - Toán Bồi Dưỡng (T7,CN)', 'PH Trọng Nghĩa', '0901234536', 500000, 'Đã hoàn thành', '', '2026-09-01', 2]
  ];

  const metaMap = {};
  const students = rawStudents.map((row, index) => {
    const [code, fullName, className, parentName, parentPhone, tuitionFee, status, note, startDate, paidBatches] = row;
    metaMap[code] = { startDate, paidBatches };
    return {
      id: `ST_DEMO_${String(index + 1).padStart(3, '0')}`,
      studentCode: code,
      fullName,
      className,
      parentName,
      parentPhone,
      period: 'Tháng 10-11/2026',
      tuitionFee,
      status,
      receiptUrl: status === 'Chờ duyệt' ? SAMPLE_RECEIPT_SVG : '',
      updatedAt: '2026-10-23 09:30',
      note
    };
  });

  const sampleHistory = [
    {
      id: 'HIST_DEMO_01',
      archivedAt: '2026-09-30 20:15',
      className: '12A1 - Luyện Thi ĐH (Ca 1 - T2,4,6)',
      subject: 'Toán 12',
      periodLabel: 'Tháng 8-9/2026',
      batchLabel: 'ĐỢT 4',
      startDate: '2026-08-25',
      endDate: '2026-09-25',
      daysOfWeek: [1, 3, 5],
      sessionStates: {
        '2026-08-26': 1,
        '2026-08-28': 1,
        '2026-08-31': 1,
        '2026-09-02': 1,
        '2026-09-04': 1,
        '2026-09-07': 1,
        '2026-09-09': 1,
        '2026-09-11': 1,
        '2026-09-14': 1,
        '2026-09-16': 1,
        '2026-09-18': 1,
        '2026-09-21': 1
      },
      checkedSessions: 12,
      totalStudents: 8,
      paidCount: 8,
      totalExpected: 6400000,
      totalCollected: 6400000,
      totalMissing: 0,
      studentsSnapshot: students
        .filter(s => s.className === '12A1 - Luyện Thi ĐH (Ca 1 - T2,4,6)')
        .map(s => ({ ...s, period: 'Tháng 8-9/2026', status: 'Đã hoàn thành', note: 'Đã hoàn thành Đợt 4' }))
    }
  ];

  const paymentRequests = [
    {
      id: 'YC_DEMO_01',
      submittedAt: '2026-10-23 08:45',
      studentRecordId: 'ST_DEMO_002',
      studentCode: 'NV002',
      studentName: 'Trần Ngọc Bảo Châu',
      className: '12A1 - Luyện Thi ĐH (Ca 1 - T2,4,6)',
      period: 'Tháng 10-11/2026',
      amount: 800000,
      parentPhone: '0901234502',
      payerName: 'Trần Văn Hùng (PH em Bảo Châu)',
      note: 'Chuyển khoản học phí Đợt 5 cho cháu Bảo Châu lớp 12A1',
      receiptUrl: SAMPLE_RECEIPT_SVG,
      status: 'Chờ duyệt'
    },
    {
      id: 'YC_DEMO_02',
      submittedAt: '2026-10-23 10:15',
      studentRecordId: 'ST_DEMO_011',
      studentCode: 'NV011',
      studentName: 'Hồ Ngọc Quỳnh Hương',
      className: '12A2 - Mục Tiêu 9+ (Ca 2 - T3,5,7)',
      period: 'Tháng 10-11/2026',
      amount: 800000,
      parentPhone: '0901234511',
      payerName: 'Mẹ bé Quỳnh Hương',
      note: 'Gửi thầy học phí tháng 10-11 của em Hương ạ',
      receiptUrl: SAMPLE_RECEIPT_SVG,
      status: 'Chờ duyệt'
    }
  ];

  const transactions = [
    {
      id: 'GD_DEMO_001',
      date: '2026-10-23',
      type: 'Thu',
      category: 'Thu học phí',
      amount: 800000,
      description: 'Tự động lưu CK vào STK: NV001 - Nguyễn Hoàng Minh Khôi (Tháng 10-11/2026)',
      studentCode: 'NV001',
      method: 'Chuyển khoản STK (Tự động)',
      receiptUrl: '',
      createdBy: 'Tự động từ STK (SePay)'
    },
    {
      id: 'GD_DEMO_002',
      date: '2026-10-22',
      type: 'Thu',
      category: 'Thu học phí',
      amount: 800000,
      description: 'Tự động lưu CK vào STK: NV003 - Lê Quốc Thiên Ân (Tháng 10-11/2026)',
      studentCode: 'NV003',
      method: 'Chuyển khoản STK (Tự động)',
      receiptUrl: '',
      createdBy: 'Tự động từ STK (SePay)'
    },
    {
      id: 'GD_DEMO_003',
      date: '2026-10-22',
      type: 'Thu',
      category: 'Thu học phí',
      amount: 800000,
      description: 'Thu học phí Tháng 10-11/2026 - NV005 Vũ Hà My',
      studentCode: 'NV005',
      method: 'Chuyển khoản',
      receiptUrl: '',
      createdBy: 'Quản lý (Bản nháp)'
    },
    {
      id: 'GD_DEMO_004',
      date: '2026-10-21',
      type: 'Chi',
      category: 'Chi phí vận hành',
      amount: 1450000,
      description: 'In ấn tài liệu chuyên đề Luyện thi ĐH & Đề thi thử tháng 10',
      studentCode: '',
      method: 'Chuyển khoản',
      receiptUrl: '',
      createdBy: 'Quản lý (Bản nháp)'
    },
    {
      id: 'GD_DEMO_005',
      date: '2026-10-20',
      type: 'Thu',
      category: 'Thu học phí',
      amount: 700000,
      description: 'Thu học phí Tháng 10-11/2026 - NV015 Phan Bảo Ngọc (11B1)',
      studentCode: 'NV015',
      method: 'Chuyển khoản',
      receiptUrl: '',
      createdBy: 'Tự động từ STK (SePay)'
    },
    {
      id: 'GD_DEMO_006',
      date: '2026-10-19',
      type: 'Chi',
      category: 'Chi phí vận hành',
      amount: 950000,
      description: 'Thanh toán tiền điện, nước & Internet cáp quang phòng học',
      studentCode: '',
      method: 'Chuyển khoản',
      receiptUrl: '',
      createdBy: 'Quản lý (Bản nháp)'
    },
    {
      id: 'GD_DEMO_007',
      date: '2026-10-18',
      type: 'Thu',
      category: 'Thu học phí',
      amount: 600000,
      description: 'Thu học phí Tháng 10-11/2026 - NV021 Nguyễn Lê Thảo Vy (10C1)',
      studentCode: 'NV021',
      method: 'Chuyển khoản',
      receiptUrl: '',
      createdBy: 'Tự động từ STK (SePay)'
    }
  ];

  return {
    settings: {
      isSandboxData: true,
      centerName: 'TRUNG TÂM GIÁO DỤC ALPHA (BẢN NHÁP)',
      bankBin: 'BIDV',
      bankAccountNo: '5801434567',
      bankAccountName: 'HKD TRUNG TAM HUYNH THANH CHI',
      activeBankProfileId: 'TEST_BIDV',
      sepayLinkedStatus: 'CONNECTED',
      sepayLinkedAccount: 'BIDV • 5801434567',
      defaultPeriod: 'Tháng 10-11/2026',
      sandboxAdminPassword: 'DEMO-NHAP-2026',
      teacherPhone: '0901234567',
      customQrUrl: '',
      sepayBalance: '45600000',
      classSchedulesJson: JSON.stringify(sampleClassesConfig),
      classHistoryJson: JSON.stringify(sampleHistory),
      studentMetaJson: JSON.stringify(metaMap)
    },
    students,
    paymentRequests,
    transactions
  };
}

function loadSandboxDraftStateFromLocal() {
  try {
    localStorage.removeItem('edupay_sandbox_draft_state_v1');
    const raw = localStorage.getItem(STORAGE_KEYS.SANDBOX_STATE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        Array.isArray(parsed.students) &&
        parsed.settings &&
        parsed.settings.isSandboxData === true &&
        !String(parsed.settings.centerName || '').toUpperCase().includes('ANH CHÍ')
      ) {
        delete parsed.settings.adminPassword;
        if (!parsed.settings.sandboxAdminPassword || parsed.settings.sandboxAdminPassword === '123456') {
          parsed.settings.sandboxAdminPassword = 'DEMO-NHAP-2026';
        }
        // Tự động nâng cấp STK nháp cũ (0999888777) sang STK Nháp BIDV 5801434567 theo yêu cầu
        if (!parsed.settings.bankAccountNo || parsed.settings.bankAccountNo === '0999888777') {
          parsed.settings.bankBin = 'BIDV';
          parsed.settings.bankAccountNo = '5801434567';
          parsed.settings.bankAccountName = 'HKD TRUNG TAM HUYNH THANH CHI';
          parsed.settings.activeBankProfileId = 'TEST_BIDV';
        }
        return parsed;
      }
    }
  } catch (e) {}
  const initialDraft = getInitialSandboxDraftState();
  localStorage.setItem(STORAGE_KEYS.SANDBOX_STATE, JSON.stringify(initialDraft));
  return initialDraft;
}

function checkIsSandboxUrlRequested() {
  try {
    const params = new URLSearchParams(window.location.search);
    const modeParam = (params.get('mode') || params.get('tab') || '').toLowerCase();
    const hash = (window.location.hash || '').toLowerCase();
    return (
      modeParam === 'nhap' ||
      modeParam === 'demo' ||
      modeParam === 'sandbox' ||
      hash === '#nhap' ||
      hash === '#demo'
    );
  } catch (e) {
    return false;
  }
}

// Biến trạng thái toàn cục
let isSandboxDraftMode = false;
let isOpenedViaFriendSandboxUrl = checkIsSandboxUrlRequested();
let realAppStateBackup = null;
let modeBeforeEnteringSandbox = 'parent';
let actionUndoStack = [];
let actionRedoStack = [];
let isRestoringUndoRedo = false;
let isSilentServerSync = false;
// shortcut: chỉ ghi nhớ tối đa 5 bước hoàn tác gần nhất để nhẹ bộ nhớ và tránh lùi về tận trạng thái ban đầu
const MAX_UNDO_HISTORY = 5;
appState = isOpenedViaFriendSandboxUrl ? loadSandboxDraftStateFromLocal() : loadStateFromLocal();
if (isOpenedViaFriendSandboxUrl) {
  isSandboxDraftMode = true;
} else {
  loadUndoRedoHistoryFromLocal();
}
let lastCommittedStateJson = JSON.stringify(appState);

let currentMode = 'parent'; // 'parent' | 'admin'
let currentAdminTab = 'classbook';
let selectedClassbookClass = '';
let selectedClassbookGradeFilter = 'ALL';
let selectedAllStuGradeFilter = 'ALL';
let selectedStuStatTimeMode = 'ALL';
let expandedHistoryIds = new Set();
let livePollingTimer = null;
let currentCalendarBrush = 'cycle'; // 'cycle' | 1 | 2 | 3 | 0
let uploadedReceiptBase64 = '';
let financeBarChartInstance = null;
let tuitionPieChartInstance = null;

function isAdminAuthenticated() {
  const authKey = isSandboxDraftMode ? STORAGE_KEYS.SANDBOX_AUTH : STORAGE_KEYS.ADMIN_AUTH;
  return sessionStorage.getItem(authKey) === 'true';
}

function handleOpenGoogleSheetLink(event) {
  if (isSandboxDraftMode) {
    if (event) event.preventDefault();
    showToast(
      'Đang ở Tab Nháp (Dùng Thử): Không sử dụng Google Sheet thật của chủ hệ thống! Mọi dữ liệu nháp được lưu độc lập.',
      'info'
    );
    return false;
  }
  return true;
}

function updateSandboxModeButtonsUI() {
  const banner = document.getElementById('sandbox-draft-banner');
  const topBtn = document.getElementById('btn-mode-sandbox');
  const sideBtn = document.getElementById('side-nav-sandbox');
  const sideLabel = document.getElementById('side-nav-sandbox-label');
  const tabBtn = document.getElementById('tab-btn-sandbox');
  const tabLabel = document.getElementById('tab-btn-sandbox-label');

  // Các phần tử thương hiệu cần đổi sang Thông tin Nháp khi ở Tab Nháp
  const headerBrandBadge = document.getElementById('header-brand-badge');
  const sidebarBrandTitle = document.getElementById('sidebar-brand-title');
  const sidebarBrandSub = document.getElementById('sidebar-brand-subtitle');
  const workspaceBrandBadge = document.getElementById('workspace-brand-badge');
  const avatarInitials = document.getElementById('header-avatar-initials');
  const avatarBox = document.getElementById('header-avatar-box');
  const sheetTopLabel = document.getElementById('btn-open-google-sheet-top-label');

  if (banner) {
    if (isSandboxDraftMode) {
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }

  if (isSandboxDraftMode) {
    document.title = 'ALPHA EDU (BẢN NHÁP) - Hệ Thống Dùng Thử Quản Lý Học Sinh & Tài Chính';
    if (headerBrandBadge) {
      headerBrandBadge.textContent = 'ALPHA EDU • NHÁP';
      headerBrandBadge.className =
        'hidden sm:inline-block px-2 py-0.5 rounded-full bg-[#FFF3EE] text-[#FF4B16] border border-[#FFD9CC] text-xs font-extrabold tracking-normal uppercase shrink-0';
    }
    if (sidebarBrandTitle) sidebarBrandTitle.textContent = 'ALPHA EDU (NHÁP)';
    if (sidebarBrandSub) sidebarBrandSub.textContent = 'Bản Dùng Thử Mẫu';
    if (workspaceBrandBadge) {
      workspaceBrandBadge.textContent = 'BẢN NHÁP DÙNG THỬ';
      workspaceBrandBadge.className =
        'hidden sm:inline-flex px-2.5 py-0.5 rounded-full bg-[#FFF3EE] text-[#FF4B16] border border-[#FFD9CC] text-xs font-extrabold';
    }
    if (avatarInitials) avatarInitials.textContent = 'NH';
    if (avatarBox) avatarBox.title = 'Tài khoản Dùng Thử - TRUNG TÂM GIÁO DỤC ALPHA (BẢN NHÁP)';
    if (sheetTopLabel) sheetTopLabel.textContent = 'Sheet Nháp (Demo)';
  } else {
    document.title = 'THANH CHÍ EDU - Quản Lý Học Sinh, Học Phí & Tài Chính';
    if (headerBrandBadge) {
      headerBrandBadge.textContent = 'THANH CHÍ EDU';
      headerBrandBadge.className =
        'hidden sm:inline-block px-2 py-0.5 rounded-full bg-[#eeeeee] text-[#141414] text-xs font-extrabold tracking-normal uppercase shrink-0';
    }
    if (sidebarBrandTitle) sidebarBrandTitle.textContent = 'THANH CHÍ EDU';
    if (sidebarBrandSub) sidebarBrandSub.textContent = 'Hệ thống Quản trị';
    if (workspaceBrandBadge) {
      workspaceBrandBadge.textContent = 'THANH CHÍ EDU';
      workspaceBrandBadge.className =
        'hidden sm:inline-flex px-2.5 py-0.5 rounded-full bg-[#eeeeee] text-[#141414] text-xs font-extrabold';
    }
    if (avatarInitials) avatarInitials.textContent = 'TC';
    if (avatarBox) avatarBox.title = 'Quản trị viên - THANH CHÍ EDU';
    if (sheetTopLabel) sheetTopLabel.textContent = 'Mở Google Sheet';
  }

  if (topBtn) {
    if (isSandboxDraftMode) {
      topBtn.className =
        'hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-extrabold bg-[#141414] from-[#FF4B16] to-[#141414] text-white  transition cursor-pointer whitespace-nowrap';
      topBtn.innerHTML = `<i data-lucide="flask-conical" class="w-3.5 h-3.5 shrink-0"></i><span>Tab Nháp</span>`;
    } else {
      topBtn.className =
        'mode-pill-inactive hidden md:flex relative items-center gap-1 px-2.5 py-1.5 rounded-full text-xs transition cursor-pointer whitespace-nowrap';
      topBtn.innerHTML = `<i data-lucide="flask-conical" class="w-3.5 h-3.5 text-[#FF4B16] shrink-0"></i><span>Tab Nháp</span>`;
    }
  }

  if (sideBtn && sideLabel) {
    if (isSandboxDraftMode) {
      sideBtn.className = 'tc-nav-item is-active';
      sideLabel.textContent = 'Đang ở Tab Nháp';
      sideLabel.className = 'tc-sidebar-label truncate text-white font-extrabold';
    } else {
      sideBtn.className = 'tc-nav-item border border-dashed border-[#FF4B16]/40 bg-[#FFF3EE]/60';
      sideLabel.textContent = 'Tab Nháp (Dùng thử)';
      sideLabel.className = 'tc-sidebar-label truncate text-[#FF4B16] font-extrabold';
    }
  }

  if (tabBtn && tabLabel) {
    if (isSandboxDraftMode) {
      tabBtn.className =
        'shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-extrabold transition bg-[#141414] from-[#FF4B16] to-[#141414] text-white cursor-pointer ';
      tabLabel.textContent = 'Đang ở Tab Nháp (Bấm để về Dữ liệu thật)';
    } else {
      tabBtn.className =
        'shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-extrabold transition bg-[#FFF3EE] hover:bg-[#FF4B16] text-[#FF4B16] hover:text-white border border-[#FFD9CC] cursor-pointer ';
      tabLabel.textContent = 'Tab Nháp (Dùng Thử Cho Bạn Bè)';
    }
  }
}

function enterSandboxDraftMode(silent = false) {
  if (!isSandboxDraftMode) {
    realAppStateBackup = JSON.stringify(appState);
    modeBeforeEnteringSandbox = currentMode;
  }
  isSandboxDraftMode = true;
  if (typeof livePollingTimer !== 'undefined' && livePollingTimer) {
    clearInterval(livePollingTimer);
    livePollingTimer = null;
  }

  appState = loadSandboxDraftStateFromLocal();
  lastCommittedStateJson = JSON.stringify(appState);
  actionUndoStack = [];
  actionRedoStack = [];

  const clsMap = getClassSchedulesMap();
  selectedClassbookClass = Object.keys(clsMap)[0] || '';
  selectedClassbookGradeFilter = 'ALL';
  selectedAllStuGradeFilter = 'ALL';

  // Chỉ mở quyền phiên Nháp (SANDBOX_AUTH), tuyệt đối không đụng vào quyền Quản lý chính (ADMIN_AUTH)
  sessionStorage.setItem(STORAGE_KEYS.SANDBOX_AUTH, 'true');

  try {
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('mode', 'nhap');
    window.history.replaceState({}, '', newUrl.toString());
  } catch (e) {}

  updateSandboxModeButtonsUI();
  updateSyncStatusBanner();
  populateSettingsForm();
  switchAppMode('admin');

  if (!silent) {
    showToast(
      'Đã chuyển sang Tab Nháp (Dùng Thử)! Mọi thao tác và mật khẩu tại đây hoàn toàn tách biệt với Quản lý chính.',
      'success'
    );
  }
}

async function exitSandboxDraftMode() {
  // Nếu đường link được mở trực tiếp từ ?mode=nhap (dành cho bạn bè), yêu cầu mật khẩu chủ hệ thống trước khi cho xem dữ liệu thật
  if (isOpenedViaFriendSandboxUrl) {
    const realStateCandidate = loadStateFromLocal();
    const ownerPass = String(realStateCandidate?.settings?.adminPassword || '336699').trim();
    const entered = await appPrompt(
      'Khu vực Dữ Liệu Thật dành riêng cho Chủ hệ thống (LỚP TOÁN ANH CHÍ).\nNhập mật khẩu quản lý chính để chuyển về dữ liệu thật (Nếu bạn đang dùng thử, hãy bấm Hủy để tiếp tục ở Tab Nháp):',
      '',
      {
        title: 'Xác Thực Chủ Hệ Thống',
        icon: 'lock',
        inputType: 'password',
        placeholder: 'Nhập mật khẩu quản lý chính...',
        confirmText: 'Mở Dữ Liệu Thật'
      }
    );
    if (entered === null) return;
    if (entered.trim() !== ownerPass) {
      showToast('Mật khẩu Quản lý chính không đúng! Bạn vẫn đang ở Tab Nháp Dùng Thử.', 'warning');
      return;
    }
    isOpenedViaFriendSandboxUrl = false;
    sessionStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, 'true');
  }

  isSandboxDraftMode = false;
  if (realAppStateBackup) {
    try {
      appState = JSON.parse(realAppStateBackup);
    } catch (e) {
      appState = loadStateFromLocal();
    }
  } else {
    appState = loadStateFromLocal();
  }

  lastCommittedStateJson = JSON.stringify(appState);
  actionUndoStack = [];
  actionRedoStack = [];

  const clsMap = getClassSchedulesMap();
  selectedClassbookClass = Object.keys(clsMap)[0] || '';
  selectedClassbookGradeFilter = 'ALL';
  selectedAllStuGradeFilter = 'ALL';

  try {
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.delete('mode');
    newUrl.searchParams.delete('tab');
    window.history.replaceState({}, '', newUrl.toString());
  } catch (e) {}

  updateSandboxModeButtonsUI();
  updateSyncStatusBanner();
  populateSettingsForm();

  // Nếu trước đó chưa đăng nhập Quản lý chính thì kiểm tra lại trạng thái xác thực (hiển thị ô nhập mật khẩu chính)
  if (!isAdminAuthenticated()) {
    switchAppMode(modeBeforeEnteringSandbox || 'parent');
    checkAdminAuthStatus();
  } else {
    refreshAllViews();
  }

  const gasUrl = getGasUrl();
  if (gasUrl && isAutoSyncEnabled()) {
    syncAllToGoogleSheet(false);
  }

  showToast('Đã quay về Dữ Liệu Thật của bạn (LỚP TOÁN ANH CHÍ)!', 'success');
}

function toggleSandboxDraftMode() {
  if (isSandboxDraftMode) {
    exitSandboxDraftMode();
  } else {
    enterSandboxDraftMode(false);
  }
}

function resetSandboxDraftData() {
  if (!isSandboxDraftMode) {
    enterSandboxDraftMode(true);
  }
  const freshDraft = getInitialSandboxDraftState();
  localStorage.setItem(STORAGE_KEYS.SANDBOX_STATE, JSON.stringify(freshDraft));
  appState = freshDraft;
  lastCommittedStateJson = JSON.stringify(appState);
  actionUndoStack = [];
  actionRedoStack = [];

  const clsMap = getClassSchedulesMap();
  selectedClassbookClass = Object.keys(clsMap)[0] || '';
  selectedClassbookGradeFilter = 'ALL';
  selectedAllStuGradeFilter = 'ALL';

  populateSettingsForm();
  refreshAllViews();
  showToast('Đã tạo lại bộ dữ liệu nháp mẫu mới (36 Học sinh • 6 Lớp học • Sổ Thu Chi mẫu)!', 'success');
}

async function copySandboxShareLink() {
  let shareUrl = 'https://thanhchi113.github.io/quan-ly-hoc-sinh-thu-chi/?mode=nhap';
  try {
    if (window.location.origin && window.location.origin.startsWith('http')) {
      const u = new URL(window.location.origin + window.location.pathname);
      u.searchParams.set('mode', 'nhap');
      shareUrl = u.toString();
    }
  } catch (e) {}

  try {
    await navigator.clipboard.writeText(shareUrl);
    showToast(
      `Đã copy Link Tab Nháp (${shareUrl})! Bạn chỉ việc dán (Ctrl+V) gửi cho bạn bè dùng thử ngay!`,
      'success'
    );
  } catch (e) {
    await appPrompt('Sao chép đường link Tab Nháp bên dưới để gửi cho bạn bè dùng thử:', shareUrl, {
      title: 'Chia Sẻ Link Tab Nháp',
      icon: 'share-2',
      readOnly: true,
      confirmText: 'Đã sao chép'
    });
  }
}

function isRunningAsStandaloneApp() {
  try {
    return Boolean(
      window.navigator?.standalone === true ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
    );
  } catch (e) {
    return false;
  }
}

function isAdminAppBootRequested() {
  if (isRunningAsStandaloneApp()) return true;
  try {
    const appParam = (new URLSearchParams(window.location.search).get('app') || '').toLowerCase();
    return appParam === 'admin' || appParam === 'ios';
  } catch (e) {
    return false;
  }
}

function getIosAdminAppInstallUrl() {
  try {
    if (window.location.origin && window.location.origin.startsWith('http')) {
      const u = new URL(window.location.pathname || '/', window.location.origin);
      u.searchParams.set('app', 'admin');
      return u.toString();
    }
  } catch (e) {}
  return 'https://thanhchi113.github.io/quan-ly-hoc-sinh-thu-chi/?app=admin';
}

function openIosInstallModal() {
  const modal = document.getElementById('ios-install-modal');
  if (!modal) return;
  const qrImg = document.getElementById('ios-install-qr-img');
  const installUrl = getIosAdminAppInstallUrl();
  if (qrImg) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(installUrl)}`;
  }
  modal.classList.remove('hidden');
  lucide.createIcons({ root: modal });
}

function closeIosInstallModal() {
  const modal = document.getElementById('ios-install-modal');
  if (modal) modal.classList.add('hidden');
}

async function copyIosAppLink() {
  const url = getIosAdminAppInstallUrl();
  try {
    await navigator.clipboard.writeText(url);
    showToast('Đã sao chép link cài App Quản Lý! Hãy dán vào trình duyệt Safari trên iPhone.', 'success');
  } catch (e) {
    await appPrompt('Sao chép link cài App Quản Lý dưới đây để mở bằng Safari trên iPhone:', url, {
      title: 'Link Cài App Quản Lý iOS',
      icon: 'smartphone',
      readOnly: true,
      confirmText: 'Đóng'
    });
  }
}

// shortcut: tự khóa lại sau 3 phút chạy nền trên iOS để vừa tránh phải gõ lại khi chuyển sang app Ngân hàng/Ảnh vừa bảo mật mỗi lần mở lại App
const STANDALONE_BG_LOCK_MS = 3 * 60 * 1000;
let _standaloneHiddenAtMs = 0;

function initStandaloneIosLifecycle() {
  const installBtn = document.getElementById('btn-install-ios-app');
  if (installBtn && isRunningAsStandaloneApp()) {
    installBtn.classList.add('hidden');
  }

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && window.location?.protocol?.startsWith('http')) {
    navigator.serviceWorker
      .register('./sw.js?v=20261029_v59', { updateViaCache: 'none' })
      .then(reg => {
        if (reg && typeof reg.update === 'function') reg.update().catch(() => {});
      })
      .catch(() => {});
  }

  if (isRunningAsStandaloneApp() && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (isSandboxDraftMode) return;
      if (document.hidden) {
        _standaloneHiddenAtMs = Date.now();
      } else if (_standaloneHiddenAtMs > 0 && Date.now() - _standaloneHiddenAtMs >= STANDALONE_BG_LOCK_MS) {
        _standaloneHiddenAtMs = 0;
        sessionStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
        switchAppMode('admin');
      }
    });
  }
}

function saveUiViewState() {
  if (isSandboxDraftMode) return;
  try {
    sessionStorage.setItem(
      STORAGE_KEYS.UI_VIEW,
      JSON.stringify({
        mode: currentMode,
        adminTab: currentAdminTab,
        classbookClass: selectedClassbookClass,
        classbookGrade: selectedClassbookGradeFilter
      })
    );
  } catch (e) {}
}

function restoreUiViewState() {
  if (isSandboxDraftMode) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.UI_VIEW);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.classbookClass) selectedClassbookClass = parsed.classbookClass;
      if (parsed.classbookGrade) selectedClassbookGradeFilter = parsed.classbookGrade;
      return parsed;
    }
  } catch (e) {}
  return null;
}

function bootstrapApp() {
  initThemeSystem();
  enableSourceProtection();
  initStandaloneIosLifecycle();
  lucide.createIcons();

  if (isSandboxDraftMode) {
    enterSandboxDraftMode(true);
    showToast(
      'Chào mừng bạn đến với Phiên Bản Dùng Thử (Tab Nháp)! Bạn có thể thoải mái trải nghiệm mọi tính năng.',
      'info'
    );
    return;
  }

  const openDirectAdminApp = isAdminAppBootRequested();
  if (openDirectAdminApp && !sessionStorage.getItem('edupay_standalone_booted')) {
    sessionStorage.setItem('edupay_standalone_booted', '1');
    sessionStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
  }

  const savedView = restoreUiViewState();
  initAppUI();
  checkPasswordResetUrlRequest();

  if (openDirectAdminApp || (savedView && savedView.mode === 'admin')) {
    switchAppMode('admin');
    if (savedView && savedView.adminTab && isAdminAuthenticated()) {
      switchAdminTab(savedView.adminTab);
    }
  }

  // Chế độ 1 chiều tuyệt đối (Web -> Google Sheet): Tuyệt đối không lấy dữ liệu từ Google Sheet về Web.
  // Chỉ đẩy bù dữ liệu từ Web lên Google Sheet nếu lần lưu trước đó chưa kịp đẩy xong trước khi tải lại trang.
  const gasUrl = getGasUrl();
  if (gasUrl) {
    if (typeof seedCurrentBankTxAsNotified === 'function') seedCurrentBankTxAsNotified(appState);
    const hasDirtySync = (() => {
      try {
        return localStorage.getItem(STORAGE_KEYS.DIRTY_SYNC) === '1';
      } catch (e) {
        return false;
      }
    })();
    if (hasDirtySync && isAutoSyncEnabled()) {
      syncAllToGoogleSheet(false).catch(() => {});
    }
  }
}

// Bảo vệ mã nguồn (chỉ chặn F12 / Ctrl+U / Ctrl+Shift+I), vẫn cho phép Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+Z, chọn chữ và chuột phải trong ô nhập liệu
function enableSourceProtection() {
  document.addEventListener('contextmenu', e => {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
    const isAuth = isAdminAuthenticated();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'IMG' || isAuth) {
      return true; // Cho phép chuột phải bình thường trong ô nhập liệu, trên ảnh và khi Quản lý đăng nhập
    }
    e.preventDefault();
  });

  document.addEventListener('keydown', e => {
    const key = (e.key || '').toUpperCase();
    // Hỗ trợ phím tắt Ctrl + Z (Quay lại thao tác trước) và Ctrl + Y (Làm lại) khi đang ở trang Quản lý
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
    const isTypingInField = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);
    if (!isTypingInField && currentMode === 'admin' && isAdminAuthenticated()) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'Z') {
        e.preventDefault();
        undoLastAction();
        return false;
      }
      if ((e.ctrlKey || e.metaKey) && (key === 'Y' || (e.shiftKey && key === 'Z'))) {
        e.preventDefault();
        redoLastAction();
        return false;
      }
    }

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

function safeWriteLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    if (key === STORAGE_KEYS.STATE) {
      try {
        sessionStorage.setItem(STORAGE_KEYS.STATE, value);
      } catch (e) {}
    }
    return true;
  } catch (err) {
    try {
      localStorage.removeItem('edupay_app_state_v1');
      localStorage.removeItem('TC_NOTIFIED_BANK_TX_IDS');
      localStorage.removeItem(STORAGE_KEYS.REDO_STACK);
      if (key === STORAGE_KEYS.STATE) {
        localStorage.removeItem(STORAGE_KEYS.UNDO_STACK);
        if (!isSandboxDraftMode) {
          localStorage.removeItem(STORAGE_KEYS.SANDBOX_STATE);
        }
      }
      localStorage.setItem(key, value);
      if (key === STORAGE_KEYS.STATE) {
        try {
          sessionStorage.setItem(STORAGE_KEYS.STATE, value);
        } catch (e) {}
      }
      return true;
    } catch (retryErr) {
      if (key === STORAGE_KEYS.STATE) {
        try {
          sessionStorage.setItem(STORAGE_KEYS.STATE, value);
        } catch (e) {}
      }
      console.warn('Cảnh báo bộ nhớ LocalStorage:', retryErr);
      return false;
    }
  }
}

function saveUndoRedoHistoryToLocal() {
  if (isSandboxDraftMode) return;
  try {
    const persistedUndo = (actionUndoStack || []).slice(-MAX_UNDO_HISTORY);
    const persistedRedo = (actionRedoStack || []).slice(-MAX_UNDO_HISTORY);
    const undoJson = JSON.stringify(persistedUndo);
    const redoJson = JSON.stringify(persistedRedo);
    try {
      sessionStorage.setItem(STORAGE_KEYS.UNDO_STACK, undoJson);
      sessionStorage.setItem(STORAGE_KEYS.REDO_STACK, redoJson);
    } catch (e) {}
    try {
      localStorage.setItem(STORAGE_KEYS.UNDO_STACK, undoJson);
      localStorage.setItem(STORAGE_KEYS.REDO_STACK, redoJson);
    } catch (e) {
      try {
        localStorage.setItem(STORAGE_KEYS.UNDO_STACK, JSON.stringify(persistedUndo.slice(-3)));
      } catch (e2) {}
    }
  } catch (err) {}
}

function loadUndoRedoHistoryFromLocal() {
  if (isSandboxDraftMode) return;
  try {
    const rawUndo = sessionStorage.getItem(STORAGE_KEYS.UNDO_STACK) || localStorage.getItem(STORAGE_KEYS.UNDO_STACK);
    const rawRedo = sessionStorage.getItem(STORAGE_KEYS.REDO_STACK) || localStorage.getItem(STORAGE_KEYS.REDO_STACK);
    if (rawUndo) {
      const parsedUndo = JSON.parse(rawUndo);
      if (Array.isArray(parsedUndo)) {
        actionUndoStack = parsedUndo
          .filter(item => item && typeof item.stateJson === 'string')
          .slice(-MAX_UNDO_HISTORY);
      }
    }
    if (rawRedo) {
      const parsedRedo = JSON.parse(rawRedo);
      if (Array.isArray(parsedRedo)) {
        actionRedoStack = parsedRedo
          .filter(item => item && typeof item.stateJson === 'string')
          .slice(-MAX_UNDO_HISTORY);
      }
    }
  } catch (err) {}
}

function repairCorruptedStatusAndPeriodV58(state) {
  if (!state) return state;
  if (Array.isArray(state.students)) {
    state.students.forEach(s => {
      if (!s) return;
      if (typeof s.status === 'string') {
        if (s.status.includes('ho?n th?nh') || s.status.includes('hoàn thành')) {
          s.status = 'Đã hoàn thành';
        } else if (s.status.includes('Ch?a') || s.status.includes('??ng')) {
          s.status = 'Chưa đóng';
        } else if (s.status.includes('duy?t')) {
          s.status = 'Chờ duyệt';
        }
      }
      if (typeof s.period === 'string' && s.period.includes('Th?ng')) {
        s.period = s.period.replace(/Th\?ng/g, 'Tháng');
      }
      if (typeof s.note === 'string' && s.note.includes('??')) {
        if (s.studentCode === 'HS010') s.note = 'Đã chuyển khoản';
        else if (s.studentCode === 'HS007') s.note = 'Đã nhận CK: +600.000 ₫ (2026-10-28 13:36:14)';
        else if (s.studentCode === 'HS081') s.note = 'Đã nhận CK: +600.000 ₫ (2026-10-27 12:04:01)';
        else if (s.studentCode === 'HS044') s.note = 'Đã thanh toán';
        else s.note = '';
      }
    });
  }
  if (state.settings?.classHistoryJson) {
    try {
      const hist = JSON.parse(state.settings.classHistoryJson);
      if (Array.isArray(hist)) {
        let fixedHist = false;
        hist.forEach(h => {
          if (h && Array.isArray(h.studentsSnapshot)) {
            h.studentsSnapshot.forEach(st => {
              if (st && typeof st.status === 'string' && st.status.includes('ho?n th?nh')) {
                st.status = 'Đã hoàn thành';
                fixedHist = true;
              }
              if (st && typeof st.note === 'string' && st.note.includes('??')) {
                st.note = 'Đã chuyển khoản học phí';
                fixedHist = true;
              }
            });
            const paid = h.studentsSnapshot.filter(x => x && x.status === 'Đã hoàn thành');
            if (paid.length !== h.paidCount) {
              h.paidCount = paid.length;
              h.totalCollected = paid.reduce((sum, x) => sum + (Number(x.tuitionFee) || 0), 0);
              h.totalMissing = Math.max(0, (Number(h.totalExpected) || 0) - h.totalCollected);
              fixedHist = true;
            }
          }
        });
        if (fixedHist) state.settings.classHistoryJson = JSON.stringify(hist);
      }
    } catch (e) {}
  }
  return state;
}

function loadStateFromLocal() {
  let parsed = null;
  try {
    try {
      localStorage.removeItem('edupay_app_state_v1');
    } catch (e) {}

    const rawLocal = localStorage.getItem(STORAGE_KEYS.STATE);
    let rawSession = null;
    try {
      rawSession = sessionStorage.getItem(STORAGE_KEYS.STATE);
    } catch (e) {}

    let candidateLocal = null;
    let candidateSession = null;
    if (rawLocal) {
      try {
        candidateLocal = JSON.parse(rawLocal);
      } catch (e) {}
    }
    if (rawSession) {
      try {
        candidateSession = JSON.parse(rawSession);
      } catch (e) {}
    }

    if (candidateLocal && candidateSession) {
      const tLocal = Number(candidateLocal?.settings?._lastSavedAtMs || 0);
      const tSess = Number(candidateSession?.settings?._lastSavedAtMs || 0);
      parsed = tSess > tLocal ? candidateSession : candidateLocal;
    } else {
      parsed = candidateLocal || candidateSession;
    }

    if (parsed && parsed.students && parsed.transactions && parsed.settings) {
      _bootedFromEmptyStorage = false;
      if (!parsed.settings.adminPassword || parsed.settings.adminPassword === '123456') {
        parsed.settings.adminPassword = '336699';
      }
      let cleaned = parsed;
      try {
        cleaned = purgeDraftDataFromState(parsed);
      } catch (cleanErr) {
        console.warn('Cảnh báo làm sạch dữ liệu khi tải (giữ nguyên dữ liệu gốc):', cleanErr);
        cleaned = parsed;
      }
      cleaned = repairCorruptedStatusAndPeriodV58(cleaned);
      safeWriteLocalStorage(STORAGE_KEYS.STATE, JSON.stringify(cleaned));
      return cleaned;
    }
  } catch (e) {
    console.warn('Không đọc được LocalStorage, kiểm tra bản lưu tạm:', e);
    if (parsed && parsed.students && parsed.settings) {
      _bootedFromEmptyStorage = false;
      return repairCorruptedStatusAndPeriodV58(parsed);
    }
  }
  _bootedFromEmptyStorage = true;
  const initial = repairCorruptedStatusAndPeriodV58(getInitialDemoState());
  safeWriteLocalStorage(STORAGE_KEYS.STATE, JSON.stringify(initial));
  return initial;
}

function detectActionDescription(prevJson, nextJsonOrObj) {
  try {
    const prev = typeof prevJson === 'string' ? JSON.parse(prevJson) : prevJson || {};
    const next = typeof nextJsonOrObj === 'string' ? JSON.parse(nextJsonOrObj) : nextJsonOrObj || {};
    const prevSt = prev.students || [];
    const nextSt = next.students || [];

    if (prev.settings?.deletedClassesJson !== next.settings?.deletedClassesJson) {
      return `Xóa lớp học (${prevSt.length} → ${nextSt.length} HS)`;
    }
    if (
      prev.settings?.customGradesJson !== next.settings?.customGradesJson ||
      prev.settings?.deletedGradesJson !== next.settings?.deletedGradesJson
    ) {
      return 'Tạo / Cập nhật danh sách Khối lớp';
    }
    if (nextSt.length > prevSt.length) {
      return `Thêm học sinh (${prevSt.length} → ${nextSt.length} HS)`;
    }
    if (nextSt.length < prevSt.length) {
      return `Xóa học sinh (${prevSt.length} → ${nextSt.length} HS)`;
    }
    for (let i = 0; i < nextSt.length; i++) {
      const a = prevSt[i];
      const b = nextSt[i];
      if (!a || !b) continue;
      if (a.status !== b.status) {
        return `Đổi trạng thái ${b.fullName}: ${a.status} → ${b.status}`;
      }
      if (Number(a.tuitionFee) !== Number(b.tuitionFee)) {
        return `Đổi học phí ${b.fullName}: ${formatCurrency(a.tuitionFee)} → ${formatCurrency(b.tuitionFee)}`;
      }
      if ((a.note || '') !== (b.note || '')) {
        return `Sửa ghi chú học sinh ${b.fullName}`;
      }
      if (a.fullName !== b.fullName || a.className !== b.className) {
        return `Cập nhật thông tin học sinh ${b.fullName}`;
      }
    }
    if (prev.settings?.studentAttendanceJson !== next.settings?.studentAttendanceJson) {
      return 'Điểm danh buổi học của học sinh';
    }
    if (prev.settings?.autoAttendanceNextDay !== next.settings?.autoAttendanceNextDay) {
      return 'Bật/Tắt tự động điểm danh qua ngày';
    }
    if (prev.settings?.classSchedulesJson !== next.settings?.classSchedulesJson) {
      return 'Tích buổi dạy / Cập nhật lịch học';
    }
    if (prev.settings?.studentMetaJson !== next.settings?.studentMetaJson) {
      return 'Cập nhật ngày bắt đầu học / số đợt đóng';
    }
    if (
      prev.settings?.excludedTxIdsJson !== next.settings?.excludedTxIdsJson ||
      prev.settings?.txCustomTagsJson !== next.settings?.txCustomTagsJson
    ) {
      return 'Gắn / Gỡ tag Không ghi nhận giao dịch vào hệ thống';
    }
    if ((prev.transactions || []).length !== (next.transactions || []).length) {
      return 'Cập nhật Sổ Thu - Chi';
    }
  } catch (e) {}
  return 'Thao tác vừa thực hiện';
}

function updateUndoRedoButtonsUI() {
  const undoCount = actionUndoStack.length;
  const redoCount = actionRedoStack.length;
  const topUndo = undoCount > 0 ? actionUndoStack[undoCount - 1] : null;
  const topRedo = redoCount > 0 ? actionRedoStack[redoCount - 1] : null;

  const undoBtnIds = ['btn-global-undo', 'btn-classbook-undo', 'btn-attendance-undo', 'btn-students-undo'];
  undoBtnIds.forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = undoCount === 0;
    btn.title = topUndo
      ? `Quay lại thao tác trước (${topUndo.time}): ${topUndo.desc} [Phím tắt: Ctrl + Z]`
      : 'Chưa có thao tác nào trước đó để quay lại (Ctrl + Z)';
  });

  const badgeEl = document.getElementById('badge-undo-count');
  if (badgeEl) {
    if (undoCount > 0) {
      badgeEl.textContent = String(undoCount);
      badgeEl.classList.remove('hidden');
    } else {
      badgeEl.classList.add('hidden');
    }
  }

  const financeUndoBadge = document.getElementById('undo-count-badge-finance');
  if (financeUndoBadge) {
    if (undoCount > 0) {
      financeUndoBadge.textContent = String(undoCount);
      financeUndoBadge.classList.remove('hidden');
    } else {
      financeUndoBadge.classList.add('hidden');
    }
  }

  const redoBtn = document.getElementById('btn-global-redo');
  if (redoBtn) {
    redoBtn.disabled = redoCount === 0;
    redoBtn.title = topRedo
      ? `Làm lại thao tác vừa hoàn tác (${topRedo.time}): ${topRedo.desc} [Phím tắt: Ctrl + Y]`
      : 'Không có thao tác nào để làm lại (Ctrl + Y)';
  }
}

async function undoLastAction() {
  if (actionUndoStack.length === 0) {
    showToast('Chưa có thao tác nào trước đó để quay lại!', 'info');
    return;
  }

  const prevSnapshot = actionUndoStack.pop();
  const currentJson = JSON.stringify(appState);
  actionRedoStack.push({
    stateJson: currentJson,
    desc: prevSnapshot.desc || 'Thao tác trước đó',
    time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  });
  if (actionRedoStack.length > MAX_UNDO_HISTORY) {
    actionRedoStack = actionRedoStack.slice(-MAX_UNDO_HISTORY);
  }

  try {
    isRestoringUndoRedo = true;
    appState = JSON.parse(prevSnapshot.stateJson);
    lastCommittedStateJson = prevSnapshot.stateJson;
    saveStateToLocal();
  } finally {
    isRestoringUndoRedo = false;
  }

  updateUndoRedoButtonsUI();
  showToast(
    `Đã quay lại thao tác trước: "${prevSnapshot.desc}"! (Còn ${actionUndoStack.length} bước có thể quay lại)`,
    'warning'
  );

  const gasUrl = getGasUrl();
  if (gasUrl && isAutoSyncEnabled()) {
    await syncAllToGoogleSheet(false);
  }
}

async function redoLastAction() {
  if (actionRedoStack.length === 0) {
    showToast('Không có thao tác nào để làm lại!', 'info');
    return;
  }

  const nextSnapshot = actionRedoStack.pop();
  const currentJson = JSON.stringify(appState);
  actionUndoStack.push({
    stateJson: currentJson,
    desc: nextSnapshot.desc || 'Thao tác làm lại',
    time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  });
  if (actionUndoStack.length > MAX_UNDO_HISTORY) {
    actionUndoStack = actionUndoStack.slice(-MAX_UNDO_HISTORY);
  }

  try {
    isRestoringUndoRedo = true;
    appState = JSON.parse(nextSnapshot.stateJson);
    lastCommittedStateJson = nextSnapshot.stateJson;
    saveStateToLocal();
  } finally {
    isRestoringUndoRedo = false;
  }

  updateUndoRedoButtonsUI();
  showToast(`Đã làm lại thao tác: "${nextSnapshot.desc}"!`, 'info');

  const gasUrl = getGasUrl();
  if (gasUrl && isAutoSyncEnabled()) {
    await syncAllToGoogleSheet(false);
  }
}

let inFlightSheetPushCount = 0;
let lastLocalMutationAtMs = 0;

function saveStateToLocal() {
  if (!isSilentServerSync && appState && appState.settings) {
    appState.settings._lastSavedAtMs = Date.now();
  }
  const currentJson = JSON.stringify(appState);
  if (!isSilentServerSync && !isSandboxDraftMode && currentJson !== lastCommittedStateJson) {
    try {
      localStorage.setItem(STORAGE_KEYS.DIRTY_SYNC, '1');
    } catch (e) {}
  }
  if (
    lastCommittedStateJson &&
    currentJson !== lastCommittedStateJson &&
    !isRestoringUndoRedo &&
    !isSilentServerSync
  ) {
    lastLocalMutationAtMs = Date.now();
    actionUndoStack.push({
      stateJson: lastCommittedStateJson,
      desc: detectActionDescription(lastCommittedStateJson, appState),
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      createdAtMs: Date.now()
    });
    if (actionUndoStack.length > MAX_UNDO_HISTORY) {
      actionUndoStack = actionUndoStack.slice(-MAX_UNDO_HISTORY);
    }
    actionRedoStack = [];
    saveUndoRedoHistoryToLocal();
  } else if (isRestoringUndoRedo) {
    lastLocalMutationAtMs = Date.now();
    if (actionUndoStack.length > MAX_UNDO_HISTORY) {
      actionUndoStack = actionUndoStack.slice(-MAX_UNDO_HISTORY);
    }
    saveUndoRedoHistoryToLocal();
  } else if (!isSilentServerSync && currentJson !== lastCommittedStateJson) {
    lastLocalMutationAtMs = Date.now();
  }
  lastCommittedStateJson = currentJson;
  const targetStorageKey = isSandboxDraftMode ? STORAGE_KEYS.SANDBOX_STATE : STORAGE_KEYS.STATE;
  safeWriteLocalStorage(targetStorageKey, currentJson);
  refreshAllViews();
}

function getGasUrl() {
  if (isSandboxDraftMode) return '';
  const saved = (localStorage.getItem(STORAGE_KEYS.GAS_URL) || '').trim();
  if (!saved || saved.includes('DEMO_SANDBOX_MODE_ONLY')) {
    return (DEFAULT_GAS_WEBAPP_URL || '').trim();
  }
  return saved;
}

function isAutoSyncEnabled() {
  if (isSandboxDraftMode) return false;
  const val = localStorage.getItem(STORAGE_KEYS.AUTO_SYNC);
  return val === null ? true : val === 'true';
}

function initAppUI() {
  // Cập nhật trạng thái kết nối Sheet trên Header
  updateSyncStatusBanner();

  // Đổ dữ liệu cài đặt vào form
  populateSettingsForm();

  // Tự động kích hoạt liên kết & kết nối SePay ngầm ngay khi mở Web
  if (typeof autoConnectAndVerifySepay === 'function') {
    autoConnectAndVerifySepay(false);
  }

  // Render toàn bộ giao diện Quản lý (ẩn cho đến khi đăng nhập)
  refreshAllViews();
}

function renderActiveAdminTab() {
  if (currentAdminTab === 'classbook') {
    renderAdminClassbook();
  } else if (currentAdminTab === 'attendance') {
    if (typeof renderAdminAttendance === 'function') renderAdminAttendance();
  } else if (currentAdminTab === 'history') {
    renderAdminHistory();
  } else if (currentAdminTab === 'dashboard') {
    renderAdminDashboard();
  } else if (currentAdminTab === 'students') {
    populateStudentFilterDropdowns();
    renderAdminStudents();
  } else if (currentAdminTab === 'finance') {
    renderAdminTransactions();
  } else if (currentAdminTab === 'settings') {
    populateSettingsForm();
  }
}

function refreshAllViews() {
  // Cập nhật nút & banner Tab Nháp nếu đang bật
  if (typeof updateSandboxModeButtonsUI === 'function') {
    updateSandboxModeButtonsUI();
  }

  // Header
  const centerNameEl = document.getElementById('header-center-name');
  if (centerNameEl) {
    const rawCenterName = appState.settings.centerName || 'LỚP TOÁN ANH CHÍ';
    centerNameEl.textContent =
      isSandboxDraftMode && rawCenterName.length > 24 ? 'ALPHA EDU (BẢN NHÁP)' : rawCenterName;
    centerNameEl.title = rawCenterName;
  }

  // Đếm số yêu cầu chờ duyệt
  const pendingCount = (appState.paymentRequests || []).filter(r => r.status === 'Chờ duyệt').length;
  const navBadge = document.getElementById('nav-pending-badge');
  const tabBadge = document.getElementById('tab-pending-count');
  const sidePendingBadge = document.getElementById('sidebar-pending-badge');
  const sideFinanceBadge = document.getElementById('sidebar-finance-pending-badge');
  const tabFinanceBadge = document.getElementById('tab-finance-pending-count');
  const iosFinanceBadge = document.getElementById('ios-finance-pending-badge');

  [navBadge, tabBadge, sidePendingBadge, sideFinanceBadge, tabFinanceBadge, iosFinanceBadge].forEach(badge => {
    if (!badge) return;
    if (pendingCount > 0) {
      badge.textContent = pendingCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  });

  if (typeof renderHeaderNotificationState === 'function') {
    renderHeaderNotificationState();
  }

  if (currentMode === 'admin' && isAdminAuthenticated()) {
    // Đếm tổng số học sinh trên nút Tab "Tất cả Học sinh", Sidebar & số đợt Lịch sử
    const totalStudentsCount = (appState.students || []).length;
    const totalStudentsBadge = document.getElementById('tab-all-students-count');
    if (totalStudentsBadge) {
      totalStudentsBadge.textContent = `${totalStudentsCount} HS`;
    }
    const sideStudentsBadge = document.getElementById('sidebar-students-badge');
    if (sideStudentsBadge) {
      sideStudentsBadge.textContent = `${totalStudentsCount}`;
    }
    const sideClassesBadge = document.getElementById('sidebar-classes-badge');
    if (sideClassesBadge && typeof getClassSchedulesMap === 'function') {
      const clsMap = getClassSchedulesMap();
      const clsSet = new Set([
        ...Object.keys(clsMap),
        ...(appState.students || []).map(s => (s.className || '').trim()).filter(Boolean)
      ]);
      sideClassesBadge.textContent = `${clsSet.size}`;
    }
    const historyBadge = document.getElementById('tab-history-count');
    if (historyBadge) {
      const histList = getClassHistoryList();
      historyBadge.textContent = `${histList.length}`;
    }
    const tabAutoBadge = document.getElementById('tab-attendance-auto-badge');
    if (tabAutoBadge && typeof isAutoAttendanceEnabled === 'function') {
      const autoOn = isAutoAttendanceEnabled();
      tabAutoBadge.textContent = autoOn ? 'Tự động: BẬT' : 'Tự động: TẮT';
      tabAutoBadge.className = autoOn
        ? 'px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-800 font-extrabold whitespace-nowrap'
        : 'px-2 py-0.5 text-xs rounded-full bg-slate-200 text-slate-700 font-extrabold whitespace-nowrap';
    }

    // Chỉ render thanh số dư SePay và đúng Tab đang mở thay vì render cả 6 Tab ẩn cùng lúc
    updateUndoRedoButtonsUI();
    renderSepayBalanceBanner();
    renderActiveAdminTab();
    if (typeof syncFloatingStickyTableHeader === 'function') {
      requestAnimationFrame(() => syncFloatingStickyTableHeader(true));
    }
  } else {
    // Nếu đang có tìm kiếm bên Phụ huynh thì làm mới lại kết quả
    const currentSearch = document.getElementById('parent-search-input')?.value.trim() || '';
    if (currentSearch) {
      handleParentSearch(false);
    }
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
    document.getElementById('ios-bottom-tabbar')?.classList.add('hidden');
    btnParent.className = 'mode-pill-active flex items-center gap-1 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs transition cursor-pointer whitespace-nowrap';
    btnAdmin.className = 'mode-pill-inactive relative flex items-center gap-1 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs transition cursor-pointer whitespace-nowrap';
  } else {
    parentView.classList.add('hidden');
    adminView.classList.remove('hidden');
    btnAdmin.className = 'mode-pill-active relative flex items-center gap-1 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs transition cursor-pointer whitespace-nowrap';
    btnParent.className = 'mode-pill-inactive flex items-center gap-1 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs transition cursor-pointer whitespace-nowrap';

    checkAdminAuthStatus();
  }
  saveUiViewState();
  lucide.createIcons();
}

function checkAdminAuthStatus() {
  const isAuth = isAdminAuthenticated();
  const loginBox = document.getElementById('admin-login-box');
  const workspace = document.getElementById('admin-workspace');
  const iosTabBar = document.getElementById('ios-bottom-tabbar');

  if (isAuth) {
    loginBox.classList.add('hidden');
    workspace.classList.remove('hidden');
    if (iosTabBar && currentMode === 'admin') iosTabBar.classList.remove('hidden');
    refreshAllViews();
  } else {
    loginBox.classList.remove('hidden');
    workspace.classList.add('hidden');
    if (iosTabBar) iosTabBar.classList.add('hidden');
  }
}

function toggleAdminLoginPasswordVisibility() {
  const input = document.getElementById('admin-password-input');
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  const label = document.getElementById('label-toggle-admin-login-pass');
  if (label) label.textContent = isHidden ? 'Ẩn' : 'Hiện';
  const icon1 = document.getElementById('icon-toggle-admin-login-pass');
  const icon2 = document.getElementById('icon-toggle-admin-login-pass-btn');
  if (icon1) icon1.setAttribute('data-lucide', isHidden ? 'eye-off' : 'eye');
  if (icon2) icon2.setAttribute('data-lucide', isHidden ? 'eye-off' : 'eye');
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

function handleAdminLogin(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  const rawInput = document.getElementById('admin-password-input')?.value || '';
  const inputPass = rawInput.trim();
  const actualPass = isSandboxDraftMode
    ? String(appState?.settings?.sandboxAdminPassword || 'DEMO-NHAP-2026').trim()
    : String(appState?.settings?.adminPassword || '336699').trim();

  if (inputPass === actualPass) {
    const authKey = isSandboxDraftMode ? STORAGE_KEYS.SANDBOX_AUTH : STORAGE_KEYS.ADMIN_AUTH;
    sessionStorage.setItem(authKey, 'true');
    const inputEl = document.getElementById('admin-password-input');
    if (inputEl) inputEl.value = '';
    showToast(
      isSandboxDraftMode ? 'Đăng nhập Quản lý (Bản Nháp) thành công!' : 'Đăng nhập Quản lý chính thành công!',
      'success'
    );
    checkAdminAuthStatus();
    saveUiViewState();
  } else {
    showToast('Mật khẩu quản trị không đúng!', 'error');
  }
}

function handleAdminLogout() {
  const authKey = isSandboxDraftMode ? STORAGE_KEYS.SANDBOX_AUTH : STORAGE_KEYS.ADMIN_AUTH;
  sessionStorage.removeItem(authKey);
  showToast('Đã đăng xuất khỏi phiên Quản lý.', 'info');
  checkAdminAuthStatus();
  saveUiViewState();
}

// ============================================================================
// KHÔI PHỤC MẬT KHẨU / GỬI LINK ĐẶT LẠI VỀ MAIL BADAOQN132@GMAIL.COM
// ============================================================================
let _activeResetToken = '';
let _activeResetOtp = '';

function checkPasswordResetUrlRequest() {
  try {
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('reset_token') || params.get('token');
    const otp = params.get('otp') || '';
    if (resetToken) {
      openResetPasswordModal(resetToken, otp);
    }
  } catch (e) {}
}

function openForgotPasswordModal() {
  const modal = document.getElementById('forgot-password-modal');
  if (!modal) return;
  const sentBox = document.getElementById('forgot-pwd-sent-status');
  const otpSec = document.getElementById('forgot-pwd-otp-section');
  const sendBtn = document.getElementById('btn-send-reset-link');
  const btnText = document.getElementById('btn-send-reset-link-text');
  if (sentBox) sentBox.classList.add('hidden');
  if (otpSec) otpSec.classList.add('hidden');
  if (sendBtn) {
    sendBtn.disabled = false;
    sendBtn.classList.remove('opacity-60', 'cursor-not-allowed');
  }
  if (btnText) btnText.textContent = 'Gửi link về mail badaoqn132@gmail.com';
  modal.classList.remove('hidden');
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

function closeForgotPasswordModal() {
  const modal = document.getElementById('forgot-password-modal');
  if (modal) modal.classList.add('hidden');
}

function openResetPasswordModal(token = '', otp = '') {
  _activeResetToken = token || 'RST_DIRECT';
  _activeResetOtp = otp || '';
  const modal = document.getElementById('reset-password-modal');
  if (!modal) return;
  const newPassInput = document.getElementById('modal-new-password');
  const confirmPassInput = document.getElementById('modal-confirm-password');
  if (newPassInput) newPassInput.value = '';
  if (confirmPassInput) confirmPassInput.value = '';
  modal.classList.remove('hidden');
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

function closeResetPasswordModal() {
  const modal = document.getElementById('reset-password-modal');
  if (modal) modal.classList.add('hidden');
}

async function handleSendResetPasswordLink() {
  const sendBtn = document.getElementById('btn-send-reset-link');
  const btnText = document.getElementById('btn-send-reset-link-text');
  const sentBox = document.getElementById('forgot-pwd-sent-status');
  const otpSec = document.getElementById('forgot-pwd-otp-section');
  const otpInput = document.getElementById('reset-otp-input');
  const directBtn = document.getElementById('btn-direct-reset-here');

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.classList.add('opacity-60', 'cursor-not-allowed');
  }
  if (btnText) btnText.textContent = 'Đang gửi link về badaoqn132@gmail.com...';

  const token = 'RST_' + Date.now() + '_' + Math.floor(Math.random() * 899999 + 100000);
  const otp = String(Math.floor(Math.random() * 899999 + 100000));
  _activeResetToken = token;
  _activeResetOtp = otp;

  try {
    localStorage.setItem(
      'TC_PWD_RESET_SESSION',
      JSON.stringify({ token, otp, expiresAt: Date.now() + 30 * 60 * 1000 })
    );
  } catch (e) {}

  let resetUrl = 'https://thanhchi113.github.io/quan-ly-hoc-sinh-thu-chi/?reset_token=' + token + '&otp=' + otp;
  try {
    if (window.location && window.location.origin) {
      const u = new URL(window.location.origin + window.location.pathname);
      u.searchParams.set('reset_token', token);
      u.searchParams.set('otp', otp);
      resetUrl = u.toString();
    }
  } catch (e) {}

  // 1. Gửi qua Google Apps Script Web App nếu có
  const gasUrl = getGasUrl();
  if (gasUrl) {
    try {
      await postToGas(gasUrl, {
        action: 'sendResetEmail',
        email: 'badaoqn132@gmail.com',
        resetUrl,
        otp
      });
    } catch (e) {}
  }

  // 2. Gửi qua FormSubmit trực tiếp đến badaoqn132@gmail.com
  try {
    await fetch('https://formsubmit.co/ajax/badaoqn132@gmail.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        _subject: `[Thanh Chí Edu] Link đặt lại mật khẩu Quản lý (Mã OTP: ${otp})`,
        email: 'badaoqn132@gmail.com',
        _template: 'table',
        _captcha: 'false',
        'Link đặt lại mật khẩu': resetUrl,
        'Mã OTP 6 số': otp,
        'Thời gian': new Date().toLocaleString('vi-VN'),
        'Hướng dẫn': 'Bấm vào đường link trên để mở trang đặt lại mật khẩu mới cho trang Quản lý Thanh Chí Edu.'
      })
    });
  } catch (e) {}

  if (sentBox) sentBox.classList.remove('hidden');
  if (otpSec) otpSec.classList.remove('hidden');
  if (otpInput) otpInput.value = otp;
  if (directBtn) {
    directBtn.onclick = () => {
      closeForgotPasswordModal();
      openResetPasswordModal(token, otp);
    };
  }

  if (sendBtn) {
    sendBtn.disabled = false;
    sendBtn.classList.remove('opacity-60', 'cursor-not-allowed');
  }
  if (btnText) btnText.textContent = 'Gửi lại link về badaoqn132@gmail.com';

  showToast('Đã gửi link đặt lại mật khẩu về email badaoqn132@gmail.com!', 'success');
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

async function handleVerifyOtpAndResetPassword(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  const enteredOtp = (document.getElementById('reset-otp-input')?.value || '').trim();
  const newPass = (document.getElementById('reset-new-password-input')?.value || '').trim();

  if (!newPass) {
    showToast('Vui lòng nhập mật khẩu mới!', 'warning');
    return;
  }

  let sessionInfo = null;
  try {
    const raw = localStorage.getItem('TC_PWD_RESET_SESSION');
    if (raw) sessionInfo = JSON.parse(raw);
  } catch (err) {}

  const validOtp = sessionInfo?.otp || _activeResetOtp;
  if (validOtp && enteredOtp !== validOtp) {
    showToast('Mã OTP không đúng! Vui lòng kiểm tra lại email badaoqn132@gmail.com.', 'error');
    return;
  }

  if (sessionInfo && sessionInfo.expiresAt && Date.now() > sessionInfo.expiresAt) {
    showToast('Mã OTP đã hết hạn (quá 30 phút). Vui lòng bấm gửi lại link!', 'error');
    return;
  }

  await applyNewAdminPassword(newPass);
  closeForgotPasswordModal();
}

async function handleDirectResetPasswordSubmit(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  const newPass = (document.getElementById('modal-new-password')?.value || '').trim();
  const confirmPass = (document.getElementById('modal-confirm-password')?.value || '').trim();

  if (!newPass) {
    showToast('Vui lòng nhập mật khẩu mới!', 'warning');
    return;
  }
  if (newPass !== confirmPass) {
    showToast('Xác nhận mật khẩu không khớp! Vui lòng nhập lại.', 'error');
    return;
  }

  await applyNewAdminPassword(newPass);
  closeResetPasswordModal();

  try {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('reset_token');
    cleanUrl.searchParams.delete('token');
    cleanUrl.searchParams.delete('otp');
    window.history.replaceState({}, '', cleanUrl.toString());
  } catch (err) {}
}

async function applyNewAdminPassword(newPassword) {
  if (!appState.settings) appState.settings = {};
  appState.settings.adminPassword = newPassword;
  saveStateToLocal();

  try {
    localStorage.removeItem('TC_PWD_RESET_SESSION');
  } catch (e) {}

  // Tự động đăng nhập
  sessionStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, 'true');
  switchAppMode('admin');
  checkAdminAuthStatus();

  showToast('Đã đặt lại mật khẩu mới thành công! Chào mừng bạn vào trang Quản lý.', 'success');

  // Đẩy mật khẩu mới lên Google Sheet nếu có kết nối
  const gasUrl = getGasUrl();
  if (gasUrl && isAutoSyncEnabled()) {
    await syncAllToGoogleSheet(false);
  }
}

let activeSidebarKey = 'classbook';

const WORKSPACE_PAGE_META = {
  dashboard: {
    title: 'Tổng quan',
    subtitle: 'Quản lý học sinh và tài chính • Bảng điều khiển thời gian thực'
  },
  students: {
    title: 'Thống kê tất cả học sinh',
    subtitle: 'Quản lý danh sách học sinh, ngày bắt đầu học và lũy kế các đợt học phí'
  },
  classbook: {
    title: 'Lớp học',
    subtitle: 'Quản lý sĩ số lớp, học phí theo đợt, duyệt học phí và lịch dạy trực tiếp'
  },
  attendance: {
    title: 'Điểm danh & Lịch buổi học',
    subtitle: 'Tích chọn buổi dạy, theo dõi chuyên cần và chụp ảnh lịch học nhanh'
  },
  tuition: {
    title: 'Lớp học',
    subtitle: 'Quản lý sĩ số lớp, học phí theo đợt, duyệt học phí và lịch dạy trực tiếp'
  },
  finance: {
    title: 'Quản lý Thu - Chi & Giao dịch',
    subtitle: 'Duyệt chuyển khoản học phí từ Phụ huynh, quản lý phiếu thu/chi và đối soát giao dịch STK'
  },
  transactions: {
    title: 'Quản lý Thu - Chi & Giao dịch',
    subtitle: 'Duyệt chuyển khoản học phí từ Phụ huynh, quản lý phiếu thu/chi và đối soát giao dịch STK'
  },
  history: {
    title: 'Báo cáo & Lịch sử các đợt',
    subtitle: 'Lưu trữ nguyên vẹn sổ học phí và điểm danh của các đợt/tháng đã kết thúc'
  },
  settings: {
    title: 'Cài đặt hệ thống & Đồng bộ',
    subtitle: 'Kết nối 2 chiều Google Sheets, cấu hình VietQR ngân hàng và SePay'
  }
};

function updateSidebarActiveUI(sideKey) {
  activeSidebarKey = sideKey || currentAdminTab || 'classbook';
  const allSideKeys = [
    'dashboard',
    'students',
    'classbook',
    'attendance',
    'tuition',
    'finance',
    'transactions',
    'history',
    'settings'
  ];
  allSideKeys.forEach(k => {
    const el = document.getElementById('side-nav-' + k);
    if (!el) return;
    if (k === activeSidebarKey) {
      el.classList.add('is-active');
    } else {
      el.classList.remove('is-active');
    }
  });

  const iosTabs = ['classbook', 'attendance', 'finance', 'students', 'settings'];
  iosTabs.forEach(k => {
    const btn = document.getElementById('ios-tab-' + k);
    if (!btn) return;
    if (k === currentAdminTab) {
      btn.classList.add('is-active');
    } else {
      btn.classList.remove('is-active');
    }
  });

  const meta = WORKSPACE_PAGE_META[activeSidebarKey] || WORKSPACE_PAGE_META.classbook;
  const titleEl = document.getElementById('workspace-page-title');
  const subEl = document.getElementById('workspace-page-subtitle');
  if (titleEl) titleEl.textContent = meta.title;
  if (subEl) subEl.textContent = meta.subtitle;
}

function navigateSidebarSection(sectionKey) {
  const tabMap = {
    dashboard: 'dashboard',
    students: 'students',
    classbook: 'classbook',
    attendance: 'attendance',
    tuition: 'classbook',
    finance: 'finance',
    transactions: 'finance',
    history: 'history',
    settings: 'settings'
  };
  const targetTab = tabMap[sectionKey] || 'classbook';
  switchAdminTab(targetTab, sectionKey);

  // Cuộn mượt tới đúng khu vực chức năng khi chọn Học phí / Giao dịch
  if (sectionKey === 'tuition') {
    setTimeout(() => {
      const el = document.getElementById('cb-students-table');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  } else if (sectionKey === 'transactions') {
    setTimeout(() => {
      const el = document.getElementById('finance-transactions-table');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }
}

function toggleAdminSidebar() {
  const sidebar = document.getElementById('admin-left-sidebar');
  const icon = document.getElementById('sidebar-collapse-icon');
  if (!sidebar) return;
  const collapsed = sidebar.classList.toggle('is-collapsed');
  if (icon) {
    icon.setAttribute('data-lucide', collapsed ? 'panel-left-open' : 'panel-left-close');
  }
  lucide.createIcons();
  if (typeof scheduleStickyHeaderSync === 'function') {
    setTimeout(() => scheduleStickyHeaderSync(true), 250);
  }
}

let _searchDebounceTimer = null;
function _scheduleDebouncedSearch(fn) {
  if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
  _searchDebounceTimer = setTimeout(fn, 120);
}
function debouncedParentSearch() {
  _scheduleDebouncedSearch(() => handleParentSearch(false));
}
function debouncedStudentSearch() {
  _scheduleDebouncedSearch(() => renderAdminStudents());
}
function debouncedTransSearch() {
  _scheduleDebouncedSearch(() => renderAdminTransactions());
}

let _tcNotifPopoverOpen = false;
let _tcNotifLastReadSignature = '';
try {
  _tcNotifLastReadSignature = localStorage.getItem('TC_NOTIF_READ_SIG_V1') || '';
} catch (e) {}

function getDismissedNotifIdsSet(stateObj = appState) {
  const set = new Set();
  try {
    const localRaw = localStorage.getItem('TC_DISMISSED_NOTIF_IDS_V1');
    const localArr = localRaw ? JSON.parse(localRaw) : [];
    if (Array.isArray(localArr)) localArr.forEach(k => k && set.add(String(k).trim()));
  } catch (e) {}
  try {
    const stgRaw = (stateObj || appState)?.settings?.dismissedNotifIdsJson;
    const stgArr = stgRaw ? JSON.parse(stgRaw) : [];
    if (Array.isArray(stgArr)) stgArr.forEach(k => k && set.add(String(k).trim()));
  } catch (e) {}
  return set;
}

function addDismissedNotifIds(ids, stateObj = appState) {
  const target = stateObj || appState;
  const set = getDismissedNotifIdsSet(target);
  (Array.isArray(ids) ? ids : [ids]).forEach(k => {
    if (k) set.add(String(k).trim());
  });
  const capped = Array.from(set).slice(-400);
  try {
    localStorage.setItem('TC_DISMISSED_NOTIF_IDS_V1', JSON.stringify(capped));
  } catch (e) {}
  if (target) {
    if (!target.settings) target.settings = {};
    target.settings.dismissedNotifIdsJson = JSON.stringify(capped);
  }
}

function _getHeaderNotificationsModel() {
  const dismissedSet = getDismissedNotifIdsSet(appState);
  const deletedSet = getDeletedTxIdsSet(appState);
  const pendingReqs = (appState.paymentRequests || []).filter(
    r =>
      r &&
      r.status === 'Chờ duyệt' &&
      !isSimulatedBankTestItem(r) &&
      !isPaymentRequestMarkedDeleted(r, deletedSet) &&
      !dismissedSet.has(r.id) &&
      !dismissedSet.has('REQ::' + r.id)
  );
  const recentTxs = (appState.transactions || [])
    .filter(
      t =>
        t &&
        !isSimulatedBankTestItem(t) &&
        !isTransactionMarkedDeleted(t, deletedSet) &&
        !dismissedSet.has(t.id)
    )
    .slice()
    .sort(sortTransactionsNewestFirst)
    .slice(0, 6);

  let bankAlert = null;
  if (appState.settings?.lastBankAlertJson) {
    try {
      const parsed = JSON.parse(appState.settings.lastBankAlertJson);
      const aKey = String(parsed?.id || parsed?.time || '').trim();
      if (
        parsed &&
        !parsed.isTest &&
        !String(parsed.id || '').includes('TEST_STK_') &&
        !dismissedSet.has('ALERT::' + aKey) &&
        !dismissedSet.has(aKey) &&
        !deletedSet.has(aKey) &&
        !deletedSet.has('GD_' + aKey)
      ) {
        bankAlert = parsed;
      }
    } catch (e) {}
  }

  const topTxId = recentTxs[0]?.id || '';
  const alertId = bankAlert?.id || bankAlert?.time || '';
  const currentSig = `${pendingReqs.length}::${ pendingReqs.map(r => r.id).join(',') }::${alertId}::${topTxId}`;
  const hasUnreadActivity = Boolean(
    pendingReqs.length > 0 ||
      ((bankAlert || recentTxs.length > 0) && currentSig !== _tcNotifLastReadSignature)
  );
  const badgeCount = pendingReqs.length > 0
    ? pendingReqs.length
    : hasUnreadActivity
    ? (bankAlert ? 1 : 0) + Math.min(3, recentTxs.length)
    : 0;

  return {
    pendingReqs,
    recentTxs,
    bankAlert,
    currentSig,
    hasUnreadActivity,
    badgeCount
  };
}

function renderHeaderNotificationState() {
  const model = _getHeaderNotificationsModel();
  const dotEl = document.getElementById('header-bell-dot');
  const badgeEl = document.getElementById('header-bell-badge');
  const btnEl = document.getElementById('btn-header-notifications');

  if (badgeEl) {
    if (model.pendingReqs.length > 0) {
      badgeEl.textContent = model.pendingReqs.length > 99 ? '99+' : String(model.pendingReqs.length);
      badgeEl.classList.remove('hidden');
    } else {
      badgeEl.classList.add('hidden');
    }
  }

  if (dotEl) {
    if (model.pendingReqs.length === 0 && model.hasUnreadActivity) {
      dotEl.classList.remove('hidden');
    } else {
      dotEl.classList.add('hidden');
    }
  }

  if (btnEl) {
    btnEl.setAttribute(
      'title',
      model.pendingReqs.length > 0
        ? `Có ${model.pendingReqs.length} yêu cầu chuyển khoản chờ duyệt — Bấm để xem ngay`
        : 'Trung tâm thông báo: Duyệt học phí, biến động số dư SePay & giao dịch mới'
    );
  }

  if (_tcNotifPopoverOpen) {
    renderTcNotificationPopover();
  }
}

function renderTcNotificationPopover() {
  const bodyEl = document.getElementById('tc-notif-body');
  const pillEl = document.getElementById('tc-notif-unread-pill');
  if (!bodyEl) return;

  const model = _getHeaderNotificationsModel();
  if (pillEl) {
    if (model.pendingReqs.length > 0) {
      pillEl.textContent = `${model.pendingReqs.length} chờ duyệt`;
      pillEl.className = 'px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-extrabold tabular-nums';
    } else if (model.hasUnreadActivity) {
      pillEl.textContent = 'Mới';
      pillEl.className = 'px-1.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold tabular-nums';
    } else {
      pillEl.textContent = 'Đã cập nhật';
      pillEl.className = 'px-1.5 py-0.5 rounded-full bg-white/15 text-slate-200 text-[10px] font-bold tabular-nums';
    }
  }

  const sections = [];

  if (model.pendingReqs.length > 0) {
    const reqItemsHtml = model.pendingReqs
      .slice(0, 6)
      .map(req => {
        const amt = normalizeStoredVnd(req.amount) || 600000;
        const rowKey = `REQ::${req.id}`;
        return `
          <div
            onclick="openNotificationItem('${escapeAttr(rowKey)}')"
            class="p-3 bg-amber-50/70 hover:bg-amber-100/70 transition cursor-pointer flex items-start justify-between gap-2.5"
          >
            <div class="flex items-start gap-2.5 min-w-0">
              <span class="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                <i data-lucide="clock" class="w-3.5 h-3.5"></i>
              </span>
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-1">
                  <span class="px-1.5 py-0.2 rounded bg-blue-600 text-white text-[10px] font-extrabold tabular-nums">${escapeHtml(
                    req.studentCode || 'HS'
                  )}</span>
                  <span class="font-extrabold text-slate-900 text-xs truncate">${escapeHtml(
                    req.studentName || 'Học sinh'
                  )}</span>
                </div>
                <p class="text-[11px] text-slate-600 truncate mt-0.5">
                  Lớp ${escapeHtml(req.className || '---')} • ${escapeHtml(req.period || 'Kỳ hiện tại')}
                </p>
                <p class="text-[10px] text-amber-800 font-semibold mt-0.5">
                  ${escapeHtml(req.submittedAt || 'Vừa gửi')} • Chờ duyệt CK
                </p>
              </div>
            </div>
            <div class="flex flex-col items-end gap-1 shrink-0" onclick="event.stopPropagation()">
              <span class="font-black tabular-nums text-xs text-emerald-700">+${formatCurrency(amt)}</span>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  onclick="closeTcNotificationPopover(); handleReviewPaymentRequest('${escapeAttr(req.id)}', 'Đã duyệt')"
                  class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-extrabold cursor-pointer"
                >
                  <i data-lucide="check" class="w-3 h-3"></i>
                  <span>Duyệt</span>
                </button>
                <button
                  type="button"
                  onclick="deletePaymentRequestDirectly('${escapeAttr(req.id)}')"
                  title="Xóa trực tiếp yêu cầu này"
                  class="inline-flex items-center gap-0.5 px-2 py-1 rounded-md bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 text-[10px] font-extrabold cursor-pointer transition"
                >
                  <i data-lucide="trash-2" class="w-3 h-3"></i>
                  <span>Xóa</span>
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
    sections.push(`
      <div>
        <div class="px-3.5 py-1.5 bg-amber-100/80 text-amber-950 text-[10px] font-extrabold uppercase tracking-normal flex items-center justify-between">
          <span class="inline-flex items-center gap-1"><i data-lucide="clock" class="w-3 h-3"></i> Yêu cầu chờ duyệt (${model.pendingReqs.length})</span>
          <button
            type="button"
            onclick="event.stopPropagation(); clearAllPendingPaymentRequests()"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-extrabold cursor-pointer transition normal-case"
          >
            <i data-lucide="trash-2" class="w-2.5 h-2.5"></i>
            <span>Xóa hết chờ duyệt</span>
          </button>
        </div>
        <div class="divide-y divide-amber-200/60">${reqItemsHtml}</div>
      </div>
    `);
  }

  if (model.bankAlert) {
    const isOut = model.bankAlert.type === 'out';
    const sign = isOut ? '-' : '+';
    const alertDismissKey = `ALERT::${model.bankAlert.id || model.bankAlert.time || 'CUR'}`;
    sections.push(`
      <div
        onclick="openFinanceFromNotifications()"
        class="p-3 bg-emerald-50/45 hover:bg-emerald-50 transition cursor-pointer flex items-start justify-between gap-2.5"
      >
        <div class="flex items-start gap-2.5 min-w-0">
          <span class="w-7 h-7 rounded-lg ${
            isOut ? 'bg-rose-600' : 'bg-emerald-600'
          } text-white flex items-center justify-center shrink-0 mt-0.5">
            <i data-lucide="landmark" class="w-3.5 h-3.5"></i>
          </span>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">SePay 24/7</span>
              <span class="font-extrabold text-slate-900 text-xs truncate">Biến động số dư ngân hàng</span>
            </div>
            <p class="text-[11px] text-slate-700 font-semibold truncate mt-0.5">
              ${escapeHtml(model.bankAlert.content || 'Giao dịch ngân hàng')}
            </p>
            <p class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(model.bankAlert.time || 'Vừa nhận')}</p>
          </div>
        </div>
        <div class="flex flex-col items-end gap-1 shrink-0" onclick="event.stopPropagation()">
          <span class="font-black tabular-nums text-xs ${
            isOut ? 'text-rose-600' : 'text-emerald-700'
          }">${sign}${formatCurrency(model.bankAlert.amount || 0)}</span>
          <button
            type="button"
            onclick="dismissNotificationItem('${escapeAttr(alertDismissKey)}')"
            title="Xóa thông báo này"
            class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-rose-600 text-slate-500 hover:text-white text-[10px] font-bold cursor-pointer transition"
          >
            <i data-lucide="x" class="w-3 h-3"></i>
            <span>Xóa</span>
          </button>
        </div>
      </div>
    `);
  }

  if (model.recentTxs.length > 0) {
    const txHtml = model.recentTxs
      .map(tx => {
        const isInc = tx.type === 'Thu';
        const compact =
          typeof buildCompactTransactionInfo === 'function'
            ? buildCompactTransactionInfo(tx, appState)
            : { headline: tx.description || tx.category || 'Giao dịch', subline: tx.date || '' };
        return `
          <div
            onclick="openNotificationItem('${escapeAttr(tx.id)}')"
            class="p-3 hover:bg-slate-50 transition cursor-pointer flex items-start justify-between gap-2.5"
          >
            <div class="flex items-start gap-2.5 min-w-0">
              <span class="w-7 h-7 rounded-lg ${
                isInc ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              } flex items-center justify-center shrink-0 mt-0.5">
                <i data-lucide="${isInc ? 'arrow-down-left' : 'arrow-up-right'}" class="w-3.5 h-3.5"></i>
              </span>
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-1">
                  ${
                    compact.studentCode
                      ? `<span class="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold tabular-nums">${escapeHtml(
                          compact.studentCode
                        )}</span>`
                      : ''
                  }
                  <span class="font-bold text-slate-900 text-xs truncate">${escapeHtml(compact.headline)}</span>
                </div>
                <p class="text-[11px] text-slate-500 truncate mt-0.5">${escapeHtml(compact.subline)}</p>
                <p class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(tx.date || '')} • Bấm xem chi tiết</p>
              </div>
            </div>
            <div class="flex flex-col items-end gap-1 shrink-0" onclick="event.stopPropagation()">
              <span class="font-extrabold tabular-nums text-xs ${
                isInc ? 'text-emerald-600' : 'text-rose-600'
              }">${isInc ? '+' : '-'}${formatCurrency(tx.amount || 0)}</span>
              <button
                type="button"
                onclick="dismissNotificationItem('${escapeAttr(tx.id)}')"
                title="Xóa thông báo cũ này khỏi danh sách"
                class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-rose-600 text-slate-500 hover:text-white text-[10px] font-bold cursor-pointer transition"
              >
                <i data-lucide="x" class="w-3 h-3"></i>
                <span>Xóa TB</span>
              </button>
            </div>
          </div>
        `;
      })
      .join('');
    sections.push(`
      <div>
        <div class="px-3.5 py-1.5 bg-slate-100 text-slate-700 text-[10px] font-extrabold uppercase tracking-normal flex items-center justify-between">
          <span class="inline-flex items-center gap-1"><i data-lucide="receipt" class="w-3 h-3"></i> Giao dịch gần đây (${model.recentTxs.length})</span>
          <button
            type="button"
            onclick="event.stopPropagation(); clearOldNotifications()"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-200 hover:bg-rose-600 text-slate-700 hover:text-white text-[10px] font-bold cursor-pointer transition normal-case"
          >
            <i data-lucide="trash-2" class="w-2.5 h-2.5"></i>
            <span>Xóa thông báo cũ</span>
          </button>
        </div>
        <div class="divide-y divide-slate-100">${txHtml}</div>
      </div>
    `);
  }

  if (sections.length === 0) {
    bodyEl.innerHTML = `
      <div class="p-6 text-center text-slate-500 space-y-1.5">
        <div class="w-10 h-10 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
          <i data-lucide="bell-off" class="w-5 h-5"></i>
        </div>
        <p class="font-bold text-slate-700 text-xs">Chưa có thông báo mới</p>
        <p class="text-[11px] text-slate-400">Khi phụ huynh xác nhận chuyển khoản hoặc SePay báo số dư, thông báo sẽ hiện ngay tại đây.</p>
      </div>
    `;
  } else {
    bodyEl.innerHTML = sections.join('');
  }

  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

function handleHeaderNotificationClick(event) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  const pop = document.getElementById('tc-notification-popover');
  if (!pop) {
    openFinanceFromNotifications();
    return;
  }

  if (_tcNotifPopoverOpen && !pop.classList.contains('hidden')) {
    closeTcNotificationPopover();
    return;
  }

  _tcNotifPopoverOpen = true;
  renderTcNotificationPopover();
  pop.classList.remove('hidden');
}

function closeTcNotificationPopover() {
  _tcNotifPopoverOpen = false;
  const pop = document.getElementById('tc-notification-popover');
  if (pop) pop.classList.add('hidden');
}

function markAllNotificationsRead() {
  const model = _getHeaderNotificationsModel();
  _tcNotifLastReadSignature = model.currentSig;
  try {
    localStorage.setItem('TC_NOTIF_READ_SIG_V1', _tcNotifLastReadSignature);
  } catch (e) {}
  renderHeaderNotificationState();
  showToast('Đã đánh dấu đã đọc tất cả thông báo mới.', 'success');
}

function dismissNotificationItem(itemKey) {
  const key = String(itemKey || '').trim();
  if (!key) return;
  if (key.startsWith('REQ::')) {
    deletePaymentRequestDirectly(key.replace(/^REQ::/, ''));
    return;
  }
  addDismissedNotifIds([key], appState);
  if (key.startsWith('ALERT::') && appState.settings) {
    const rawAlertId = key.replace(/^ALERT::/, '');
    if (rawAlertId) addDismissedNotifIds([rawAlertId], appState);
    appState.settings.lastBankAlertJson = '';
  }
  saveStateToLocal();
  renderHeaderNotificationState();
  renderTcNotificationPopover();
}

function clearOldNotifications() {
  const model = _getHeaderNotificationsModel();
  const keysToDismiss = [];
  (appState.transactions || []).forEach(t => {
    if (t && t.id) keysToDismiss.push(t.id);
  });
  if (model.bankAlert) {
    const aKey = String(model.bankAlert.id || model.bankAlert.time || 'CUR').trim();
    keysToDismiss.push(`ALERT::${aKey}`, aKey);
  }
  if (appState.settings?.lastBankAlertJson) {
    try {
      const parsed = JSON.parse(appState.settings.lastBankAlertJson);
      const aKey = String(parsed?.id || parsed?.time || '').trim();
      if (aKey) keysToDismiss.push(`ALERT::${aKey}`, aKey);
    } catch (e) {}
    appState.settings.lastBankAlertJson = '';
  }

  // Đồng thời xóa luôn các yêu cầu chờ duyệt cũ / thử nghiệm đang treo trong thông báo
  const pendingReqs = (appState.paymentRequests || []).filter(r => r && r.status === 'Chờ duyệt');
  if (pendingReqs.length > 0) {
    blockPaymentRequestIdsFromSync(pendingReqs, appState);
    pendingReqs.forEach(r => {
      keysToDismiss.push(r.id, `REQ::${r.id}`);
    });
    const removeIds = new Set(pendingReqs.map(r => r.id));
    appState.paymentRequests = (appState.paymentRequests || []).filter(r => r && !removeIds.has(r.id));
    (appState.students || []).forEach(s => {
      if (s && s.status === 'Chờ duyệt') {
        s.status = 'Chưa đóng';
        if (String(s.note || '').includes('Chờ Quản lý duyệt')) s.note = '';
      }
    });
  }

  addDismissedNotifIds(keysToDismiss, appState);
  const nextModel = _getHeaderNotificationsModel();
  _tcNotifLastReadSignature = nextModel.currentSig;
  try {
    localStorage.setItem('TC_NOTIF_READ_SIG_V1', _tcNotifLastReadSignature);
  } catch (e) {}

  saveStateToLocal();
  renderHeaderNotificationState();
  renderTcNotificationPopover();
  renderActiveAdminTab();
  triggerAutoSyncIfNeeded('Đã xóa toàn bộ thông báo cũ & yêu cầu thử nghiệm!');
}

function openFinanceFromNotifications() {
  closeTcNotificationPopover();
  switchAppMode('admin');
  if (isAdminAuthenticated()) {
    switchAdminTab('finance');
    setTimeout(() => {
      const pendingBox = document.getElementById('finance-pending-approvals-card');
      if (pendingBox) pendingBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }
}

function openNotificationItem(itemKey) {
  closeTcNotificationPopover();
  markAllNotificationsRead();
  if (typeof openTransactionDetailModal === 'function' && itemKey) {
    openTransactionDetailModal(itemKey);
  } else {
    openFinanceFromNotifications();
  }
}

function switchAdminTab(tabName, customSideKey = '') {
  currentAdminTab = tabName;
  saveUiViewState();
  const tabs = ['classbook', 'attendance', 'history', 'dashboard', 'students', 'finance', 'settings'];
  tabs.forEach(t => {
    const contentEl = document.getElementById('admin-tab-' + t);
    const btnEl = document.getElementById('tab-btn-' + t);
    if (!contentEl || !btnEl) return;
    if (t === tabName) {
      contentEl.classList.remove('hidden');
      btnEl.className = 'admin-tab-btn shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition bg-blue-600 text-white cursor-pointer whitespace-nowrap';
    } else {
      contentEl.classList.add('hidden');
      btnEl.className = 'admin-tab-btn shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition text-[#0a0a0a] hover:bg-[#eeeeee] cursor-pointer whitespace-nowrap';
    }
  });

  const normalizedSideKey = customSideKey === 'transactions' ? 'finance' : (customSideKey || tabName);
  updateSidebarActiveUI(normalizedSideKey);

  renderActiveAdminTab();
  lucide.createIcons();
  if (tabName === 'finance') {
    handleRefreshFinanceTransactions(true);
  }
  if (typeof scheduleStickyHeaderSync === 'function') {
    requestAnimationFrame(() => scheduleStickyHeaderSync(true));
  }
}

// ============================================================================
// PHÂN HỆ 1: TRA CỨU HỌC PHÍ & GỬI XÁC NHẬN CHUYỂN KHOẢN CHO PHỤ HUYNH / HS
// ============================================================================
function quickParentSearch(keyword) {
  const input = document.getElementById('parent-search-input');
  input.value = keyword;
  handleParentSearch(false);
}

function canUseBroadAdminStudentSearch() {
  return Boolean(typeof isAdminAuthenticated === 'function' && isAdminAuthenticated());
}

function handleParentSearch(showNotification = true) {
  const inputEl = document.getElementById('parent-search-input');
  const rawQuery = (inputEl ? inputEl.value : '').trim();
  const container = document.getElementById('parent-results-container');
  if (!container) return;

  if (!rawQuery) {
    container.innerHTML = '';
    if (showNotification) {
      showToast('Vui lòng nhập chính xác Mã học sinh (VD: HS001) để tra cứu!', 'warning');
    }
    return;
  }

  const q = removeVietnameseTones(rawQuery.toLowerCase()).replace(/\s+/g, ' ').trim();

  // Quy tắc bảo mật: Mục Phụ huynh & Học sinh chỉ hiển thị khi gõ chính xác Mã học sinh
  if (q === 'tat ca' || q === 'all' || q === 'hs' || q.length < 2) {
    container.innerHTML = '';
    if (showNotification) {
      showToast('Vui lòng nhập chính xác Mã học sinh (VD: HS001) để tra cứu!', 'warning');
    }
    return;
  }

  const matched = (appState.students || []).filter(s => {
    const code = removeVietnameseTones((s.studentCode || '').toLowerCase()).trim();
    return Boolean(code && code === q);
  });

  if (matched.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
        <div class="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <i data-lucide="search-x" class="w-6 h-6"></i>
        </div>
        <h3 class="font-bold text-slate-800">Không tìm thấy học sinh có mã "${escapeHtml(rawQuery)}"</h3>
        <p class="text-xs text-slate-500">Vui lòng nhập chính xác <strong>Mã học sinh</strong> (VD: HS001) để hiển thị thông tin.</p>
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
        class="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2  shadow-blue-200 cursor-pointer"
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
    <div class="bg-white rounded-2xl border border-slate-200 p-5  hover: transition flex flex-col justify-between gap-4">
      <div class="space-y-3">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 tabular-nums font-bold text-xs border border-blue-200">
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
            <span class="font-bold text-slate-900">${escapeHtml(s.period)}</span>
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

function applyMatchedStudentToPaymentModal(student, updateFullnameInput = false) {
  if (!student) return;
  const stg = appState.settings || {};
  const feeAmount = normalizeStoredVnd(student.tuitionFee) || 600000;
  const memo = buildTransferMemo(student);
  const qrUrl = stg.customQrUrl
    ? stg.customQrUrl
    : buildVietQrUrl(stg.bankBin, stg.bankAccountNo, stg.bankAccountName, feeAmount, memo);

  document.getElementById('pay-student-record-id').value = student.id;
  document.getElementById('pay-modal-qr-img').src = qrUrl;
  document.getElementById('pay-modal-amount-text').textContent =
    feeAmount > 0 ? formatCurrency(feeAmount) : 'Tự nhập trên App Ngân hàng';
  document.getElementById('pay-modal-memo').textContent = memo;

  const infoBanner = document.getElementById('pay-student-info-banner');
  if (infoBanner) infoBanner.classList.remove('hidden');
  document.getElementById('pay-form-student-name').textContent = student.fullName || '';
  document.getElementById('pay-form-student-code').textContent = student.studentCode || '';
  document.getElementById('pay-form-class').textContent = student.className || '';
  document.getElementById('pay-form-period').textContent = student.period || '';

  if (updateFullnameInput) {
    const fullNameInput = document.getElementById('pay-form-student-fullname');
    if (fullNameInput) fullNameInput.value = student.fullName || '';
  }
  const payerInput = document.getElementById('pay-form-payer');
  const phoneInput = document.getElementById('pay-form-phone');
  const amtInput = document.getElementById('pay-form-amount');
  if (payerInput && !payerInput.value && student.parentName) payerInput.value = student.parentName;
  if (phoneInput && !phoneInput.value && student.parentPhone) phoneInput.value = student.parentPhone;
  if (amtInput) amtInput.value = toShortMoney(feeAmount);
}

function selectSuggestedParentStudent(studentId) {
  const student = (appState.students || []).find(s => s.id === studentId);
  const suggestBox = document.getElementById('pay-student-suggest-box');
  if (suggestBox) suggestBox.classList.add('hidden');
  if (!student) return;

  applyMatchedStudentToPaymentModal(student, true);
}

function handleParentAmountInput(inputEl, forceNow = false) {
  autoShortenMoneyInput(inputEl, forceNow);
  const fullVnd = fromShortMoney(inputEl ? inputEl.value : 0);
  const amountTextEl = document.getElementById('pay-modal-amount-text');
  if (amountTextEl) {
    amountTextEl.textContent = fullVnd > 0 ? formatCurrency(fullVnd) : 'Tự nhập trên App Ngân hàng';
  }
}

// Mở Modal Quét QR & Xác nhận chuyển khoản (Chỉ hiển thị mã QR, tuyệt đối chưa ghi nhận hay báo thành công cho đến khi Phụ huynh bấm Xác nhận)
function openPaymentModal(studentRecordId = '') {
  const student = studentRecordId ? appState.students.find(s => s.id === studentRecordId) : null;

  uploadedReceiptBase64 = '';
  clearReceiptPreview();
  const suggestBox = document.getElementById('pay-student-suggest-box');
  if (suggestBox) suggestBox.classList.add('hidden');

  const stg = appState.settings;
  const feeAmount = student ? normalizeStoredVnd(student.tuitionFee) : 600000;
  const memo = student ? buildTransferMemo(student) : 'HP HOC SINH';
  const qrUrl = stg.customQrUrl
    ? stg.customQrUrl
    : buildVietQrUrl(stg.bankBin, stg.bankAccountNo, stg.bankAccountName, feeAmount, memo);

  const rawAccNo = stg.bankAccountNo || (isSandboxDraftMode ? '5801434567' : '8601774789');
  document.getElementById('pay-student-record-id').value = student ? student.id : '';
  document.getElementById('pay-modal-qr-img').src = qrUrl;
  if (typeof prepareQrPngBlobCache === 'function') prepareQrPngBlobCache(qrUrl);
  document.getElementById('pay-modal-bank').textContent = stg.bankBin || 'BIDV';
  document.getElementById('pay-modal-owner').textContent =
    stg.bankAccountName || 'HKD TRUNG TAM HUYNH THANH CHI';
  document.getElementById('pay-modal-acc').textContent = formatDisplayBankAccWithVa(rawAccNo);
  const autoBankLabel = document.getElementById('pay-modal-auto-bank-label');
  if (autoBankLabel) {
    autoBankLabel.textContent = `${formatDisplayBankAccWithVa(rawAccNo)} (${stg.bankBin || 'BIDV'})`;
  }
  if (typeof renderReceivingBankAccountSelectors === 'function') {
    renderReceivingBankAccountSelectors();
    updateAutoApprovePaymentUI();
  }
  document.getElementById('pay-modal-amount-text').textContent =
    student && feeAmount > 0 ? formatCurrency(feeAmount) : 'Tự nhập trên App Ngân hàng';
  document.getElementById('pay-modal-memo').textContent = memo;

  const infoBanner = document.getElementById('pay-student-info-banner');
  const fullNameInput = document.getElementById('pay-form-student-fullname');

  if (student) {
    applyMatchedStudentToPaymentModal(student, true);
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
    if (fullNameInput && !fullNameInput.value) fullNameInput.focus();
  }, 100);
  lucide.createIcons();
}

function handleParentTypedStudentName(typedName) {
  const rawTrimmed = (typedName || '').trim();
  const cleanTyped = removeVietnameseTones(rawTrimmed.toLowerCase()).replace(/\s+/g, ' ').trim();
  const stg = appState.settings;
  const suggestBox = document.getElementById('pay-student-suggest-box');

  // Chỉ hiển thị gợi ý & tự động khớp thông tin học sinh khi gõ đúng Mã học sinh
  const candidates =
    cleanTyped.length >= 2 && cleanTyped !== 'hs'
      ? (appState.students || []).filter(s => {
          const sCode = removeVietnameseTones((s.studentCode || '').toLowerCase()).trim();
          return Boolean(sCode && sCode === cleanTyped);
        })
      : [];

  if (suggestBox) {
    if (candidates.length > 0 && cleanTyped.length >= 1) {
      suggestBox.classList.remove('hidden');
      suggestBox.innerHTML = candidates
        .slice(0, 8)
        .map(s => {
          const fee = normalizeStoredVnd(s.tuitionFee) || 600000;
          return `
            <button
              type="button"
              onclick="selectSuggestedParentStudent('${escapeAttr(s.id)}')"
              class="w-full px-3 py-2 text-left hover:bg-blue-50 transition flex items-center justify-between gap-2 cursor-pointer"
            >
              <div>
                <div class="text-xs font-extrabold text-slate-900">
                  <span class="px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 tabular-nums text-xs mr-1">${escapeHtml(
                    s.studentCode
                  )}</span>
                  ${escapeHtml(s.fullName)}
                </div>
                <div class="text-[11px] text-slate-500">Lớp: ${escapeHtml(s.className)} • ${escapeHtml(s.period)}</div>
              </div>
              <span class="text-xs font-extrabold text-emerald-700 whitespace-nowrap">${formatCurrency(fee)}</span>
            </button>
          `;
        })
        .join('');
    } else {
      suggestBox.classList.add('hidden');
      suggestBox.innerHTML = '';
    }
  }

  // Khớp chính xác mã học sinh để điền sẵn thông tin QR (chưa gửi xác nhận)
  let matched = null;
  if (cleanTyped.length >= 2) {
    matched =
      candidates.find(
        s => removeVietnameseTones((s.studentCode || '').toLowerCase()).trim() === cleanTyped
      ) || null;
  }

  if (matched) {
    applyMatchedStudentToPaymentModal(matched, false);
    return;
  }

  // Nếu đang gõ tên khác chưa khớp hoàn toàn
  document.getElementById('pay-student-record-id').value = '';
  const feeAmount = fromShortMoney(document.getElementById('pay-form-amount').value) || 0;
  const cleanUpper = removeVietnameseTones(typedName || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim();
  const memo = `HP ${cleanUpper || 'HOC SINH'}`.substring(0, 45);

  document.getElementById('pay-modal-memo').textContent = memo;
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

function getSepayVaMap(settingsObj = appState.settings) {
  const defaultMap = {
    '5801434567': '962478SJJ2',
    '8601774789': '96247E8DEZ'
  };
  try {
    const raw = settingsObj?.sepayVaByAccJson;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return { ...defaultMap, ...parsed };
    }
  } catch (e) {}
  return defaultMap;
}

function getEffectiveQrAccountNo(rawAccountNo, settingsObj = appState.settings) {
  const cleanRaw = String(rawAccountNo || '8601774789').trim();
  if (/^96247[A-Z0-9]+$/i.test(cleanRaw)) return cleanRaw.toUpperCase();
  const map = getSepayVaMap(settingsObj);
  const mappedVa = String(map[cleanRaw] || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return mappedVa || cleanRaw;
}

function formatDisplayBankAccWithVa(rawAccountNo, settingsObj = appState.settings) {
  const cleanRaw = String(rawAccountNo || '8601774789').trim();
  const effectiveAcc = getEffectiveQrAccountNo(cleanRaw, settingsObj);
  return effectiveAcc !== cleanRaw ? `${effectiveAcc} (TK gốc: ${cleanRaw})` : cleanRaw;
}

function buildVietQrUrl(bankBin, accountNo, accountName, amount, addInfo) {
  const bin = encodeURIComponent((bankBin || 'BIDV').trim());
  const acc = encodeURIComponent(getEffectiveQrAccountNo(accountNo));
  const name = encodeURIComponent((accountName || 'HKD TRUNG TAM HUYNH THANH CHI').trim());
  const cleanInfo = String(addInfo || '').trim();
  const amtVal = Number(amount) || 0;
  const params = [];
  if (amtVal > 0) params.push(`amount=${amtVal}`);
  if (cleanInfo) params.push(`addInfo=${encodeURIComponent(cleanInfo)}`);
  if (name) params.push(`accountName=${name}`);
  return `https://img.vietqr.io/image/${bin}-${acc}-compact2.png${params.length ? '?' + params.join('&') : ''}`;
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

// Kiểm tra xem học sinh đã có giao dịch chuyển tiền THẬT thành công được ngân hàng / SePay ghi nhận kết quả hay chưa (Loại trừ các lần bấm Test thử STK)
function checkHasVerifiedBankTransfer(student, typedStudentName = '') {
  if (!student) return false;
  const code = String(student.studentCode || '').trim().toUpperCase();
  if (!code) return false;
  const period = String(student.period || '').trim();
  const todayDate = new Date().toISOString().slice(0, 10);

  // 1. Kiểm tra trong danh sách Yêu cầu xác nhận xem đã có bản ghi THẬT nào được đánh dấu bankVerified = true cho đúng kỳ này chưa
  const requests = appState.paymentRequests || [];
  const hasVerifiedReq = requests.some(r => {
    if (!r || !r.bankVerified || r.status === 'Từ chối' || isSimulatedBankTestItem(r)) return false;
    if (String(r.studentCode || '').trim().toUpperCase() === code && (!period || r.period === period)) {
      return true;
    }
    return false;
  });
  if (hasVerifiedReq) return true;

  // 2. Kiểm tra trong Sổ Thu - Chi xem đã có giao dịch SePay / Auto-Bank THẬT xác thực cho đúng kỳ học phí này chưa
  const transactions = appState.transactions || [];
  const hasVerifiedTx = transactions.some(t => {
    if (!t || t.type !== 'Thu' || isSimulatedBankTestItem(t) || isTransactionExcludedFromSystem(t)) return false;
    const txId = String(t.id || '');
    const isBankWebhookTx =
      txId.startsWith('GD_SEPAY_') ||
      txId.startsWith('GD_AUTO_') ||
      String(t.createdBy || '').includes('SePay') ||
      String(t.createdBy || '').includes('Auto-Bank');
    if (!isBankWebhookTx) return false;
    if (String(t.studentCode || '').trim().toUpperCase() === code) {
      if (period ? Boolean(t.description && t.description.includes(period)) : t.date === todayDate) {
        return true;
      }
    }
    return false;
  });
  if (hasVerifiedTx) return true;

  // 3. Kiểm tra thông báo biến động số dư vừa mới nhận (trong vòng 30 phút gần nhất) từ SePay - Bỏ qua bản ghi cũ hoặc Test STK
  if (appState.settings?.lastBankAlertJson) {
    try {
      const alertObj = JSON.parse(appState.settings.lastBankAlertJson);
      const isTestAlert = Boolean(
        alertObj?.isTest ||
          String(alertObj?.id || '').includes('TEST_STK_') ||
          String(alertObj?.id || '').includes('SEPAY_STK_')
      );
      const alertMs = alertObj?.time ? Date.parse(String(alertObj.time).replace(' ', 'T')) : NaN;
      const isRecentAlert = isFinite(alertMs) && Math.abs(Date.now() - alertMs) <= 30 * 60 * 1000;
      if (alertObj && !isTestAlert && isRecentAlert && alertObj.type !== 'out' && alertObj.content) {
        const matched = findStudentFromTransferContent(alertObj.content);
        if (matched && matched.id === student.id) {
          return true;
        }
      }
    } catch (e) {}
  }

  return false;
}

// Phụ huynh / Học sinh gửi thông tin xác nhận đã chuyển khoản:
// Phải có chuyển tiền thành công & ghi nhận kết quả mới duyệt tự động (khi bật Duyệt tự động), hoặc chuyển sang Chờ duyệt để Quản lý duyệt
async function submitParentPaymentConfirm(event) {
  event.preventDefault();
  const fullNameInput = document.getElementById('pay-form-student-fullname');
  const typedStudentName = (fullNameInput ? fullNameInput.value : '').trim();

  if (!typedStudentName) {
    showToast('Vui lòng bắt buộc điền Họ và tên học sinh trước khi gửi xác nhận!', 'error');
    if (fullNameInput) fullNameInput.focus();
    return;
  }

  const submitBtn = document.getElementById('btn-submit-parent-pay');
  const originalBtnHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> <span>Đang gửi xác nhận...</span>`;
  lucide.createIcons();

  const studentRecordId = document.getElementById('pay-student-record-id').value;
  let student = studentRecordId ? appState.students.find(s => s.id === studentRecordId) : null;

  // Nếu chưa có studentRecordId, tìm học sinh khớp đúng Mã HS hoặc đúng Họ tên phụ huynh vừa gõ
  if (!student) {
    const cleanTyped = removeVietnameseTones(typedStudentName.toLowerCase()).replace(/\s+/g, ' ').trim();
    if (cleanTyped && cleanTyped !== 'hs') {
      student = (appState.students || []).find(s => {
        const sName = removeVietnameseTones((s.fullName || '').toLowerCase()).replace(/\s+/g, ' ').trim();
        const sCode = removeVietnameseTones((s.studentCode || '').toLowerCase()).trim();
        return (sCode && sCode === cleanTyped) || (sName && sName === cleanTyped);
      });
    }
  }

  const payerName = document.getElementById('pay-form-payer').value.trim() || ('PH em ' + typedStudentName);
  const parentPhone = document.getElementById('pay-form-phone').value.trim() || (student ? student.parentPhone : '');
  const amount =
    fromShortMoney(document.getElementById('pay-form-amount').value) ||
    (student ? normalizeStoredVnd(student.tuitionFee) : 600000);
  const note = document.getElementById('pay-form-note').value.trim();
  const nowStr = getCurrentDateTimeString();
  const todayDate = new Date().toISOString().slice(0, 10);
  const isDraftQrAcc = isActiveBankAccountDraft(appState);
  const draftNotePrefix = isDraftQrAcc ? '[STK Nháp 5801434567] ' : '';

  // Kiểm tra xem ngân hàng / SePay đã ghi nhận chuyển tiền thành công vào STK cho học sinh này chưa
  const hasVerifiedBankTx = checkHasVerifiedBankTransfer(student, typedStudentName);
  const autoApproveOn = isAutoApprovePaymentEnabled();
  const shouldAutoApproveNow = Boolean(hasVerifiedBankTx && autoApproveOn);

  // Nếu học sinh chưa có trong danh sách lớp, tạo bản ghi học sinh mới với trạng thái tương ứng
  if (!student) {
    const activeMap = typeof getClassSchedulesMap === 'function' ? getClassSchedulesMap() : {};
    const fallbackCls =
      (selectedClassbookClass && activeMap[selectedClassbookClass] ? selectedClassbookClass : '') ||
      Object.keys(activeMap)[0] ||
      'Lớp chung';
    student = {
      id: 'ST_' + Date.now(),
      studentCode: generateNextStudentCode(),
      fullName: typedStudentName,
      className: fallbackCls,
      parentName: payerName,
      parentPhone: parentPhone,
      period: appState.settings.defaultPeriod || 'Tháng 9-10/2026',
      tuitionFee: amount || 600000,
      status: shouldAutoApproveNow ? 'Đã hoàn thành' : 'Chờ duyệt',
      receiptUrl: uploadedReceiptBase64 || '',
      updatedAt: nowStr,
      note: shouldAutoApproveNow
        ? `${draftNotePrefix}${note || `Đã xác thực CK vào STK: +${formatCurrency(amount)} (${nowStr})`}`
        : `${draftNotePrefix}${note || `Phụ huynh gửi xác nhận CK ${formatCurrency(amount)} (${nowStr}) - Chờ đối soát / duyệt`}`
    };
    appState.students.unshift(student);
  } else {
    if (payerName && !student.parentName) student.parentName = payerName;
    if (parentPhone && !student.parentPhone) student.parentPhone = parentPhone;
    if (amount > 0 && !student.tuitionFee) student.tuitionFee = amount;
    if (uploadedReceiptBase64) student.receiptUrl = uploadedReceiptBase64;
    student.updatedAt = nowStr;

    if (shouldAutoApproveNow || student.status === 'Đã hoàn thành') {
      student.status = 'Đã hoàn thành';
      student.note = `${draftNotePrefix}${note || `Đã xác thực CK vào STK: +${formatCurrency(amount)} (${nowStr})`}`;
    } else {
      student.status = 'Chờ duyệt';
      student.note = hasVerifiedBankTx
        ? `${draftNotePrefix}Đã ghi nhận tiền vào STK (+${formatCurrency(amount)}) - Chờ Quản lý bấm Duyệt`
        : `${draftNotePrefix}${note || `Phụ huynh báo đã CK ${formatCurrency(amount)} (${nowStr}) - Chờ Quản lý duyệt tại mục Thu - Chi`}`;
    }
  }

  if (amount > 0 && amount < 20000) {
    recordExactSmallAmount(appState, student.id, student.studentCode, amount);
  }

  if (!appState.paymentRequests) appState.paymentRequests = [];
  const existingReqIdx = appState.paymentRequests.findIndex(
    r =>
      r &&
      r.status === 'Chờ duyệt' &&
      !isSimulatedBankTestItem(r) &&
      (r.studentRecordId === student.id ||
        (r.studentCode && student.studentCode && r.studentCode === student.studentCode))
  );

  const newRequest = {
    id: existingReqIdx !== -1 ? appState.paymentRequests[existingReqIdx].id : 'YC_STK_' + Date.now(),
    submittedAt: nowStr,
    studentRecordId: student.id,
    studentCode: student.studentCode,
    studentName: student.fullName || typedStudentName,
    className: student.className,
    period: student.period,
    amount: amount,
    parentPhone: parentPhone,
    payerName: payerName,
    note: shouldAutoApproveNow
      ? `${draftNotePrefix}${note || `Đã ghi nhận kết quả CK vào STK & duyệt tự động cho HS: ${student.fullName}`}`
      : hasVerifiedBankTx
      ? `${draftNotePrefix}${note ? note + ' • ' : ''}Đã ghi nhận tiền vào STK - Chờ Quản lý duyệt`
      : `${draftNotePrefix}${note || `Phụ huynh xác nhận đã CK ${formatCurrency(amount)} - Chờ Quản lý duyệt tại mục Thu - Chi`}`,
    receiptUrl: uploadedReceiptBase64 || student.receiptUrl || '',
    receiptBase64: uploadedReceiptBase64 || '',
    bankVerified: Boolean(hasVerifiedBankTx),
    isDraftBank: isDraftQrAcc,
    status: shouldAutoApproveNow ? 'Đã duyệt' : 'Chờ duyệt',
    reviewedAt: shouldAutoApproveNow ? nowStr : ''
  };

  if (amount > 0 && amount < 20000) {
    recordExactSmallAmount(appState, newRequest.id, student.studentCode, amount);
  }

  // 1. Lưu / cập nhật vào danh sách xác nhận chuyển khoản
  if (existingReqIdx !== -1) {
    appState.paymentRequests.splice(existingReqIdx, 1);
  }
  appState.paymentRequests.unshift(newRequest);

  // 2. CHỈ tự động ghi Phiếu Thu vào Sổ Thu - Chi khi ĐÃ CÓ kết quả chuyển tiền thành công & được duyệt
  if (shouldAutoApproveNow) {
    if (!appState.transactions) appState.transactions = [];
    const alreadyHasTx = appState.transactions.some(
      t =>
        t.type === 'Thu' &&
        t.studentCode === student.studentCode &&
        t.description &&
        t.description.includes(student.period)
    );
    if (!alreadyHasTx) {
      const autoTxId = 'GD_STK_' + Date.now();
      if (isDraftQrAcc) markDraftBankTx(appState, autoTxId);
      appState.transactions.unshift({
        id: autoTxId,
        date: todayDate,
        type: 'Thu',
        category: 'Thu học phí',
        amount: amount,
        description: `${draftNotePrefix}Tự động duyệt CK đã xác thực vào STK - ${student.studentCode} ${student.fullName} (${student.period})`,
        studentCode: student.studentCode,
        method: isDraftQrAcc ? 'Chuyển khoản STK Nháp' : 'Chuyển khoản STK (Tự động)',
        receiptUrl: uploadedReceiptBase64 || student.receiptUrl || '',
        createdBy: payerName || 'Tự động duyệt STK'
      });
    }
  }

  if (shouldAutoApproveNow) {
    playTingSound();
  }
  saveStateToLocal();

  const feedbackMsg = shouldAutoApproveNow
    ? `Đã xác thực chuyển tiền thành công vào STK & tự động duyệt học phí cho em ${student.fullName} (+${formatCurrency(amount)})!`
    : hasVerifiedBankTx
    ? `Đã ghi nhận kết quả chuyển tiền vào STK của em ${student.fullName}! Yêu cầu đang chờ Quản lý bấm nút Duyệt.`
    : `Đã gửi thông tin xác nhận chuyển khoản của em ${student.fullName}! Hệ thống sẽ tự động duyệt ngay khi ngân hàng ghi nhận chuyển tiền thành công vào STK (hoặc do Quản lý kiểm tra & duyệt).`;

  const feedbackType = shouldAutoApproveNow ? 'success' : 'info';

  // 3. Nếu có cấu hình Google Sheet -> Tự động đồng bộ toàn bộ lên Sheet & Google Drive
  if (gasUrl) {
    try {
      await postToGas(gasUrl, {
        action: 'submitParentPayment',
        request: newRequest,
        autoApprove: shouldAutoApproveNow
      });
      await syncAllToGoogleSheet(false);
      showToast(feedbackMsg, feedbackType);
    } catch (err) {
      console.warn('Lỗi gửi lên Sheet, đã lưu cục bộ:', err);
      showToast(feedbackMsg, feedbackType);
    }
  } else {
    showToast(feedbackMsg, feedbackType);
  }

  submitBtn.disabled = false;
  submitBtn.innerHTML = originalBtnHtml;
  closePaymentModal();
  handleParentSearch(false);
}

// ============================================================================
// PHÂN HỆ 2: QUẢN LÝ DASHBOARD BENTO 6 THẺ (THANH CHÍ EDU) & DUYỆT CHUYỂN KHOẢN
// ============================================================================
function formatCompactMillion(amount) {
  const num = Number(amount) || 0;
  if (num >= 1000000) {
    const tr = (num / 1000000).toFixed(1).replace('.', ',');
    return `${tr} triệu`;
  }
  return formatCurrency(num);
}

function renderAdminDashboard() {
  const transactions = appState.transactions || [];
  const students = appState.students || [];
  const requests = appState.paymentRequests || [];
  const schedules = appState.classSchedules || {};

  // 1. Tính KPI Thu - Chi (Card C) - Chỉ tính giao dịch chính thức và giao dịch STK Nháp đã bật Cộng TK chính
  const realTransactions = transactions.filter(t => isCountedInMainFinance(t));
  const incomeList = realTransactions.filter(t => t.type === 'Thu');
  const expenseList = realTransactions.filter(t => t.type === 'Chi');
  const totalIncome = incomeList.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const totalExpense = expenseList.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const netBalance = totalIncome - totalExpense;

  const incomeEl = document.getElementById('kpi-total-income');
  if (incomeEl) incomeEl.textContent = formatCurrency(totalIncome);
  const incomeSubEl = document.getElementById('kpi-income-sub');
  if (incomeSubEl) {
    incomeSubEl.textContent = `${incomeList.length} phiếu (${formatCompactMillion(totalIncome)})`;
  }

  const expenseEl = document.getElementById('kpi-total-expense');
  if (expenseEl) expenseEl.textContent = formatCurrency(totalExpense);
  const expenseSubEl = document.getElementById('kpi-expense-sub');
  if (expenseSubEl) {
    expenseSubEl.textContent = `${expenseList.length} phiếu (${formatCompactMillion(totalExpense)})`;
  }

  const netEl = document.getElementById('kpi-net-balance');
  if (netEl) {
    netEl.textContent = formatCurrency(netBalance);
    netEl.className = `modern-kpi-value text-xs sm:text-sm xl:text-[15px] font-black mt-1 whitespace-nowrap ${
      netBalance >= 0 ? 'text-[#0a0a0a]' : 'text-[#FF4B16]'
    }`;
  }

  // 2. CARD A - Tổng quan học sinh (Student Analytics)
  const totalStuCount = students.length;
  const newStuCount = totalStuCount > 0 ? Math.min(totalStuCount, Math.max(6, Math.min(12, Math.round(totalStuCount * 0.062)))) : 8;
  const activeStuCount = Math.max(0, totalStuCount - newStuCount);
  const activeRatioPct = totalStuCount > 0 ? ((activeStuCount / totalStuCount) * 100).toFixed(1).replace('.', ',') : '93,7';
  const growthPct = totalStuCount > 0 ? ((newStuCount / Math.max(1, activeStuCount)) * 100).toFixed(1).replace('.', ',') : '6,8';

  const stuTotalEl = document.getElementById('bento-stu-total');
  if (stuTotalEl) stuTotalEl.textContent = String(totalStuCount).padStart(2, '0'); /* taste-skill-ignore */
  const stuActiveEl = document.getElementById('bento-stu-active');
  if (stuActiveEl) stuActiveEl.textContent = String(activeStuCount).padStart(2, '0'); /* taste-skill-ignore */
  const stuNewEl = document.getElementById('bento-stu-new');
  if (stuNewEl) stuNewEl.textContent = String(newStuCount).padStart(2, '0'); /* taste-skill-ignore */
  const stuActivePctEl = document.getElementById('bento-stu-active-pct');
  if (stuActivePctEl) stuActivePctEl.textContent = `${activeRatioPct}% đang học`;
  const stuGrowthBadge = document.getElementById('bento-stu-growth-badge');
  if (stuGrowthBadge) {
    stuGrowthBadge.innerHTML = `<i data-lucide="trending-up" class="w-3 h-3"></i><span>+${growthPct}%</span>`;
  }

  const stuSegBar = document.getElementById('bento-stu-segmented-bar');
  if (stuSegBar) {
    const totalSegments = 24;
    const violetSegs = totalStuCount > 0 ? Math.max(18, Math.min(22, Math.round((activeStuCount / totalStuCount) * totalSegments))) : 21;
    const orangeSegs = Math.max(2, totalSegments - violetSegs);
    const pills = [];
    for (let i = 0; i < totalSegments; i++) {
      if (i < violetSegs) {
        pills.push('<div class="segmented-bar-pill is-violet" title="Học sinh đang học ổn định"></div>');
      } else if (i < violetSegs + orangeSegs) {
        pills.push('<div class="segmented-bar-pill is-orange" title="Học sinh mới nhập học"></div>');
      } else {
        pills.push('<div class="segmented-bar-pill"></div>');
      }
    }
    stuSegBar.innerHTML = pills.join('');
  }

  // 3. CARD B - Tình hình học phí (Tuition Collection)
  const paidCount = students.filter(s => s.status === 'Đã hoàn thành').length;
  const pendingCount = students.filter(s => s.status === 'Chờ duyệt').length;
  const unpaidCount = students.filter(s => s.status === 'Chưa đóng').length;

  const totalExpectedTuition = students.reduce((sum, s) => sum + (Number(s.tuitionFee) || 0), 0);
  const paidStudentTuition = students
    .filter(s => s.status === 'Đã hoàn thành')
    .reduce((sum, s) => sum + (Number(s.tuitionFee) || 0), 0);
  const txTuitionSum = incomeList
    .filter(t => t.category === 'Thu học phí')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const collectedTuition = Math.max(paidStudentTuition, txTuitionSum);
  const remainingTuition = Math.max(0, totalExpectedTuition - collectedTuition);
  const tuitionCompletionPct =
    totalExpectedTuition > 0
      ? Math.min(100, Math.round((collectedTuition / totalExpectedTuition) * 100))
      : students.length > 0
      ? Math.round((paidCount / students.length) * 100)
      : 88;

  const kpiTuitionProgEl = document.getElementById('kpi-tuition-progress');
  if (kpiTuitionProgEl) kpiTuitionProgEl.textContent = `${paidCount} / ${students.length} HS`;
  const kpiTuitionSubEl = document.getElementById('kpi-tuition-sub');
  if (kpiTuitionSubEl) kpiTuitionSubEl.textContent = `${pendingCount} chờ duyệt • ${unpaidCount} chưa đóng`;

  const bentoTuitionCollectedEl = document.getElementById('bento-tuition-collected');
  if (bentoTuitionCollectedEl) bentoTuitionCollectedEl.textContent = formatCurrency(collectedTuition);
  const bentoTuitionUnpaidEl = document.getElementById('bento-tuition-unpaid');
  if (bentoTuitionUnpaidEl) bentoTuitionUnpaidEl.textContent = formatCurrency(remainingTuition);
  const bentoTuitionRateEl = document.getElementById('bento-tuition-rate');
  if (bentoTuitionRateEl) bentoTuitionRateEl.textContent = `${tuitionCompletionPct}%`;
  const bentoTuitionRateTextEl = document.getElementById('bento-tuition-rate-text');
  if (bentoTuitionRateTextEl) bentoTuitionRateTextEl.textContent = `${tuitionCompletionPct}%`;

  // 4. CARD D - Tình hình chuyên cần (Attendance Overview)
  const attSummary =
    typeof getGlobalAttendanceSummary === 'function'
      ? getGlobalAttendanceSummary()
      : {
          classCount: Object.keys(schedules).length || 17,
          taughtSessionsCount: 192,
          attendanceRateNum: 96.2,
          presentStudentsEst: Math.max(0, totalStuCount - 5),
          absentStudentsEst: Math.min(totalStuCount, 5)
        };

  const attendanceRateNum = attSummary.attendanceRateNum;
  const presentStudentsEst = attSummary.presentStudentsEst;
  const absentStudentsEst = attSummary.absentStudentsEst;
  const totalTaughtSessions = attSummary.taughtSessionsCount;

  const attRateEl = document.getElementById('bento-attendance-rate');
  if (attRateEl) attRateEl.textContent = `${attendanceRateNum.toFixed(1).replace('.', ',')}%`;
  const attPresentEl = document.getElementById('bento-attendance-present');
  if (attPresentEl) attPresentEl.textContent = String(presentStudentsEst).padStart(2, '0'); /* taste-skill-ignore */
  const attAbsentEl = document.getElementById('bento-attendance-absent');
  if (attAbsentEl) attAbsentEl.textContent = String(absentStudentsEst).padStart(2, '0'); /* taste-skill-ignore */
  const attSessionsBadge = document.getElementById('bento-attendance-sessions-badge');
  if (attSessionsBadge) attSessionsBadge.textContent = `${attSummary.classCount || 17} lớp đang học`;
  const attTaughtCountEl = document.getElementById('bento-attendance-taught-count');
  if (attTaughtCountEl) attTaughtCountEl.textContent = `Đã dạy ${totalTaughtSessions} buổi`;

  const attSegBar = document.getElementById('bento-attendance-segmented-bar');
  if (attSegBar) {
    const totalSegments = 24;
    const presentSegs = Math.max(19, Math.min(23, Math.round((attendanceRateNum / 100) * totalSegments)));
    const pills = [];
    for (let i = 0; i < totalSegments; i++) {
      if (i < presentSegs) {
        pills.push('<div class="segmented-bar-pill is-violet" title="Có mặt đầy đủ"></div>');
      } else {
        pills.push('<div class="segmented-bar-pill is-orange" title="Vắng / Dạy bù"></div>');
      }
    }
    attSegBar.innerHTML = pills.join('');
  }

  // 5. CARD E - Giao dịch gần đây (Banking & Transactions)
  const recentTxContainer = document.getElementById('bento-recent-transactions');
  if (recentTxContainer) {
    const pendingReqsForRows = requests.filter(r => r.status === 'Chờ duyệt').slice(0, 2);
    const recentTxRows = [];

    pendingReqsForRows.forEach(req => {
      const isTestReq = isSimulatedBankTestItem(req);
      recentTxRows.push({
        detailKey: `REQ::${req.id}`,
        title: `${req.studentName || 'Học sinh'} (${req.studentCode || 'HS'})`,
        subtitle: `Lớp ${req.className || '---'} • ${req.period || 'Kỳ hiện tại'}`,
        amount: isTestReq ? 0 : Number(req.amount) || 0,
        testDisplayAmount: req.testDisplayAmount || Number(req.amount) || 600000,
        isIncome: true,
        statusLabel: isTestReq ? 'Test không cộng tiền' : 'Chờ xác nhận',
        isPending: true,
        isTest: isTestReq
      });
    });

    transactions.slice(0, 6).forEach(tx => {
      const isTestTx = isSimulatedBankTestItem(tx);
      const isExcludedTx = !isTestTx && isTransactionExcludedFromSystem(tx);
      const txTag = getTransactionTagLabel(tx);
      const isDraftTx = !isTestTx && isDraftBankTransaction(tx);
      const isDraftIncluded = isDraftTx && isDraftTxIncludedInMain(tx);
      const isInc = tx.type === 'Thu';
      const compact = typeof buildCompactTransactionInfo === 'function'
        ? buildCompactTransactionInfo(tx, appState)
        : { headline: tx.description || tx.category || 'Giao dịch', subline: tx.date || '' };
      recentTxRows.push({
        detailKey: tx.id,
        title: compact.headline,
        subtitle: `${tx.date || ''} • ${
          isTestTx
            ? 'Test STK (0 ₫)'
            : isExcludedTx
            ? txTag || 'Không ghi nhận hệ thống'
            : isDraftTx
            ? 'STK Nháp'
            : compact.shortMethod || tx.method || 'Chuyển khoản'
        }`,
        amount: isTestTx ? 0 : Number(tx.amount) || 0,
        testDisplayAmount: tx.testDisplayAmount || Number(tx.amount) || 600000,
        isIncome: isInc,
        statusLabel: isTestTx
          ? 'Test không cộng tiền'
          : isExcludedTx
          ? txTag || 'Không ghi nhận HT'
          : isDraftTx
          ? isDraftIncluded
            ? 'Nháp • Đã cộng'
            : 'Nháp • Tắt cộng'
          : txTag || 'Đã đối soát',
        isPending: false,
        isTest: isTestTx,
        isExcluded: isExcludedTx
      });
    });

    if (recentTxRows.length === 0) {
      recentTxRows.push(
        {
          detailKey: '',
          title: 'Học phí tháng 10',
          subtitle: 'VietQR SePay • Tự động',
          amount: 1200000,
          isIncome: true,
          statusLabel: 'Đã đối soát',
          isPending: false
        },
        {
          detailKey: '',
          title: 'Học phí tháng 10',
          subtitle: 'VietQR SePay • Tự động',
          amount: 1500000,
          isIncome: true,
          statusLabel: 'Đã đối soát',
          isPending: false
        },
        {
          detailKey: '',
          title: 'Chi phí vận hành',
          subtitle: 'Sổ quỹ trung tâm',
          amount: 850000,
          isIncome: false,
          statusLabel: 'Đã đối soát',
          isPending: false
        }
      );
    }

    recentTxContainer.innerHTML = recentTxRows
      .slice(0, 5)
      .map(item => {
        const iconBg = item.isTest
          ? 'bg-amber-100 text-amber-800 border-amber-300'
          : item.isIncome
          ? 'bg-[#eeeeee] text-[#141414] border-[#eeeeee]'
          : 'bg-[#FFF3EE] text-[#FF4B16] border-[#FFD9CC]';
        const iconName = item.isTest ? 'flask-conical' : item.isIncome ? 'arrow-down-left' : 'arrow-up-right';
        const amountSign = item.isTest ? '' : item.isIncome ? '+' : '−';
        const amountColor = item.isTest ? 'text-amber-700' : item.isIncome ? 'text-[#0a0a0a]' : 'text-[#FF4B16]';
        const chipHtml = item.isTest
          ? `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-400 text-xs font-extrabold">Test không cộng tiền</span>`
          : item.isPending
          ? `<span class="px-2 py-0.5 rounded-full bg-[#FFF3EE] text-[#FF4B16] border border-[#FFD9CC] text-xs font-extrabold">Chờ xác nhận</span>`
          : `<span class="px-2 py-0.5 rounded-full bg-[#eeeeee] text-[#141414] border border-[#eeeeee] text-xs font-extrabold">${escapeHtml(item.statusLabel || 'Đã đối soát')}</span>`;
        const clickAttr = item.detailKey
          ? `onclick="openTransactionDetailModal('${escapeAttr(item.detailKey)}')" title="Bấm để xem chi tiết giao dịch & chỉnh sửa"`
          : '';

        return `
          <div ${clickAttr} class="bento-inner-tile py-2.5 px-3 flex items-center justify-between gap-2.5 ${
          item.detailKey ? 'cursor-pointer hover:border-[#141414]/40 transition' : ''
        } ${item.isTest ? 'border border-amber-300 bg-amber-50/40' : ''}">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-8 h-8 rounded-xl border ${iconBg} flex items-center justify-center shrink-0">
                <i data-lucide="${iconName}" class="w-4 h-4"></i>
              </div>
              <div class="min-w-0">
                <div class="text-xs font-extrabold text-[#0a0a0a] truncate">
                  ${escapeHtml(item.title)}
                </div>
                <div class="text-xs font-semibold text-[#595c5f] truncate">
                  ${escapeHtml(item.subtitle)}
                </div>
              </div>
            </div>
            <div class="text-right shrink-0 leading-tight">
              ${
                item.isTest
                  ? `<div>${chipHtml}</div>
                     <div class="text-xs font-black text-amber-700 whitespace-nowrap mt-0.5">${formatCurrency(item.testDisplayAmount || 600000)}</div>`
                  : `<div class="text-xs font-black ${amountColor} whitespace-nowrap">${amountSign}${formatCurrency(item.amount)}</div>
                     <div class="mt-0.5">${chipHtml}</div>`
              }
            </div>
          </div>
        `;
      })
      .join('');
  }

  // 6. CARD F - Dự báo tài chính (Financial Forecasting)
  const baseExpected = Math.max(totalExpectedTuition, totalIncome, 78000000);
  const forecastedNextMonth = Math.round((baseExpected * 1.124) / 100000) * 100000;
  const reserveAmount = Math.round(forecastedNextMonth * 0.15);

  const forecastAmountEl = document.getElementById('bento-forecast-amount');
  if (forecastAmountEl) forecastAmountEl.textContent = formatCurrency(forecastedNextMonth);
  const forecastExpectedEl = document.getElementById('bento-forecast-current-expected');
  if (forecastExpectedEl) forecastExpectedEl.textContent = formatCurrency(totalExpectedTuition || baseExpected);
  const forecastReserveEl = document.getElementById('bento-forecast-reserve');
  if (forecastReserveEl) forecastReserveEl.textContent = formatCurrency(reserveAmount);

  // 7. Render danh sách Yêu cầu xác nhận chuyển khoản từ Phụ huynh
  if (typeof updateAutoApprovePaymentUI === 'function') {
    updateAutoApprovePaymentUI();
  }
  const pendingReqs = requests.filter(r => r.status === 'Chờ duyệt');
  const pendingBoxBadge = document.getElementById('pending-box-badge');
  if (pendingBoxBadge) pendingBoxBadge.textContent = `${pendingReqs.length} chờ duyệt`;

  const pendingListEl = document.getElementById('pending-requests-list');
  if (pendingListEl) {
    if (pendingReqs.length === 0) {
      pendingListEl.innerHTML = `
        <div class="py-7 text-center text-[#595c5f] space-y-1">
          <i data-lucide="check-check" class="w-8 h-8 mx-auto text-[#141414]"></i>
          <p class="text-sm font-extrabold text-[#0a0a0a]">Tuyệt vời! Không có yêu cầu chuyển khoản nào đang chờ duyệt.</p>
          <p class="text-xs">Khi phụ huynh gửi xác nhận chuyển khoản (chờ tiền vào STK hoặc khi tắt Duyệt tự động), thông báo sẽ hiện ngay tại đây.</p>
        </div>
      `;
    } else {
      pendingListEl.innerHTML = pendingReqs
        .map(req => {
          const isTestReq = isSimulatedBankTestItem(req);
          const linkedStu = (appState.students || []).find(
            s => s.id === req.studentRecordId || s.studentCode === req.studentCode
          );
          const isBankVerified = Boolean(
            req.bankVerified || checkHasVerifiedBankTransfer(linkedStu, req.studentName)
          );
          const testBadgeHtml = isTestReq
            ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-400 font-extrabold text-[11px]">
                <i data-lucide="flask-conical" class="w-3.5 h-3.5 text-amber-700"></i>
                <span>Test không cộng tiền</span>
              </span>`
            : '';
          const bankStatusBadge = isBankVerified
            ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold text-[11px]">
                <i data-lucide="badge-check" class="w-3.5 h-3.5 text-emerald-600"></i>
                <span>Đã vào STK</span>
              </span>`
            : `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-extrabold text-[11px]">
                <i data-lucide="clock" class="w-3.5 h-3.5 text-amber-600"></i>
                <span>Chờ tiền vào STK</span>
              </span>`;
          const cleanNote = isTestReq ? stripRedundantTestPrefix(req.note) : req.note;

          return `
        <div class="bento-inner-tile p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 ${isTestReq ? 'border-2 border-amber-300 bg-amber-50/40' : ''}">
          <div class="flex items-start gap-3.5">
            ${
              req.receiptUrl
                ? `<img
                    onclick="openReceiptViewer('${escapeAttr(req.receiptUrl)}', 'Biên lai ${escapeAttr(req.studentName)}')"
                    src="${escapeAttr(req.receiptUrl)}"
                    alt="Biên lai"
                    class="w-16 h-20 rounded-xl object-cover border border-[#eeeeee] cursor-pointer hover:opacity-90 shrink-0 bg-white"
                    title="Bấm để phóng to ảnh biên lai"
                  />`
                : `<div class="w-16 h-20 rounded-xl bg-[#eeeeee] border border-[#eeeeee] flex flex-col items-center justify-center text-xs text-[#595c5f] shrink-0 text-center p-1">
                    <i data-lucide="file-text" class="w-5 h-5 mb-1 text-[#141414]"></i>Không ảnh
                  </div>`
            }
            <div class="space-y-1 text-xs">
              <div class="flex flex-wrap items-center gap-2">
                ${testBadgeHtml}
                <span class="px-2.5 py-0.5 rounded-full bg-[#eeeeee] text-[#141414] tabular-nums font-extrabold">${escapeHtml(req.studentCode)}</span>
                <span class="font-extrabold text-[#0a0a0a] text-sm">${escapeHtml(req.studentName)}</span>
                <span class="text-[#595c5f]">• ${escapeHtml(req.className)}</span>
                <span class="px-2.5 py-0.5 rounded-full bg-[#FFF3EE] text-[#FF4B16] font-bold">${escapeHtml(req.period)}</span>
                ${bankStatusBadge}
              </div>
              <p class="text-[#0a0a0a]">
                Người chuyển: <strong>${escapeHtml(req.payerName || 'Phụ huynh')}</strong>${req.parentPhone ? ` (${escapeHtml(req.parentPhone)})` : ''}
                - Số tiền: <strong class="${isTestReq ? 'text-amber-700' : 'text-[#141414]'} text-sm">${
                  isTestReq
                    ? `${formatCurrency(req.testDisplayAmount || 600000)} (Test không cộng tiền)`
                    : formatCurrency(req.amount)
                }</strong>
              </p>
              <p class="text-[#595c5f] italic">"${escapeHtml(cleanNote || 'Không có ghi chú')}"</p>
              <p class="text-[11px] text-[#595c5f]">Gửi lúc: ${escapeHtml(req.submittedAt)}</p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end shrink-0">
            ${
              req.receiptUrl
                ? `<button
                    onclick="openReceiptViewer('${escapeAttr(req.receiptUrl)}', 'Biên lai ${escapeAttr(req.studentName)}')"
                    class="px-3.5 py-2 rounded-full bg-white border border-[#EBECF3] text-[#0a0a0a] hover:bg-[#eeeeee] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <i data-lucide="eye" class="w-4 h-4 text-[#141414]"></i>
                    <span>Xem biên lai</span>
                  </button>`
                : ''
            }
            <button
              type="button"
              onclick="deletePaymentRequestDirectly('${escapeAttr(req.id)}')"
              title="Xóa trực tiếp yêu cầu này và chặn tự động tạo lại"
              class="px-3.5 py-2 rounded-full bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
            >
              <i data-lucide="trash-2" class="w-4 h-4"></i>
              <span>Xóa</span>
            </button>
            <button
              type="button"
              onclick="handleReviewPaymentRequest('${escapeAttr(req.id)}', 'Từ chối')"
              class="px-3.5 py-2 rounded-full bg-[#FFF3EE] hover:bg-[#FF4B16] text-[#FF4B16] hover:text-white border border-[#FFD9CC] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
            >
              <i data-lucide="x-circle" class="w-4 h-4"></i>
              <span>Chưa nhận được</span>
            </button>
            <button
              type="button"
              onclick="handleReviewPaymentRequest('${escapeAttr(req.id)}', 'Đã duyệt')"
              class="px-4 py-2 rounded-full bg-[#141414] hover:bg-[#4842E8] text-white text-xs font-extrabold flex items-center gap-1.5  cursor-pointer transition"
            >
              <i data-lucide="check-circle" class="w-4 h-4"></i>
              <span>Duyệt (Đã nhận tiền)</span>
            </button>
          </div>
        </div>
      `;
        })
        .join('');
    }
  }

  // 8. Vẽ biểu đồ Bento (Card B Donut + Card C Smooth Dual-Line)
  renderDashboardCharts(
    totalIncome,
    totalExpense,
    paidCount,
    pendingCount,
    unpaidCount,
    collectedTuition,
    remainingTuition
  );
  lucide.createIcons();
}

async function approvePaymentRequest(requestId) {
  return handleReviewPaymentRequest(requestId, 'Đã duyệt');
}

async function rejectPaymentRequest(requestId) {
  return handleReviewPaymentRequest(requestId, 'Từ chối');
}

async function deletePaymentRequestDirectly(requestId) {
  const cleanId = String(requestId || '').replace(/^REQ::/i, '').trim();
  if (!cleanId) return;
  const req = (appState.paymentRequests || []).find(r => r && r.id === cleanId);
  if (typeof pushUndoSnapshot === 'function') {
    pushUndoSnapshot(`Xóa yêu cầu chuyển khoản ${req ? req.studentName : cleanId}`);
  }
  if (typeof selectedFinanceItemIds !== 'undefined' && selectedFinanceItemIds instanceof Set) {
    selectedFinanceItemIds.delete('REQ::' + cleanId);
    selectedFinanceItemIds.delete(cleanId);
  }
  blockPaymentRequestIdsFromSync(req || cleanId, appState);
  addDismissedNotifIds([cleanId, 'REQ::' + cleanId], appState);
  appState.paymentRequests = (appState.paymentRequests || []).filter(r => r && r.id !== cleanId);

  if (req) {
    const linkedStu = (appState.students || []).find(
      s => s && (s.id === req.studentRecordId || (s.studentCode && s.studentCode === req.studentCode))
    );
    if (linkedStu && linkedStu.status === 'Chờ duyệt') {
      const stillPending = (appState.paymentRequests || []).some(
        r =>
          r &&
          r.status === 'Chờ duyệt' &&
          (r.studentRecordId === linkedStu.id || (r.studentCode && r.studentCode === linkedStu.studentCode))
      );
      if (!stillPending) {
        linkedStu.status = 'Chưa đóng';
        if (String(linkedStu.note || '').includes('Chờ Quản lý duyệt')) {
          linkedStu.note = '';
        }
      }
    }
  }

  saveStateToLocal();
  renderHeaderNotificationState();
  renderActiveAdminTab();
  await triggerAutoSyncIfNeeded(
    `Đã xóa trực tiếp yêu cầu chuyển khoản${req?.studentName ? ` của ${req.studentName}` : ''}!`
  );
}

async function clearAllPendingPaymentRequests() {
  const pendingReqs = (appState.paymentRequests || []).filter(r => r && r.status === 'Chờ duyệt');
  if (pendingReqs.length === 0) {
    showToast('Hiện không có yêu cầu chờ duyệt nào để xóa.', 'info');
    return;
  }
  if (typeof pushUndoSnapshot === 'function') {
    pushUndoSnapshot(`Xóa tất cả ${pendingReqs.length} yêu cầu chờ duyệt`);
  }
  blockPaymentRequestIdsFromSync(pendingReqs, appState);
  pendingReqs.forEach(r => {
    addDismissedNotifIds([r.id, 'REQ::' + r.id], appState);
    if (typeof selectedFinanceItemIds !== 'undefined' && selectedFinanceItemIds instanceof Set) {
      selectedFinanceItemIds.delete('REQ::' + r.id);
      selectedFinanceItemIds.delete(r.id);
    }
  });
  const pendingIds = new Set(pendingReqs.map(r => r.id));
  appState.paymentRequests = (appState.paymentRequests || []).filter(r => r && !pendingIds.has(r.id));
  (appState.students || []).forEach(s => {
    if (s && s.status === 'Chờ duyệt') {
      s.status = 'Chưa đóng';
      if (String(s.note || '').includes('Chờ Quản lý duyệt')) s.note = '';
    }
  });
  if (appState.settings) {
    appState.settings.lastBankAlertJson = '';
  }

  saveStateToLocal();
  renderHeaderNotificationState();
  renderActiveAdminTab();
  await triggerAutoSyncIfNeeded(`Đã xóa toàn bộ ${pendingReqs.length} yêu cầu chờ duyệt!`);
}

// Quản lý bấm Duyệt hoặc Từ chối yêu cầu chuyển khoản của Phụ huynh
async function handleReviewPaymentRequest(requestId, decision) {
  const req = (appState.paymentRequests || []).find(r => r.id === requestId);
  if (!req) return;

  if (typeof selectedFinanceItemIds !== 'undefined' && selectedFinanceItemIds instanceof Set) {
    selectedFinanceItemIds.delete('REQ::' + requestId);
    selectedFinanceItemIds.delete(requestId);
  }

  const isTestReq = isSimulatedBankTestItem(req);
  const nowStr = getCurrentDateTimeString();
  const todayDate = new Date().toISOString().slice(0, 10);

  req.status = decision;
  req.reviewedAt = nowStr;
  addDismissedNotifIds([req.id, 'REQ::' + req.id], appState);

  if (decision === 'Từ chối') {
    blockPaymentRequestIdsFromSync(req, appState);
    appState.paymentRequests = (appState.paymentRequests || []).filter(r => r && r.id !== requestId);
  } else {
    const suffix = String(req.id || '').replace(/^(?:YC_STK_SEPAY_|YC_SEPAY_|YC_STK_|YC_)+/i, '').trim();
    if (suffix) {
      markTransactionsAsDeletedInState([`GD_${suffix}`, `GD_SEPAY_${suffix}`], appState);
    }
  }

  // Nếu là bản ghi Test thử STK -> Chỉ đổi trạng thái bản ghi Test, tuyệt đối KHÔNG cộng tiền vào Web và KHÔNG đổi trạng thái học sinh thật
  if (isTestReq) {
    saveStateToLocal();
    renderHeaderNotificationState();
    renderActiveAdminTab();
    showToast(
      decision === 'Đã duyệt'
        ? `Đã xác nhận kiểm tra bản ghi "Test thử STK" (Không cộng tiền vào Web)!`
        : `Đã đóng bản ghi "Test thử STK".`,
      'info'
    );
    return;
  }

  // Tìm bản ghi học sinh tương ứng
  const reqNameClean = removeVietnameseTones((req.studentName || '').toLowerCase()).trim();
  const student = (appState.students || []).find(
    s =>
      s.id === req.studentRecordId ||
      (s.studentCode && req.studentCode && s.studentCode === req.studentCode) ||
      (reqNameClean && removeVietnameseTones((s.fullName || '').toLowerCase()).trim() === reqNameClean)
  );

  let createdTransaction = null;

  if (decision === 'Đã duyệt') {
    const finalAmt =
      normalizeStoredVnd(req.amount) || (student ? normalizeStoredVnd(student.tuitionFee) : 600000);
    if (student) {
      student.status = 'Đã hoàn thành';
      if (req.receiptUrl) student.receiptUrl = req.receiptUrl;
      student.updatedAt = nowStr;
    }

    const txId = 'GD_' + Date.now();
    if (finalAmt > 0 && finalAmt < 20000) {
      recordExactSmallAmount(appState, txId, '', finalAmt);
    }
    const isDraftReq = isDraftPaymentRequest(req, appState) || isActiveBankAccountDraft(appState);
    if (isDraftReq) {
      markDraftBankTx(appState, txId);
    }

    // Tự động ghi 1 phiếu Thu vào Sổ Thu - Chi
    createdTransaction = {
      id: txId,
      date: todayDate,
      type: 'Thu',
      category: 'Thu học phí',
      amount: finalAmt,
      description: `${isDraftReq ? '[STK Nháp 5801434567] ' : ''}Thu học phí ${req.period || 'kỳ này'} - ${req.studentCode || ''} ${req.studentName} (${req.payerName || 'Phụ huynh'})`,
      studentCode: req.studentCode || (student ? student.studentCode : ''),
      method: isDraftReq ? 'Chuyển khoản STK Nháp' : 'Chuyển khoản',
      receiptUrl: req.receiptUrl || '',
      createdBy: 'Quản lý (Duyệt CK)'
    };
    appState.transactions.unshift(createdTransaction);
  } else {
    if (student) {
      student.status = 'Chưa đóng';
      student.updatedAt = nowStr;
      if (String(student.note || '').includes('Chờ Quản lý duyệt')) {
        student.note = '';
      }
    }
  }

  saveStateToLocal();
  renderHeaderNotificationState();
  renderActiveAdminTab();

  // Đồng bộ toàn bộ (bao gồm danh sách chặn deletedTxIdsJson) lên Google Sheet để không bao giờ bị tự động tạo lại
  await triggerAutoSyncIfNeeded(
    decision === 'Đã duyệt'
      ? `Đã duyệt học phí em ${req.studentName} & đồng bộ lên Google Sheet!`
      : `Đã từ chối & xóa yêu cầu của ${req.studentName} (Chưa đóng).`
  );
}

function renderDashboardCharts(
  totalIncome,
  totalExpense,
  paidCount,
  pendingCount,
  unpaidCount,
  collectedTuition = 0,
  remainingTuition = 0
) {
  const barCtx = document.getElementById('financeBarChart');
  const pieCtx = document.getElementById('tuitionPieChart');
  if (!barCtx || !pieCtx || typeof barCtx.getContext !== 'function' || typeof pieCtx.getContext !== 'function') return;

  const isDark = document.documentElement.classList.contains('dark-mode');
  const tickColor = isDark ? '#cbd5e1' : '#595c5f';
  const gridColor = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(137, 134, 166, 0.12)';

  // Xây dựng dữ liệu chuỗi 6 điểm cho Biểu đồ đường đôi mượt (Smooth Dual-Line Chart: Violet & Orange)
  const curIncM = Math.max(12.5, Number(((totalIncome || 78000000) / 1000000).toFixed(1)));
  const curExpM = Math.max(3.2, Number(((totalExpense || 18500000) / 1000000).toFixed(1)));

  const lineLabels = ['Đợt 1', 'Đợt 2', 'Đợt 3', 'Đợt 4', 'Đợt 5', 'Kỳ hiện tại'];
  const incomeSeries = [
    Number((curIncM * 0.68).toFixed(1)),
    Number((curIncM * 0.76).toFixed(1)),
    Number((curIncM * 0.72).toFixed(1)),
    Number((curIncM * 0.85).toFixed(1)),
    Number((curIncM * 0.93).toFixed(1)),
    curIncM
  ];
  const expenseSeries = [
    Number((curExpM * 0.74).toFixed(1)),
    Number((curExpM * 0.68).toFixed(1)),
    Number((curExpM * 0.82).toFixed(1)),
    Number((curExpM * 0.79).toFixed(1)),
    Number((curExpM * 0.91).toFixed(1)),
    curExpM
  ];

  const ctx2d = barCtx.getContext('2d');
  const violetGrad = ctx2d.createLinearGradient(0, 0, 0, 200);
  violetGrad.addColorStop(0, 'rgba(124, 107, 255, 0.28)');
  violetGrad.addColorStop(1, 'rgba(124, 107, 255, 0.01)');

  const orangeGrad = ctx2d.createLinearGradient(0, 0, 0, 200);
  orangeGrad.addColorStop(0, 'rgba(255, 75, 22, 0.22)');
  orangeGrad.addColorStop(1, 'rgba(255, 75, 22, 0.01)');

  if (financeBarChartInstance && financeBarChartInstance.canvas === barCtx) {
    financeBarChartInstance.data.datasets[0].data = incomeSeries;
    financeBarChartInstance.data.datasets[0].backgroundColor = violetGrad;
    financeBarChartInstance.data.datasets[1].data = expenseSeries;
    financeBarChartInstance.data.datasets[1].backgroundColor = orangeGrad;
    financeBarChartInstance.options.scales.x.ticks.color = tickColor;
    financeBarChartInstance.options.scales.y.ticks.color = tickColor;
    financeBarChartInstance.options.scales.y.grid.color = gridColor;
    financeBarChartInstance.update('none');
  } else {
    if (financeBarChartInstance) financeBarChartInstance.destroy();
    financeBarChartInstance = new Chart(barCtx, {
      type: 'line',
      data: {
        labels: lineLabels,
        datasets: [
          {
            label: 'Tổng thu (Triệu đ)',
            data: incomeSeries,
            borderColor: '#141414',
            backgroundColor: violetGrad,
            borderWidth: 2.5,
            tension: 0.42,
            fill: true,
            pointRadius: 3.5,
            pointHoverRadius: 5.5,
            pointBackgroundColor: '#FFFFFF',
            pointBorderColor: '#141414',
            pointBorderWidth: 2
          },
          {
            label: 'Tổng chi (Triệu đ)',
            data: expenseSeries,
            borderColor: '#FF4B16',
            backgroundColor: orangeGrad,
            borderWidth: 2.5,
            tension: 0.42,
            fill: true,
            pointRadius: 3.5,
            pointHoverRadius: 5.5,
            pointBackgroundColor: '#FFFFFF',
            pointBorderColor: '#FF4B16',
            pointBorderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0a0a0a',
            titleColor: '#FFFFFF',
            bodyColor: '#eeeeee',
            cornerRadius: 12,
            padding: 10
          }
        },
        scales: {
          x: {
            ticks: { color: tickColor, font: { size: 11, weight: '600' } },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            grid: { color: gridColor, drawBorder: false },
            ticks: {
              color: tickColor,
              font: { size: 10, weight: '600' },
              callback: function (val) {
                return val + 'M';
              }
            }
          }
        }
      }
    });
  }

  // Biểu đồ Donut Học Phí (Card B: Kết hợp Violet #141414 và Orange #FF4B16)
  const hasStudentStatus = paidCount + pendingCount + unpaidCount > 0;
  const donutData = hasStudentStatus ? [Math.max(1, paidCount), pendingCount, unpaidCount] : [88, 4, 8];

  if (tuitionPieChartInstance && tuitionPieChartInstance.canvas === pieCtx) {
    tuitionPieChartInstance.data.datasets[0].data = donutData;
    tuitionPieChartInstance.data.datasets[0].borderColor = isDark ? '#151F32' : '#FAFAFC';
    tuitionPieChartInstance.update('none');
  } else {
    if (tuitionPieChartInstance) tuitionPieChartInstance.destroy();
    tuitionPieChartInstance = new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels: ['Đã hoàn thành', 'Chờ xác nhận', 'Chưa thu'],
        datasets: [
          {
            data: donutData,
            backgroundColor: ['#141414', '#141414', '#FF4B16'],
            borderWidth: 3,
            borderColor: isDark ? '#151F32' : '#FAFAFC',
            hoverOffset: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: '#0a0a0a',
            titleColor: '#FFFFFF',
            bodyColor: '#eeeeee',
            cornerRadius: 12,
            padding: 10
          }
        }
      }
    });
  }
}

// ============================================================================
// TAB 2: SỔ THỐNG KÊ HỌC SINH & HỌC PHÍ (ĐA CHIỀU: LỚP • THÁNG • NĂM • NGÀY)
// ============================================================================
function sortClassNamesStandard(classNames) {
  const gradeOrder = { '12': 1, '11': 2, '10': 3, '9': 4, '8': 5, '7': 6, '6': 7, '6-8': 8, 'OTHER': 99 };
  return [...classNames].sort((a, b) => {
    const ga = gradeOrder[getGradeCategoryForClassName(a)] || 50;
    const gb = gradeOrder[getGradeCategoryForClassName(b)] || 50;
    if (ga !== gb) return ga - gb;
    const numA = parseInt(String(a).match(/^\d+/)?.[0] || '0', 10);
    const numB = parseInt(String(b).match(/^\d+/)?.[0] || '0', 10);
    if (numA !== numB) return numB - numA;
    return String(a).localeCompare(String(b), 'vi');
  });
}

function populateStudentFilterDropdowns() {
  const classSelect = document.getElementById('filter-student-class');
  const periodSelect = document.getElementById('filter-student-period');
  if (!classSelect || !periodSelect) return;

  const currentClass = classSelect.value || 'ALL';
  const currentPeriod = periodSelect.value || 'ALL';

  const scheduleMap = typeof getClassSchedulesMap === 'function' ? getClassSchedulesMap() : {};
  const rawClasses = Array.from(
    new Set([
      ...Object.keys(scheduleMap),
      ...(appState.students || []).map(s => (s.className || '').trim()).filter(Boolean)
    ])
  );
  const classes = sortClassNamesStandard(rawClasses);
  const periods = Array.from(new Set((appState.students || []).map(s => s.period).filter(Boolean)));

  classSelect.innerHTML =
    `<option value="ALL">Tất cả các lớp (${classes.length} lớp • ${(appState.students || []).length} HS)</option>` +
    classes
      .map(c => {
        const cnt = (appState.students || []).filter(s => s.className === c).length;
        return `<option value="${escapeAttr(c)}">Lớp ${escapeHtml(c)} (${cnt} HS)</option>`;
      })
      .join('');

  periodSelect.innerHTML =
    `<option value="ALL">Tất cả kỳ / đợt học phí (${periods.length} kỳ)</option>` +
    periods
      .map(p => {
        const cnt = (appState.students || []).filter(s => s.period === p).length;
        return `<option value="${escapeAttr(p)}">${escapeHtml(p)} (${cnt} HS)</option>`;
      })
      .join('');

  if (classes.includes(currentClass)) {
    classSelect.value = currentClass;
  } else {
    classSelect.value = 'ALL';
  }
  if (periods.includes(currentPeriod)) {
    periodSelect.value = currentPeriod;
  } else {
    periodSelect.value = 'ALL';
  }
}

function extractMonthsAndYearsFromText(periodStr, startDateStr = '', endDateStr = '') {
  const months = new Set();
  const years = new Set();
  const s = String(periodStr || '');

  // Tìm các năm (2024..2030)
  const yearMatches = s.match(/\b(202\d)\b/g);
  if (yearMatches) {
    yearMatches.forEach(y => years.add(Number(y)));
  }

  // Trường hợp đặc biệt: "Tháng 8/2025 - 1/2026"
  const crossYearMatch = s.match(/(\d{1,2})\s*\/\s*(202\d)\s*-\s*(\d{1,2})\s*\/\s*(202\d)/);
  if (crossYearMatch) {
    const m1 = Number(crossYearMatch[1]);
    const y1 = Number(crossYearMatch[2]);
    const m2 = Number(crossYearMatch[3]);
    const y2 = Number(crossYearMatch[4]);
    years.add(y1);
    years.add(y2);
    for (let m = m1; m <= 12; m++) months.add(m);
    for (let m = 1; m <= m2; m++) months.add(m);
  } else {
    // Trường hợp "Tháng 9-10/2026" hoặc "T9-10"
    const rangeMatch = s.match(/(?:Tháng|T)\s*(\d{1,2})\s*-\s*(\d{1,2})/i);
    if (rangeMatch) {
      const m1 = Number(rangeMatch[1]);
      const m2 = Number(rangeMatch[2]);
      const startM = Math.min(m1, m2);
      const endM = Math.max(m1, m2);
      for (let m = startM; m <= endM; m++) {
        if (m >= 1 && m <= 12) months.add(m);
      }
    } else {
      const singleMatch = s.match(/(?:Tháng|T)\s*(\d{1,2})/i);
      if (singleMatch) {
        const m = Number(singleMatch[1]);
        if (m >= 1 && m <= 12) months.add(m);
      }
    }
  }

  // Bổ sung từ startDate -> endDate nếu có
  [startDateStr, endDateStr].forEach(dStr => {
    if (dStr && /^\d{4}-\d{2}-\d{2}/.test(dStr)) {
      const parts = dStr.slice(0, 10).split('-');
      years.add(Number(parts[0]));
      months.add(Number(parts[1]));
    }
  });

  if (years.size === 0) years.add(2026);
  return { months, years };
}

function getStudentPaymentDatesIso(s) {
  const dates = new Set();
  const code = String(s.studentCode || '').trim().toUpperCase();
  (appState.transactions || []).forEach(tx => {
    if (tx.type !== 'Thu' || isSimulatedBankTestItem(tx) || isTransactionExcludedFromSystem(tx)) return;
    const matchCode =
      (tx.studentCode && code && String(tx.studentCode).trim().toUpperCase() === code) ||
      (code && String(tx.description || '').toUpperCase().includes(code));
    if (matchCode && tx.date && /^\d{4}-\d{2}-\d{2}/.test(tx.date)) {
      dates.add(tx.date.slice(0, 10));
    }
  });
  if (s.status === 'Đã hoàn thành' && s.updatedAt && /^\d{4}-\d{2}-\d{2}/.test(s.updatedAt)) {
    dates.add(s.updatedAt.slice(0, 10));
  }
  return Array.from(dates);
}

function matchesStudentTimeFilter(s, ctx = null) {
  if (selectedStuStatTimeMode === 'ALL') return true;

  const dateTarget = document.getElementById('filter-student-date-target')?.value || 'ALL';
  const scheduleMap = ctx?.scheduleMap || (typeof getClassSchedulesMap === 'function' ? getClassSchedulesMap() : {});
  const clsCfg = scheduleMap[s.className] || {};
  const stats = getStudentStatistics(s, ctx);
  const startDateIso = stats.startDateIso || clsCfg.startDate || '';
  const paymentDates = getStudentPaymentDatesIso(s);
  const periodInfo = extractMonthsAndYearsFromText(s.period, clsCfg.startDate, clsCfg.endDate);

  if (selectedStuStatTimeMode === 'MONTH') {
    const selMonthVal = document.getElementById('filter-stu-month')?.value || 'ALL';
    const selYearVal = document.getElementById('filter-stu-month-year')?.value || 'ALL';
    const mNum = selMonthVal === 'ALL' ? null : Number(selMonthVal);
    const yNum = selYearVal === 'ALL' ? null : Number(selYearVal);

    const checkDateIsoMonthYear = iso => {
      if (!iso || !/^\d{4}-\d{2}/.test(iso)) return false;
      const y = Number(iso.slice(0, 4));
      const m = Number(iso.slice(5, 7));
      if (yNum && y !== yNum) return false;
      if (mNum && m !== mNum) return false;
      return true;
    };

    const matchPeriod =
      (!yNum || periodInfo.years.has(yNum)) &&
      (!mNum || periodInfo.months.has(mNum));
    const matchPayment = paymentDates.some(checkDateIsoMonthYear) || (s.status === 'Đã hoàn thành' && matchPeriod);
    const matchStart = checkDateIsoMonthYear(startDateIso);
    const matchSchedule =
      (!yNum || periodInfo.years.has(yNum)) &&
      (!mNum || periodInfo.months.has(mNum) || Object.keys(clsCfg.sessionStates || {}).some(checkDateIsoMonthYear));

    if (dateTarget === 'PAYMENT_DATE') return matchPayment;
    if (dateTarget === 'START_DATE') return matchStart;
    if (dateTarget === 'CLASS_SCHEDULE') return matchSchedule;
    return matchPeriod || matchPayment || matchStart || matchSchedule;
  }

  if (selectedStuStatTimeMode === 'YEAR') {
    const selYearVal = document.getElementById('filter-stu-year')?.value || 'ALL';
    if (selYearVal === 'ALL') return true;
    const yNum = Number(selYearVal);

    const checkDateIsoYear = iso => iso && Number(iso.slice(0, 4)) === yNum;
    const matchPeriod = periodInfo.years.has(yNum);
    const matchPayment = paymentDates.some(checkDateIsoYear) || (s.status === 'Đã hoàn thành' && matchPeriod);
    const matchStart = checkDateIsoYear(startDateIso);
    const matchSchedule =
      periodInfo.years.has(yNum) || Object.keys(clsCfg.sessionStates || {}).some(checkDateIsoYear);

    if (dateTarget === 'PAYMENT_DATE') return matchPayment;
    if (dateTarget === 'START_DATE') return matchStart;
    if (dateTarget === 'CLASS_SCHEDULE') return matchSchedule;
    return matchPeriod || matchPayment || matchStart || matchSchedule;
  }

  if (selectedStuStatTimeMode === 'DAY') {
    const selDate = (document.getElementById('filter-stu-date')?.value || '').trim();
    if (!selDate) return true;

    const matchPayment = paymentDates.includes(selDate);
    const matchStart = startDateIso === selDate;
    const inClassRange =
      clsCfg.startDate && clsCfg.endDate && selDate >= clsCfg.startDate && selDate <= clsCfg.endDate;
    const hasSessionOnDate =
      Boolean(clsCfg.sessionStates && clsCfg.sessionStates[selDate]) ||
      (inClassRange &&
        Array.isArray(clsCfg.daysOfWeek) &&
        clsCfg.daysOfWeek.includes(new Date(selDate + 'T00:00:00').getDay()));

    if (dateTarget === 'PAYMENT_DATE') return matchPayment;
    if (dateTarget === 'START_DATE') return matchStart;
    if (dateTarget === 'CLASS_SCHEDULE') return hasSessionOnDate;
    return matchPayment || matchStart || hasSessionOnDate || inClassRange;
  }

  if (selectedStuStatTimeMode === 'RANGE') {
    const fromDate = (document.getElementById('filter-stu-from-date')?.value || '').trim();
    const toDate = (document.getElementById('filter-stu-to-date')?.value || '').trim();
    if (!fromDate && !toDate) return true;
    const minD = fromDate || '1900-01-01';
    const maxD = toDate || '2099-12-31';

    const inRange = iso => iso && iso >= minD && iso <= maxD;
    const matchPayment = paymentDates.some(inRange);
    const matchStart = inRange(startDateIso);
    const matchSchedule =
      (clsCfg.startDate && clsCfg.endDate && clsCfg.startDate <= maxD && clsCfg.endDate >= minD) ||
      Object.keys(clsCfg.sessionStates || {}).some(inRange);

    if (dateTarget === 'PAYMENT_DATE') return matchPayment;
    if (dateTarget === 'START_DATE') return matchStart;
    if (dateTarget === 'CLASS_SCHEDULE') return matchSchedule;
    return matchPayment || matchStart || matchSchedule;
  }

  return true;
}

function getFilteredStudents(ctx = null) {
  const q = removeVietnameseTones((document.getElementById('filter-student-search')?.value || '').trim().toLowerCase());
  const classFilter = document.getElementById('filter-student-class')?.value || 'ALL';
  const periodFilter = document.getElementById('filter-student-period')?.value || 'ALL';
  const statusFilter = document.getElementById('filter-student-status')?.value || 'ALL';

  return (appState.students || []).filter(s => {
    if (selectedAllStuGradeFilter !== 'ALL') {
      if (getGradeCategoryForClassName(s.className) !== selectedAllStuGradeFilter) return false;
    }
    if (classFilter !== 'ALL' && s.className !== classFilter) return false;
    if (periodFilter !== 'ALL' && s.period !== periodFilter) return false;
    if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
    if (!matchesStudentTimeFilter(s, ctx)) return false;
    if (q) {
      const hay = removeVietnameseTones(
        `${s.studentCode} ${s.fullName} ${s.parentName} ${s.parentPhone} ${s.className} ${s.period}`.toLowerCase()
      );
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function setAllStuGradeFilter(gradeKey) {
  selectedAllStuGradeFilter = gradeKey || 'ALL';
  const classSelect = document.getElementById('filter-student-class');
  if (classSelect && classSelect.value !== 'ALL') {
    if (
      selectedAllStuGradeFilter !== 'ALL' &&
      getGradeCategoryForClassName(classSelect.value) !== selectedAllStuGradeFilter
    ) {
      classSelect.value = 'ALL';
    }
  }
  renderAdminStudents();
}

function quickFilterByClassInAllStudents(className) {
  const select = document.getElementById('filter-student-class');
  if (!select) return;
  select.value = className || 'ALL';
  renderAdminStudents();
}

function setStuStatTimeMode(mode) {
  selectedStuStatTimeMode = mode || 'ALL';
  const modes = ['ALL', 'MONTH', 'YEAR', 'DAY', 'RANGE'];
  modes.forEach(m => {
    const btn = document.getElementById('stu-mode-btn-' + m);
    if (btn) {
      if (m === selectedStuStatTimeMode) {
        btn.className =
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer border bg-blue-600 text-white border-blue-600  whitespace-nowrap';
      } else {
        btn.className =
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer border bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200 whitespace-nowrap';
      }
    }
    const ctrl = document.getElementById('stu-stat-ctrl-' + m);
    if (ctrl) {
      if (m === selectedStuStatTimeMode) {
        ctrl.classList.remove('hidden');
        ctrl.classList.add('flex');
      } else {
        ctrl.classList.add('hidden');
        ctrl.classList.remove('flex');
      }
    }
  });

  if (selectedStuStatTimeMode === 'DAY') {
    const dateInput = document.getElementById('filter-stu-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }
  } else if (selectedStuStatTimeMode === 'RANGE') {
    const fromInput = document.getElementById('filter-stu-from-date');
    const toInput = document.getElementById('filter-stu-to-date');
    if (fromInput && !fromInput.value) fromInput.value = '2026-09-01';
    if (toInput && !toInput.value) toInput.value = '2026-10-31';
  }

  renderAdminStudents();
}

function setStuStatToday() {
  const dateInput = document.getElementById('filter-stu-date');
  if (dateInput) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }
  renderAdminStudents();
}

function quickSelectPeriodBreakdown(periodValue) {
  const periodSelect = document.getElementById('filter-student-period');
  if (!periodSelect) return;
  if (periodSelect.value === periodValue) {
    periodSelect.value = 'ALL';
  } else {
    periodSelect.value = periodValue || 'ALL';
  }
  renderAdminStudents();
}

function resetAllStudentStatFilters() {
  selectedAllStuGradeFilter = 'ALL';
  const searchEl = document.getElementById('filter-student-search');
  const classEl = document.getElementById('filter-student-class');
  const periodEl = document.getElementById('filter-student-period');
  const statusEl = document.getElementById('filter-student-status');
  const targetEl = document.getElementById('filter-student-date-target');
  if (searchEl) searchEl.value = '';
  if (classEl) classEl.value = 'ALL';
  if (periodEl) periodEl.value = 'ALL';
  if (statusEl) statusEl.value = 'ALL';
  if (targetEl) targetEl.value = 'ALL';
  setStuStatTimeMode('ALL');
}

function getStudentMetaMap() {
  try {
    if (appState.settings && appState.settings.studentMetaJson) {
      return JSON.parse(appState.settings.studentMetaJson) || {};
    }
  } catch (e) {}
  return {};
}

function saveStudentMetaMap(map, syncMsg = '') {
  if (!appState.settings) appState.settings = {};
  appState.settings.studentMetaJson = JSON.stringify(map || {});
  saveStateToLocal();
  if (syncMsg) {
    triggerAutoSyncIfNeeded(syncMsg);
  }
}

function buildStudentStatsContext(scheduleMap = null) {
  const historyList = typeof getClassHistoryList === 'function' ? getClassHistoryList() : [];
  return {
    metaMap: getStudentMetaMap(),
    chronologicalHist: [...historyList].reverse(),
    scheduleMap: scheduleMap || (typeof getClassSchedulesMap === 'function' ? getClassSchedulesMap() : {}),
    incomeTxs: (appState.transactions || []).filter(t => t && t.type === 'Thu' && isCountedInMainFinance(t))
  };
}

function getStudentStatistics(s, ctx = null) {
  const metaMap = ctx ? ctx.metaMap : getStudentMetaMap();
  const codeKey = s.studentCode || s.id;
  const meta = metaMap[codeKey] || metaMap[String(codeKey).toUpperCase()] || {};
  const chronologicalHist = ctx
    ? ctx.chronologicalHist
    : [...(typeof getClassHistoryList === 'function' ? getClassHistoryList() : [])].reverse();
  const scheduleMap = ctx
    ? ctx.scheduleMap
    : (typeof getClassSchedulesMap === 'function' ? getClassSchedulesMap() : {});

  // 1. Tính ngày bắt đầu học (Ưu tiên ngày đã lưu trong meta -> ngày bắt đầu của đợt lịch sử cũ nhất -> ngày bắt đầu của lớp hiện tại)
  let startDateIso = meta.startDate || s.startDate || '';
  let historyPaidCount = 0;
  let totalPaidAmount = 0;
  const paidBatchLabels = [];
  const countedBatchKeys = new Set();
  const previousClassesSet = new Set();
  const cleanName = removeVietnameseTones((s.fullName || '').toLowerCase()).trim();

  // Nguồn A: Duyệt tự động tất cả các đợt đã lưu trong Lịch sử (từ cũ nhất đến mới nhất)
  // Hỗ trợ đồng bộ lịch sử khi học sinh chuyển từ lớp cũ sang lớp mới
  chronologicalHist.forEach(hist => {
    const matchedInHist = (hist.studentsSnapshot || []).find(hs => {
      const hsNameClean = removeVietnameseTones((hs.fullName || '').toLowerCase()).trim();
      const sameCode = hs.studentCode && s.studentCode && hs.studentCode === s.studentCode;
      if (sameCode) {
        return !cleanName || !hsNameClean || hsNameClean === cleanName;
      }
      return cleanName && hsNameClean === cleanName;
    });
    if (matchedInHist) {
      const histCls = (hist.className || matchedInHist.className || s.className || '').trim();
      if (histCls && histCls !== s.className) {
        previousClassesSet.add(histCls);
      }
      if (!startDateIso && hist.startDate) {
        startDateIso = hist.startDate;
      }
      if (matchedInHist.status === 'Đã hoàn thành') {
        const bKey = `${histCls}__${hist.periodLabel || ''}__${hist.batchLabel || hist.id}`;
        if (!countedBatchKeys.has(bKey)) {
          countedBatchKeys.add(bKey);
          historyPaidCount++;
          totalPaidAmount += normalizeStoredVnd(matchedInHist.tuitionFee) || 0;
          paidBatchLabels.push(
            histCls && histCls !== s.className
              ? `${hist.batchLabel || hist.periodLabel || 'Đợt cũ'} (Lớp ${histCls})`
              : hist.batchLabel || hist.periodLabel || 'Đợt cũ'
          );
        }
      }
    }
  });

  // Nguồn A2: Duyệt lịch sử chuyển lớp của học sinh (lưu trong meta.transferHistory)
  const transferHistory = Array.isArray(meta.transferHistory) ? meta.transferHistory : [];
  transferHistory.forEach(tr => {
    if (!tr) return;
    const fromCls = String(tr.fromClass || '').trim();
    if (fromCls && fromCls !== s.className) {
      previousClassesSet.add(fromCls);
    }
    if (!startDateIso && tr.startDate) {
      startDateIso = tr.startDate;
    }
    if (tr.mode === 'NEW_BATCH' && tr.status === 'Đã hoàn thành') {
      const bKey = `${fromCls || s.className}__${tr.periodLabel || ''}__${tr.batchLabel || tr.id}`;
      if (!countedBatchKeys.has(bKey)) {
        countedBatchKeys.add(bKey);
        historyPaidCount++;
        totalPaidAmount += normalizeStoredVnd(tr.tuitionFee) || 0;
        paidBatchLabels.push(`${tr.batchLabel || tr.periodLabel || 'Đợt trước'} (Lớp ${fromCls || s.className})`);
      }
    }
  });

  if (!startDateIso) {
    const clsCfg = scheduleMap[s.className];
    startDateIso = clsCfg?.startDate || '2026-05-04';
  }

  // Nguồn B: Duyệt tự động các bản ghi học phí hiện tại của học sinh trên hệ thống có trạng thái "Đã hoàn thành"
  let currentPaidCount = 0;
  (appState.students || []).forEach(hs => {
    const hsNameClean = removeVietnameseTones((hs.fullName || '').toLowerCase()).trim();
    const isSameStu =
      (hs.studentCode && s.studentCode && hs.studentCode === s.studentCode && (!cleanName || hsNameClean === cleanName)) ||
      (cleanName && hsNameClean === cleanName && hs.className === s.className);
    if (isSameStu && hs.status === 'Đã hoàn thành') {
      const clsCfg = scheduleMap[hs.className];
      const label = clsCfg?.batchLabel ? `${clsCfg.batchLabel} (${hs.period})` : hs.period || 'Đợt hiện tại';
      const bKey = `${hs.className}__${hs.period || ''}__${clsCfg?.batchLabel || 'CUR'}`;
      if (!countedBatchKeys.has(bKey)) {
        countedBatchKeys.add(bKey);
        currentPaidCount++;
        totalPaidAmount += normalizeStoredVnd(hs.tuitionFee) || 0;
        paidBatchLabels.push(label);
      }
    }
  });

  // Nguồn C: Kiểm tra Sổ Thu - Chi (Chỉ cộng bù nếu giao dịch khớp cả Mã HS lẫn Tên HS và học sinh không phải là học sinh mới chưa đóng đợt nào)
  const baseIncomeTxs = ctx
    ? ctx.incomeTxs
    : (appState.transactions || []).filter(t => t && t.type === 'Thu' && isCountedInMainFinance(t));
  const studentIncomeTxs = baseIncomeTxs.filter(t => {
    const codeMatch =
      (t.studentCode && s.studentCode && t.studentCode.toUpperCase() === s.studentCode.toUpperCase()) ||
      (s.studentCode && String(t.description || '').toUpperCase().includes(s.studentCode.toUpperCase()));
    if (!codeMatch) return false;
    const descClean = removeVietnameseTones(String(t.description || '').toLowerCase());
    if (String(t.id || '').startsWith('GD_REAL_') && cleanName && !descClean.includes(cleanName)) {
      return false;
    }
    return true;
  });

  let autoPaidBatches = historyPaidCount + currentPaidCount;
  // Nếu học sinh hiện tại đang ở trạng thái "Chưa đóng" / "Chờ duyệt" và chưa từng đóng đợt nào trong lịch sử,
  // thì số đợt tự động bắt buộc là 0 (tránh đếm nhầm giao dịch cũ)
  if (s.status === 'Đã hoàn thành' && studentIncomeTxs.length > autoPaidBatches) {
    const extraTxCount = studentIncomeTxs.length - autoPaidBatches;
    autoPaidBatches = studentIncomeTxs.length;
    const txSum = studentIncomeTxs.reduce((sum, t) => sum + (normalizeStoredVnd(t.amount) || 0), 0);
    if (txSum > totalPaidAmount) {
      totalPaidAmount = txSum;
    }
    for (let k = 0; k < extraTxCount; k++) {
      const tx = studentIncomeTxs[k];
      paidBatchLabels.push(tx.date ? `CK ${formatShortDateVN(tx.date)}` : 'Giao dịch CK');
    }
  }

  // Hỗ trợ điều chỉnh tăng / giảm số đợt đã đóng bằng nút − / +
  const extraOffset = Number(meta.extraPaidBatches || 0);
  const paidBatchesCount = Math.max(0, autoPaidBatches + extraOffset);
  const unitFee =
    s.tuitionFee !== undefined && s.tuitionFee !== null && String(s.tuitionFee).trim() !== ''
      ? normalizeStoredVnd(s.tuitionFee)
      : 600000;

  if (paidBatchesCount === 0) {
    totalPaidAmount = 0;
  } else if (paidBatchesCount !== autoPaidBatches) {
    totalPaidAmount = Math.max(0, totalPaidAmount + (paidBatchesCount - autoPaidBatches) * unitFee);
  }

  const previousClasses = Array.from(previousClassesSet);
  const feeMode = meta.feeMode || 'FIXED';
  const perSessionRate = normalizeStoredVnd(meta.perSessionRate) || 0;
  const lastSessionCount = Number(meta.lastSessionCount || 0);

  return {
    startDateIso,
    startDateVN: formatShortDateVN(startDateIso),
    autoPaidBatches,
    paidBatchesCount,
    paidBatchLabels,
    totalPaidAmount,
    previousClasses,
    transferHistory,
    feeMode,
    perSessionRate,
    lastSessionCount
  };
}

async function updateStudentStartDate(studentId, newDateIso) {
  const s = (appState.students || []).find(item => item.id === studentId);
  if (!s) return;
  const metaMap = getStudentMetaMap();
  const key = s.studentCode || s.id;
  if (!metaMap[key]) metaMap[key] = {};
  metaMap[key].startDate = newDateIso;
  s.startDate = newDateIso;
  saveStudentMetaMap(metaMap, `Đã cập nhật ngày bắt đầu học của ${s.fullName}: ${formatShortDateVN(newDateIso)}!`);
}

let currentDetailStudentId = '';

function openStudentDetailModal(studentId) {
  const s = (appState.students || []).find(item => item.id === studentId);
  if (!s) return;
  currentDetailStudentId = s.id;

  const modal = document.getElementById('student-detail-modal');
  if (!modal) return;

  const stats = getStudentStatistics(s);
  const historyList = typeof getClassHistoryList === 'function' ? getClassHistoryList() : [];
  const scheduleMap = typeof getClassSchedulesMap === 'function' ? getClassSchedulesMap() : {};
  const cleanName = removeVietnameseTones((s.fullName || '').toLowerCase()).trim();

  // 1. Điền Header & 3 Ô Thống Kê Chính
  document.getElementById('stu-detail-code').textContent = s.studentCode || 'HS';
  document.getElementById('stu-detail-name').textContent = s.fullName || '';
  const subParts = [`Lớp hiện tại: ${s.className || '---'}`];
  if (stats.previousClasses && stats.previousClasses.length > 0) {
    subParts.push(`Đã học: Lớp ${stats.previousClasses.join(', ')}`);
  }
  if (s.parentName && s.parentName.trim()) {
    subParts.push(`Phụ huynh: ${s.parentName.trim()}`);
  }
  if (s.parentPhone && s.parentPhone.trim() && s.parentPhone.trim() !== '1234567890') {
    subParts.push(`SĐT: ${s.parentPhone.trim()}`);
  } else {
    subParts.push(`Kỳ học: ${s.period || '---'}`);
  }
  document.getElementById('stu-detail-sub').textContent = subParts.join(' • ');

  const startInput = document.getElementById('stu-detail-start-input');
  if (startInput) startInput.value = stats.startDateIso || '';
  document.getElementById('stu-detail-start-text').textContent = `Từ ngày: ${stats.startDateVN || '---'}`;
  document.getElementById('stu-detail-paid-batches').textContent = `${stats.paidBatchesCount} đợt`;
  document.getElementById('stu-detail-total-paid').textContent = formatCurrency(stats.totalPaidAmount);
  const curSessionsCnt = typeof getClassTotalSessionsCount === 'function' ? getClassTotalSessionsCount(s.className, scheduleMap) : 0;
  document.getElementById('stu-detail-current-fee').textContent =
    stats.feeMode === 'PER_SESSION' && stats.perSessionRate > 0
      ? `Học phí: ${formatCurrency(s.tuitionFee)} (${formatCurrency(stats.perSessionRate)}/buổi × ${stats.lastSessionCount || curSessionsCnt} buổi)`
      : `Mức học phí: ${formatCurrency(s.tuitionFee)}/đợt`;

  // 2. Tạo danh sách tất cả các đợt học của học sinh này (Lịch sử lớp + Lịch sử chuyển lớp + Đợt hiện tại)
  const batchRecords = [];
  const seenBatchKeys = new Set();
  const chronologicalHist = [...historyList].reverse();
  chronologicalHist.forEach(hist => {
    const matchedInHist = (hist.studentsSnapshot || []).find(
      hs =>
        (hs.studentCode && hs.studentCode === s.studentCode) ||
        (cleanName && removeVietnameseTones((hs.fullName || '').toLowerCase()).trim() === cleanName)
    );
    if (matchedInHist) {
      const clsName = hist.className || matchedInHist.className || s.className;
      const bKey = `${clsName}__${hist.periodLabel || ''}__${hist.batchLabel || hist.id}`;
      seenBatchKeys.add(bKey);
      batchRecords.push({
        className: clsName,
        batchLabel: hist.batchLabel || 'ĐỢT CŨ',
        periodLabel: hist.periodLabel || '',
        dateRange:
          hist.startDate && hist.endDate
            ? `${formatShortDateVN(hist.startDate)} → ${formatShortDateVN(hist.endDate)}`
            : hist.archivedAt || '---',
        fee: normalizeStoredVnd(matchedInHist.tuitionFee) || 0,
        status: matchedInHist.status || 'Chưa đóng',
        note: matchedInHist.note || '',
        isCurrent: false
      });
    }
  });

  (stats.transferHistory || []).forEach(tr => {
    if (!tr) return;
    const fromCls = tr.fromClass || s.className;
    const bKey = `${fromCls}__${tr.periodLabel || ''}__${tr.batchLabel || tr.id}`;
    if (seenBatchKeys.has(bKey)) return;
    seenBatchKeys.add(bKey);
    batchRecords.push({
      className: fromCls,
      batchLabel: tr.batchLabel || 'ĐỢT TRƯỚC',
      periodLabel: tr.periodLabel || '',
      dateRange: tr.dateRange || (tr.transferredAt ? `Chuyển lớp ngày ${tr.transferredAt}` : '---'),
      fee: normalizeStoredVnd(tr.tuitionFee) || 0,
      status: tr.status || 'Chưa đóng',
      note: tr.toClass
        ? `Chuyển từ Lớp ${fromCls} sang Lớp ${tr.toClass}${tr.note ? ` (${tr.note})` : ''}`
        : tr.note || '',
      isCurrent: false
    });
  });

  const curClsCfg = scheduleMap[s.className] || {};
  batchRecords.push({
    className: s.className,
    batchLabel: curClsCfg.batchLabel || 'ĐỢT HIỆN TẠI',
    periodLabel: s.period || curClsCfg.periodLabel || '',
    dateRange:
      curClsCfg.startDate && curClsCfg.endDate
        ? `${formatShortDateVN(curClsCfg.startDate)} → ${formatShortDateVN(curClsCfg.endDate)}`
        : 'Đang diễn ra',
    fee: normalizeStoredVnd(s.tuitionFee) || 0,
    status: s.status || 'Chưa đóng',
    note: s.note || '',
    isCurrent: true
  });

  const batchesTbody = document.getElementById('stu-detail-batches-tbody');
  if (batchesTbody) {
    batchesTbody.innerHTML = batchRecords
      .map((b, idx) => {
        const isPaid = b.status === 'Đã hoàn thành';
        const badgeCls = isPaid
          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
          : b.status === 'Chờ duyệt'
          ? 'bg-amber-100 text-amber-800 border-amber-300'
          : 'bg-rose-50 text-rose-700 border-rose-200';
        return `
          <tr class="${b.isCurrent ? 'bg-blue-50/40' : 'hover:bg-slate-50'}">
            <td class="py-3 px-4 text-center font-bold text-slate-500 whitespace-nowrap">${idx + 1}</td>
            <td class="py-3 px-4 whitespace-nowrap">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-900 font-extrabold text-xs uppercase whitespace-nowrap">${escapeHtml(
                  b.batchLabel
                )}</span>
                <span class="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 font-extrabold text-xs whitespace-nowrap">Lớp ${escapeHtml(
                  b.className || s.className
                )}</span>
                <span class="font-bold text-slate-800 whitespace-nowrap">${escapeHtml(b.periodLabel)}</span>
                ${
                  b.isCurrent
                    ? `<span class="px-2 py-0.5 rounded-md bg-blue-600 text-white text-[11px] font-bold whitespace-nowrap">Hiện tại</span>`
                    : ''
                }
              </div>
              ${
                b.note
                  ? `<div class="text-[11px] text-slate-500 italic mt-0.5">${escapeHtml(b.note)}</div>`
                  : ''
              }
            </td>
            <td class="py-3 px-4 text-center text-xs sm:text-sm text-slate-600 font-semibold whitespace-nowrap">${escapeHtml(b.dateRange)}</td>
            <td class="py-3 px-4 text-right font-extrabold text-slate-900 whitespace-nowrap">${formatCurrency(b.fee)}</td>
            <td class="py-3 px-4 text-center whitespace-nowrap">
              <span class="inline-flex items-center justify-center px-3 py-1 rounded-full border text-xs font-extrabold whitespace-nowrap ${badgeCls}">
                ${escapeHtml(b.status)}
              </span>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  // 3. Lịch sử giao dịch thu học phí / chuyển khoản của học sinh này
  const studentTxs = (appState.transactions || []).filter(
    t =>
      t.type === 'Thu' &&
      ((t.studentCode && s.studentCode && t.studentCode.toUpperCase() === s.studentCode.toUpperCase()) ||
        (s.studentCode && String(t.description || '').toUpperCase().includes(s.studentCode.toUpperCase())))
  );

  const txContainer = document.getElementById('stu-detail-tx-list');
  if (txContainer) {
    if (studentTxs.length === 0) {
      txContainer.innerHTML = `
        <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-400">
          Chưa có giao dịch thu học phí nào được ghi nhận trong Sổ Thu - Chi cho học sinh này.
        </div>
      `;
    } else {
      txContainer.innerHTML = studentTxs
        .map(tx => {
          const isTestTx = isSimulatedBankTestItem(tx);
          const isExcludedTx = !isTestTx && isTransactionExcludedFromSystem(tx);
          const txTag = getTransactionTagLabel(tx);
          const cleanDesc = isTestTx ? stripRedundantTestPrefix(tx.description) : tx.description;
          return `
          <div class="p-3 rounded-xl ${
            isTestTx
              ? 'bg-amber-50/70 border border-amber-300'
              : isExcludedTx
              ? 'bg-slate-100 border border-slate-300 opacity-85'
              : 'bg-emerald-50/50 border border-emerald-200'
          } flex flex-wrap items-center justify-between gap-2 text-xs">
            <div class="space-y-0.5">
              <div class="font-bold text-slate-900 flex flex-wrap items-center gap-1.5">
                <span class="px-2 py-0.2 rounded ${
                  isTestTx ? 'bg-amber-600' : isExcludedTx ? 'bg-slate-600' : 'bg-emerald-600'
                } text-white tabular-nums text-xs">${escapeHtml(tx.id)}</span>
                ${
                  isExcludedTx
                    ? `<span class="px-2 py-0.2 rounded bg-rose-100 text-rose-800 border border-rose-300 font-extrabold text-[11px]">${escapeHtml(
                        txTag || 'Không ghi nhận hệ thống'
                      )}</span>`
                    : ''
                }
                <span>${escapeHtml(cleanDesc || 'Thu học phí')}</span>
              </div>
              <div class="text-[11px] text-slate-500">
                Ngày: <strong>${escapeHtml(formatShortDateVN(tx.date))}</strong> • Phương thức: <strong>${escapeHtml(
                  isTestTx ? 'Test STK (0 ₫)' : tx.method || 'Chuyển khoản'
                )}</strong>
              </div>
            </div>
            <div class="text-right leading-tight">
              ${
                isTestTx
                  ? `<div class="text-xs font-extrabold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">Test không cộng tiền</div>
                     <div class="font-black text-xs sm:text-sm text-amber-700 mt-0.5">${formatCurrency(
                       tx.testDisplayAmount || 600000
                     )}</div>`
                  : isExcludedTx
                  ? `<div class="text-[11px] font-extrabold text-rose-800 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-300">Không ghi nhận hệ thống</div>
                     <div class="font-black text-xs sm:text-sm line-through text-slate-400 mt-0.5">+${formatCurrency(tx.amount)}</div>`
                  : `<div class="font-extrabold text-sm text-emerald-700">+${formatCurrency(tx.amount)}</div>`
              }
            </div>
          </div>
        `;
        })
        .join('');
    }
  }

  // 4. Nút thao tác nhanh
  const qrBtn = document.getElementById('stu-detail-btn-qr');
  if (qrBtn) {
    qrBtn.onclick = () => {
      closeStudentDetailModal();
      openPaymentModal(s.id);
    };
  }
  const transferBtn = document.getElementById('stu-detail-btn-transfer');
  if (transferBtn) {
    transferBtn.onclick = () => {
      closeStudentDetailModal();
      openTransferStudentModal(s.id);
    };
  }
  const editBtn = document.getElementById('stu-detail-btn-edit');
  if (editBtn) {
    editBtn.onclick = () => {
      closeStudentDetailModal();
      openStudentModal(s.id);
    };
  }

  modal.classList.remove('hidden');
  lucide.createIcons();
}

function closeStudentDetailModal() {
  const modal = document.getElementById('student-detail-modal');
  if (modal) modal.classList.add('hidden');
}

async function openTransferStudentModal(studentId) {
  const s = (appState.students || []).find(item => item.id === studentId);
  if (!s) return;

  const map = typeof getClassSchedulesMap === 'function' ? getClassSchedulesMap() : {};
  const activeClasses = (typeof getAvailableActiveClassNames === 'function' ? getAvailableActiveClassNames() : Object.keys(map)).filter(
    c => c && c !== s.className
  );
  if (activeClasses.length === 0) {
    showToast('Hiện chưa có lớp học nào khác để chuyển đến! Hãy tạo thêm lớp mới trước.', 'warning');
    return;
  }

  const oldClass = s.className || '---';
  const oldCfg = map[oldClass] || getDefaultClassScheduleConfig(oldClass);
  const classOptions = activeClasses.map(cls => {
    const cCfg = map[cls] || {};
    const subInfo = [cCfg.batchLabel, cCfg.periodLabel].filter(Boolean).join(' • ');
    return {
      value: cls,
      label: `Lớp ${cls}${subInfo ? ` (${subInfo})` : ''}`
    };
  });

  const res = await showTcAppDialog({
    mode: 'fields',
    tone: 'indigo',
    badge: 'THANH CHÍ EDU • CHUYỂN LỚP & ĐỒNG BỘ LỊCH SỬ',
    title: `Chuyển lớp: ${s.fullName} (${s.studentCode})`,
    message: `Đang học tại Lớp ${oldClass} • ${oldCfg.batchLabel || 'Đợt hiện tại'} (${s.period || oldCfg.periodLabel || ''}) • Học phí: ${formatCurrency(s.tuitionFee)} (${s.status}). Hệ thống sẽ giữ nguyên toàn bộ lịch sử lớp cũ và các đợt đã đóng:`,
    okText: 'Xác nhận chuyển lớp',
    fields: [
      {
        key: 'targetClass',
        label: '1. Chọn Lớp học chuyển đến',
        type: 'select',
        defaultValue: classOptions[0].value,
        options: classOptions
      },
      {
        key: 'transferMode',
        label: '2. Cách đồng bộ Đợt học & Trạng thái học phí ở lớp mới',
        type: 'select',
        defaultValue: 'NEW_BATCH',
        options: [
          {
            value: 'NEW_BATCH',
            label: `Chuyển sang đợt mới ở lớp đích (Lưu đợt cũ Lớp ${oldClass} vào lịch sử & đặt lại Chưa đóng)`
          },
          {
            value: 'SAME_BATCH',
            label: `Chuyển ngang trong cùng đợt (Giữ nguyên trạng thái "${s.status}" & chuyển điểm danh sang lớp mới)`
          }
        ]
      },
      {
        key: 'note',
        label: '3. Ghi chú chuyển lớp (Không bắt buộc)',
        type: 'text',
        defaultValue: `Chuyển từ Lớp ${oldClass}`,
        placeholder: 'VD: Chuyển từ Lớp 12A1 sang từ Đợt 2...'
      }
    ]
  });

  if (!res || !res.targetClass) return;
  const targetClass = String(res.targetClass).trim();
  if (!targetClass || targetClass === oldClass) return;

  // Lấy lại bản ghi học sinh trực tiếp từ appState.students hiện tại (tránh tham chiếu cũ nếu có đồng bộ ngầm trong lúc mở hộp thoại)
  const liveStu = (appState.students || []).find(
    item => item && (item.id === studentId || (s.studentCode && item.studentCode === s.studentCode))
  );
  if (!liveStu) {
    showToast('Không tìm thấy hồ sơ học sinh để chuyển lớp!', 'error');
    return;
  }

  lastLocalMutationAtMs = Date.now();
  unmarkClassAsDeletedInState(targetClass);
  const latestMap = typeof getClassSchedulesMap === 'function' ? getClassSchedulesMap() : map;
  const mode = res.transferMode === 'SAME_BATCH' ? 'SAME_BATCH' : 'NEW_BATCH';
  const targetCfg = latestMap[targetClass] || { ...getDefaultClassScheduleConfig(targetClass), className: targetClass };
  if (!latestMap[targetClass]) {
    latestMap[targetClass] = targetCfg;
  }
  const nowStr = getCurrentDateTimeString();

  const metaMap = getStudentMetaMap();
  const codeKey = liveStu.studentCode || liveStu.id;
  if (!metaMap[codeKey]) metaMap[codeKey] = {};
  if (!Array.isArray(metaMap[codeKey].transferHistory)) {
    metaMap[codeKey].transferHistory = [];
  }

  const newHistoryEntry = {
    id: 'TR_' + Date.now(),
    transferredAt: nowStr,
    mode,
    fromClass: oldClass,
    toClass: targetClass,
    startDate: oldCfg.startDate || metaMap[codeKey].startDate || '',
    batchLabel: oldCfg.batchLabel || 'ĐỢT TRƯỚC',
    periodLabel: liveStu.period || oldCfg.periodLabel || '',
    dateRange:
      oldCfg.startDate && oldCfg.endDate
        ? `${formatShortDateVN(oldCfg.startDate)} → ${formatShortDateVN(oldCfg.endDate)}`
        : nowStr,
    tuitionFee: normalizeStoredVnd(liveStu.tuitionFee) ?? 0,
    status: liveStu.status || 'Chưa đóng',
    note: liveStu.note || ''
  };

  // Tránh nhân đôi lịch sử nếu cùng 1 lần chuyển lớp từ oldClass sang targetClass
  const histArr = metaMap[codeKey].transferHistory;
  const lastHist = histArr.length > 0 ? histArr[histArr.length - 1] : null;
  if (
    lastHist &&
    lastHist.fromClass === oldClass &&
    lastHist.toClass === targetClass &&
    lastHist.batchLabel === newHistoryEntry.batchLabel
  ) {
    histArr[histArr.length - 1] = newHistoryEntry;
  } else {
    histArr.push(newHistoryEntry);
  }

  // Nếu chuyển ngang trong cùng đợt, đồng bộ dữ liệu điểm danh của học sinh từ lớp cũ sang lớp mới
  if (mode === 'SAME_BATCH' && typeof getStudentAttendanceMap === 'function') {
    const attMap = getStudentAttendanceMap();
    if (attMap[oldClass] && attMap[oldClass][liveStu.id]) {
      if (!attMap[targetClass]) attMap[targetClass] = {};
      attMap[targetClass][liveStu.id] = {
        ...(attMap[oldClass][liveStu.id] || {}),
        ...(attMap[targetClass][liveStu.id] || {})
      };
      if (!appState.settings) appState.settings = {};
      appState.settings.studentAttendanceJson = JSON.stringify(attMap);
    }
  }

  liveStu.className = targetClass;
  if (targetCfg.periodLabel) {
    liveStu.period = targetCfg.periodLabel;
  }
  if (mode === 'NEW_BATCH') {
    liveStu.status = 'Chưa đóng';
    liveStu.receiptUrl = '';
  }
  const customNote = String(res.note || '').trim();
  liveStu.note = customNote || `Chuyển từ Lớp ${oldClass}`;

  // Nếu học sinh đang bật chế độ tính học phí theo số buổi, tự động cập nhật theo tổng số buổi dạy của lớp mới
  if (metaMap[codeKey].feeMode === 'PER_SESSION' && normalizeStoredVnd(metaMap[codeKey].perSessionRate) > 0) {
    const targetSessions = getClassTotalSessionsCount(targetClass, latestMap);
    if (targetSessions > 0) {
      const newFee = normalizeStoredVnd(metaMap[codeKey].perSessionRate) * targetSessions;
      liveStu.tuitionFee = newFee;
      metaMap[codeKey].lastSessionCount = targetSessions;
      recordExactSmallAmount(appState, liveStu.id, liveStu.studentCode, newFee);
    }
  }

  liveStu.updatedAt = nowStr;
  if (!appState.settings) appState.settings = {};
  appState.settings.classSchedulesJson = JSON.stringify(latestMap);
  appState.settings.studentMetaJson = JSON.stringify(metaMap);

  // Chuyển bộ lọc lớp sang lớp đích để Quản lý thấy ngay kết quả học sinh trong lớp mới
  selectedClassbookClass = targetClass;
  if (
    typeof getGradeCategoryForClassName === 'function' &&
    selectedClassbookGradeFilter !== 'ALL' &&
    getGradeCategoryForClassName(targetClass) !== selectedClassbookGradeFilter
  ) {
    selectedClassbookGradeFilter = 'ALL';
  }
  const stuClassFilterEl = document.getElementById('filter-student-class');
  if (stuClassFilterEl && stuClassFilterEl.value !== 'ALL' && stuClassFilterEl.value !== targetClass) {
    stuClassFilterEl.value = 'ALL';
  }

  saveStateToLocal();
  await triggerAutoSyncIfNeeded(
    `Đã chuyển học sinh "${liveStu.fullName}" từ Lớp ${oldClass} sang Lớp ${targetClass} & đồng bộ đầy đủ lịch sử!`
  );
}

async function handleDetailStartDateChange(newDateIso) {
  if (!currentDetailStudentId || !newDateIso) return;
  await updateStudentStartDate(currentDetailStudentId, newDateIso);
  openStudentDetailModal(currentDetailStudentId);
}

async function adjustStudentPaidBatches(studentId, delta) {
  const s = (appState.students || []).find(item => item.id === studentId);
  if (!s) return;
  const metaMap = getStudentMetaMap();
  const key = s.studentCode || s.id;
  if (!metaMap[key]) metaMap[key] = {};
  const curExtra = Number(metaMap[key].extraPaidBatches || 0);
  const stats = getStudentStatistics(s);
  const nextCount = stats.paidBatchesCount + delta;
  if (nextCount < 0) return;

  metaMap[key].extraPaidBatches = curExtra + delta;
  saveStudentMetaMap(
    metaMap,
    `Đã cập nhật số đợt đã đóng của ${s.fullName}: ${nextCount} đợt!`
  );
}

async function adjustDetailStudentPaidBatches(delta) {
  if (!currentDetailStudentId) return;
  await adjustStudentPaidBatches(currentDetailStudentId, delta);
  openStudentDetailModal(currentDetailStudentId);
}

async function adjustCurrentClassBatchNumber(delta) {
  const map = getClassSchedulesMap();
  const targetClass = selectedClassbookClass || Object.keys(map)[0] || '';
  if (!targetClass) return;
  const cfg = map[targetClass] || getDefaultClassScheduleConfig(targetClass);
  const curLabel = String(cfg.batchLabel || 'ĐỢT SỐ 1').trim().toUpperCase();
  const numMatch = curLabel.match(/(\d+)/);
  const curNum = numMatch ? parseInt(numMatch[1], 10) : 1;
  const nextNum = Math.max(1, curNum + delta);
  if (nextNum === curNum && delta < 0) return;

  const hasSo = curLabel.includes('SỐ');
  const nextLabel = hasSo ? `ĐỢT SỐ ${nextNum}` : `ĐỢT ${nextNum}`;
  cfg.batchLabel = nextLabel;
  map[targetClass] = cfg;
  if (!appState.settings) appState.settings = {};
  appState.settings.classSchedulesJson = JSON.stringify(map);
  saveStateToLocal();
  await triggerAutoSyncIfNeeded(`Đã chuyển lớp ${targetClass} sang ${nextLabel}!`);
}

function adjustModalBatchInput(delta) {
  const input = document.getElementById('cs-form-batch');
  if (!input) return;
  const curLabel = String(input.value || 'ĐỢT SỐ 1').trim().toUpperCase();
  const numMatch = curLabel.match(/(\d+)/);
  const curNum = numMatch ? parseInt(numMatch[1], 10) : 1;
  const nextNum = Math.max(1, curNum + delta);
  const hasSo = curLabel.includes('SỐ') || !curLabel;
  input.value = hasSo ? `ĐỢT SỐ ${nextNum}` : `ĐỢT ${nextNum}`;
}

function getActiveTimeFilterDescription() {
  if (selectedStuStatTimeMode === 'MONTH') {
    const m = document.getElementById('filter-stu-month')?.value || 'ALL';
    const y = document.getElementById('filter-stu-month-year')?.value || 'ALL';
    const mText = m === 'ALL' ? 'Tất cả tháng' : `Tháng ${m}`;
    const yText = y === 'ALL' ? 'Tất cả năm' : `Năm ${y}`;
    return `${mText} / ${yText}`;
  }
  if (selectedStuStatTimeMode === 'YEAR') {
    const y = document.getElementById('filter-stu-year')?.value || 'ALL';
    return y === 'ALL' ? 'Tất cả các năm' : `Năm ${y}`;
  }
  if (selectedStuStatTimeMode === 'DAY') {
    const d = document.getElementById('filter-stu-date')?.value || '';
    return d ? `Ngày ${formatShortDateVN(d)}` : 'Theo ngày';
  }
  if (selectedStuStatTimeMode === 'RANGE') {
    const f = document.getElementById('filter-stu-from-date')?.value || '';
    const t = document.getElementById('filter-stu-to-date')?.value || '';
    if (f && t) return `${formatShortDateVN(f)} → ${formatShortDateVN(t)}`;
    if (f) return `Từ ${formatShortDateVN(f)}`;
    if (t) return `Đến ${formatShortDateVN(t)}`;
    return 'Khoảng thời gian';
  }
  const p = document.getElementById('filter-student-period')?.value || 'ALL';
  if (p !== 'ALL') return p;
  return 'Tất cả thời gian';
}

function renderAdminStudents() {
  const tbody = document.getElementById('admin-students-tbody');
  if (!tbody) return;

  const allStudents = appState.students || [];
  const scheduleMap = typeof getClassSchedulesMap === 'function' ? getClassSchedulesMap() : {};
  const statsCtx = buildStudentStatsContext(scheduleMap);
  const list = getFilteredStudents(statsCtx);

  // 1. Tính toán các chỉ số thống kê của danh sách đang hiển thị
  const paidList = list.filter(s => s.status === 'Đã hoàn thành');
  const pendingList = list.filter(s => s.status === 'Chờ duyệt');
  const unpaidList = list.filter(s => s.status === 'Chưa đóng');

  const paidSum = paidList.reduce((sum, s) => sum + (Number(s.tuitionFee) || 0), 0);
  const unpaidSum = unpaidList.reduce((sum, s) => sum + (Number(s.tuitionFee) || 0), 0);
  const totalFeeSum = list.reduce((sum, s) => sum + (Number(s.tuitionFee) || 0), 0);

  let totalBatchesPaidCount = 0;
  let allTimePaidSum = 0;
  const studentStatsCache = new Map();
  list.forEach(s => {
    const st = getStudentStatistics(s, statsCtx);
    studentStatsCache.set(s.id, st);
    totalBatchesPaidCount += st.paidBatchesCount;
    allTimePaidSum += st.totalPaidAmount;
  });

  const activeClassesInList = new Set(list.map(s => s.className).filter(Boolean));
  const allClassNames = sortClassNamesStandard(
    Array.from(
      new Set([
        ...Object.keys(scheduleMap),
        ...allStudents.map(s => (s.className || '').trim()).filter(Boolean)
      ])
    )
  );
  const paidRateText =
    list.length > 0 ? ((paidList.length / list.length) * 100).toFixed(1).replace('.', ',') + '%' : '0%';

  // Cập nhật tiêu đề Sổ Thống Kê, Thanh Sub-bar & 4 Ô KPI chuẩn mẫu Sổ Theo Dõi
  const currentClassFilter = document.getElementById('filter-student-class')?.value || 'ALL';
  const timeDesc = getActiveTimeFilterDescription();

  const delClassBtnLabel = document.getElementById('btn-students-delete-class-label');
  if (delClassBtnLabel) {
    delClassBtnLabel.textContent =
      currentClassFilter === 'ALL' ? 'Xóa Lớp' : `Xóa Lớp "${currentClassFilter}"`;
  }

  const sheetTitleEl = document.getElementById('stu-stat-sheet-title');
  if (sheetTitleEl) {
    const classTitlePart =
      currentClassFilter === 'ALL'
        ? selectedAllStuGradeFilter === 'ALL'
          ? 'TẤT CẢ CÁC LỚP'
          : `KHỐI ${selectedAllStuGradeFilter}`
        : `LỚP ${currentClassFilter}`;
    sheetTitleEl.textContent = `SỔ THỐNG KÊ HỌC SINH & QUẢN LÝ HỌC PHÍ - ${classTitlePart} (${timeDesc})`;
  }

  const metaClassEl = document.getElementById('stu-meta-classname');
  const metaTimeEl = document.getElementById('stu-meta-time');
  const metaBatchesEl = document.getElementById('stu-meta-batches');
  if (metaClassEl) {
    metaClassEl.textContent =
      currentClassFilter === 'ALL'
        ? `Tất cả (${activeClassesInList.size}/${allClassNames.length} lớp)`
        : `Lớp ${currentClassFilter}`;
  }
  if (metaTimeEl) metaTimeEl.textContent = timeDesc;
  if (metaBatchesEl) metaBatchesEl.textContent = `${totalBatchesPaidCount} đợt đã đóng`;

  const kpiTotalEl = document.getElementById('all-stu-kpi-total');
  const kpiSubClassesEl = document.getElementById('all-stu-kpi-sub-classes');
  const kpiFilteredEl = document.getElementById('all-stu-kpi-filtered');
  const kpiPaidEl = document.getElementById('all-stu-kpi-paid');
  const kpiPaidSumEl = document.getElementById('all-stu-kpi-paid-sum');
  const kpiAllTimeSumEl = document.getElementById('all-stu-kpi-alltime-sum');
  const kpiPendingEl = document.getElementById('all-stu-kpi-pending');
  const kpiUnpaidEl = document.getElementById('all-stu-kpi-unpaid');
  const kpiUnpaidSumEl = document.getElementById('all-stu-kpi-unpaid-sum');

  if (kpiTotalEl) kpiTotalEl.textContent = `${list.length} HS`;
  if (kpiSubClassesEl) {
    kpiSubClassesEl.textContent =
      list.length === allStudents.length
        ? `Toàn bộ ${allClassNames.length} lớp (${allStudents.length} HS)`
        : `Lọc từ ${allStudents.length} HS (${activeClassesInList.size} lớp)`;
  }
  if (kpiFilteredEl) kpiFilteredEl.textContent = `${list.length} / ${allStudents.length} HS`;
  if (kpiPaidEl) kpiPaidEl.textContent = `${paidList.length} HS (${paidRateText})`;
  if (kpiPaidSumEl) kpiPaidSumEl.textContent = formatCurrency(paidSum);
  if (kpiAllTimeSumEl) kpiAllTimeSumEl.textContent = `Tổng lũy kế ${totalBatchesPaidCount} đợt: ${formatCurrency(allTimePaidSum)}`;
  if (kpiPendingEl) {
    kpiPendingEl.textContent =
      pendingList.length > 0
        ? `${pendingList.length} HS đang chờ duyệt • Đã đóng ${totalBatchesPaidCount} đợt`
        : `Tổng cộng ${totalBatchesPaidCount} đợt đã đóng trên hệ thống`;
  }
  if (kpiUnpaidEl) kpiUnpaidEl.textContent = `${unpaidList.length} HS chưa đóng`;
  if (kpiUnpaidSumEl) kpiUnpaidSumEl.textContent = formatCurrency(unpaidSum);

  // Cập nhật dòng TỔNG CỘNG khớp chính xác 1:1 theo từng cột tiêu đề
  const sumCountEl = document.getElementById('stu-sum-count');
  const sumClassesEl = document.getElementById('stu-sum-classes-cnt');
  const sumStartInfoEl = document.getElementById('stu-sum-start-info');
  const sumBatchesEl = document.getElementById('stu-sum-batches');
  const sumPaidRatioEl = document.getElementById('stu-sum-paid-ratio');
  const sumExpectedEl = document.getElementById('stu-sum-expected');
  const sumCollectedEl = document.getElementById('stu-sum-collected');
  const sumMissingEl = document.getElementById('stu-sum-missing');

  if (sumCountEl) sumCountEl.textContent = `${list.length} HS`;
  if (sumClassesEl) sumClassesEl.textContent = `${activeClassesInList.size} lớp`;
  if (sumStartInfoEl) {
    sumStartInfoEl.innerHTML = `<div class="leading-tight"><div class="text-xs uppercase tracking-normal text-slate-400">Lũy kế</div><div class="text-[11px] text-slate-600">${list.length} hồ sơ</div></div>`;
  }
  if (sumBatchesEl) {
    sumBatchesEl.innerHTML = `<div class="leading-tight"><div>${totalBatchesPaidCount} đợt</div><div class="text-[11px] font-bold">${formatCurrency(
      allTimePaidSum
    )}</div></div>`;
  }
  if (sumPaidRatioEl) {
    sumPaidRatioEl.innerHTML = `<div class="leading-tight"><div>${paidList.length}/${list.length} em</div><div class="text-[11px] text-slate-600">(${paidRateText})</div></div>`;
  }
  if (sumExpectedEl) {
    sumExpectedEl.innerHTML = `<div class="leading-tight"><div class="text-xs uppercase tracking-normal text-slate-500">Tổng học phí</div><div>${formatCurrency(
      totalFeeSum
    )}</div></div>`;
  }
  if (sumCollectedEl) {
    sumCollectedEl.innerHTML = `<div class="leading-tight"><div class="text-xs uppercase tracking-normal text-emerald-600">Đã thu kỳ này</div><div>${formatCurrency(
      paidSum
    )}</div></div>`;
  }
  if (sumMissingEl) {
    sumMissingEl.innerHTML = `<div class="leading-tight"><div class="text-xs uppercase tracking-normal text-rose-500">Còn thiếu</div><div>${formatCurrency(
      unpaidSum
    )}</div></div>`;
  }

  // 2. Render bộ lọc nhanh theo Khối lớp (Tầng 2 cân đối ngang hàng với nút + Tạo Khối / Xóa Khối bên phải)
  const gradeFiltersEl = document.getElementById('all-stu-grade-filters');
  if (gradeFiltersEl) {
    const gradeGroups = getAllGradeGroupsForDisplay(allClassNames, allStudents);
    const activeGradeLabel =
      selectedAllStuGradeFilter && selectedAllStuGradeFilter !== 'ALL'
        ? getGradeLabelByKey(selectedAllStuGradeFilter)
        : '';

    const topDelBtnLabel = document.getElementById('btn-students-delete-grade-label');
    if (topDelBtnLabel) {
      topDelBtnLabel.textContent = activeGradeLabel ? `Xóa ${activeGradeLabel}` : 'Xóa Khối';
    }

    gradeFiltersEl.innerHTML = gradeGroups
      .map(g => {
        const active = selectedAllStuGradeFilter === g.key;
        return `
          <button
            type="button"
            onclick="setAllStuGradeFilter('${escapeAttr(g.key)}')"
            class="h-8 px-3 rounded-lg text-xs font-extrabold transition cursor-pointer inline-flex items-center gap-1.5 border whitespace-nowrap ${
              active
                ? 'bg-blue-600 text-white border-blue-600 '
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            }"
          >
            <span>${escapeHtml(g.label)}</span>
            <span class="px-1.5 py-0.2 rounded-full text-xs ${
              active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }">${g.stuCount} HS</span>
          </button>
        `;
      })
      .join('');
  }

  // 3. Render Lưới Thẻ Đếm & Chọn Lớp 4 cột cân đối (giống hệt Sổ Theo Dõi Lớp Học)
  const classCountsBar = document.getElementById('all-stu-class-counts-bar');
  if (classCountsBar) {
    const visibleClasses =
      selectedAllStuGradeFilter === 'ALL'
        ? allClassNames
        : allClassNames.filter(c => getGradeCategoryForClassName(c) === selectedAllStuGradeFilter);

    const allPaidCnt = allStudents.filter(s => s.status === 'Đã hoàn thành').length;
    const allPaidPct = allStudents.length > 0 ? Math.round((allPaidCnt / allStudents.length) * 100) : 0;
    const isAllSelected = currentClassFilter === 'ALL';

    const allCardHtml = `
      <button
        type="button"
        onclick="quickFilterByClassInAllStudents('ALL')"
        class="class-selector-item ${
          isAllSelected ? 'is-active' : ''
        } group w-full px-3.5 py-2.5 rounded-xl text-left transition cursor-pointer flex flex-col justify-between gap-1.5"
      >
        <div class="flex items-center justify-between gap-2 w-full">
          <span class="font-extrabold text-xs sm:text-sm truncate inline-flex items-center gap-1.5 ${
            isAllSelected ? 'text-white' : 'text-slate-900 group-hover:text-blue-600'
          }">
            <i data-lucide="layers" class="w-3.5 h-3.5 shrink-0"></i>
            <span>Tất cả các lớp</span>
          </span>
          <span class="px-2 py-0.5 rounded-full text-[11px] shrink-0 whitespace-nowrap ${
            isAllSelected
              ? 'bg-amber-300 text-slate-950 font-black '
              : 'bg-blue-50 text-blue-700 font-extrabold border border-blue-200'
          }">
            ${allStudents.length} HS
          </span>
        </div>
        <div class="flex items-center justify-between gap-2 w-full text-[11px]">
          <span class="truncate font-semibold ${isAllSelected ? 'text-blue-100' : 'text-slate-500'}">
            Tổng hợp ${allClassNames.length} lớp học
          </span>
          <span class="shrink-0 font-bold whitespace-nowrap ${
            isAllSelected ? 'text-emerald-200' : 'text-emerald-600'
          }">
            ${allPaidCnt}/${allStudents.length} đóng (${allPaidPct}%)
          </span>
        </div>
        <div class="class-card-progress-track">
          <div class="class-card-progress-fill" style="width: ${allPaidPct}%"></div>
        </div>
      </button>
    `;

    const classCardsHtml = visibleClasses
      .map(cls => {
        const isSelected = currentClassFilter === cls;
        const clsStudents = allStudents.filter(s => s.className === cls);
        const count = clsStudents.length;
        const paidCnt = clsStudents.filter(s => s.status === 'Đã hoàn thành').length;
        const paidPct = count > 0 ? Math.round((paidCnt / count) * 100) : 0;
        const cCfg = scheduleMap[cls] || {};
        const { mainTitle, subLabel } = parseClassDisplayTitle(cls);
        const batchTag = cCfg.batchLabel || 'ĐỢT 1';

        return `
          <div
            role="button"
            tabindex="0"
            onclick="quickFilterByClassInAllStudents('${escapeAttr(cls)}')"
            class="class-selector-item ${
              isSelected ? 'is-active' : ''
            } group w-full px-3.5 py-2.5 rounded-xl text-left transition cursor-pointer flex flex-col justify-between gap-1.5"
          >
            <div class="flex items-center justify-between gap-1.5 w-full">
              <span class="font-extrabold text-xs sm:text-sm truncate ${
                isSelected ? 'text-white' : 'text-slate-900 group-hover:text-blue-600'
              }">
                ${escapeHtml(mainTitle)}
              </span>
              <div class="flex items-center gap-1 shrink-0">
                <span class="px-2 py-0.5 rounded-full text-[11px] whitespace-nowrap ${
                  isSelected
                    ? 'bg-amber-300 text-slate-950 font-black '
                    : 'bg-blue-50 text-blue-700 font-extrabold border border-blue-200'
                }">
                  ${count} HS
                </span>
                <button
                  type="button"
                  onclick="event.stopPropagation(); deleteClassByName('${escapeAttr(cls)}')"
                  title="Xóa lớp ${escapeAttr(cls)}"
                  class="class-card-del-btn p-1 rounded-lg ${
                    isSelected
                      ? 'text-white/80 hover:text-white hover:bg-rose-500/80'
                      : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                  } transition cursor-pointer"
                >
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
            <div class="flex items-center justify-between gap-2 w-full text-[11px]">
              <span class="truncate font-semibold ${isSelected ? 'text-blue-100' : 'text-slate-500'}">
                ${escapeHtml(subLabel)} • ${escapeHtml(batchTag)}
              </span>
              <span class="shrink-0 font-bold whitespace-nowrap ${
                isSelected
                  ? 'text-emerald-200'
                  : paidCnt === count && count > 0
                  ? 'text-emerald-600'
                  : 'text-slate-500'
              }">
                ${paidCnt}/${count} đóng (${paidPct}%)
              </span>
            </div>
            <div class="class-card-progress-track">
              <div class="class-card-progress-fill" style="width: ${paidPct}%"></div>
            </div>
          </div>
        `;
      })
      .join('');

    classCountsBar.innerHTML = allCardHtml + classCardsHtml;
  }

  // 4. Render Lưới Thẻ Tổng Hợp Theo Từng Tháng / Kỳ & Năm (Bấm để xem thống kê của Tháng / Kỳ đó)
  const periodBreakdownEl = document.getElementById('all-stu-period-breakdown');
  if (periodBreakdownEl) {
    const currentPeriodFilter = document.getElementById('filter-student-period')?.value || 'ALL';
    const baseStudentsForPeriod = allStudents.filter(s => {
      if (selectedAllStuGradeFilter !== 'ALL' && getGradeCategoryForClassName(s.className) !== selectedAllStuGradeFilter) {
        return false;
      }
      if (currentClassFilter !== 'ALL' && s.className !== currentClassFilter) return false;
      return true;
    });

    const periodGroups = new Map();
    baseStudentsForPeriod.forEach(s => {
      const p = (s.period || 'Chưa phân kỳ').trim();
      if (!periodGroups.has(p)) {
        periodGroups.set(p, { period: p, total: 0, paid: 0, collected: 0, missing: 0 });
      }
      const g = periodGroups.get(p);
      g.total++;
      const fee = Number(s.tuitionFee) || 0;
      if (s.status === 'Đã hoàn thành') {
        g.paid++;
        g.collected += fee;
      } else {
        g.missing += fee;
      }
    });

    const periodEntries = Array.from(periodGroups.values());
    periodBreakdownEl.innerHTML = periodEntries
      .map(g => {
        const isSelected = currentPeriodFilter === g.period;
        return `
          <button
            type="button"
            onclick="quickSelectPeriodBreakdown('${escapeAttr(g.period)}')"
            class="class-selector-item ${
              isSelected ? 'is-active' : ''
            } px-3.5 py-2.5 rounded-xl text-left transition cursor-pointer flex flex-col justify-between gap-1"
            title="Bấm để lọc riêng học sinh thuộc kỳ ${escapeAttr(g.period)}"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-extrabold text-xs truncate inline-flex items-center gap-1.5 ${
                isSelected ? 'text-white' : 'text-slate-900'
              }">
                <i data-lucide="calendar-days" class="w-3.5 h-3.5 shrink-0"></i>
                <span>${escapeHtml(g.period)}</span>
              </span>
              <span class="px-2 py-0.2 rounded-full text-[11px] font-extrabold whitespace-nowrap ${
                isSelected ? 'bg-amber-300 text-slate-950' : 'bg-slate-100 text-slate-700 border border-slate-300'
              }">
                ${g.total} HS
              </span>
            </div>
            <div class="flex items-center justify-between gap-2 text-[11px] pt-0.5">
              <span class="font-bold whitespace-nowrap ${
                isSelected ? 'text-emerald-200' : 'text-emerald-600'
              }">
                Thu: ${formatCurrency(g.collected)}
              </span>
              <span class="font-semibold whitespace-nowrap ${
                isSelected ? 'text-blue-100' : 'text-slate-500'
              }">
                ${g.paid}/${g.total} em
              </span>
            </div>
          </button>
        `;
      })
      .join('');
  }

  // 5. Render Bảng Học Sinh Chuẩn Mẫu Sổ Theo Dõi
  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="py-10 text-center text-slate-400 text-xs sm:text-sm">
          Không tìm thấy học sinh nào khớp với bộ lọc (Lớp / Tháng / Năm / Ngày) hiện tại.
          <button onclick="resetAllStudentStatFilters()" class="text-blue-600 font-bold hover:underline ml-1.5 cursor-pointer">
            [Xem lại tất cả học sinh]
          </button>
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = list
    .map((s, idx) => {
      const isPaid = s.status === 'Đã hoàn thành';
      const isPending = s.status === 'Chờ duyệt';
      const stats = studentStatsCache.get(s.id) || getStudentStatistics(s);
      const statusCellClass = isPaid
        ? 'status-cell-paid'
        : isPending
        ? 'status-cell-pending'
        : 'status-cell-unpaid';

      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-2 px-1.5 text-center font-bold text-slate-600 text-xs whitespace-nowrap">
            ${idx + 1}
          </td>
          <td class="py-2 px-2 text-center tabular-nums font-bold text-xs text-blue-700 whitespace-nowrap">
            ${escapeHtml(s.studentCode)}
          </td>
          <td class="py-2 px-3 min-w-[175px] max-w-[240px]">
            <div class="w-full flex items-center justify-between gap-2">
              <button
                type="button"
                onclick="openStudentDetailModal('${s.id}')"
                class="font-bold text-slate-900 hover:text-blue-600 hover:underline text-left cursor-pointer truncate"
                title="Bấm để xem Hồ sơ chi tiết của học sinh ${escapeAttr(s.fullName)}"
              >
                ${escapeHtml(s.fullName)}
              </button>
              <button
                type="button"
                onclick="openStudentDetailModal('${s.id}')"
                title="Xem hồ sơ chi tiết của học sinh ${escapeAttr(s.fullName)}"
                class="stu-detail-inline-btn shrink-0 ml-auto px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white text-xs font-extrabold border border-blue-200 transition cursor-pointer whitespace-nowrap"
              >
                Chi tiết
              </button>
            </div>
            ${
              s.parentPhone && s.parentPhone !== '1234567890'
                ? `<div class="text-[11px] text-slate-500 tabular-nums mt-0.5">SĐT: ${escapeHtml(s.parentPhone)}</div>`
                : ''
            }
            ${
              stats.previousClasses && stats.previousClasses.length > 0
                ? `<div class="mt-0.5"><span class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[10px]" title="Lịch sử lớp học trước đây"><i data-lucide="arrow-right-left" class="w-2.5 h-2.5"></i><span>Đã học: Lớp ${escapeHtml(
                    stats.previousClasses.join(', ')
                  )}</span></span></div>`
                : ''
            }
            ${s.note ? `<div class="text-[11px] text-slate-500 italic mt-0.5 line-clamp-2">${escapeHtml(s.note)}</div>` : ''}
          </td>
          <td class="py-2 px-2 text-center whitespace-nowrap">
            <button
              type="button"
              onclick="quickFilterByClassInAllStudents('${escapeAttr(s.className)}')"
              class="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-extrabold text-xs transition cursor-pointer whitespace-nowrap"
              title="Bấm để lọc riêng Lớp ${escapeAttr(s.className)}"
            >
              Lớp ${escapeHtml(s.className)}
            </button>
          </td>
          <td class="py-2 px-2 text-center whitespace-nowrap">
            <button
              type="button"
              onclick="openStudentStartDatePicker('${s.id}', '${escapeAttr(stats.startDateIso)}', this)"
              title="Bấm để chọn hoặc sửa ngày bắt đầu học của học sinh"
              class="tc-date-pill-btn"
            >
              <span>${escapeHtml(formatShortDateVN(stats.startDateIso) || 'Chọn ngày')}</span>
              <i data-lucide="calendar" class="w-3.5 h-3.5 text-[#141414] shrink-0"></i>
            </button>
          </td>
          <td class="py-2 px-2 text-center whitespace-nowrap">
            <div class="inline-flex flex-col items-center justify-center min-w-[98px] px-2 py-1 rounded-lg border leading-tight ${
              stats.paidBatchesCount > 0
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-slate-100 border-slate-300 text-slate-600'
            }">
              <div class="inline-flex items-center gap-1">
                <button
                  type="button"
                  onclick="adjustStudentPaidBatches('${s.id}', -1)"
                  title="Giảm 1 đợt đã đóng"
                  class="w-5 h-5 rounded bg-white hover:bg-rose-100 text-rose-700 border border-slate-300 font-black text-xs leading-none flex items-center justify-center cursor-pointer transition"
                >−</button>
                <span class="text-xs font-extrabold min-w-[42px] text-center">${stats.paidBatchesCount} đợt</span>
                <button
                  type="button"
                  onclick="adjustStudentPaidBatches('${s.id}', 1)"
                  title="Tăng 1 đợt đã đóng"
                  class="w-5 h-5 rounded bg-white hover:bg-emerald-100 text-emerald-700 border border-slate-300 font-black text-xs leading-none flex items-center justify-center cursor-pointer transition"
                >+</button>
              </div>
              <span class="text-[11px] font-bold mt-0.5">${formatCurrency(stats.totalPaidAmount)}</span>
            </div>
          </td>
          <td class="py-2 px-2 text-center whitespace-nowrap">
            <span class="inline-block px-2.5 py-1 rounded-lg bg-slate-100 text-slate-900 border border-slate-200 font-bold text-xs whitespace-nowrap">
              ${escapeHtml(s.period)}
            </span>
          </td>
          <td class="py-2 px-2 text-right font-extrabold text-slate-900 whitespace-nowrap">
            <select
              onchange="handleClassbookFeeSelect('${s.id}', this.value)"
              title="Bấm để tùy chọn mức học phí hoặc tính theo số buổi cho học sinh"
              class="tc-fee-select"
            >
              ${getPresetTuitionOptionsHtml(s.tuitionFee, s)}
              <option value="PER_SESSION">⚡ Tính theo số buổi...</option>
              <option value="CUSTOM">+ Số khác...</option>
            </select>
            ${
              stats.feeMode === 'PER_SESSION' && stats.perSessionRate > 0
                ? `<button type="button" onclick="handleClassbookFeeSelect('${s.id}', 'PER_SESSION')" title="Đang tính học phí theo số buổi dạy (Bấm để đổi đơn giá/buổi)" class="block ml-auto mt-0.5 px-1.5 py-0.2 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-extrabold cursor-pointer whitespace-nowrap">${toShortMoney(
                    stats.perSessionRate
                  )}k/b × ${stats.lastSessionCount || getClassTotalSessionsCount(s.className)}b</button>`
                : ''
            }
          </td>
          <td class="py-2 px-2 text-center whitespace-nowrap min-w-[132px] ${statusCellClass}">
            <select
              onchange="quickChangeStudentStatus('${s.id}', this.value)"
              class="status-select bg-transparent text-xs font-bold text-center focus:outline-none cursor-pointer"
            >
              <option value="Đã hoàn thành" ${isPaid ? 'selected' : ''}>Đã hoàn thành</option>
              <option value="Chờ duyệt" ${isPending ? 'selected' : ''}>Chờ duyệt</option>
              <option value="Chưa đóng" ${!isPaid && !isPending ? 'selected' : ''}>Chưa đóng</option>
            </select>
          </td>
          <td class="py-2 px-2 text-center whitespace-nowrap min-w-[148px]">
            <div class="inline-flex items-center justify-center gap-1">
              <button
                type="button"
                onclick="openStudentDetailModal('${s.id}')"
                title="Xem hồ sơ chi tiết học sinh"
                class="tc-row-action-btn bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border-blue-200"
              >
                <i data-lucide="eye" class="w-3.5 h-3.5"></i>
              </button>
              <button
                type="button"
                onclick="openTransferStudentModal('${s.id}')"
                title="Chuyển học sinh sang lớp khác (đồng bộ lịch sử)"
                class="tc-row-action-btn bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border-indigo-200"
              >
                <i data-lucide="arrow-right-left" class="w-3.5 h-3.5"></i>
              </button>
              <button
                type="button"
                onclick="openPaymentModal('${s.id}')"
                title="Lấy mã VietQR của học sinh này"
                class="tc-row-action-btn bg-slate-100 hover:bg-slate-900 text-slate-900 hover:text-white border-slate-200"
              >
                <i data-lucide="qr-code" class="w-3.5 h-3.5"></i>
              </button>
              <button
                type="button"
                onclick="openStudentModal('${s.id}')"
                title="Chỉnh sửa thông tin học sinh"
                class="tc-row-action-btn bg-slate-100 hover:bg-slate-700 text-slate-700 hover:text-white border-slate-200"
              >
                <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
              </button>
              <button
                type="button"
                onclick="deleteStudentRecord('${s.id}')"
                title="Xóa bản ghi học sinh"
                class="tc-row-action-btn bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border-rose-200"
              >
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  lucide.createIcons();
  if (typeof scheduleStickyHeaderSync === 'function') {
    requestAnimationFrame(() => scheduleStickyHeaderSync(true));
  }
}

// Đổi nhanh trạng thái học phí trực tiếp trên bảng Quản lý
function quickChangeStudentStatus(studentId, newStatus) {
  const student = appState.students.find(s => s.id === studentId);
  if (!student) return;

  const oldStatus = student.status;
  const nowStr = getCurrentDateTimeString();
  student.status = newStatus;
  student.updatedAt = nowStr;
  student.manualStatusUpdatedAt = nowStr;

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
        date: nowStr,
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
  } else if (newStatus !== 'Đã hoàn thành' && oldStatus === 'Đã hoàn thành') {
    // Đánh dấu mọi giao dịch SePay hiện có là đã xử lý để khi đổi về Chưa đóng/Chờ duyệt không bị SePay tự gạch nợ lại
    markSepayTxIdsProcessed(appState);
    const toRemove = (appState.transactions || []).filter(
      t =>
        t &&
        t.type === 'Thu' &&
        t.studentCode === student.studentCode &&
        t.description &&
        t.description.includes(student.period) &&
        !String(t.id || '').startsWith('GD_SEPAY_')
    );
    if (toRemove.length > 0) {
      markTransactionsAsDeletedInState(toRemove, appState);
      const removeSet = new Set(toRemove.map(t => t.id));
      appState.transactions = (appState.transactions || []).filter(t => !removeSet.has(t?.id));
    }
  }

  saveStateToLocal();
  triggerAutoSyncIfNeeded(`Đã cập nhật trạng thái ${student.fullName} sang "${newStatus}"!`);
}

// Thêm / Sửa học sinh Modal
function getAvailableActiveClassNames() {
  const map = typeof getClassSchedulesMap === 'function' ? getClassSchedulesMap() : {};
  const deletedSet = getDeletedClassesSet(appState);
  const set = new Set(Object.keys(map).filter(c => c && !DRAFT_CLASS_NAMES.has(c) && !deletedSet.has(c)));
  (appState.students || []).forEach(s => {
    const cls = String(s?.className || '').trim();
    if (cls && !DRAFT_CLASS_NAMES.has(cls) && !deletedSet.has(cls)) set.add(cls);
  });
  const list = Array.from(set);
  return typeof sortClassNamesStandard === 'function' ? sortClassNamesStandard(list) : list;
}

function resolveDefaultModalClassName(preferredClass = '') {
  const activeClasses = getAvailableActiveClassNames();
  const matchCanonical = raw => {
    const clean = String(raw || '').trim();
    if (!clean || clean === 'ALL') return '';
    return activeClasses.find(c => c.toLowerCase() === clean.toLowerCase()) || clean;
  };
  if (preferredClass) return matchCanonical(preferredClass);
  if (currentAdminTab === 'students') {
    const filterCls = document.getElementById('filter-student-class')?.value || '';
    if (filterCls && filterCls !== 'ALL') return matchCanonical(filterCls);
  }
  if (currentAdminTab === 'attendance') {
    const attCls = document.getElementById('att-class-dropdown')?.value || '';
    if (attCls) return matchCanonical(attCls);
  }
  if (selectedClassbookClass && activeClasses.includes(selectedClassbookClass)) {
    return selectedClassbookClass;
  }
  return activeClasses[0] || '';
}

function populateStudentModalClassSelect(targetClass = '') {
  const selectEl = document.getElementById('stu-form-class-select');
  const inputEl = document.getElementById('stu-form-class');
  const activeClasses = getAvailableActiveClassNames();
  const cleanTarget = String(targetClass || '').trim();
  const matchedExisting = cleanTarget
    ? activeClasses.find(c => c.toLowerCase() === cleanTarget.toLowerCase()) || ''
    : '';

  if (!selectEl) {
    if (inputEl) inputEl.value = matchedExisting || cleanTarget;
    return;
  }

  const optionsHtml = activeClasses
    .map(cls => `<option value="${escapeAttr(cls)}">Lớp ${escapeHtml(cls)}</option>`)
    .concat('<option value="__NEW__">+ Nhập tên lớp mới...</option>')
    .join('');
  selectEl.innerHTML = optionsHtml;

  if (matchedExisting) {
    selectEl.value = matchedExisting;
    if (inputEl) {
      inputEl.value = matchedExisting;
      inputEl.classList.add('hidden');
    }
  } else if (!cleanTarget && activeClasses.length > 0) {
    selectEl.value = activeClasses[0];
    if (inputEl) {
      inputEl.value = activeClasses[0];
      inputEl.classList.add('hidden');
    }
  } else {
    selectEl.value = '__NEW__';
    if (inputEl) {
      inputEl.value = cleanTarget;
      inputEl.classList.remove('hidden');
    }
  }
}

function handleStudentModalClassSelectChange(selectedVal) {
  const inputEl = document.getElementById('stu-form-class');
  const isEditing = Boolean(document.getElementById('stu-form-id')?.value);
  if (selectedVal === '__NEW__') {
    if (inputEl) {
      inputEl.value = '';
      inputEl.classList.remove('hidden');
      inputEl.focus();
    }
    return;
  }
  if (inputEl) {
    inputEl.value = selectedVal;
    inputEl.classList.add('hidden');
  }
  if (!isEditing && selectedVal && typeof getClassSchedulesMap === 'function') {
    const cfg = getClassSchedulesMap()[selectedVal];
    const periodEl = document.getElementById('stu-form-period');
    const startDateEl = document.getElementById('stu-form-start-date');
    if (cfg?.periodLabel && periodEl) periodEl.value = cfg.periodLabel;
    if (cfg?.startDate && startDateEl) startDateEl.value = cfg.startDate;
  }
}

function openStudentModal(studentId = '', preferredClass = '') {
  const modal = document.getElementById('student-modal');
  const title = document.getElementById('student-modal-title');
  const startDateInput = document.getElementById('stu-form-start-date');

  if (studentId) {
    const s = appState.students.find(item => item.id === studentId);
    if (!s) return;
    const stats = getStudentStatistics(s);
    title.textContent = 'Chỉnh Sửa Thông Tin Học Sinh';
    document.getElementById('stu-form-id').value = s.id;
    document.getElementById('stu-form-code').value = s.studentCode;
    document.getElementById('stu-form-name').value = s.fullName;
    populateStudentModalClassSelect(s.className);
    document.getElementById('stu-form-period').value = s.period;
    document.getElementById('stu-form-parent').value = s.parentName;
    document.getElementById('stu-form-phone').value = s.parentPhone;
    document.getElementById('stu-form-fee').value = toShortMoney(s.tuitionFee);
    document.getElementById('stu-form-status').value = s.status;
    document.getElementById('stu-form-note').value = s.note || '';
    if (startDateInput) startDateInput.value = stats.startDateIso || '';
  } else {
    const defaultCls = resolveDefaultModalClassName(preferredClass);
    const map = typeof getClassSchedulesMap === 'function' ? getClassSchedulesMap() : {};
    const clsCfg = defaultCls ? map[defaultCls] : null;
    title.textContent = 'Thêm Học Sinh Mới';
    document.getElementById('stu-form-id').value = '';
    document.getElementById('stu-form-code').value = generateNextStudentCode();
    document.getElementById('stu-form-name').value = '';
    populateStudentModalClassSelect(defaultCls);
    document.getElementById('stu-form-period').value =
      clsCfg?.periodLabel || appState.settings.defaultPeriod || 'Tháng 10/2026';
    document.getElementById('stu-form-parent').value = '';
    document.getElementById('stu-form-phone').value = '';
    document.getElementById('stu-form-fee').value = 600;
    document.getElementById('stu-form-status').value = 'Chưa đóng';
    document.getElementById('stu-form-note').value = '';
    if (startDateInput) startDateInput.value = clsCfg?.startDate || new Date().toISOString().slice(0, 10);
  }

  modal.classList.remove('hidden');
}

function closeStudentModal() {
  document.getElementById('student-modal').classList.add('hidden');
}

function saveStudentForm(event) {
  event.preventDefault();
  const id = document.getElementById('stu-form-id').value;
  const rawCode = document.getElementById('stu-form-code').value.trim().toUpperCase();
  const fullName = document.getElementById('stu-form-name').value.trim();
  if (!fullName) {
    showToast('Vui lòng nhập Họ và tên học sinh!', 'warning');
    document.getElementById('stu-form-name')?.focus();
    return;
  }

  const selectEl = document.getElementById('stu-form-class-select');
  const rawInputClass = (document.getElementById('stu-form-class')?.value || '').trim();
  const chosenClass =
    selectEl && selectEl.value && selectEl.value !== '__NEW__' ? selectEl.value.trim() : rawInputClass;
  const activeClasses = getAvailableActiveClassNames();
  const resolvedInputClass = chosenClass
    ? activeClasses.find(c => c.toLowerCase() === chosenClass.toLowerCase()) || chosenClass
    : '';
  const className = resolvedInputClass || resolveDefaultModalClassName() || 'Lớp mới';

  let studentCode = rawCode || generateNextStudentCode();
  if (
    !id &&
    (appState.students || []).some(s => String(s?.studentCode || '').trim().toUpperCase() === studentCode)
  ) {
    studentCode = generateNextStudentCode();
  }

  const map = typeof getClassSchedulesMap === 'function' ? getClassSchedulesMap() : {};
  const period =
    document.getElementById('stu-form-period').value.trim() ||
    map[className]?.periodLabel ||
    appState.settings.defaultPeriod ||
    'Tháng 10/2026';
  const parentName = document.getElementById('stu-form-parent').value.trim();
  const parentPhone = document.getElementById('stu-form-phone').value.trim();
  const tuitionFee = fromShortMoney(document.getElementById('stu-form-fee').value);
  const status = document.getElementById('stu-form-status').value || 'Chưa đóng';
  const note = document.getElementById('stu-form-note').value.trim();
  const startDateIso = (document.getElementById('stu-form-start-date')?.value || '').trim();
  const nowStr = getCurrentDateTimeString();

  unmarkClassAsDeletedInState(className);
  if (!appState.settings) appState.settings = {};
  if (!map[className] && typeof getDefaultClassScheduleConfig === 'function') {
    map[className] = {
      ...getDefaultClassScheduleConfig(className),
      className,
      periodLabel: period
    };
  }
  appState.settings.classSchedulesJson = JSON.stringify(map);

  if (!Array.isArray(appState.students)) appState.students = [];
  let targetRecordId = id;
  let oldStuSnapshot = null;
  if (id) {
    const idx = appState.students.findIndex(s => s.id === id);
    if (idx !== -1) {
      oldStuSnapshot = { ...appState.students[idx] };
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
        updatedAt: nowStr,
        manualStatusUpdatedAt: nowStr
      };
    }
  } else {
    targetRecordId = 'ST_' + Date.now();
    appState.students.push({
      id: targetRecordId,
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
      manualStatusUpdatedAt: nowStr,
      note
    });
  }

  recordExactSmallAmount(appState, targetRecordId, studentCode, tuitionFee);

  const metaMap = getStudentMetaMap();
  const key = String(studentCode || targetRecordId).trim().toUpperCase();
  if (!metaMap[key]) metaMap[key] = {};
  if (startDateIso) {
    metaMap[key].startDate = startDateIso;
  }
  if (oldStuSnapshot && oldStuSnapshot.className && oldStuSnapshot.className !== className) {
    const oldCfg = map[oldStuSnapshot.className] || {};
    if (!Array.isArray(metaMap[key].transferHistory)) metaMap[key].transferHistory = [];
    metaMap[key].transferHistory.push({
      id: 'TR_' + Date.now(),
      transferredAt: nowStr,
      mode: oldStuSnapshot.period !== period || status === 'Chưa đóng' ? 'NEW_BATCH' : 'SAME_BATCH',
      fromClass: oldStuSnapshot.className,
      toClass: className,
      startDate: oldCfg.startDate || metaMap[key].startDate || '',
      batchLabel: oldCfg.batchLabel || 'ĐỢT TRƯỚC',
      periodLabel: oldStuSnapshot.period || oldCfg.periodLabel || '',
      dateRange:
        oldCfg.startDate && oldCfg.endDate
          ? `${formatShortDateVN(oldCfg.startDate)} → ${formatShortDateVN(oldCfg.endDate)}`
          : nowStr,
      tuitionFee: normalizeStoredVnd(oldStuSnapshot.tuitionFee) || 0,
      status: oldStuSnapshot.status || 'Chưa đóng',
      note: oldStuSnapshot.note || ''
    });
  }
  appState.settings.studentMetaJson = JSON.stringify(metaMap);

  selectedClassbookClass = className;
  if (
    typeof getGradeCategoryForClassName === 'function' &&
    selectedClassbookGradeFilter !== 'ALL' &&
    getGradeCategoryForClassName(className) !== selectedClassbookGradeFilter
  ) {
    selectedClassbookGradeFilter = 'ALL';
  }
  const stuClassFilterEl = document.getElementById('filter-student-class');
  if (stuClassFilterEl && stuClassFilterEl.value !== 'ALL' && stuClassFilterEl.value !== className) {
    stuClassFilterEl.value = 'ALL';
  }

  closeStudentModal();
  saveStateToLocal();
  triggerAutoSyncIfNeeded(
    id ? `Đã cập nhật thông tin học sinh "${fullName}"!` : `Đã thêm học sinh "${fullName}" vào lớp ${className}!`
  );
}

async function deleteStudentRecord(studentId) {
  const s = appState.students.find(item => item.id === studentId);
  if (!s) return;
  const ok = await appConfirm(
    `Bạn có chắc muốn xóa hồ sơ học sinh "${s.fullName} (${s.studentCode}) - Lớp ${s.className}"?\n• Kỳ học: ${s.period}\n• Bạn vẫn có thể bấm nút Hoàn tác (Ctrl + Z) nếu xóa nhầm.`,
    {
      title: 'Xác Nhận Xóa Học Sinh',
      icon: 'trash-2',
      variant: 'danger',
      confirmText: 'Xóa học sinh'
    }
  );
  if (!ok) return;

  appState.students = appState.students.filter(item => item.id !== studentId);
  // Đồng thời dọn các yêu cầu chờ duyệt của học sinh vừa xóa
  if (Array.isArray(appState.paymentRequests)) {
    appState.paymentRequests = appState.paymentRequests.filter(
      r => !(r.studentRecordId === studentId || (s.studentCode && r.studentCode === s.studentCode && r.status === 'Chờ duyệt'))
    );
  }
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

  const nowStr = getCurrentDateTimeString();
  const map = getClassSchedulesMap();
  const historyList = getClassHistoryList();

  // Lưu các đợt hiện tại của từng lớp vào mục Lịch Sử trước khi chuyển sang kỳ mới
  Object.keys(map).forEach(cls => {
    const oldCfg = map[cls];
    const clsStudents = (appState.students || []).filter(s => s.className === cls);
    if (clsStudents.length > 0) {
      const paidStudents = clsStudents.filter(s => s.status === 'Đã hoàn thành');
      const totalExpected = clsStudents.reduce((sum, s) => sum + (Number(s.tuitionFee) || 0), 0);
      const totalCollected = paidStudents.reduce((sum, s) => sum + (Number(s.tuitionFee) || 0), 0);
      historyList.unshift({
        id: 'HIST_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        archivedAt: nowStr,
        className: cls,
        subject: oldCfg?.subject || 'Toán',
        periodLabel: oldCfg?.periodLabel || clsStudents[0].period || 'Kỳ trước',
        batchLabel: oldCfg?.batchLabel || 'ĐỢT TRƯỚC',
        startDate: oldCfg?.startDate || '',
        endDate: oldCfg?.endDate || '',
        daysOfWeek: Array.isArray(oldCfg?.daysOfWeek) ? [...oldCfg.daysOfWeek] : [1, 3, 5, 0],
        sessionStates: { ...(oldCfg?.sessionStates || {}) },
        checkedSessions: countCheckedSessionsInConfig(oldCfg),
        totalStudents: clsStudents.length,
        paidCount: paidStudents.length,
        totalExpected,
        totalCollected,
        totalMissing: Math.max(0, totalExpected - totalCollected),
        studentsSnapshot: clsStudents.map(st => ({ ...st }))
      });
    }
    if (oldCfg) {
      oldCfg.periodLabel = newPeriod;
      oldCfg.rolledOverAt = nowStr;
    }
  });

  if (!appState.settings) appState.settings = {};
  appState.settings.classHistoryJson = JSON.stringify(historyList);
  appState.settings.classSchedulesJson = JSON.stringify(map);
  markSepayTxIdsProcessed(appState);

  // Chuyển học sinh hiện tại sang kỳ mới (không nhân đôi sĩ số học sinh)
  let updatedCount = 0;
  (appState.students || []).forEach(s => {
    s.period = newPeriod;
    s.status = 'Chưa đóng';
    s.note = '';
    s.receiptUrl = '';
    s.updatedAt = nowStr;
    s.manualStatusUpdatedAt = nowStr;
    updatedCount++;
  });

  appState.settings.defaultPeriod = newPeriod;
  closeBatchPeriodModal();
  saveStateToLocal();
  triggerAutoSyncIfNeeded(`Đã lưu kỳ cũ vào Lịch Sử và chuyển ${updatedCount} học sinh sang kỳ "${newPeriod}"!`);
}

// ============================================================================
// TAB 3: QUẢN LÝ SỔ THU - CHI & GIAO DỊCH (TÍCH HỢP DUYỆT CK & THAO TÁC HÀNG LOẠT)
// ============================================================================
const selectedFinanceItemIds = new Set();

function getFilteredPendingRequestsForFinance() {
  const q = removeVietnameseTones((document.getElementById('filter-trans-search')?.value || '').trim().toLowerCase());
  const typeFilter = document.getElementById('filter-trans-type')?.value || 'ALL';
  const catFilter = document.getElementById('filter-trans-category')?.value || 'ALL';

  return (appState.paymentRequests || []).filter(req => {
    if (!req || req.status !== 'Chờ duyệt') return false;
    if (typeFilter === 'Chi') return false;
    if (catFilter !== 'ALL' && catFilter !== 'Thu học phí') return false;
    if (q) {
      const hay = removeVietnameseTones(
        `${req.id} ${req.studentCode} ${req.studentName} ${req.className} ${req.payerName} ${req.note} ${req.period}`.toLowerCase()
      );
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => String(b.submittedAt || b.id || '').localeCompare(String(a.submittedAt || a.id || '')));
}

function formatDisplayDateTime(rawDate) {
  if (!rawDate) return { time: '', date: '', formatted: '' };
  const str = String(rawDate).trim();

  // Pattern 1: YYYY-MM-DD HH:mm:ss or YYYY-MM-DDTHH:mm:ss
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (isoMatch) {
    const [, y, m, d, hh, mm, ss] = isoMatch;
    const dateFormatted = `${d}/${m}/${y}`;
    const timeFormatted = hh !== undefined ? `${hh}:${mm}${ss !== undefined ? ':' + ss : ''}` : '';
    return {
      time: timeFormatted,
      date: dateFormatted,
      formatted: timeFormatted ? `${timeFormatted} • ${dateFormatted}` : dateFormatted
    };
  }

  // Pattern 2: DD/MM/YYYY HH:mm:ss
  const vnMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (vnMatch) {
    const [, d, m, y, hh, mm, ss] = vnMatch;
    const dateFormatted = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    const timeFormatted = hh !== undefined ? `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}${ss !== undefined ? ':' + ss.padStart(2, '0') : ''}` : '';
    return {
      time: timeFormatted,
      date: dateFormatted,
      formatted: timeFormatted ? `${timeFormatted} • ${dateFormatted}` : dateFormatted
    };
  }

  return { time: '', date: str, formatted: str };
}

function parseTransactionTimestamp(tx) {
  if (!tx) return 0;
  const dStr = String(tx.date || '').trim();
  const idMsMatch = String(tx.id || '').match(/^GD_(?:HIST_|AUTO_|STK_)?(\d{12,14})$/);

  if (dStr.length <= 10 && idMsMatch) {
    return Number(idMsMatch[1]);
  }

  if (dStr) {
    const isoMatch = dStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (isoMatch) {
      const parsedMs = new Date(
        Number(isoMatch[1]),
        Number(isoMatch[2]) - 1,
        Number(isoMatch[3]),
        Number(isoMatch[4] || 0),
        Number(isoMatch[5] || 0),
        Number(isoMatch[6] || 0)
      ).getTime();
      if (!isNaN(parsedMs)) return parsedMs;
    }
    const vnMatch = dStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (vnMatch) {
      const day = Number(vnMatch[1]);
      const month = Number(vnMatch[2]) - 1;
      const year = Number(vnMatch[3]);
      const hour = Number(vnMatch[4] || 0);
      const min = Number(vnMatch[5] || 0);
      const sec = Number(vnMatch[6] || 0);
      const parsedMs = new Date(year, month, day, hour, min, sec).getTime();
      if (!isNaN(parsedMs)) return parsedMs;
    }
  }

  if (tx.updatedAtMs && Number(tx.updatedAtMs) > 0) return Number(tx.updatedAtMs);

  const msMatch = String(tx.id || '').match(/_(\d{12,14})/);
  if (msMatch) return Number(msMatch[1]);

  return 0;
}

function sortTransactionsNewestFirst(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const tsA = parseTransactionTimestamp(a);
  const tsB = parseTransactionTimestamp(b);
  if (tsA !== tsB) return tsB - tsA;

  // Tie-breaker cho giao dịch SePay có ID tăng dần
  const sepayA = (String(a.id || '').match(/GD_SEPAY_(\d+)/) || [])[1];
  const sepayB = (String(b.id || '').match(/GD_SEPAY_(\d+)/) || [])[1];
  if (sepayA && sepayB && sepayA !== sepayB) {
    return Number(sepayB) - Number(sepayA);
  }

  return String(b.id || '').localeCompare(String(a.id || ''));
}

function getFilteredTransactions() {
  const q = removeVietnameseTones((document.getElementById('filter-trans-search')?.value || '').trim().toLowerCase());
  const typeFilter = document.getElementById('filter-trans-type')?.value || 'ALL';
  const catFilter = document.getElementById('filter-trans-category')?.value || 'ALL';

  const filtered = (appState.transactions || []).filter(t => {
    if (typeFilter === 'PENDING') return false;
    if (typeFilter === 'EXCLUDED') {
      if (!isTransactionExcludedFromSystem(t)) return false;
    } else if (typeFilter === 'INCLUDED') {
      if (!isCountedInMainFinance(t)) return false;
    } else if (typeFilter !== 'ALL' && t.type !== typeFilter) {
      return false;
    }
    if (catFilter !== 'ALL' && t.category !== catFilter) return false;
    if (q) {
      const txTag = getTransactionTagLabel(t);
      const hay = removeVietnameseTones(`${t.id} ${t.description} ${t.category} ${t.studentCode} ${txTag}`.toLowerCase());
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return filtered.sort(sortTransactionsNewestFirst);
}

function renderFinancePendingApprovalsCard() {
  const pendingAll = (appState.paymentRequests || []).filter(r => r && r.status === 'Chờ duyệt');
  const badgeCountEl = document.getElementById('finance-pending-badge-count');
  const listEl = document.getElementById('finance-pending-requests-list');
  const autoToggle = document.getElementById('finance-auto-approve-toggle');

  const tabPendingBadge = document.getElementById('tab-finance-pending-count');
  const sidePendingBadge = document.getElementById('sidebar-finance-pending-badge');
  if (tabPendingBadge) {
    tabPendingBadge.textContent = pendingAll.length;
    if (pendingAll.length > 0) {
      tabPendingBadge.classList.remove('hidden');
    } else {
      tabPendingBadge.classList.add('hidden');
    }
  }
  if (sidePendingBadge) {
    sidePendingBadge.textContent = pendingAll.length;
    if (pendingAll.length > 0) {
      sidePendingBadge.classList.remove('hidden');
    } else {
      sidePendingBadge.classList.add('hidden');
    }
  }

  if (autoToggle && typeof isAutoApprovePaymentEnabled === 'function') {
    autoToggle.checked = isAutoApprovePaymentEnabled();
  }
  if (badgeCountEl) {
    badgeCountEl.textContent = `${pendingAll.length} chờ duyệt`;
  }
  if (!listEl) return;

  if (pendingAll.length === 0) {
    listEl.innerHTML = `
      <div class="py-4 px-3 rounded-xl bg-white/80 border border-amber-200/80 text-center text-slate-600 text-xs flex flex-col sm:flex-row items-center justify-center gap-2">
        <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-600 shrink-0"></i>
        <span>Hiện không có yêu cầu chuyển khoản nào đang chờ duyệt. Khi phụ huynh mở mã QR học sinh hoặc xác nhận chuyển khoản trên web, yêu cầu sẽ hiển thị ngay tại đây và trong bảng giao dịch bên dưới.</span>
      </div>
    `;
    return;
  }

  listEl.innerHTML = pendingAll
    .map(req => {
      const isTestReq = isSimulatedBankTestItem(req);
      const isDraftReq = !isTestReq && isDraftPaymentRequest(req);
      const linkedStu = (appState.students || []).find(
        s => s.id === req.studentRecordId || (s.studentCode && s.studentCode === req.studentCode)
      );
      const isBankVerified = Boolean(
        req.bankVerified || checkHasVerifiedBankTransfer(linkedStu, req.studentName)
      );
      const amtVal = isTestReq
        ? req.testDisplayAmount || 600000
        : normalizeStoredVnd(req.amount) || (linkedStu ? normalizeStoredVnd(linkedStu.tuitionFee) : 600000);
      const cleanNote = isTestReq ? stripRedundantTestPrefix(req.note) : req.note;

      return `
        <div class="p-3 rounded-xl bg-white border-2 ${
          isTestReq ? 'border-amber-300 bg-amber-50/40' : 'border-amber-200 hover:border-amber-400'
        }  flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 transition">
          <div class="flex items-start gap-3 min-w-0">
            ${
              req.receiptUrl
                ? `<img
                    onclick="openReceiptViewer('${escapeAttr(req.receiptUrl)}', 'Biên lai ${escapeAttr(req.studentName)}')"
                    src="${escapeAttr(req.receiptUrl)}"
                    alt="Biên lai"
                    class="w-12 h-14 rounded-lg object-cover border border-amber-300 cursor-pointer shrink-0 bg-white"
                    title="Bấm để xem ảnh biên lai"
                  />`
                : `<div class="w-12 h-14 rounded-lg bg-amber-50 border border-amber-200 flex flex-col items-center justify-center text-xs text-amber-700 font-bold shrink-0 text-center p-1">
                    <i data-lucide="qr-code" class="w-4 h-4 mb-0.5 text-amber-600"></i>QR Web
                  </div>`
            }
            <div class="space-y-0.5 text-xs min-w-0">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 tabular-nums font-extrabold text-[11px]">${escapeHtml(
                  req.studentCode || 'HS'
                )}</span>
                <span class="font-extrabold text-slate-900 text-sm">${escapeHtml(req.studentName)}</span>
                <span class="text-slate-500 font-semibold">• Lớp ${escapeHtml(req.className || '---')}</span>
                <span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-[11px]">${escapeHtml(
                  req.period || 'Kỳ hiện tại'
                )}</span>
                ${
                  isDraftReq
                    ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-200 text-amber-950 border border-amber-400 font-extrabold text-xs"><i data-lucide="tag" class="w-3 h-3"></i><span>STK Nháp</span></span>`
                    : ''
                }
                ${
                  isBankVerified
                    ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold text-xs"><i data-lucide="check-circle-2" class="w-3 h-3"></i><span>Đã vào STK</span></span>`
                    : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-extrabold text-xs"><i data-lucide="clock" class="w-3 h-3"></i><span>Chờ duyệt CK</span></span>`
                }
              </div>
              <div class="text-slate-700">
                Người chuyển: <strong>${escapeHtml(req.payerName || 'Phụ huynh')}</strong>${
        req.parentPhone ? ` (${escapeHtml(req.parentPhone)})` : ''
      }
                - Số tiền: <strong class="text-emerald-700 tabular-nums text-sm">${formatCurrency(amtVal)}</strong>
              </div>
              <div class="text-[11px] text-slate-500 truncate max-w-2xl" title="${escapeAttr(cleanNote || '')}">
                ${escapeHtml(cleanNote || 'Phụ huynh mở QR chuyển khoản trên web')} • <span class="text-slate-400">${escapeHtml(
        req.submittedAt || ''
      )}</span>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end shrink-0">
            ${
              req.receiptUrl
                ? `<button
                    type="button"
                    onclick="openReceiptViewer('${escapeAttr(req.receiptUrl)}', 'Biên lai ${escapeAttr(req.studentName)}')"
                    class="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <i data-lucide="image" class="w-3.5 h-3.5"></i>
                    <span>Ảnh</span>
                  </button>`
                : ''
            }
            <button
              type="button"
              onclick="deletePaymentRequestDirectly('${escapeAttr(req.id)}')"
              title="Xóa trực tiếp yêu cầu này và chặn tự động tạo lại"
              class="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 text-xs font-extrabold flex items-center gap-1 cursor-pointer transition"
            >
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              <span>Xóa</span>
            </button>
            <button
              type="button"
              onclick="handleReviewPaymentRequest('${escapeAttr(req.id)}', 'Từ chối')"
              class="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 text-xs font-extrabold flex items-center gap-1 cursor-pointer transition"
            >
              <i data-lucide="x-circle" class="w-3.5 h-3.5"></i>
              <span>Từ chối</span>
            </button>
            <button
              type="button"
              onclick="handleReviewPaymentRequest('${escapeAttr(req.id)}', 'Đã duyệt')"
              class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5  cursor-pointer transition"
            >
              <i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i>
              <span>Duyệt (Đã nhận tiền)</span>
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderAdminTransactions() {
  const tbody = document.getElementById('admin-transactions-tbody');
  if (!tbody) return;

  renderFinancePendingApprovalsCard();

  const pendingList = getFilteredPendingRequestsForFinance();
  const list = getFilteredTransactions();

  // Dọn các ID đã chọn nhưng không còn tồn tại
  const validKeys = new Set([
    ...(appState.paymentRequests || []).filter(r => r && r.status === 'Chờ duyệt').map(r => 'REQ::' + r.id),
    ...(appState.transactions || []).map(t => t.id)
  ]);
  Array.from(selectedFinanceItemIds).forEach(k => {
    if (!validKeys.has(k)) selectedFinanceItemIds.delete(k);
  });

  // Cập nhật 4 thẻ KPI tổng hợp Thu - Chi theo bộ lọc (Chỉ cộng giao dịch chính thức + giao dịch STK Nháp đã bật Cộng TK chính)
  const realList = list.filter(t => isCountedInMainFinance(t));
  const totalIn = realList.filter(t => t.type === 'Thu').reduce((sum, t) => sum + (normalizeStoredVnd(t.amount) || 0), 0);
  const totalOut = realList.filter(t => t.type === 'Chi').reduce((sum, t) => sum + (normalizeStoredVnd(t.amount) || 0), 0);
  const netBal = totalIn - totalOut;

  const sumInEl = document.getElementById('finance-summary-in');
  const sumOutEl = document.getElementById('finance-summary-out');
  const sumNetEl = document.getElementById('finance-summary-net');
  const sumCountEl = document.getElementById('finance-summary-count');

  if (sumInEl) sumInEl.textContent = `+${formatCurrency(totalIn)}`;
  if (sumOutEl) sumOutEl.textContent = `-${formatCurrency(totalOut)}`;
  if (sumNetEl) sumNetEl.textContent = formatCurrency(netBal);
  if (sumCountEl) {
    const testCount = list.filter(t => isSimulatedBankTestItem(t)).length;
    const draftOffCount = list.filter(t => !isSimulatedBankTestItem(t) && isDraftBankTransaction(t) && !isDraftTxIncludedInMain(t)).length;
    const excludedCount = list.filter(t => !isSimulatedBankTestItem(t) && isTransactionExcludedFromSystem(t)).length;
    const extraTags = [
      excludedCount > 0 ? `+${excludedCount} Không ghi nhận` : '',
      testCount > 0 ? `+${testCount} Test` : '',
      draftOffCount > 0 ? `+${draftOffCount} Nháp đang tắt` : ''
    ].filter(Boolean);
    const pendingTag = pendingList.length > 0 ? ` • ${pendingList.length} chờ duyệt` : '';
    sumCountEl.textContent =
      (extraTags.length > 0 ? `${realList.length} phiếu (${extraTags.join(', ')})` : `${list.length} phiếu`) + pendingTag;
  }

  if (pendingList.length === 0 && list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="py-10 text-center text-slate-400 text-sm">
          Chưa có giao dịch hoặc yêu cầu chờ duyệt nào khớp với bộ lọc.
        </td>
      </tr>
    `;
    updateFinanceBulkActionBarUI();
    return;
  }

  const pendingRowsHtml = pendingList
    .map((req, pIdx) => {
      const stt = pIdx + 1;
      const reqDt = formatDisplayDateTime(req.submittedAt);
      const rowKey = 'REQ::' + req.id;
      const isSelected = selectedFinanceItemIds.has(rowKey);
      const isTestReq = isSimulatedBankTestItem(req);
      const isDraftReq = !isTestReq && isDraftPaymentRequest(req);
      const linkedStu = (appState.students || []).find(
        s => s.id === req.studentRecordId || (s.studentCode && s.studentCode === req.studentCode)
      );
      const amtVal = isTestReq
        ? req.testDisplayAmount || 600000
        : normalizeStoredVnd(req.amount) || (linkedStu ? normalizeStoredVnd(linkedStu.tuitionFee) : 600000);
      const cleanNote = isTestReq ? stripRedundantTestPrefix(req.note) : req.note;
      const shortReqId = formatCompactTxId(req.id);
      const quickSub = cleanNote
        ? String(cleanNote).replace(/^\[STK[^\]]*\]\s*/i, '').slice(0, 65)
        : `Phụ huynh xác nhận CK (${req.payerName || 'Phụ huynh'})`;

      return `
        <tr
          onclick="openTransactionDetailModal('${escapeAttr(rowKey)}')"
          title="Bấm vào dòng để xem thông tin chi tiết yêu cầu chuyển khoản"
          class="bg-amber-50/70 hover:bg-amber-100/60 transition align-middle border-l-4 border-l-amber-500 cursor-pointer"
        >
          <td class="py-2.5 px-2 text-center align-middle" onclick="event.stopPropagation()">
            <input
              type="checkbox"
              ${isSelected ? 'checked' : ''}
              onchange="toggleSelectTransactionRow('${escapeAttr(rowKey)}', this.checked)"
              class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              title="Chọn yêu cầu chờ duyệt này"
            />
          </td>
          <td class="py-2.5 px-2 text-center align-middle font-bold text-xs text-amber-900 dark:text-amber-300 tabular-nums">
            ${stt}
          </td>
          <td class="py-2.5 px-3 whitespace-nowrap align-middle">
            <div class="tabular-nums font-extrabold text-xs text-amber-900 dark:text-amber-200" title="${escapeAttr(req.id)}">${escapeHtml(shortReqId)}</div>
            ${
              reqDt.time
                ? `<div class="text-[11px] font-bold text-amber-700 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                    <i data-lucide="clock" class="w-3 h-3 shrink-0"></i>
                    <span>${escapeHtml(reqDt.time)}</span>
                    <span class="text-slate-400 font-normal">•</span>
                    <span class="font-semibold">${escapeHtml(reqDt.date)}</span>
                  </div>`
                : `<div class="text-[11px] font-semibold text-amber-700 dark:text-amber-400 mt-0.5">${escapeHtml(reqDt.date || req.submittedAt || 'Vừa gửi')}</div>`
            }
          </td>
          <td class="py-2.5 px-2.5 text-center whitespace-nowrap align-middle">
            <span class="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold whitespace-nowrap border bg-amber-200/90 text-amber-950 border-amber-400">
              <i data-lucide="clock" class="w-3 h-3 shrink-0"></i>
              <span>Chờ duyệt</span>
            </span>
          </td>
          <td class="py-2.5 px-2.5 text-center align-middle">
            <span class="inline-flex items-center justify-center px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs leading-tight max-w-[120px] text-center">
              Thu học phí
            </span>
          </td>
          <td class="py-2.5 px-3.5 align-middle">
            <div class="space-y-0.5 max-w-[360px]">
              <div class="flex flex-wrap items-center gap-1.5">
                ${
                  isDraftReq
                    ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-200 text-amber-950 border border-amber-400 font-extrabold text-xs whitespace-nowrap"><i data-lucide="tag" class="w-3 h-3"></i><span>STK Nháp</span></span>`
                    : ''
                }
                <span class="px-1.5 py-0.5 rounded bg-blue-600 text-white tabular-nums font-bold text-xs whitespace-nowrap">${escapeHtml(
                  req.studentCode || 'HS'
                )}</span>
                <span class="font-extrabold text-xs sm:text-sm text-slate-900 truncate">${escapeHtml(req.studentName || 'Học sinh')}</span>
              </div>
              <div class="text-[11px] font-semibold text-slate-600 truncate">
                Lớp ${escapeHtml(req.className || '---')} • ${escapeHtml(req.period || 'Kỳ hiện tại')}
              </div>
              <div class="text-[11px] text-slate-500 truncate flex items-center gap-1">
                <span class="truncate">${escapeHtml(quickSub)}</span>
                <span class="text-xs font-extrabold text-[#141414] shrink-0">Chi tiết ↗</span>
              </div>
            </div>
          </td>
          <td class="py-2.5 px-3 text-right tabular-nums font-extrabold text-xs sm:text-sm whitespace-nowrap align-middle text-amber-700">
            <div class="inline-flex flex-col items-end leading-tight">
              <span class="inline-flex items-center gap-1 text-xs font-sans font-extrabold text-amber-900 bg-amber-200/80 px-1.5 py-0.5 rounded border border-amber-400">
                <i data-lucide="clock" class="w-3 h-3 shrink-0"></i>
                <span>Chờ duyệt</span>
              </span>
              <span class="text-xs sm:text-sm font-black text-emerald-700 mt-0.5">
                +${formatCurrency(amtVal)}
              </span>
            </div>
          </td>
          <td class="py-2.5 px-2.5 text-center whitespace-nowrap align-middle">
            <div class="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-amber-100/80 border border-amber-300 text-[11px] font-extrabold text-amber-900">
              QR Web / CK
            </div>
          </td>
          <td class="py-2.5 px-2.5 text-center whitespace-nowrap align-middle" onclick="event.stopPropagation()">
            ${
              req.receiptUrl
                ? `<button
                    type="button"
                    onclick="openReceiptViewer('${escapeAttr(req.receiptUrl)}', 'Biên lai ${escapeAttr(req.studentName)}')"
                    class="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-600 hover:text-white text-xs font-extrabold cursor-pointer whitespace-nowrap transition"
                  >
                    <i data-lucide="image" class="w-3.5 h-3.5"></i>
                    <span>Xem</span>
                  </button>`
                : `<span class="text-xs font-bold text-slate-400">---</span>`
            }
          </td>
          <td class="py-2.5 px-2.5 text-center whitespace-nowrap align-middle" onclick="event.stopPropagation()">
            <div class="tc-tx-action-col">
              <button
                type="button"
                onclick="handleReviewPaymentRequest('${escapeAttr(req.id)}', 'Đã duyệt')"
                title="Duyệt yêu cầu chuyển khoản này và ghi vào Sổ Thu - Chi"
                class="tc-tx-action-btn bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600 "
              >
                <i data-lucide="check" class="w-3.5 h-3.5"></i>
                <span>Duyệt</span>
              </button>
              <button
                type="button"
                onclick="openTransactionDetailModal('${escapeAttr(rowKey)}')"
                title="Xem đầy đủ thông tin yêu cầu chuyển khoản"
                class="tc-tx-action-btn bg-slate-100 hover:bg-slate-900 text-slate-900 hover:text-white border border-slate-200"
              >
                <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                <span>Chi tiết</span>
              </button>
              <button
                type="button"
                onclick="handleReviewPaymentRequest('${escapeAttr(req.id)}', 'Từ chối')"
                title="Từ chối / Đóng yêu cầu chờ duyệt này"
                class="tc-tx-action-btn bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200"
              >
                <i data-lucide="x" class="w-3.5 h-3.5"></i>
                <span>Từ chối</span>
              </button>
              <button
                type="button"
                onclick="deletePaymentRequestDirectly('${escapeAttr(req.id)}')"
                title="Xóa trực tiếp yêu cầu chờ duyệt này"
                class="tc-tx-action-btn bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200"
              >
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                <span>Xóa</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  const txRowsHtml = list
    .map((t, tIdx) => {
      const stt = pendingList.length + tIdx + 1;
      const dt = formatDisplayDateTime(t.date);
      const isSelected = selectedFinanceItemIds.has(t.id);
      const isIncome = t.type === 'Thu';
      const isTestTx = isSimulatedBankTestItem(t);
      const isDraftTx = !isTestTx && isDraftBankTransaction(t);
      const isDraftIncluded = isDraftTx && isDraftTxIncludedInMain(t);
      const isExcludedTx = !isTestTx && isTransactionExcludedFromSystem(t);
      const txTagLabel = getTransactionTagLabel(t);
      const compact = buildCompactTransactionInfo(t, appState);
      return `
        <tr
          onclick="openTransactionDetailModal('${escapeAttr(t.id)}')"
          title="Bấm vào dòng để xem chi tiết giao dịch & chỉnh sửa"
          class="hover:bg-slate-50/90 transition align-middle cursor-pointer ${
            isTestTx
              ? 'bg-amber-50/45'
              : isExcludedTx
              ? 'bg-slate-100/75 opacity-80'
              : isDraftTx
              ? isDraftIncluded
                ? 'bg-emerald-50/35'
                : 'bg-amber-50/35'
              : ''
          } ${isSelected ? 'bg-blue-50/60' : ''}"
        >
          <td class="py-2.5 px-2 text-center align-middle" onclick="event.stopPropagation()">
            <input
              type="checkbox"
              ${isSelected ? 'checked' : ''}
              onchange="toggleSelectTransactionRow('${escapeAttr(t.id)}', this.checked)"
              class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              title="Chọn giao dịch này để sửa/xóa hàng loạt"
            />
          </td>
          <td class="py-2.5 px-2 text-center align-middle font-extrabold text-xs text-slate-700 dark:text-slate-300 tabular-nums">
            ${stt}
          </td>
          <td class="py-2.5 px-3 whitespace-nowrap align-middle">
            <div class="tabular-nums font-extrabold text-xs text-slate-800 dark:text-slate-100" title="Mã đầy đủ: ${escapeAttr(t.id)}">${escapeHtml(compact.shortId)}</div>
            ${
              dt.time
                ? `<div class="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 mt-0.5 flex items-center gap-1">
                    <i data-lucide="clock" class="w-3 h-3 shrink-0"></i>
                    <span>${escapeHtml(dt.time)}</span>
                    <span class="text-slate-400 font-normal">•</span>
                    <span class="text-slate-500 dark:text-slate-400 font-semibold">${escapeHtml(dt.date)}</span>
                  </div>`
                : `<div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">${escapeHtml(dt.date || t.date || '')}</div>`
            }
          </td>
          <td class="py-2.5 px-2.5 text-center whitespace-nowrap align-middle">
            ${
              isTestTx
                ? `<span class="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold whitespace-nowrap border bg-amber-100 text-amber-950 border-amber-400">
                    Test STK
                  </span>`
                : `<div class="inline-flex flex-col items-center gap-1">
                    <span class="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-extrabold whitespace-nowrap border ${
                      isExcludedTx
                        ? 'bg-slate-200 text-slate-700 border-slate-400'
                        : isIncome
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-rose-100 text-rose-800 border-rose-300'
                    }">
                      ${isIncome ? '+ Thu' : '- Chi'}
                    </span>
                    ${
                      isExcludedTx
                        ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold whitespace-nowrap border bg-slate-200 text-slate-800 border-slate-400" title="Giao dịch này không được ghi nhận vào thống kê hệ thống">
                            <i data-lucide="eye-off" class="w-3 h-3 shrink-0"></i>
                            <span>Không ghi nhận</span>
                          </span>`
                        : ''
                    }
                    ${
                      isDraftTx
                        ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-extrabold whitespace-nowrap border bg-amber-100 text-amber-900 border-amber-400">
                            <i data-lucide="tag" class="w-3 h-3 shrink-0"></i>
                            <span>STK Nháp</span>
                          </span>`
                        : ''
                    }
                  </div>`
            }
          </td>
          <td class="py-2.5 px-2.5 text-center align-middle">
            <span class="inline-flex items-center justify-center px-2 py-0.5 rounded-lg ${
              isTestTx
                ? 'bg-amber-100/80 text-amber-900 border border-amber-300'
                : 'bg-slate-100 text-slate-700 border border-slate-200'
            } font-bold text-xs leading-tight max-w-[120px] text-center">
              ${escapeHtml(isTestTx ? 'Test STK' : t.category)}
            </span>
          </td>
          <td class="py-2.5 px-3.5 align-middle">
            <div class="space-y-0.5 max-w-[360px]">
              <div class="flex flex-wrap items-center gap-1.5">
                ${
                  isTestTx
                    ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-950 border border-amber-400 text-xs font-extrabold"><i data-lucide="flask-conical" class="w-3 h-3"></i><span>Test</span></span>`
                    : ''
                }
                ${
                  isExcludedTx
                    ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 border border-slate-400 text-xs font-extrabold"><i data-lucide="tag" class="w-3 h-3"></i><span>${escapeHtml(
                        txTagLabel || 'Không ghi nhận hệ thống'
                      )}</span></span>`
                    : txTagLabel
                    ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-extrabold"><i data-lucide="tag" class="w-3 h-3"></i><span>${escapeHtml(
                        txTagLabel
                      )}</span></span>`
                    : ''
                }
                ${
                  isDraftTx
                    ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-200/90 text-amber-950 border border-amber-400 text-xs font-extrabold"><i data-lucide="tag" class="w-3 h-3"></i><span>STK Nháp</span></span>`
                    : ''
                }
                ${
                  compact.studentCode
                    ? `<span class="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 tabular-nums font-bold text-xs whitespace-nowrap">${escapeHtml(
                        compact.studentCode
                      )}</span>`
                    : ''
                }
                <span class="text-slate-900 font-extrabold text-xs sm:text-sm leading-snug truncate ${
                  isExcludedTx ? 'line-through text-slate-500' : ''
                }" title="${escapeAttr(compact.headline)}">
                  ${escapeHtml(compact.headline)}
                </span>
              </div>
              <div class="text-[11px] text-slate-500 font-medium truncate flex items-center gap-1.5">
                <span class="truncate">${escapeHtml(compact.subline)}</span>
                <span class="text-xs font-extrabold text-[#141414] shrink-0">Chi tiết ↗</span>
              </div>
            </div>
          </td>
          <td class="py-2.5 px-3 text-right tabular-nums font-extrabold text-xs sm:text-sm whitespace-nowrap align-middle ${
            isTestTx
              ? 'text-amber-700'
              : isExcludedTx
              ? 'text-slate-400'
              : isDraftTx && !isDraftIncluded
              ? 'text-slate-500'
              : isIncome
              ? 'text-emerald-600'
              : 'text-rose-600'
          }">
            ${
              isTestTx
                ? `<div class="inline-flex flex-col items-end leading-tight">
                     <span class="text-xs font-sans font-extrabold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                       Test
                     </span>
                     <span class="text-xs sm:text-sm font-black text-amber-700 mt-0.5">
                       ${formatCurrency(t.testDisplayAmount || 600000)}
                     </span>
                   </div>`
                : isExcludedTx
                ? `<div class="inline-flex flex-col items-end leading-tight">
                     <span class="inline-flex items-center gap-1 text-[11px] font-sans font-extrabold text-slate-700 bg-slate-200 px-1.5 py-0.5 rounded border border-slate-400">
                       <i data-lucide="eye-off" class="w-3 h-3 shrink-0"></i>
                       <span>Không ghi nhận HT</span>
                     </span>
                     <span class="text-xs sm:text-sm font-black mt-0.5 line-through text-slate-400">
                       ${isIncome ? '+' : '-'}${formatCurrency(t.amount)}
                     </span>
                   </div>`
                : isDraftTx
                ? `<div class="inline-flex flex-col items-end leading-tight">
                     <span class="inline-flex items-center gap-1 text-xs font-sans font-extrabold px-1.5 py-0.5 rounded border ${
                       isDraftIncluded
                         ? 'text-emerald-800 bg-emerald-100 border-emerald-300'
                         : 'text-slate-600 bg-slate-100 border-slate-300'
                     }">
                       <i data-lucide="${isDraftIncluded ? 'check-circle-2' : 'pause-circle'}" class="w-3 h-3 shrink-0"></i>
                       <span>${isDraftIncluded ? 'Đã cộng TK chính' : 'Chưa cộng TK chính'}</span>
                     </span>
                     <span class="text-xs sm:text-sm font-black mt-0.5 ${
                       isDraftIncluded ? (isIncome ? 'text-emerald-600' : 'text-rose-600') : 'line-through text-slate-400'
                     }">
                       ${isIncome ? '+' : '-'}${formatCurrency(t.amount)}
                     </span>
                   </div>`
                : `${isIncome ? '+' : '-'}${formatCurrency(t.amount)}`
            }
          </td>
          <td class="py-2.5 px-2.5 text-center whitespace-nowrap align-middle">
            <div class="inline-flex items-center justify-center px-2.5 py-1 rounded-lg ${
              isTestTx || isDraftTx
                ? 'bg-amber-50 border border-amber-300'
                : 'bg-slate-50 border border-slate-200'
            }">
              ${formatCompactMethodHtml(t.method, isTestTx, isDraftTx)}
            </div>
          </td>
          <td class="py-2.5 px-2.5 text-center whitespace-nowrap align-middle" onclick="event.stopPropagation()">
            ${
              t.receiptUrl
                ? `<button
                    type="button"
                    onclick="openReceiptViewer('${escapeAttr(t.receiptUrl)}', 'Chứng từ ${escapeAttr(t.id)}')"
                    class="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-600 hover:text-white text-xs font-extrabold cursor-pointer whitespace-nowrap transition"
                  >
                    <i data-lucide="image" class="w-3.5 h-3.5"></i>
                    <span>Xem</span>
                  </button>`
                : `<span class="text-xs font-bold text-slate-400">---</span>`
            }
          </td>
          <td class="py-2.5 px-2.5 text-center whitespace-nowrap align-middle" onclick="event.stopPropagation()">
            <div class="tc-tx-action-col">
              ${
                !isTestTx
                  ? `<button
                      type="button"
                      onclick="toggleTransactionExcludedFromSystem('${escapeAttr(t.id)}')"
                      title="${
                        isExcludedTx
                          ? 'Bấm để gỡ tag Không ghi nhận và tính lại giao dịch này vào hệ thống'
                          : 'Bấm để gắn tag Không ghi nhận vào hệ thống (bỏ qua khỏi Tổng Thu/Chi, Tồn quỹ, Học phí)'
                      }"
                      class="tc-tx-action-btn border ${
                        isExcludedTx
                          ? 'bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border-emerald-300'
                          : 'bg-slate-100 hover:bg-slate-800 text-slate-700 hover:text-white border-slate-300'
                      }"
                    >
                      <i data-lucide="${isExcludedTx ? 'check-circle-2' : 'eye-off'}" class="w-3.5 h-3.5"></i>
                      <span>${isExcludedTx ? 'Ghi nhận lại' : 'Không ghi nhận'}</span>
                    </button>`
                  : ''
              }
              ${
                isDraftTx
                  ? `<button
                      type="button"
                      onclick="toggleDraftTransactionMainAccount('${escapeAttr(t.id)}')"
                      title="${
                        isDraftIncluded
                          ? 'Bấm để tắt, không cộng khoản STK Nháp này vào Tài khoản chính'
                          : 'Bấm để cộng khoản tiền từ STK Nháp này vào Tài khoản chính'
                      }"
                      class="tc-tx-action-btn border ${
                        isDraftIncluded
                          ? 'bg-amber-50 hover:bg-amber-500 text-amber-800 hover:text-white border-amber-300'
                          : 'bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border-emerald-300'
                      }"
                    >
                      <i data-lucide="${isDraftIncluded ? 'pause-circle' : 'plus-circle'}" class="w-3.5 h-3.5"></i>
                      <span>${isDraftIncluded ? 'Tắt cộng' : 'Cộng TK chính'}</span>
                    </button>`
                  : ''
              }
              <button
                type="button"
                onclick="editTransactionRecord('${escapeAttr(t.id)}')"
                title="Chỉnh sửa thông tin phiếu thu/chi này"
                class="tc-tx-action-btn bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200"
              >
                <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                <span>Sửa</span>
              </button>
              <button
                type="button"
                onclick="deleteTransactionRecord('${escapeAttr(t.id)}')"
                title="Xóa vĩnh viễn giao dịch này khỏi Sổ Thu - Chi"
                class="tc-tx-action-btn bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200"
              >
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                <span>Xóa</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  tbody.innerHTML = pendingRowsHtml + txRowsHtml;
  updateFinanceBulkActionBarUI();
  lucide.createIcons();
}

function toggleSelectTransactionRow(itemKey, isChecked) {
  if (!itemKey) return;
  if (isChecked) {
    selectedFinanceItemIds.add(itemKey);
  } else {
    selectedFinanceItemIds.delete(itemKey);
  }
  renderAdminTransactions();
}

function toggleSelectAllTransactions(isChecked) {
  const pendingList = getFilteredPendingRequestsForFinance();
  const list = getFilteredTransactions();
  if (isChecked) {
    pendingList.forEach(r => selectedFinanceItemIds.add('REQ::' + r.id));
    list.forEach(t => selectedFinanceItemIds.add(t.id));
  } else {
    pendingList.forEach(r => selectedFinanceItemIds.delete('REQ::' + r.id));
    list.forEach(t => selectedFinanceItemIds.delete(t.id));
  }
  renderAdminTransactions();
}

function clearSelectedTransactions() {
  selectedFinanceItemIds.clear();
  const selectAllCb = document.getElementById('finance-select-all-cb');
  if (selectAllCb) selectAllCb.checked = false;
  renderAdminTransactions();
}

function updateFinanceBulkActionBarUI() {
  const bar = document.getElementById('finance-bulk-action-bar');
  const countEl = document.getElementById('finance-bulk-selected-count') || document.getElementById('finance-selected-count');
  const approveBtn = document.getElementById('btn-bulk-approve-tx') || document.getElementById('btn-bulk-approve-trans');
  const selectAllCb = document.getElementById('finance-select-all-cb');

  const pendingList = getFilteredPendingRequestsForFinance();
  const list = getFilteredTransactions();
  const allVisibleKeys = [...pendingList.map(r => 'REQ::' + r.id), ...list.map(t => t.id)];

  if (selectAllCb) {
    selectAllCb.checked =
      allVisibleKeys.length > 0 && allVisibleKeys.every(k => selectedFinanceItemIds.has(k));
  }

  const totalSelected = selectedFinanceItemIds.size;
  const selectedPendingCount = Array.from(selectedFinanceItemIds).filter(k => k.startsWith('REQ::')).length;

  if (countEl) countEl.textContent = totalSelected;
  if (approveBtn) {
    if (selectedPendingCount > 0) {
      approveBtn.classList.remove('hidden');
      approveBtn.classList.add('inline-flex');
      approveBtn.innerHTML = `<i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i><span>Duyệt (${selectedPendingCount}) khoản chờ</span>`;
    } else {
      approveBtn.classList.add('hidden');
      approveBtn.classList.remove('inline-flex');
    }
  }

  if (bar) {
    if (totalSelected > 0) {
      bar.classList.remove('hidden');
      bar.classList.add('flex');
    } else {
      bar.classList.add('hidden');
      bar.classList.remove('flex');
    }
  }
}

function getEditedTxOverridesMap(stateObj = appState) {
  try {
    const raw = stateObj?.settings?.editedTxOverridesJson;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function recordEditedTransactionOverride(stateObj, oldTx, updatedTx) {
  if (!stateObj || !updatedTx || !updatedTx.id) return;
  if (!stateObj.settings) stateObj.settings = {};
  const map = { ...getEditedTxOverridesMap(stateObj) };
  const prevEntry = map[updatedTx.id] || {};
  const origDesc = prevEntry.origDesc || String(oldTx?.description || updatedTx.description || '');
  const origAmount = prevEntry.origAmount !== undefined ? prevEntry.origAmount : Number(oldTx?.amount || updatedTx.amount || 0);
  const origDate = prevEntry.origDate || String(oldTx?.date || updatedTx.date || '');
  map[updatedTx.id] = {
    id: updatedTx.id,
    date: updatedTx.date,
    type: updatedTx.type,
    category: updatedTx.category,
    amount: updatedTx.amount,
    description: updatedTx.description,
    studentCode: updatedTx.studentCode || '',
    method: updatedTx.method || 'Chuyển khoản',
    isExcluded: Boolean(updatedTx.isExcluded),
    customTag: String(updatedTx.customTag || ''),
    origDesc,
    origAmount,
    origDate,
    updatedAtMs: Date.now()
  };
  stateObj.settings.editedTxOverridesJson = JSON.stringify(map);
}

function formatCompactTxId(rawId) {
  const id = String(rawId || '').trim();
  if (!id) return '#GD';
  if (id.startsWith('GD_SEPAY_')) return `#SP-${id.slice(9, 17)}`;
  if (id.startsWith('GD_REAL_')) return `#GD-${id.slice(8)}`;
  if (id.startsWith('YC_SEPAY_')) return `#YC-${id.slice(9, 17)}`;
  if (id.startsWith('YC_')) return `#YC-${id.slice(3, 9).toUpperCase()}`;
  if (/^GD_[0-9a-f]{8}-/i.test(id)) return `#GD-${id.slice(3, 9).toUpperCase()}`;
  if (/^GD_\d{10,}/.test(id)) return `#GD-${id.slice(-6)}`;
  return id.length > 12 ? `#${id.slice(0, 10)}` : id;
}

function buildCompactTransactionInfo(tx, stateObj = appState) {
  if (!tx) {
    return {
      shortId: '#GD',
      headline: 'Giao dịch',
      subline: 'Bấm để xem chi tiết',
      studentCode: '',
      shortMethod: 'CK',
      rawNote: ''
    };
  }
  const isTestTx = isSimulatedBankTestItem(tx);
  const rawDesc = isTestTx ? stripRedundantTestPrefix(tx.description) || 'Kiểm tra hoạt động STK' : String(tx.description || '');
  let body = rawDesc
    .replace(/^\[STK\s*Nh[aá]p[^\]]*\]\s*/i, '')
    .replace(/^Tự động lưu (?:CK|GD) (?:SePay|từ STK)(?:\s*\([^)]*\))?:\s*/i, '')
    .replace(/^Tự động lưu CK vào STK:\s*/i, '')
    .trim();

  let bankMemo = '';
  const ndIdx = body.indexOf('| ND:');
  if (ndIdx !== -1) {
    bankMemo = body.slice(ndIdx + 5).trim();
    body = body.slice(0, ndIdx).trim();
  }

  const stuCode = String(tx.studentCode || '').trim().toUpperCase();
  const matchedStu = stuCode
    ? (stateObj?.students || []).find(s => String(s?.studentCode || '').trim().toUpperCase() === stuCode)
    : null;

  let headline = body || tx.category || (tx.type === 'Chi' ? 'Khoản chi' : 'Khoản thu');
  let subline = '';

  if (matchedStu) {
    headline = `${matchedStu.fullName}${matchedStu.className ? ` • Lớp ${matchedStu.className}` : ''}`;
    subline = `${tx.category || 'Thu học phí'}${matchedStu.period ? ` (${matchedStu.period})` : ''}${
      bankMemo ? ` • ND: ${bankMemo}` : ''
    }`;
  } else if (stuCode && body) {
    headline = body.replace(new RegExp(`^${stuCode}\\s*-\\s*`, 'i'), '').trim() || body;
    subline = bankMemo ? `ND CK: ${bankMemo}` : `${tx.category || 'Thu học phí'} • ${tx.date || ''}`;
  } else {
    headline = body || tx.category || 'Giao dịch sổ quỹ';
    subline = bankMemo
      ? `ND CK: ${bankMemo}`
      : `${tx.category || 'Sổ quỹ'} • ${tx.createdBy || tx.method || 'Ghi nhận trên hệ thống'}`;
  }

  return {
    shortId: formatCompactTxId(tx.id),
    headline,
    subline,
    studentCode: stuCode,
    matchedStu,
    bankMemo,
    rawDesc,
    shortMethod: String(tx.method || '').includes('Tiền mặt') ? 'Tiền mặt' : 'Chuyển khoản'
  };
}

let _activeDetailTxKey = '';

function openTransactionDetailModal(itemKey) {
  const modal = document.getElementById('transaction-detail-modal');
  const headerEl = document.getElementById('tx-detail-header');
  const badgeEl = document.getElementById('tx-detail-badge');
  const titleEl = document.getElementById('tx-detail-title');
  const bodyEl = document.getElementById('tx-detail-body');
  const footerEl = document.getElementById('tx-detail-footer');
  if (!modal || !bodyEl || !footerEl) return;

  const key = String(itemKey || '').trim();
  if (!key) return;
  _activeDetailTxKey = key;

  if (key.startsWith('REQ::')) {
    const reqId = key.replace(/^REQ::/, '');
    const req = (appState.paymentRequests || []).find(r => r && r.id === reqId);
    if (!req) {
      showToast('Không tìm thấy yêu cầu chuyển khoản này!', 'warning');
      return;
    }
    const isDraftReq = isDraftPaymentRequest(req);
    const linkedStu = (appState.students || []).find(
      s => s.id === req.studentRecordId || (s.studentCode && s.studentCode === req.studentCode)
    );
    const amtVal = normalizeStoredVnd(req.amount) || (linkedStu ? normalizeStoredVnd(linkedStu.tuitionFee) : 600000);

    if (headerEl) headerEl.className = 'tc-dialog-header-indigo px-5 py-4 text-white flex items-center justify-between gap-3';
    if (badgeEl) badgeEl.textContent = 'THANH CHÍ EDU • YÊU CẦU CHỜ DUYỆT';
    if (titleEl) titleEl.textContent = `${req.studentName || 'Học sinh'} (${req.studentCode || 'HS'})`;

    bodyEl.innerHTML = `
      <div class="tc-detail-amount-card is-pending">
        <div>
          <span class="tc-detail-label">Số tiền chờ duyệt</span>
          <span class="text-xl sm:text-2xl font-black tabular-nums tc-detail-amount-value">+${formatCurrency(amtVal)}</span>
        </div>
        <span class="tc-detail-badge-type">
          <i data-lucide="clock" class="w-3.5 h-3.5"></i>
          <span>Đang chờ duyệt</span>
        </span>
      </div>
      <div class="grid grid-cols-2 gap-2.5 text-xs">
        <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
          <span class="tc-detail-label">Mã yêu cầu</span>
          <span class="tabular-nums font-bold text-slate-800 break-all">${escapeHtml(req.id)}</span>
        </div>
        <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
          <span class="tc-detail-label">Thời gian gửi</span>
          <span class="font-bold text-slate-800">${escapeHtml(req.submittedAt || 'Vừa gửi')}</span>
        </div>
        <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
          <span class="tc-detail-label">Học sinh / Lớp</span>
          <span class="font-bold text-slate-900">${escapeHtml(req.studentName || '---')} (${escapeHtml(req.studentCode || '---')}) • Lớp ${escapeHtml(req.className || '---')}</span>
        </div>
        <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
          <span class="tc-detail-label">Kỳ thu / Người gửi</span>
          <span class="font-bold text-slate-800">${escapeHtml(req.period || '---')} • ${escapeHtml(req.payerName || 'Phụ huynh')}</span>
        </div>
      </div>
      ${
        isDraftReq
          ? `<div class="p-2.5 rounded-xl bg-amber-100/80 border border-amber-300 text-xs font-bold text-amber-950 flex items-center gap-1.5">
               <i data-lucide="tag" class="w-4 h-4 shrink-0"></i>
               <span>Yêu cầu này thuộc <strong>STK Nháp (5801434567)</strong>.</span>
             </div>`
          : ''
      }
      <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
        <span class="tc-detail-label">Ghi chú / Nội dung chuyển khoản đầy đủ</span>
        <p class="text-xs sm:text-sm font-semibold text-slate-800 break-words leading-relaxed">${escapeHtml(req.note || 'Phụ huynh xác nhận chuyển khoản học phí')}</p>
      </div>
    `;

    footerEl.innerHTML = `
      <button
        type="button"
        onclick="closeTransactionDetailModal()"
        class="px-3.5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
      >
        Đóng
      </button>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onclick="closeTransactionDetailModal(); deletePaymentRequestDirectly('${escapeAttr(req.id)}')"
          class="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 text-xs font-extrabold transition cursor-pointer inline-flex items-center gap-1"
        >
          <i data-lucide="trash-2" class="w-4 h-4"></i>
          <span>Xóa trực tiếp</span>
        </button>
        <button
          type="button"
          onclick="closeTransactionDetailModal(); handleReviewPaymentRequest('${escapeAttr(req.id)}', 'Từ chối')"
          class="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 text-xs font-extrabold transition cursor-pointer inline-flex items-center gap-1"
        >
          <i data-lucide="x-circle" class="w-4 h-4"></i>
          <span>Từ chối</span>
        </button>
        <button
          type="button"
          onclick="closeTransactionDetailModal(); handleReviewPaymentRequest('${escapeAttr(req.id)}', 'Đã duyệt')"
          class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold  transition cursor-pointer inline-flex items-center gap-1.5"
        >
          <i data-lucide="check-circle-2" class="w-4 h-4"></i>
          <span>Duyệt & Ghi Sổ Thu</span>
        </button>
      </div>
    `;

    modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    return;
  }

  const tx = (appState.transactions || []).find(t => t && t.id === key);
  if (!tx) {
    showToast('Không tìm thấy giao dịch này!', 'warning');
    return;
  }

  const isIncome = tx.type === 'Thu';
  const isTestTx = isSimulatedBankTestItem(tx);
  const isDraftTx = !isTestTx && isDraftBankTransaction(tx);
  const isDraftIncluded = isDraftTx && isDraftTxIncludedInMain(tx);
  const isExcludedTx = !isTestTx && isTransactionExcludedFromSystem(tx);
  const txTagLabel = getTransactionTagLabel(tx);
  const compact = buildCompactTransactionInfo(tx, appState);

  if (headerEl) {
    headerEl.className = `${
      isExcludedTx ? 'tc-dialog-header-indigo' : isIncome ? 'tc-dialog-header-emerald' : 'tc-dialog-header-danger'
    } px-5 py-4 text-white flex items-center justify-between gap-3`;
  }
  if (badgeEl) {
    badgeEl.textContent = `THANH CHÍ EDU • CHI TIẾT PHIẾU ${isIncome ? 'THU (+)' : 'CHI (-)'}${
      isExcludedTx ? ' • KHÔNG GHI NHẬN HỆ THỐNG' : ''
    }`;
  }
  if (titleEl) {
    titleEl.textContent = compact.headline;
  }

  bodyEl.innerHTML = `
    <div class="tc-detail-amount-card ${isIncome ? 'is-income' : 'is-expense'}">
      <div>
        <span class="tc-detail-label">
          Số tiền giao dịch ${isExcludedTx ? '(Đã gắn tag không ghi nhận)' : ''}
        </span>
        <span class="text-xl sm:text-2xl font-black tabular-nums tc-detail-amount-value ${
          isExcludedTx ? 'line-through opacity-75' : ''
        }">
          ${isIncome ? '+' : '-'}${formatCurrency(isTestTx ? tx.testDisplayAmount || 600000 : tx.amount)}
        </span>
      </div>
      <div class="flex flex-col items-end gap-1.5">
        <span class="tc-detail-badge-type">
          ${isIncome ? '+ Phiếu Thu' : '- Phiếu Chi'} • ${escapeHtml(tx.category || 'Sổ quỹ')}
        </span>
        ${
          isExcludedTx
            ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800 text-white text-xs font-extrabold">
                <i data-lucide="eye-off" class="w-3 h-3 shrink-0"></i>
                <span>${escapeHtml(txTagLabel || 'Không ghi nhận hệ thống')}</span>
              </span>`
            : txTagLabel
            ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-300 text-xs font-extrabold">
                <i data-lucide="tag" class="w-3 h-3 shrink-0"></i>
                <span>${escapeHtml(txTagLabel)}</span>
              </span>`
            : ''
        }
        ${
          isDraftTx
            ? `<span class="tc-detail-badge-draft">
                <i data-lucide="tag" class="w-3 h-3 shrink-0"></i>
                <span>STK Nháp (5801434567) • ${isDraftIncluded ? 'Đang cộng TK chính' : 'Chưa cộng TK chính'}</span>
              </span>`
            : `<span class="tc-detail-badge-account">
                <i data-lucide="landmark" class="w-3 h-3 shrink-0"></i>
                <span>Tài khoản Chính</span>
              </span>`
        }
      </div>
    </div>

    ${
      !isTestTx
        ? `<div class="p-3 rounded-2xl border-2 ${
            isExcludedTx
              ? 'bg-slate-100 border-slate-400'
              : 'bg-slate-50/90 border-slate-200'
          } space-y-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <i data-lucide="${isExcludedTx ? 'eye-off' : 'tag'}" class="w-4 h-4 ${
                  isExcludedTx ? 'text-slate-800' : 'text-indigo-600'
                } shrink-0"></i>
                <div>
                  <div class="text-xs font-extrabold text-slate-900">
                    ${
                      isExcludedTx
                        ? 'Đang gắn tag: KHÔNG GHI NHẬN VÀO HỆ THỐNG'
                        : 'Gắn Tag & Trạng Thái Ghi Nhận Hệ Thống'
                    }
                  </div>
                  <div class="text-[11px] text-slate-500">
                    ${
                      isExcludedTx
                        ? 'Giao dịch này đang được bỏ qua khỏi Tổng Thu/Chi, Tồn quỹ, Số dư Web và Học phí học sinh.'
                        : 'Bấm gắn tag nếu đây là khoản chuyển nhầm, giao dịch nội bộ hoặc bạn không muốn tính vào sổ quỹ hệ thống.'
                    }
                  </div>
                </div>
              </div>
              <button
                type="button"
                onclick="toggleTransactionExcludedFromSystem('${escapeAttr(tx.id)}', document.getElementById('tx-detail-tag-input-${escapeAttr(tx.id)}')?.value)"
                class="px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer inline-flex items-center gap-1.5 shrink-0 ${
                  isExcludedTx
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-slate-800 hover:bg-slate-950 text-white'
                }"
              >
                <i data-lucide="${isExcludedTx ? 'check-circle-2' : 'eye-off'}" class="w-3.5 h-3.5"></i>
                <span>${isExcludedTx ? 'Ghi nhận lại vào hệ thống' : 'Không ghi nhận vào hệ thống'}</span>
              </button>
            </div>
            <div class="flex flex-wrap items-center gap-1.5 pt-1">
              <input
                id="tx-detail-tag-input-${escapeAttr(tx.id)}"
                type="text"
                value="${escapeAttr(txTagLabel || (isExcludedTx ? 'Không ghi nhận hệ thống' : ''))}"
                placeholder="Nhãn tag (VD: Không ghi nhận hệ thống, Chuyển nhầm, Nội bộ...)"
                class="flex-1 min-w-[180px] px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onclick="saveTransactionTagFromDetailModal('${escapeAttr(tx.id)}', true)"
                class="px-2.5 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-800 text-slate-800 hover:text-white text-xs font-extrabold transition cursor-pointer"
                title="Lưu tên tag và đánh dấu Không ghi nhận vào hệ thống"
              >
                Lưu Tag &amp; Không ghi nhận
              </button>
            </div>
            <div class="flex flex-wrap items-center gap-1 text-[11px]">
              <span class="text-slate-400 font-semibold mr-1">Tag nhanh:</span>
              <button type="button" onclick="saveTransactionTagFromDetailModal('${escapeAttr(tx.id)}', true, 'Không ghi nhận hệ thống')" class="px-2 py-0.5 rounded-md bg-white hover:bg-slate-800 text-slate-700 hover:text-white border border-slate-300 font-bold cursor-pointer transition">Không ghi nhận hệ thống</button>
              <button type="button" onclick="saveTransactionTagFromDetailModal('${escapeAttr(tx.id)}', true, 'Chuyển nhầm')" class="px-2 py-0.5 rounded-md bg-white hover:bg-slate-800 text-slate-700 hover:text-white border border-slate-300 font-bold cursor-pointer transition">Chuyển nhầm</button>
              <button type="button" onclick="saveTransactionTagFromDetailModal('${escapeAttr(tx.id)}', true, 'Giao dịch nội bộ')" class="px-2 py-0.5 rounded-md bg-white hover:bg-slate-800 text-slate-700 hover:text-white border border-slate-300 font-bold cursor-pointer transition">Giao dịch nội bộ</button>
              <button type="button" onclick="saveTransactionTagFromDetailModal('${escapeAttr(tx.id)}', true, 'Thu/Chi hộ')" class="px-2 py-0.5 rounded-md bg-white hover:bg-slate-800 text-slate-700 hover:text-white border border-slate-300 font-bold cursor-pointer transition">Thu/Chi hộ</button>
              <button type="button" onclick="saveTransactionTagFromDetailModal('${escapeAttr(tx.id)}', true, 'Test / Nháp')" class="px-2 py-0.5 rounded-md bg-white hover:bg-slate-800 text-slate-700 hover:text-white border border-slate-300 font-bold cursor-pointer transition">Test / Nháp</button>
            </div>
          </div>`
        : ''
    }

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
      <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
        <span class="tc-detail-label">Mã giao dịch đầy đủ</span>
        <span class="tabular-nums font-bold text-slate-800 break-all">${escapeHtml(tx.id)}</span>
      </div>
      <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
        <span class="tc-detail-label">Ngày ghi nhận & Phương thức</span>
        <span class="font-bold text-slate-800">${escapeHtml(tx.date || '---')} • ${escapeHtml(tx.method || 'Chuyển khoản')}</span>
      </div>
      ${
        compact.matchedStu || compact.studentCode
          ? `<div class="sm:col-span-2 p-2.5 rounded-xl bg-slate-100 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
               <div>
                 <span class="tc-detail-label">Học sinh liên kết</span>
                 <span class="font-extrabold text-slate-900 text-xs sm:text-sm">
                   ${escapeHtml(compact.matchedStu ? compact.matchedStu.fullName : 'Học sinh')} (${escapeHtml(compact.studentCode)})
                   ${compact.matchedStu?.className ? ` • Lớp ${escapeHtml(compact.matchedStu.className)}` : ''}
                   ${compact.matchedStu?.period ? ` • ${escapeHtml(compact.matchedStu.period)}` : ''}
                 </span>
               </div>
               <div class="flex items-center gap-1.5 shrink-0">
                 ${
                   compact.matchedStu
                     ? `<button
                          type="button"
                          onclick="closeTransactionDetailModal(); openStudentDetailModal('${escapeAttr(compact.matchedStu.id)}')"
                          class="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-900 text-slate-900 hover:text-white border border-slate-200 text-[11px] font-extrabold transition cursor-pointer shrink-0"
                        >
                          Hồ sơ HS ↗
                        </button>`
                     : ''
                 }
                 <button
                   type="button"
                   onclick="handleUnassignStudentFromTx('${escapeAttr(tx.id)}')"
                   title="Bỏ gán hoặc đổi học sinh khác cho giao dịch này"
                   class="px-2.5 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-bold transition cursor-pointer shrink-0"
                 >
                   Đổi HS
                 </button>
               </div>
             </div>`
          : isIncome
           ? `<div class="sm:col-span-2 p-3 rounded-2xl bg-amber-50/90 border-2 border-amber-300 shadow-sm flex flex-col gap-2.5">
                <div class="flex items-center gap-2 text-xs font-extrabold text-amber-950 whitespace-nowrap overflow-hidden">
                  <i data-lucide="user-plus" class="w-4 h-4 text-amber-600 shrink-0"></i>
                  <span class="shrink-0 font-bold">Chưa gán học sinh</span>
                  <span class="text-[11px] font-normal text-amber-800 truncate">— Điền tên hoặc mã HS bên dưới để gán và tự động ghi nhận học phí</span>
                </div>
                <div class="flex items-center gap-2 w-full" onclick="event.stopPropagation()">
                  <div class="relative flex-1 min-w-0">
                    <input type="hidden" id="quick-assign-stu-id-${escapeAttr(tx.id)}" value="" />
                    <div class="relative flex items-center">
                      <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none"></i>
                      <input
                        id="quick-assign-stu-input-${escapeAttr(tx.id)}"
                        type="text"
                        placeholder="Điền tên hoặc mã HS..."
                        autocomplete="off"
                        class="w-full pl-8 pr-7 py-2 rounded-xl border border-amber-400 bg-white text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-slate-400 transition"
                        oninput="handleQuickAssignSearchInput('${escapeAttr(tx.id)}', this.value)"
                        onfocus="handleQuickAssignSearchInput('${escapeAttr(tx.id)}', this.value)"
                        onblur="setTimeout(()=>{const b=document.getElementById('quick-assign-suggest-box-${escapeAttr(tx.id)}');if(b)b.classList.add('hidden');},260)"
                        onkeydown="if(event.key==='Enter'){event.preventDefault();event.stopPropagation();handleQuickAssignStudentToTx('${escapeAttr(tx.id)}');}"
                      />
                      <button
                        id="quick-assign-clear-btn-${escapeAttr(tx.id)}"
                        type="button"
                        onclick="event.stopPropagation(); clearQuickAssignSelection('${escapeAttr(tx.id)}')"
                        title="Xóa lựa chọn"
                        class="hidden absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                      >
                        <i data-lucide="x" class="w-3.5 h-3.5"></i>
                      </button>
                    </div>
                    <div
                      id="quick-assign-suggest-box-${escapeAttr(tx.id)}"
                      onclick="event.stopPropagation()"
                      class="hidden absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-xl border border-amber-300 bg-white shadow-2xl z-[100] divide-y divide-slate-100"
                    ></div>
                  </div>
                  <button
                    type="button"
                    onclick="event.stopPropagation(); handleQuickAssignStudentToTx('${escapeAttr(tx.id)}')"
                    class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs transition cursor-pointer shrink-0 flex items-center gap-1 shadow-sm whitespace-nowrap h-[36px]"
                    title="Gán khoản chuyển khoản này cho học sinh & đánh dấu Đã hoàn thành học phí"
                  >
                    <i data-lucide="check" class="w-3.5 h-3.5"></i>
                    <span>Gán &amp; Duyệt</span>
                  </button>
                </div>
              </div>`
          : ''
      }
    </div>

    <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
      <span class="tc-detail-label">Nội dung chi tiết & Nội dung chuyển khoản gốc</span>
      <p class="text-xs sm:text-sm font-semibold text-slate-800 break-words leading-relaxed">${escapeHtml(
        tx.description || tx.category || '---'
      )}</p>
      ${
        tx.createdBy
          ? `<p class="text-[11px] text-slate-400 pt-1">Nguồn tạo: <strong class="text-slate-800">${escapeHtml(tx.createdBy)}</strong></p>`
          : ''
      }
    </div>
  `;

  footerEl.innerHTML = `
    <button
      type="button"
      onclick="closeTransactionDetailModal()"
      class="px-3.5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
    >
      Đóng
    </button>
    <div class="flex flex-wrap items-center gap-1.5">
      ${
        isDraftTx
          ? `<button
               type="button"
               onclick="toggleDraftTransactionMainAccount('${escapeAttr(tx.id)}')"
               class="px-3 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer border inline-flex items-center gap-1 ${
                 isDraftIncluded
                   ? 'bg-amber-50 hover:bg-amber-500 text-amber-800 hover:text-white border-amber-300'
                   : 'bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border-emerald-300'
               }"
             >
               <i data-lucide="${isDraftIncluded ? 'pause-circle' : 'plus-circle'}" class="w-3.5 h-3.5"></i>
               <span>${isDraftIncluded ? 'Tắt cộng TK chính' : 'Cộng vào TK chính'}</span>
             </button>`
          : ''
      }
      <button
        type="button"
        onclick="closeTransactionDetailModal(); editTransactionRecord('${escapeAttr(tx.id)}')"
        class="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold  transition cursor-pointer inline-flex items-center gap-1"
      >
        <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
        <span>Chỉnh sửa</span>
      </button>
      <button
        type="button"
        onclick="closeTransactionDetailModal(); deleteTransactionRecord('${escapeAttr(tx.id)}')"
        class="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 text-xs font-extrabold transition cursor-pointer inline-flex items-center gap-1"
      >
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        <span>Xóa</span>
      </button>
    </div>
  `;

  modal.classList.remove('hidden');
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}


function handleTxModalCardClick(e) {
  if (e && typeof e.stopPropagation === 'function') {
    e.stopPropagation();
  }
  const t = e ? e.target : null;
  if (t && typeof t.closest === 'function') {
    if (!t.closest('[id^="quick-assign-suggest-box"]') && !t.closest('[id^="quick-assign-stu-input"]')) {
      document.querySelectorAll('[id^="quick-assign-suggest-box"]').forEach(el => el.classList.add('hidden'));
    }
  }
}

async function handleRefreshFinanceTransactions(isAuto = false) {
  const icon = document.getElementById('icon-refresh-finance');
  if (icon) icon.classList.add('animate-spin');
  try {
    renderAdminTransactions();
    if (!isAuto) {
      if (getGasUrl() && isAutoSyncEnabled()) {
        await syncAllToGoogleSheet(false);
      }
      showToast('Đã làm mới sổ Thu - Chi & đẩy dữ liệu lên Google Sheet!', 'success');
    }
  } catch (e) {
    console.warn('Lỗi làm mới Thu Chi:', e);
    if (!isAuto) {
      showToast('Không thể làm mới thu chi. Vui lòng thử lại sau ít giây.', 'error');
    }
  } finally {
    if (icon) icon.classList.remove('animate-spin');
  }
}

function closeTransactionDetailModal() {
  _activeDetailTxKey = '';
  const modal = document.getElementById('transaction-detail-modal');
  if (modal) modal.classList.add('hidden');
}

function handleQuickAssignSearchInput(txId, typedVal) {
  const raw = String(typedVal || '').trim();
  const hiddenInput = document.getElementById(`quick-assign-stu-id-${txId}`);
  const textInput = document.getElementById(`quick-assign-stu-input-${txId}`);
  const clearBtn = document.getElementById(`quick-assign-clear-btn-${txId}`);
  const suggestBox = document.getElementById(`quick-assign-suggest-box-${txId}`);
  if (!suggestBox || !textInput) return;

  const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (!raw) {
    if (hiddenInput) hiddenInput.value = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    textInput.classList.remove('border-emerald-500', 'bg-emerald-50/50', 'ring-2', 'ring-emerald-300');
    textInput.classList.add('border-amber-400');

    const unpaidList = (appState.students || [])
      .filter(s => s.status !== 'Đã hoàn thành')
      .slice(0, 8);
    if (unpaidList.length > 0) {
      suggestBox.innerHTML = `
        <div class="px-2.5 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Học sinh chưa đóng học phí (Bấm để gán ngay)</div>
        ${unpaidList.map(s => `
          <div
            onmousedown="event.preventDefault(); event.stopPropagation(); selectAndAssignStudent('${escapeAttr(txId)}', '${escapeAttr(s.id)}');"
            class="p-2.5 hover:bg-emerald-50/80 cursor-pointer flex items-center justify-between gap-2 transition select-none group"
            title="Bấm để gán học sinh ${escapeAttr(s.fullName)} (${escapeAttr(s.studentCode || 'HS')}) và duyệt hoàn thành học phí"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-extrabold text-[10px] uppercase tracking-wide">${escapeHtml(s.studentCode || 'HS')}</span>
                <span class="font-extrabold text-xs text-slate-900 group-hover:text-emerald-700">${escapeHtml(s.fullName)}</span>
                <span class="text-[11px] text-slate-500 font-medium">(Lớp ${escapeHtml(s.className || '---')})</span>
              </div>
              <div class="text-[11px] text-slate-400 mt-0.5 font-medium">Học phí: ${formatCurrency(s.tuitionFee ?? 600000)} • Bấm để gán ngay</div>
            </div>
            <div class="shrink-0 flex items-center gap-1.5">
              <button
                type="button"
                onmousedown="event.preventDefault(); event.stopPropagation(); selectAndAssignStudent('${escapeAttr(txId)}', '${escapeAttr(s.id)}');"
                class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] shadow-sm transition inline-flex items-center gap-1 cursor-pointer"
              >
                <i data-lucide="check" class="w-3 h-3"></i>
                <span>Gán ngay</span>
              </button>
            </div>
          </div>
        `).join('')}
      `;
      suggestBox.classList.remove('hidden');
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    } else {
      suggestBox.innerHTML = '';
      suggestBox.classList.add('hidden');
    }
    return;
  }

  if (clearBtn) clearBtn.classList.remove('hidden');

  // 1. Nếu người dùng điền MÃ HỌC SINH -> Tự động nhận đúng học sinh có mã số
  const rawNorm = norm(raw);
  const exactCodeMatch = (appState.students || []).find(s => {
    const codeNorm = norm(s.studentCode);
    return (codeNorm === rawNorm || (rawNorm.length >= 2 && codeNorm.endsWith(rawNorm))) && rawNorm.length >= 2;
  });

  if (exactCodeMatch) {
    if (hiddenInput) hiddenInput.value = exactCodeMatch.id;
    textInput.classList.remove('border-amber-400');
    textInput.classList.add('border-emerald-500', 'bg-emerald-50/50', 'ring-2', 'ring-emerald-300');

    suggestBox.innerHTML = `
      <div
        onmousedown="event.preventDefault(); event.stopPropagation(); selectAndAssignStudent('${escapeAttr(txId)}', '${escapeAttr(exactCodeMatch.id)}');"
        class="p-2.5 bg-emerald-50/90 hover:bg-emerald-100 cursor-pointer flex items-center justify-between gap-2 transition select-none group"
        title="Bấm để gán ngay cho ${escapeAttr(exactCodeMatch.fullName)}"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-extrabold text-[10px] uppercase">✓ Khớp mã: ${escapeHtml(exactCodeMatch.studentCode || 'HS')}</span>
            <span class="font-extrabold text-xs text-emerald-950">${escapeHtml(exactCodeMatch.fullName)}</span>
            <span class="text-[11px] text-emerald-700 font-semibold">(Lớp ${escapeHtml(exactCodeMatch.className || '---')})</span>
          </div>
          <div class="text-[11px] text-emerald-700 mt-0.5 font-medium">Học phí: ${formatCurrency(exactCodeMatch.tuitionFee ?? 600000)} • Bấm để gán ngay</div>
        </div>
        <div class="shrink-0 flex items-center gap-1.5">
          <button
            type="button"
            onmousedown="event.preventDefault(); event.stopPropagation(); selectAndAssignStudent('${escapeAttr(txId)}', '${escapeAttr(exactCodeMatch.id)}');"
            class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] shadow-sm transition inline-flex items-center gap-1 cursor-pointer"
          >
            <i data-lucide="check" class="w-3 h-3"></i>
            <span>Gán ngay</span>
          </button>
        </div>
      </div>
    `;
    suggestBox.classList.remove('hidden');
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    return;
  }

  // 2. Nếu người dùng điền TÊN hoặc tiền tố -> Đề xuất học sinh kèm mã tương ứng
  if (hiddenInput) hiddenInput.value = '';
  textInput.classList.remove('border-emerald-500', 'bg-emerald-50/50', 'ring-2', 'ring-emerald-300');
  textInput.classList.add('border-amber-400');

  const q = removeVietnameseTones(raw.toLowerCase()).replace(/\s+/g, ' ').trim();
  const candidates = (appState.students || []).filter(s => {
    const sCode = norm(s.studentCode);
    const sName = removeVietnameseTones(String(s.fullName || '').toLowerCase()).trim();
    const sClass = removeVietnameseTones(String(s.className || '').toLowerCase()).trim();
    return (rawNorm.length >= 2 && sCode.includes(rawNorm)) || sName.includes(q) || sClass.includes(q);
  });

  candidates.sort((a, b) => {
    const aNameClean = removeVietnameseTones(String(a.fullName || '').toLowerCase()).trim();
    const bNameClean = removeVietnameseTones(String(b.fullName || '').toLowerCase()).trim();
    if (aNameClean === q && bNameClean !== q) return -1;
    if (bNameClean === q && aNameClean !== q) return 1;

    const aPaid = a.status === 'Đã hoàn thành' ? 1 : 0;
    const bPaid = b.status === 'Đã hoàn thành' ? 1 : 0;
    if (aPaid !== bPaid) return aPaid - bPaid;
    return String(a.fullName || '').localeCompare(String(b.fullName || ''), 'vi');
  });

  const sliced = candidates.slice(0, 8);
  if (sliced.length === 0) {
    suggestBox.innerHTML = `
      <div class="p-3 text-center text-xs text-slate-500 font-semibold">
        Không tìm thấy học sinh phù hợp với "${escapeHtml(raw)}"
      </div>
    `;
    suggestBox.classList.remove('hidden');
    return;
  }

  suggestBox.innerHTML = `
    <div class="px-2.5 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Đề xuất (${candidates.length} học sinh) • Bấm để gán ngay</div>
    ${sliced.map(s => `
      <div
        onmousedown="event.preventDefault(); event.stopPropagation(); selectAndAssignStudent('${escapeAttr(txId)}', '${escapeAttr(s.id)}');"
        class="p-2.5 hover:bg-emerald-50/80 cursor-pointer flex items-center justify-between gap-2 transition select-none group"
        title="Bấm để gán học sinh ${escapeAttr(s.fullName)} (${escapeAttr(s.studentCode || 'HS')}) và duyệt hoàn thành học phí"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-extrabold text-[10px] uppercase tracking-wide">${escapeHtml(s.studentCode || 'HS')}</span>
            <span class="font-extrabold text-xs text-slate-900 group-hover:text-emerald-700">${escapeHtml(s.fullName)}</span>
            <span class="text-[11px] text-slate-500 font-medium">(Lớp ${escapeHtml(s.className || '---')})</span>
          </div>
          <div class="text-[11px] text-slate-400 mt-0.5 font-medium">Học phí: ${formatCurrency(s.tuitionFee ?? 600000)} • Bấm để gán ngay</div>
        </div>
        <div class="shrink-0 flex items-center gap-1.5">
          <button
            type="button"
            onmousedown="event.preventDefault(); event.stopPropagation(); selectAndAssignStudent('${escapeAttr(txId)}', '${escapeAttr(s.id)}');"
            class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] shadow-sm transition inline-flex items-center gap-1 cursor-pointer"
          >
            <i data-lucide="check" class="w-3 h-3"></i>
            <span>Gán ngay</span>
          </button>
        </div>
      </div>
    `).join('')}
  `;
  suggestBox.classList.remove('hidden');
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

function selectQuickAssignStudent(txId, studentId) {
  const student = (appState.students || []).find(s => s.id === studentId);
  if (!student) return;

  const hiddenInput = document.getElementById(`quick-assign-stu-id-${txId}`);
  const textInput = document.getElementById(`quick-assign-stu-input-${txId}`);
  const clearBtn = document.getElementById(`quick-assign-clear-btn-${txId}`);
  const suggestBox = document.getElementById(`quick-assign-suggest-box-${txId}`);

  if (hiddenInput) hiddenInput.value = student.id;
  if (textInput) {
    textInput.value = `[${student.studentCode || 'HS'}] ${student.fullName} (Lớp ${student.className || '---'})`;
    textInput.classList.remove('border-amber-400');
    textInput.classList.add('border-emerald-500', 'bg-emerald-50/50', 'ring-2', 'ring-emerald-300');
  }
  if (clearBtn) clearBtn.classList.remove('hidden');
  if (suggestBox) {
    suggestBox.innerHTML = '';
    suggestBox.classList.add('hidden');
  }
}

async function selectAndAssignStudent(txId, studentId) {
  selectQuickAssignStudent(txId, studentId);
  await handleQuickAssignStudentToTx(txId, studentId);
}

function clearQuickAssignSelection(txId) {
  const hiddenInput = document.getElementById(`quick-assign-stu-id-${txId}`);
  const textInput = document.getElementById(`quick-assign-stu-input-${txId}`);
  const clearBtn = document.getElementById(`quick-assign-clear-btn-${txId}`);
  const suggestBox = document.getElementById(`quick-assign-suggest-box-${txId}`);

  if (hiddenInput) hiddenInput.value = '';
  if (textInput) {
    textInput.value = '';
    textInput.classList.remove('border-emerald-500', 'bg-emerald-50/50', 'ring-2', 'ring-emerald-300');
    textInput.classList.add('border-amber-400');
    textInput.focus();
  }
  if (clearBtn) clearBtn.classList.add('hidden');
  if (suggestBox) {
    suggestBox.innerHTML = '';
    suggestBox.classList.add('hidden');
  }
}

async function handleQuickAssignStudentToTx(txId, explicitStuId = '') {
  const tx = (appState.transactions || []).find(t => t.id === txId);
  if (!tx) {
    showToast('Không tìm thấy giao dịch!', 'error');
    return;
  }
  const hiddenInput = document.getElementById(`quick-assign-stu-id-${txId}`);
  const textInput = document.getElementById(`quick-assign-stu-input-${txId}`);
  let stuId = explicitStuId || (hiddenInput ? hiddenInput.value : '');

  // Nếu chưa có stuId trong hiddenInput, tự động đối chiếu dựa trên nội dung đã gõ trong textInput
  if (!stuId && textInput && textInput.value.trim()) {
    const raw = textInput.value.trim();
    const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const rawNorm = norm(raw);

    // 1. Đối chiếu theo mã học sinh (ví dụ HS001 hoặc 001)
    let found = (appState.students || []).find(s => {
      const codeNorm = norm(s.studentCode);
      return (codeNorm === rawNorm || (rawNorm.length >= 2 && codeNorm.endsWith(rawNorm))) && rawNorm.length >= 2;
    });
    // 2. Đối chiếu theo tên đầy đủ
    if (!found) {
      const q = removeVietnameseTones(raw.toLowerCase()).trim();
      found = (appState.students || []).find(s => removeVietnameseTones(String(s.fullName || '').toLowerCase()).trim() === q);
    }
    // 3. Nếu danh sách tìm kiếm chỉ có đúng 1 học sinh thỏa mãn
    if (!found) {
      const q = removeVietnameseTones(raw.toLowerCase()).trim();
      const matches = (appState.students || []).filter(s => {
        const sName = removeVietnameseTones(String(s.fullName || '').toLowerCase()).trim();
        return sName.includes(q);
      });
      if (matches.length === 1) found = matches[0];
    }
    if (found) {
      stuId = found.id;
    }
  }

  if (!stuId) {
    showToast('Vui lòng gõ mã hoặc chọn một học sinh trong danh sách đề xuất!', 'warning');
    if (textInput) textInput.focus();
    return;
  }
  const student = (appState.students || []).find(s => s.id === stuId);
  if (!student) {
    showToast('Không tìm thấy thông tin học sinh được chọn!', 'error');
    return;
  }

  const oldTxCopy = { ...tx };

  // 1. Cập nhật mã học sinh vào giao dịch
  tx.studentCode = student.studentCode || '';
  if (!tx.category || tx.category === 'Khác') {
    tx.category = 'Thu học phí';
  }

  // 2. Cập nhật học sinh thành "Đã hoàn thành"
  student.status = 'Đã hoàn thành';
  const txDateStr = tx.date || new Date().toISOString().slice(0, 10);
  student.completedAt = txDateStr;
  student.paidAt = txDateStr;
  const payTag = `Đã nhận CK: +${formatCurrency(tx.amount || student.tuitionFee || 600000)} (${txDateStr})`;
  student.note = student.note ? `${student.note} • ${payTag}` : payTag;

  // 3. Nếu có yêu cầu chờ duyệt cũ của học sinh này trong paymentRequests -> đánh dấu Đã duyệt
  const matchedReq = (appState.paymentRequests || []).find(
    r => (r.studentRecordId === student.id || r.studentCode === student.studentCode) && r.status === 'Chờ duyệt'
  );
  if (matchedReq) {
    matchedReq.status = 'Đã duyệt';
    matchedReq.reviewedAt = txDateStr;
  }

  // Ghi nhận override để đồng bộ an toàn không mất mã học sinh đã gán
  recordEditedTransactionOverride(appState, oldTxCopy, tx);

  saveStateToLocal();
  renderAdminTransactions();
  if (typeof renderClassbookTable === 'function') renderClassbookTable();
  if (typeof renderStudentsTable === 'function') renderStudentsTable();
  if (typeof updateGlobalHeaderBadges === 'function') updateGlobalHeaderBadges();

  // Mở lại modal chi tiết để cập nhật giao diện
  openTransactionDetailModal(tx.id);

  showToast(`✅ Đã gán thành công cho ${student.fullName} (${student.studentCode}) & cập nhật Đã hoàn thành!`, 'success');
  triggerAutoSyncIfNeeded(`Gán giao dịch cho học sinh ${student.fullName} và duyệt Đã hoàn thành học phí`);
}

async function handleUnassignStudentFromTx(txId) {
  const tx = (appState.transactions || []).find(t => t.id === txId);
  if (!tx) return;
  const oldTxCopy = { ...tx };
  tx.studentCode = '';
  recordEditedTransactionOverride(appState, oldTxCopy, tx);
  saveStateToLocal();
  renderAdminTransactions();
  if (typeof renderClassbookTable === 'function') renderClassbookTable();
  if (typeof renderStudentsTable === 'function') renderStudentsTable();
  openTransactionDetailModal(tx.id);
  showToast('Đã bỏ liên kết học sinh khỏi giao dịch này.', 'info');
  triggerAutoSyncIfNeeded('Bỏ gán học sinh khỏi giao dịch');
}

let _groupQrAmountFixed = false;
let _groupQrMemoCustom = false;

const DEFAULT_GROUP_QR_MESSAGE_TEMPLATE = `Kính gửi Quý phụ huynh thông tin đóng học phí:
- Ngân hàng: {ngan_hang}
- Số tài khoản: {so_tai_khoan}
- Chủ tài khoản: {chu_tai_khoan}
- Mức học phí: {hoc_phi}
- Gợi ý nội dung CK: {noi_dung_ck}
(Quý phụ huynh vui lòng QUÉT MÃ QR đính kèm hoặc nhập đúng Mã VA / Số tài khoản trên để hệ thống tự động đối soát và ghi nhận học phí ngay lập tức.)`;

function openGeneralGroupQrModal() {
  const modal = document.getElementById('group-qr-modal');
  if (!modal) return;
  const stg = appState.settings || {};
  const bank = stg.bankBin || 'BIDV';
  const rawAcc = stg.bankAccountNo || (isSandboxDraftMode ? '5801434567' : '8601774789');
  const owner = stg.bankAccountName || 'HKD TRUNG TAM HUYNH THANH CHI';

  const bankEl = document.getElementById('group-qr-bank');
  const ownerEl = document.getElementById('group-qr-owner');
  const accEl = document.getElementById('group-qr-acc');
  if (bankEl) bankEl.textContent = bank;
  if (ownerEl) ownerEl.textContent = owner;
  if (accEl) accEl.textContent = formatDisplayBankAccWithVa(rawAcc);

  // Load custom message template into textarea
  const msgEl = document.getElementById('group-qr-custom-msg');
  if (msgEl) {
    let tpl = (stg.groupQrMessageTemplate && stg.groupQrMessageTemplate.trim())
      ? stg.groupQrMessageTemplate
      : DEFAULT_GROUP_QR_MESSAGE_TEMPLATE;
    if (tpl.includes('- Cú pháp CK: HOC PHI')) {
      tpl = tpl.replace('- Cú pháp CK: HOC PHI', '- Gợi ý nội dung CK: {noi_dung_ck}');
    }
    msgEl.value = tpl;
  }

  updateGroupQrAmountMode(false);
  updateGroupQrMemoMode(false);
  modal.classList.remove('hidden');
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

function closeGroupQrModal() {
  const modal = document.getElementById('group-qr-modal');
  if (modal) modal.classList.add('hidden');
}

function updateGroupQrAmountMode(isFixed) {
  _groupQrAmountFixed = isFixed;
  const freeBtn = document.getElementById('group-qr-amount-free-btn');
  const fixedBtn = document.getElementById('group-qr-amount-fixed-btn');
  const fixedBox = document.getElementById('group-qr-fixed-amount-box');

  if (freeBtn && fixedBtn) {
    if (!isFixed) {
      freeBtn.className = 'p-2 rounded-lg border-2 border-blue-600 bg-blue-50 text-blue-700 font-extrabold text-xs text-center cursor-pointer';
      fixedBtn.className = 'p-2 rounded-lg border-2 border-slate-200 bg-white text-slate-600 hover:border-slate-300 font-bold text-xs text-center cursor-pointer';
      if (fixedBox) fixedBox.classList.add('hidden');
    } else {
      fixedBtn.className = 'p-2 rounded-lg border-2 border-emerald-600 bg-emerald-50 text-emerald-800 font-extrabold text-xs text-center cursor-pointer';
      freeBtn.className = 'p-2 rounded-lg border-2 border-slate-200 bg-white text-slate-600 hover:border-slate-300 font-bold text-xs text-center cursor-pointer';
      if (fixedBox) fixedBox.classList.remove('hidden');
    }
  }
  refreshGroupQrPreview();
}

function updateGroupQrMemoMode(isCustom) {
  _groupQrMemoCustom = isCustom;
  const emptyBtn = document.getElementById('group-qr-memo-empty-btn');
  const customBtn = document.getElementById('group-qr-memo-custom-btn');
  const customBox = document.getElementById('group-qr-custom-memo-box');

  if (emptyBtn && customBtn) {
    if (!isCustom) {
      emptyBtn.className = 'p-2 rounded-lg border-2 border-emerald-600 bg-emerald-50 text-emerald-800 font-extrabold text-xs text-center cursor-pointer';
      customBtn.className = 'p-2 rounded-lg border-2 border-slate-200 bg-white text-slate-600 hover:border-slate-300 font-bold text-xs text-center cursor-pointer';
      if (customBox) customBox.classList.add('hidden');
    } else {
      customBtn.className = 'p-2 rounded-lg border-2 border-indigo-600 bg-indigo-50 text-indigo-800 font-extrabold text-xs text-center cursor-pointer';
      emptyBtn.className = 'p-2 rounded-lg border-2 border-slate-200 bg-white text-slate-600 hover:border-slate-300 font-bold text-xs text-center cursor-pointer';
      if (customBox) customBox.classList.remove('hidden');
    }
  }
  refreshGroupQrPreview();
}

function refreshGroupQrPreview() {
  const stg = appState.settings || {};
  const bank = stg.bankBin || 'BIDV';
  const rawAcc = stg.bankAccountNo || (isSandboxDraftMode ? '5801434567' : '8601774789');
  const owner = stg.bankAccountName || 'HKD TRUNG TAM HUYNH THANH CHI';

  const amountInput = document.getElementById('group-qr-amount-input');
  const amt = _groupQrAmountFixed && amountInput ? Number(amountInput.value) || 0 : 0;

  const memoInput = document.getElementById('group-qr-memo-input');
  const memo = (_groupQrMemoCustom && memoInput) ? memoInput.value.trim() : '';

  const qrUrl = buildVietQrUrl(bank, rawAcc, owner, amt, memo);

  const imgEl = document.getElementById('group-modal-qr-img');
  if (imgEl) imgEl.src = qrUrl;
  if (typeof prepareQrPngBlobCache === 'function') prepareQrPngBlobCache(qrUrl);
}

function saveGroupQrMessageTemplate() {
  const msgEl = document.getElementById('group-qr-custom-msg');
  if (!msgEl) return;
  const text = msgEl.value.trim();
  if (!text) {
    showToast('Nội dung tin nhắn không được để trống!', 'warning');
    return;
  }
  if (!appState.settings) appState.settings = {};
  appState.settings.groupQrMessageTemplate = text;
  saveAppState();
  triggerAutoSyncIfNeeded();
  showToast('💾 Đã lưu mẫu nội dung gửi phụ huynh thành công!', 'success');
}

function resetGroupQrMessageTemplate() {
  const msgEl = document.getElementById('group-qr-custom-msg');
  if (msgEl) {
    msgEl.value = DEFAULT_GROUP_QR_MESSAGE_TEMPLATE;
  }
  showToast('Đã khôi phục mẫu tin nhắn mặc định. Nhấn "Lưu mẫu" nếu bạn muốn lưu lại.', 'info');
}

function formatGroupQrMessage(tpl) {
  const stg = appState.settings || {};
  const bank = stg.bankBin || 'BIDV';
  const rawAcc = stg.bankAccountNo || (isSandboxDraftMode ? '5801434567' : '8601774789');
  const owner = stg.bankAccountName || 'HKD TRUNG TAM HUYNH THANH CHI';
  const amountInput = document.getElementById('group-qr-amount-input');
  const isFixed = _groupQrAmountFixed;
  const amountVal = isFixed && amountInput ? Number(amountInput.value) || 0 : 0;
  const feeStr = amountVal > 0 ? formatCurrency(amountVal) : 'Phụ huynh tự nhập';

  const memoInput = document.getElementById('group-qr-memo-input');
  const customMemo = (_groupQrMemoCustom && memoInput) ? memoInput.value.trim() : '';
  const memoStr = customMemo || 'Để mặc định hoặc ghi [Tên HS] [Lớp] (hoặc PH tự điền)';

  let template = tpl || (stg.groupQrMessageTemplate && stg.groupQrMessageTemplate.trim()) || DEFAULT_GROUP_QR_MESSAGE_TEMPLATE;
  if (template.includes('- Cú pháp CK: HOC PHI')) {
    template = template.replace('- Cú pháp CK: HOC PHI', '- Gợi ý nội dung CK: {noi_dung_ck}');
  }
  const effectiveVa = getEffectiveQrAccountNo(rawAcc, stg);
  const accForMsg = effectiveVa && effectiveVa !== rawAcc
    ? `${effectiveVa} (Mã VA tự động của TK ${rawAcc} — Quét QR hoặc nhập mã ${effectiveVa})`
    : rawAcc;

  return template
    .replace(/\{ngan_hang\}/gi, bank)
    .replace(/\{so_tai_khoan\}/gi, accForMsg)
    .replace(/\{chu_tai_khoan\}/gi, owner)
    .replace(/\{hoc_phi\}/gi, feeStr)
    .replace(/\{noi_dung_ck\}/gi, memoStr);
}

async function copyGroupQrCustomMessage() {
  const msgEl = document.getElementById('group-qr-custom-msg');
  const template = msgEl ? msgEl.value : '';
  const finalMsg = formatGroupQrMessage(template);

  let copied = false;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(finalMsg);
      copied = true;
    } catch (e) {}
  }

  if (!copied) {
    const ta = document.createElement('textarea');
    ta.value = finalMsg;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      copied = document.execCommand('copy');
    } catch (e) {}
    document.body.removeChild(ta);
  }

  showToast('📋 Đã sao chép nội dung tin nhắn gửi phụ huynh!', 'success');
}

function copyGroupQrZaloMessage() {
  return copyGroupQrCustomMessage();
}

// Bộ nhớ đệm lưu trữ PNG Blob để sao chép vào OS Clipboard ngay lập tức khi click (giữ vững User Activation Gesture)
const _qrPngBlobCache = new Map();

function prepareQrPngBlobCache(qrUrl) {
  if (!qrUrl) return Promise.resolve(null);
  if (_qrPngBlobCache.has(qrUrl)) {
    return _qrPngBlobCache.get(qrUrl);
  }
  const promise = renderQrUrlToPngBlob(qrUrl)
    .then(blob => {
      _qrPngBlobCache.set(qrUrl, blob);
      return blob;
    })
    .catch(err => {
      console.warn('Lỗi tiền render ảnh QR PNG:', err);
      _qrPngBlobCache.delete(qrUrl);
      return null;
    });
  _qrPngBlobCache.set(qrUrl, promise);
  return promise;
}

// Tải và chuyển đổi mã QR thành PNG Blob chất lượng cao (1080x1080, 300 DPI, nền trắng sạch)
async function renderQrUrlToPngBlob(qrUrl) {
  if (!qrUrl) throw new Error('URL mã QR rỗng');

  // Trường hợp là data URL ảnh PNG hoặc JPEG
  if (qrUrl.startsWith('data:image/png') || qrUrl.startsWith('data:image/jpeg')) {
    const res = await fetch(qrUrl);
    return await res.blob();
  }

  // Tải nội dung từ server VietQR với CORS mode
  let fetchTarget = qrUrl;
  if (fetchTarget.includes('img.vietqr.io')) {
    // Chuyển trực tiếp sang .svg để nhận HTTP 200 cùng header Access-Control-Allow-Origin: *
    fetchTarget = fetchTarget.replace(/\.(png|jpg)(\?|$)/i, '.svg$2');
  }
  const response = await fetch(fetchTarget, { mode: 'cors' });
  if (!response.ok) {
    throw new Error(`Tải mã VietQR thất bại: HTTP ${response.status}`);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  // Nếu server trả về trực tiếp định dạng PNG nhị phân chuẩn (không phải SVG)
  if (contentType.includes('image/png') && !contentType.includes('svg')) {
    const rawBlob = await response.blob();
    if (rawBlob && rawBlob.size > 1000) return rawBlob;
  }

  // VietQR trả về mã nguồn SVG (ngay cả khi gọi URL đuôi .png)
  const svgText = await response.text();
  return await convertSvgStringToPngBlob(svgText);
}

// Chuyển đổi mã nguồn SVG thành PNG Blob độ phân giải cao trên Canvas
function convertSvgStringToPngBlob(svgText) {
  return new Promise((resolve, reject) => {
    try {
      if (!svgText || !svgText.includes('<svg')) {
        return reject(new Error('Dữ liệu không phải mã nguồn SVG hợp lệ'));
      }

      let cleanedSvg = svgText;
      if (!cleanedSvg.includes('xmlns="http://www.w3.org/2000/svg"')) {
        cleanedSvg = cleanedSvg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      }

      const widthMatch = cleanedSvg.match(/width=["'](\d+)["']/i);
      const heightMatch = cleanedSvg.match(/height=["'](\d+)["']/i);
      const viewBoxMatch = cleanedSvg.match(/viewBox=["']\s*0\s+0\s+(\d+)\s+(\d+)\s*["']/i);
      const baseWidth = widthMatch ? parseInt(widthMatch[1], 10) : (viewBoxMatch ? parseInt(viewBoxMatch[1], 10) : 540);
      const baseHeight = heightMatch ? parseInt(heightMatch[1], 10) : (viewBoxMatch ? parseInt(viewBoxMatch[2], 10) : 540);

      const blob = new Blob([cleanedSvg], { type: 'image/svg+xml;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const img = new Image();

      const timer = setTimeout(() => {
        try { URL.revokeObjectURL(blobUrl); } catch (e) {}
        reject(new Error('Quá thời gian render ảnh QR (timeout 8s)'));
      }, 8000);

      img.onload = () => {
        clearTimeout(timer);
        try {
          const w = img.naturalWidth || baseWidth || 540;
          const h = img.naturalHeight || baseHeight || 540;
          // Render ở độ phân giải 2x (1080x1080) để dán vào Zalo cực kỳ sắc nét và quét nhạy 100%
          const scale = 2;
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(blobUrl);
            return reject(new Error('Không khởi tạo được Canvas 2D'));
          }

          // Đổ nền trắng tinh khôi tránh việc ảnh bị viền đen khi dán vào Zalo / Messenger
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          URL.revokeObjectURL(blobUrl);

          canvas.toBlob(pngBlob => {
            if (pngBlob && pngBlob.size > 0) {
              resolve(pngBlob);
            } else {
              reject(new Error('Tạo file ảnh PNG từ Canvas thất bại'));
            }
          }, 'image/png', 1.0);
        } catch (err) {
          URL.revokeObjectURL(blobUrl);
          reject(err);
        }
      };

      img.onerror = () => {
        clearTimeout(timer);
        URL.revokeObjectURL(blobUrl);
        // Fallback: Vẽ trực tiếp background base64 và đường path QR nếu SVG Image load bị chặn
        fallbackDrawSvgToPngBlob(cleanedSvg, baseWidth, baseHeight)
          .then(resolve)
          .catch(reject);
      };

      img.src = blobUrl;
    } catch (e) {
      reject(e);
    }
  });
}

// Phương án dự phòng: Tách lớp background và ma trận QR để vẽ trực tiếp bằng Canvas 2D Path
function fallbackDrawSvgToPngBlob(svgText, baseWidth = 540, baseHeight = 540) {
  return new Promise(async (resolve, reject) => {
    try {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(baseWidth * scale);
      canvas.height = Math.round(baseHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Không có Canvas 2D Context'));

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Trích xuất ảnh nền VietQR
      const bgMatch = svgText.match(/(?:href|xlink:href)=["'](data:image\/png;base64,[^"']+)["']/i);
      if (bgMatch) {
        const bgImg = new Image();
        await new Promise((res, rej) => {
          bgImg.onload = res;
          bgImg.onerror = rej;
          bgImg.src = bgMatch[1];
        });
        ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
      }

      // Trích xuất ma trận QR (thẻ g và path)
      const gMatch = svgText.match(/<g transform="translate\((\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\)\s+scale\((\d+(?:\.\d+)?)\)">/);
      const pathMatch = svgText.match(/<path fill="([^"]+)" d="([^"]+)"/);

      if (gMatch && pathMatch && typeof Path2D !== 'undefined') {
        const tx = parseFloat(gMatch[1]) * scale;
        const ty = parseFloat(gMatch[2]) * scale;
        const s = parseFloat(gMatch[3]) * scale;
        const color = pathMatch[1] || '#111111';
        const d = pathMatch[2];

        ctx.save();
        ctx.translate(tx, ty);
        ctx.scale(s, s);
        ctx.fillStyle = color;
        const p2d = new Path2D(d);
        ctx.fill(p2d);
        ctx.restore();
      }

      canvas.toBlob(blob => {
        if (blob && blob.size > 0) resolve(blob);
        else reject(new Error('Fallback Canvas toBlob thất bại'));
      }, 'image/png', 1.0);
    } catch (e) {
      reject(e);
    }
  });
}

async function getQrPngBlob(qrUrl) {
  const cached = _qrPngBlobCache.get(qrUrl);
  if (cached && cached instanceof Blob) return cached;
  if (cached && typeof cached.then === 'function') return await cached;
  return await prepareQrPngBlobCache(qrUrl);
}

// Sao chép ảnh QR trực tiếp vào Clipboard hệ điều hành (cho phép nhấn Ctrl + V dán ảnh ngay)
async function copyQrImageToClipboard(imgId = 'group-modal-qr-img') {
  const imgEl = document.getElementById(imgId);
  if (!imgEl || !imgEl.src) {
    showToast('Chưa có mã QR để sao chép!', 'error');
    return;
  }
  const qrUrl = imgEl.src;

  // Tìm tất cả các nút sao chép tương ứng trên giao diện để cập nhật phản hồi trực quan
  const btnGroupMain = document.getElementById('btn-copy-group-qr-img');
  const btnGroupFooter = document.getElementById('btn-copy-group-qr-img-footer');
  const btnPayModal = document.getElementById('btn-copy-pay-qr-img');
  const activeBtns = [btnGroupMain, btnGroupFooter, btnPayModal].filter(Boolean);

  const origTexts = new Map();
  activeBtns.forEach(b => {
    origTexts.set(b, b.innerHTML);
    b.disabled = true;
    b.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Đang chuẩn bị ảnh...</span>`;
  });
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

  const restoreButtons = () => {
    activeBtns.forEach(b => {
      b.disabled = false;
      if (origTexts.has(b)) b.innerHTML = origTexts.get(b);
    });
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  };

  const markButtonsSuccess = () => {
    activeBtns.forEach(b => {
      b.disabled = false;
      b.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-300"></i><span>✓ Đã chép ảnh QR!</span>`;
    });
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    setTimeout(restoreButtons, 3000);
  };

  if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') {
    restoreButtons();
    showToast('Trình duyệt hiện tại chưa hỗ trợ copy ảnh vào bộ nhớ tạm. Bạn vui lòng bấm nút "Tải ảnh về máy" hoặc nhấn giữ vào ảnh để chia sẻ!', 'warning', 6000);
    return;
  }

  try {
    let writePromise;
    const cached = _qrPngBlobCache.get(qrUrl);

    // TH 1: Đã có sẵn PNG Blob trong bộ nhớ đệm (99% trường hợp vì đã render ngầm khi mở modal)
    if (cached && cached instanceof Blob) {
      const item = new ClipboardItem({ 'image/png': cached });
      writePromise = navigator.clipboard.write([item]);
    } else {
      // TH 2: Bấm quá nhanh trong vài ms đầu, truyền Promise trực tiếp vào ClipboardItem để giữ User Activation Gesture
      const blobPromise = (cached && typeof cached.then === 'function') ? cached : prepareQrPngBlobCache(qrUrl);
      try {
        const item = new ClipboardItem({ 'image/png': blobPromise });
        writePromise = navigator.clipboard.write([item]);
      } catch (e) {
        // Trình duyệt cũ chưa hỗ trợ Promise trong ClipboardItem: đợi blob rồi ghi
        const resolvedBlob = await blobPromise;
        if (!resolvedBlob || resolvedBlob.size === 0) throw new Error('Không tạo được file ảnh PNG');
        const item = new ClipboardItem({ 'image/png': resolvedBlob });
        writePromise = navigator.clipboard.write([item]);
      }
    }

    await writePromise;
    markButtonsSuccess();
    showToast('🖼️ ĐÃ SAO CHÉP ẢNH QR VÀO BỘ NHỚ TẠM! Hãy mở Zalo / Messenger và nhấn Ctrl+V để dán trực tiếp ảnh.', 'success', 6000);
  } catch (err) {
    console.error('Lỗi sao chép ảnh QR vào clipboard:', err);
    restoreButtons();
    showToast('Không thể dán trực tiếp do hạn chế quyền của trình duyệt. Bạn hãy bấm chuột phải vào ảnh chọn "Sao chép hình ảnh" hoặc bấm "Tải ảnh về máy" để gửi phụ huynh!', 'warning', 7000);
  }
}

async function downloadQrImageById(imgId, filename = 'Ma_QR_Hoc_Phi.png') {
  const imgEl = document.getElementById(imgId);
  if (!imgEl || !imgEl.src) return;
  try {
    showToast('Đang tải ảnh mã QR chất lượng cao về máy...', 'info', 2000);
    const pngBlob = await getQrPngBlob(imgEl.src);
    const blobUrl = URL.createObjectURL(pngBlob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    showToast('Đã tải ảnh mã QR thành công!', 'success');
  } catch (e) {
    window.open(imgEl.src, '_blank');
  }
}

async function downloadGroupQrImage() {
  return downloadQrImageById('group-modal-qr-img', 'Ma_VietQR_Hoc_Phi_Gui_Nhom.png');
}

async function handleBulkApproveTransactions() {
  const pendingKeys = Array.from(selectedFinanceItemIds).filter(k => k.startsWith('REQ::'));
  if (pendingKeys.length === 0) {
    showToast('Không có yêu cầu chờ duyệt nào trong các mục đang chọn!', 'warning');
    return;
  }
  for (const key of pendingKeys) {
    const reqId = key.replace(/^REQ::/, '');
    await handleReviewPaymentRequest(reqId, 'Đã duyệt');
  }
  renderAdminTransactions();
}

function openBulkEditTransactionsModal() {
  const txIds = Array.from(selectedFinanceItemIds).filter(k => !k.startsWith('REQ::'));
  if (txIds.length === 0) {
    showToast('Vui lòng tích chọn ít nhất 1 phiếu Thu/Chi để chỉnh sửa!', 'warning');
    return;
  }
  if (txIds.length === 1) {
    editTransactionRecord(txIds[0]);
    return;
  }

  const countLabel = document.getElementById('bulk-edit-tx-count-label') || document.getElementById('bulk-edit-trans-count');
  if (countLabel) countLabel.textContent = txIds.length;
  const subLabel = document.getElementById('bulk-edit-trans-subtitle');
  if (subLabel) subLabel.textContent = `Đang chọn ${txIds.length} giao dịch (Chỉ cập nhật những trường bạn thay đổi)`;

  const typeEl = document.getElementById('bulk-tx-form-type') || document.getElementById('bulk-trans-type');
  const dateEl = document.getElementById('bulk-tx-form-date') || document.getElementById('bulk-trans-date');
  const catEl = document.getElementById('bulk-tx-form-category') || document.getElementById('bulk-trans-category');
  const amtEl = document.getElementById('bulk-tx-form-amount') || document.getElementById('bulk-trans-amount');
  const methodEl = document.getElementById('bulk-tx-form-method') || document.getElementById('bulk-trans-method');
  const descEl = document.getElementById('bulk-tx-form-desc') || document.getElementById('bulk-trans-desc');
  const exclEl = document.getElementById('bulk-trans-excluded');
  const tagEl = document.getElementById('bulk-trans-custom-tag');

  if (typeEl) typeEl.value = Array.from(typeEl.options || []).some(o => o.value === '__KEEP__') ? '__KEEP__' : '';
  if (dateEl) dateEl.value = '';
  if (catEl) catEl.value = Array.from(catEl.options || []).some(o => o.value === '__KEEP__') ? '__KEEP__' : '';
  if (amtEl) amtEl.value = '';
  if (methodEl) methodEl.value = Array.from(methodEl.options || []).some(o => o.value === '__KEEP__') ? '__KEEP__' : '';
  if (descEl) descEl.value = '';
  if (exclEl) exclEl.value = '__KEEP__';
  if (tagEl) tagEl.value = '';

  const modal = document.getElementById('bulk-edit-transaction-modal');
  if (modal) modal.classList.remove('hidden');
  lucide.createIcons();
}

function closeBulkEditTransactionsModal() {
  const modal = document.getElementById('bulk-edit-transaction-modal');
  if (modal) modal.classList.add('hidden');
}

async function saveBulkEditTransactionsForm(event) {
  event.preventDefault();
  const txIds = Array.from(selectedFinanceItemIds).filter(k => !k.startsWith('REQ::'));
  if (txIds.length === 0) {
    closeBulkEditTransactionsModal();
    return;
  }

  const rawType = (
    (document.getElementById('bulk-tx-form-type') || document.getElementById('bulk-trans-type'))?.value || ''
  ).trim();
  const newType = rawType === '__KEEP__' ? '' : rawType;
  const newDate = (
    (document.getElementById('bulk-tx-form-date') || document.getElementById('bulk-trans-date'))?.value || ''
  ).trim();
  const rawCategory = (
    (document.getElementById('bulk-tx-form-category') || document.getElementById('bulk-trans-category'))?.value || ''
  ).trim();
  const newCategory = rawCategory === '__KEEP__' ? '' : rawCategory;
  const rawAmt = (
    (document.getElementById('bulk-tx-form-amount') || document.getElementById('bulk-trans-amount'))?.value || ''
  ).trim();
  const rawMethod = (
    (document.getElementById('bulk-tx-form-method') || document.getElementById('bulk-trans-method'))?.value || ''
  ).trim();
  const newMethod = rawMethod === '__KEEP__' ? '' : rawMethod;
  const newDesc = (
    (document.getElementById('bulk-tx-form-desc') || document.getElementById('bulk-trans-desc'))?.value || ''
  ).trim();
  const rawExcludedMode = (document.getElementById('bulk-trans-excluded')?.value || '').trim();
  const newExcludedMode = rawExcludedMode === '__KEEP__' ? '' : rawExcludedMode;
  const newCustomTag = (document.getElementById('bulk-trans-custom-tag')?.value || '').trim();

  const hasNewAmt = rawAmt !== '';
  const parsedAmt = hasNewAmt ? fromShortMoney(rawAmt) : 0;

  let updatedCount = 0;
  (appState.transactions || []).forEach(tx => {
    if (!txIds.includes(tx.id)) return;
    const oldCopy = { ...tx };
    if (newType) tx.type = newType;
    if (newDate) tx.date = newDate;
    if (newCategory) tx.category = newCategory;
    if (hasNewAmt && parsedAmt >= 0) {
      tx.amount = parsedAmt;
      recordExactSmallAmount(appState, tx.id, '', parsedAmt);
    }
    if (newMethod) tx.method = newMethod;
    if (newDesc) tx.description = newDesc;
    if (newExcludedMode === 'EXCLUDE') {
      setTransactionExcludedInState(tx, true, newCustomTag || 'Không ghi nhận hệ thống', appState);
    } else if (newExcludedMode === 'INCLUDE') {
      setTransactionExcludedInState(tx, false, newCustomTag, appState);
    } else if (newCustomTag) {
      setTransactionExcludedInState(tx, isTransactionExcludedFromSystem(tx, appState), newCustomTag, appState);
    }
    recordEditedTransactionOverride(appState, oldCopy, tx);
    updatedCount++;
  });

  closeBulkEditTransactionsModal();
  saveStateToLocal();
  await triggerAutoSyncIfNeeded(`Đã cập nhật hàng loạt ${updatedCount} giao dịch thành công!`);
}

async function handleBulkDeleteTransactions() {
  const totalSelected = selectedFinanceItemIds.size;
  if (totalSelected === 0) return;

  const pendingKeys = Array.from(selectedFinanceItemIds).filter(k => k.startsWith('REQ::'));
  const txIds = Array.from(selectedFinanceItemIds).filter(k => !k.startsWith('REQ::'));

  if (
    !(await appConfirm(
      `Bạn có chắc chắn muốn xóa ${totalSelected} mục đã chọn (${txIds.length} phiếu thu/chi${
        pendingKeys.length > 0 ? ` và ${pendingKeys.length} yêu cầu chờ duyệt` : ''
      }) không?`,
      { title: 'Xóa giao dịch đã chọn', tone: 'rose', okText: 'Xóa ngay' }
    ))
  ) {
    return;
  }

  if (txIds.length > 0) {
    const idSet = new Set(txIds);
    const removedTxs = (appState.transactions || []).filter(t => t && idSet.has(t.id));
    if (
      !isSepayBalanceAutoByWebStats() &&
      appState.settings?.sepayBalance !== undefined &&
      appState.settings?.sepayBalance !== '' &&
      (Number(appState.settings.sepayBalance) !== 0 || Boolean(appState.settings.sepayBalanceManualAt))
    ) {
      let manualDelta = 0;
      removedTxs.forEach(tx => {
        if (
          !isTransactionExcludedFromSystem(tx, appState) &&
          isDraftBankTransaction(tx, appState) &&
          isDraftTxIncludedInMain(tx, appState)
        ) {
          manualDelta -= (tx.type === 'Chi' ? -1 : 1) * (normalizeStoredVnd(tx.amount) || 0);
        }
      });
      if (manualDelta !== 0) {
        appState.settings.sepayBalance = String((Number(appState.settings.sepayBalance) || 0) + manualDelta);
      }
    }
    markTransactionsAsDeletedInState(removedTxs.length > 0 ? removedTxs : txIds, appState);
    appState.transactions = (appState.transactions || []).filter(t => !idSet.has(t.id));
  }
  if (pendingKeys.length > 0) {
    const reqIds = pendingKeys.map(k => k.replace(/^REQ::/, ''));
    const reqSet = new Set(reqIds);
    const removedReqs = (appState.paymentRequests || []).filter(r => r && reqSet.has(r.id));
    blockPaymentRequestIdsFromSync(removedReqs.length > 0 ? removedReqs : reqIds, appState);
    addDismissedNotifIds([...reqIds, ...pendingKeys], appState);
    appState.paymentRequests = (appState.paymentRequests || []).filter(r => !reqSet.has(r.id));
  }

  selectedFinanceItemIds.clear();
  saveStateToLocal();
  await triggerAutoSyncIfNeeded(`Đã xóa ${totalSelected} mục khỏi Sổ Thu - Chi & Giao dịch!`);
}

function ensureSelectHasOption(selectEl, value) {
  if (!selectEl || !value) return;
  const exists = Array.from(selectEl.options || []).some(opt => opt.value === value);
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    selectEl.appendChild(opt);
  }
}

function editTransactionRecord(transId) {
  const tx = (appState.transactions || []).find(t => t.id === transId);
  if (!tx) {
    showToast('Không tìm thấy giao dịch cần chỉnh sửa!', 'error');
    return;
  }
  openTransactionModal(tx.type || 'Thu', tx.id);
}

function openTransactionModal(defaultType = 'Thu', editTransId = '') {
  const existingTx = editTransId ? (appState.transactions || []).find(t => t.id === editTransId) : null;
  const type = existingTx ? (existingTx.type || 'Thu') : defaultType;

  const idInput = document.getElementById('trans-form-id');
  const typeSelect = document.getElementById('trans-form-type');
  const dateInput = document.getElementById('trans-form-date');
  const catSelect = document.getElementById('trans-form-category');
  const amountInput = document.getElementById('trans-form-amount');
  const descInput = document.getElementById('trans-form-desc');
  const studentCodeInput = document.getElementById('trans-form-student-code');
  const methodSelect = document.getElementById('trans-form-method');
  const excludedCb = document.getElementById('trans-form-excluded');
  const customTagInput = document.getElementById('trans-form-custom-tag');
  const submitBtn = document.getElementById('trans-modal-submit-btn');

  if (existingTx) {
    if (idInput) idInput.value = existingTx.id;
    if (typeSelect) typeSelect.value = type;
    if (dateInput) dateInput.value = existingTx.date || new Date().toISOString().slice(0, 10);
    if (catSelect) {
      ensureSelectHasOption(catSelect, existingTx.category);
      catSelect.value = existingTx.category || (type === 'Thu' ? 'Thu học phí' : 'Khác');
    }
    if (amountInput) amountInput.value = toShortMoney(existingTx.amount || 0);
    if (descInput) descInput.value = existingTx.description || '';
    if (studentCodeInput) studentCodeInput.value = existingTx.studentCode || '';
    if (methodSelect) {
      const mVal = existingTx.method || 'Chuyển khoản';
      ensureSelectHasOption(methodSelect, mVal);
      methodSelect.value = mVal;
    }
    if (excludedCb) excludedCb.checked = isTransactionExcludedFromSystem(existingTx);
    if (customTagInput) customTagInput.value = getTransactionTagLabel(existingTx);
    if (submitBtn) submitBtn.textContent = 'Lưu Thay Đổi';
  } else {
    if (idInput) idInput.value = '';
    if (typeSelect) typeSelect.value = type;
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
    if (catSelect) {
      catSelect.value = type === 'Thu' ? 'Thu học phí' : 'Chi thuê phòng / điện nước';
    }
    if (amountInput) amountInput.value = '';
    if (descInput) descInput.value = '';
    if (studentCodeInput) studentCodeInput.value = '';
    if (methodSelect) methodSelect.value = 'Chuyển khoản';
    if (excludedCb) excludedCb.checked = false;
    if (customTagInput) customTagInput.value = '';
    if (submitBtn) submitBtn.textContent = 'Lưu Giao Dịch';
  }

  updateTransactionModalTheme(type, Boolean(existingTx), existingTx ? existingTx.id : '');
  document.getElementById('transaction-modal').classList.remove('hidden');
  lucide.createIcons();
}

function updateTransactionModalTheme(type, isEditing = false, txId = '') {
  const header = document.getElementById('trans-modal-header');
  const title = document.getElementById('trans-modal-title');
  const subtitle = document.getElementById('trans-modal-subtitle');
  const editCurrentId = txId || (document.getElementById('trans-form-id')?.value || '').trim();
  const editingMode = isEditing || Boolean(editCurrentId);

  if (type === 'Thu') {
    header.className = 'px-6 py-4 bg-emerald-600 text-white flex items-center justify-between';
    title.textContent = editingMode ? `Chỉnh Sửa Phiếu Thu (${editCurrentId})` : 'Ghi Phiếu Thu Mới (+)';
  } else {
    header.className = 'px-6 py-4 bg-rose-600 text-white flex items-center justify-between';
    title.textContent = editingMode ? `Chỉnh Sửa Phiếu Chi (${editCurrentId})` : 'Ghi Phiếu Chi Mới (-)';
  }
  if (subtitle) {
    subtitle.textContent = editingMode
      ? 'Quản lý có toàn quyền sửa đổi ngày, loại, danh mục, số tiền, nội dung, phương thức và gắn tag Không ghi nhận'
      : 'Nhập thông tin khoản thu/chi để cập nhật vào Sổ Quỹ & Google Sheets';
  }
}

function closeTransactionModal() {
  document.getElementById('transaction-modal').classList.add('hidden');
}

function saveTransactionForm(event) {
  event.preventDefault();
  const editId = (document.getElementById('trans-form-id')?.value || '').trim();
  const type = document.getElementById('trans-form-type').value || 'Thu';
  const date = document.getElementById('trans-form-date').value || new Date().toISOString().slice(0, 10);
  const category = document.getElementById('trans-form-category').value || (type === 'Thu' ? 'Thu học phí' : 'Khác');
  const amount = fromShortMoney(document.getElementById('trans-form-amount').value);
  const description = document.getElementById('trans-form-desc').value.trim() || category;
  const studentCode = document.getElementById('trans-form-student-code').value.trim().toUpperCase();
  const method = document.getElementById('trans-form-method').value || 'Chuyển khoản';
  const isExcluded = Boolean(document.getElementById('trans-form-excluded')?.checked);
  const customTag = (document.getElementById('trans-form-custom-tag')?.value || '').trim();

  if (editId) {
    const existingIdx = (appState.transactions || []).findIndex(t => t.id === editId);
    if (existingIdx !== -1) {
      const oldTx = appState.transactions[existingIdx];
      recordExactSmallAmount(appState, editId, '', amount);
      const updatedTx = {
        ...oldTx,
        date,
        type,
        category,
        amount,
        description,
        studentCode,
        method,
        isExcluded,
        customTag: isExcluded ? (customTag || 'Không ghi nhận hệ thống') : customTag
      };
      appState.transactions[existingIdx] = updatedTx;
      setTransactionExcludedInState(updatedTx, isExcluded, customTag, appState);
      recordEditedTransactionOverride(appState, oldTx, updatedTx);
      closeTransactionModal();
      saveStateToLocal();
      triggerAutoSyncIfNeeded(
        `Đã cập nhật thông tin phiếu ${type} (${formatCompactTxId(editId)}: ${formatCurrency(amount)}${
          isExcluded ? ' • Không ghi nhận hệ thống' : ''
        }) thành công!`
      );
      return;
    }
  }

  const newTxId = 'GD_' + Date.now();
  recordExactSmallAmount(appState, newTxId, '', amount);
  const newTx = {
    id: newTxId,
    date,
    type,
    category,
    amount,
    description,
    studentCode,
    method,
    receiptUrl: '',
    createdBy: 'Quản lý',
    isExcluded,
    customTag: isExcluded ? (customTag || 'Không ghi nhận hệ thống') : customTag
  };
  appState.transactions.unshift(newTx);
  setTransactionExcludedInState(newTx, isExcluded, customTag, appState);

  closeTransactionModal();
  saveStateToLocal();
  triggerAutoSyncIfNeeded(
    `Đã ghi phiếu ${type} (${formatCurrency(amount)}${isExcluded ? ' • Đã gắn tag Không ghi nhận hệ thống' : ''}) thành công!`
  );
}

async function toggleTransactionExcludedFromSystem(transId, customTagLabel = '') {
  const tx = (appState.transactions || []).find(t => t && t.id === transId);
  if (!tx) return;
  const oldTx = { ...tx };
  const currentlyExcluded = isTransactionExcludedFromSystem(tx, appState);
  const nextExcluded = !currentlyExcluded;
  const existingTag = getTransactionTagLabel(tx, appState);
  const finalTag = nextExcluded
    ? String(customTagLabel || existingTag || 'Không ghi nhận hệ thống').trim()
    : '';

  setTransactionExcludedInState(tx, nextExcluded, finalTag, appState);
  recordEditedTransactionOverride(appState, oldTx, tx);

  saveStateToLocal();
  if (_activeDetailTxKey === transId) {
    openTransactionDetailModal(transId);
  }
  await triggerAutoSyncIfNeeded(
    nextExcluded
      ? `Đã gắn tag [${finalTag}] — Giao dịch ${formatCurrency(tx.amount)} sẽ KHÔNG ghi nhận vào hệ thống!`
      : `Đã gỡ tag Không ghi nhận — Giao dịch ${formatCurrency(tx.amount)} đã được tính lại vào hệ thống!`
  );
}

async function saveTransactionTagFromDetailModal(transId, forceExcluded = true, presetTag = '') {
  const tx = (appState.transactions || []).find(t => t && t.id === transId);
  if (!tx) return;
  const oldTx = { ...tx };
  const inputEl = document.getElementById(`tx-detail-tag-input-${transId}`);
  const rawTag = String(presetTag || (inputEl ? inputEl.value : '') || 'Không ghi nhận hệ thống').trim();
  if (inputEl && presetTag) inputEl.value = presetTag;

  setTransactionExcludedInState(tx, Boolean(forceExcluded), rawTag, appState);
  recordEditedTransactionOverride(appState, oldTx, tx);

  saveStateToLocal();
  if (_activeDetailTxKey === transId) {
    openTransactionDetailModal(transId);
  }
  await triggerAutoSyncIfNeeded(
    `Đã gắn tag [${rawTag}] và đánh dấu KHÔNG ghi nhận vào hệ thống cho giao dịch ${formatCurrency(tx.amount)}!`
  );
}

async function handleBulkToggleExcludeTransactions(shouldExclude = true) {
  const txIds = Array.from(selectedFinanceItemIds).filter(k => !k.startsWith('REQ::'));
  if (txIds.length === 0) {
    showToast('Vui lòng tích chọn ít nhất 1 giao dịch Thu/Chi!', 'warning');
    return;
  }
  let count = 0;
  (appState.transactions || []).forEach(tx => {
    if (!tx || !txIds.includes(tx.id)) return;
    const oldCopy = { ...tx };
    const curTag = getTransactionTagLabel(tx, appState);
    setTransactionExcludedInState(
      tx,
      Boolean(shouldExclude),
      shouldExclude ? (curTag || 'Không ghi nhận hệ thống') : '',
      appState
    );
    recordEditedTransactionOverride(appState, oldCopy, tx);
    count++;
  });
  saveStateToLocal();
  await triggerAutoSyncIfNeeded(
    shouldExclude
      ? `Đã gắn tag "Không ghi nhận vào hệ thống" cho ${count} giao dịch đã chọn!`
      : `Đã gỡ tag và ghi nhận lại ${count} giao dịch vào hệ thống!`
  );
}

async function toggleDraftTransactionMainAccount(transId) {
  const tx = (appState.transactions || []).find(t => t && t.id === transId);
  if (!tx) return;
  if (!appState.settings) appState.settings = {};
  const map = { ...getDraftTxIncludeMap(appState) };
  const nextIncluded = !(map[transId] === true);
  map[transId] = nextIncluded;
  appState.settings.draftTxIncludeJson = JSON.stringify(map);
  markDraftBankTx(appState, transId);

  if (
    !isSepayBalanceAutoByWebStats() &&
    appState.settings.sepayBalance !== undefined &&
    appState.settings.sepayBalance !== '' &&
    (Number(appState.settings.sepayBalance) !== 0 || Boolean(appState.settings.sepayBalanceManualAt))
  ) {
    const amt = normalizeStoredVnd(tx.amount) || 0;
    const sign = tx.type === 'Chi' ? -1 : 1;
    appState.settings.sepayBalance = String(
      (Number(appState.settings.sepayBalance) || 0) + (nextIncluded ? 1 : -1) * sign * amt
    );
  }

  saveStateToLocal();
  if (_activeDetailTxKey === transId) {
    openTransactionDetailModal(transId);
  }
  await triggerAutoSyncIfNeeded(
    nextIncluded
      ? `Đã BẬT cộng giao dịch STK Nháp (${formatCurrency(tx.amount)}) vào Tài khoản chính!`
      : `Đã TẮT cộng giao dịch STK Nháp (${formatCurrency(tx.amount)}) khỏi Tài khoản chính.`
  );
}

async function deleteTransactionRecord(transId) {
  if (
    !(await appConfirm('Bạn có chắc muốn xóa giao dịch Thu/Chi này khỏi sổ quỹ?', {
      title: 'Xóa phiếu Thu / Chi',
      tone: 'rose',
      okText: 'Xóa giao dịch'
    }))
  ) {
    return;
  }
  const targetTx = (appState.transactions || []).find(t => t && t.id === transId);
  if (
    targetTx &&
    !isTransactionExcludedFromSystem(targetTx, appState) &&
    isDraftBankTransaction(targetTx, appState) &&
    isDraftTxIncludedInMain(targetTx, appState) &&
    !isSepayBalanceAutoByWebStats() &&
    appState.settings?.sepayBalance !== undefined &&
    appState.settings?.sepayBalance !== '' &&
    (Number(appState.settings.sepayBalance) !== 0 || Boolean(appState.settings.sepayBalanceManualAt))
  ) {
    const amt = normalizeStoredVnd(targetTx.amount) || 0;
    const sign = targetTx.type === 'Chi' ? -1 : 1;
    appState.settings.sepayBalance = String((Number(appState.settings.sepayBalance) || 0) - sign * amt);
  }
  markTransactionsAsDeletedInState([targetTx || transId], appState);
  selectedFinanceItemIds.delete(transId);
  appState.transactions = appState.transactions.filter(t => t.id !== transId);
  saveStateToLocal();
  triggerAutoSyncIfNeeded('Đã xóa vĩnh viễn giao dịch khỏi Sổ Thu - Chi.');
}

// ============================================================================
// TAB 4: ĐỒNG BỘ 2 CHIỀU GOOGLE SHEETS & CÀI ĐẶT VIETQR / MÃ QR RIÊNG
// ============================================================================
function toggleSettingPasswordVisibility() {
  const passInput = document.getElementById('setting-admin-pass');
  const iconEl = document.getElementById('icon-toggle-setting-pass');
  const labelEl = document.getElementById('label-toggle-setting-pass');
  if (!passInput) return;

  const isCurrentlyHidden = passInput.type === 'password';
  passInput.type = isCurrentlyHidden ? 'text' : 'password';
  if (iconEl) iconEl.setAttribute('data-lucide', isCurrentlyHidden ? 'eye-off' : 'eye');
  if (labelEl) labelEl.textContent = isCurrentlyHidden ? 'Ẩn' : 'Hiện';
  lucide.createIcons();
}

function populateSettingsForm() {
  const stg = appState.settings || {};
  document.getElementById('setting-gas-url').value = isSandboxDraftMode
    ? 'https://script.google.com/macros/s/DEMO_SANDBOX_MODE_ONLY/exec'
    : getGasUrl();
  document.getElementById('setting-auto-sync').checked = isAutoSyncEnabled();

  document.getElementById('setting-center-name').value =
    stg.centerName || (isSandboxDraftMode ? 'TRUNG TÂM GIÁO DỤC ALPHA (BẢN NHÁP)' : 'LỚP TOÁN ANH CHÍ');
  document.getElementById('setting-default-period').value = stg.defaultPeriod || 'Tháng 10-11/2026';
  document.getElementById('setting-bank-bin').value = stg.bankBin || 'BIDV';
  const curSettingAcc = stg.bankAccountNo || (isSandboxDraftMode ? '5801434567' : '8601774789');
  document.getElementById('setting-bank-acc').value = curSettingAcc;
  const vaSettingInput = document.getElementById('setting-sepay-va-acc');
  if (vaSettingInput) vaSettingInput.value = getSepayVaMap(stg)[curSettingAcc] || '';
  document.getElementById('setting-bank-owner').value =
    stg.bankAccountName || 'HKD TRUNG TAM HUYNH THANH CHI';
  document.getElementById('setting-teacher-phone').value = stg.teacherPhone || (isSandboxDraftMode ? '0901234567' : '0905957716');

  if (typeof renderReceivingBankAccountSelectors === 'function') {
    renderReceivingBankAccountSelectors();
  updateAutoApprovePaymentUI();
  }

  // Tách biệt hoàn toàn mật khẩu Quản lý chính và mật khẩu Bản Nháp
  const passInput = document.getElementById('setting-admin-pass');
  const passLabel = document.getElementById('setting-admin-pass-label');
  const passBadge = document.getElementById('setting-admin-pass-badge');
  const passHint = document.getElementById('setting-admin-pass-hint');
  const passBox = document.getElementById('setting-admin-pass-box');
  const iconToggle = document.getElementById('icon-toggle-setting-pass');
  const labelToggle = document.getElementById('label-toggle-setting-pass');

  if (passInput) {
    // Luôn đặt mặc định ở trạng thái ẩn mật khẩu (••••••) khi mở Cài đặt
    passInput.type = 'password';
    if (iconToggle) iconToggle.setAttribute('data-lucide', 'eye');
    if (labelToggle) labelToggle.textContent = 'Hiện';

    if (isSandboxDraftMode) {
      passInput.value = stg.sandboxAdminPassword || 'DEMO-NHAP-2026';
    } else {
      passInput.value = stg.adminPassword || '336699';
    }
  }

  if (isSandboxDraftMode) {
    if (passBox) passBox.className = 'p-3 rounded-xl border border-orange-200 bg-orange-50/50 space-y-1.5';
    if (passLabel) passLabel.textContent = 'Mật khẩu Quản lý Bản Nháp (Độc lập với Quản lý chính)';
    if (passBadge) {
      passBadge.textContent = 'Mật khẩu Nháp riêng biệt';
      passBadge.className = 'px-2 py-0.5 rounded-full bg-[#FFF3EE] text-[#FF4B16] border border-[#FFD9CC] text-xs font-extrabold';
    }
    if (passHint) {
      passHint.textContent =
        'Đang ở Tab Nháp: Mật khẩu của Quản lý chính đã được ẩn và tách biệt 100%. Mật khẩu mẫu ở trên (DEMO-NHAP-2026) chỉ áp dụng trong phiên dùng thử.';
      passHint.className = 'text-[11px] text-[#FF4B16] font-semibold leading-snug';
    }
  } else {
    if (passBox) passBox.className = 'p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5';
    if (passLabel) passLabel.textContent = 'Mật khẩu Quản lý Chính trên Web App';
    if (passBadge) {
      passBadge.textContent = 'Bảo mật riêng Quản lý chính';
      passBadge.className = 'px-2 py-0.5 rounded-full bg-slate-100 text-slate-900 border border-slate-200 text-xs font-extrabold';
    }
    if (passHint) {
      passHint.textContent =
        'Mật khẩu Quản lý chính được tách biệt hoàn toàn và không bao giờ hiển thị bên Tab Nháp dùng thử.';
      passHint.className = 'text-[11px] text-slate-500 leading-snug';
    }
  }

  // Cập nhật các thông tin hướng dẫn Sheet / Ngân hàng trong tab Cài đặt theo đúng chế độ Nháp hoặc Thật
  const sheetGuideTitle = document.getElementById('setting-sheet-guide-title');
  const sheetIdCode = document.getElementById('setting-sheet-id-code');
  const autobankDesc = document.getElementById('setting-autobank-desc');
  const autobankGuideTitle = document.getElementById('setting-autobank-guide-title');
  const simContent = document.getElementById('sim-bank-content');
  const simAmount = document.getElementById('sim-bank-amount');
  const ghBox = document.getElementById('setting-github-deploy-box');

  if (isSandboxDraftMode) {
    if (sheetGuideTitle) sheetGuideTitle.textContent = 'Chế độ Tab Nháp: Không sử dụng Google Sheet của Quản lý chính';
    if (sheetIdCode) sheetIdCode.textContent = 'DEMO_SHEET_SANDBOX';
    if (autobankDesc) {
      autobankDesc.innerHTML =
        'Tự động tích <code class="font-bold">Đã hoàn thành</code> &amp; ghi Sổ Thu Chi ngay khi chuyển khoản vào STK Nháp BIDV (5801434567).';
    }
    if (autobankGuideTitle) {
      autobankGuideTitle.textContent = 'Cách kích hoạt tự động 100% cho STK Nháp BIDV (5801434567) trên SePay:';
    }
    if (simContent) simContent.value = 'HP NV002 TRAN NGOC BAO CHAU';
    if (simAmount) simAmount.value = '800000';
    if (ghBox) ghBox.classList.add('hidden');
  } else {
    const curAcc = stg.bankAccountNo || '8601774789';
    const curBin = stg.bankBin || 'BIDV';
    if (sheetGuideTitle) sheetGuideTitle.textContent = 'File Google Sheet của bạn đã được gắn sẵn ID';
    if (sheetIdCode) sheetIdCode.textContent = '1dObYu...lsvq0';
    if (autobankDesc) {
      autobankDesc.innerHTML =
        `Tự động tích <code class="font-bold">Đã hoàn thành</code> &amp; ghi Sổ Thu Chi ngay khi học sinh/phụ huynh chuyển khoản vào STK ${escapeHtml(curBin)} (${escapeHtml(curAcc)}).`;
    }
    if (autobankGuideTitle) {
      autobankGuideTitle.textContent = `Cách kích hoạt tự động 100% cho STK ${curBin} (${curAcc}) miễn phí:`;
    }
    if (simContent) simContent.value = 'HP HS001 QUOC VIET';
    if (simAmount) simAmount.value = '600000';
    if (ghBox) ghBox.classList.remove('hidden');
  }

  const webhookDisplay = document.getElementById('bank-webhook-url-display');
  if (webhookDisplay) {
    webhookDisplay.textContent = isSandboxDraftMode
      ? 'https://script.google.com/macros/s/DEMO_SANDBOX_MODE_ONLY/exec'
      : getGasUrl();
  }

  updateQrPreviewInSettings();
}

function updateQrPreviewInSettings() {
  const bin = document.getElementById('setting-bank-bin')?.value || 'BIDV';
  const acc = document.getElementById('setting-bank-acc')?.value || '8601774789';
  const typedVa = (document.getElementById('setting-sepay-va-acc')?.value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const qrAcc = typedVa || getEffectiveQrAccountNo(acc);
  const displayAcc = qrAcc !== acc ? `${qrAcc} (TK gốc: ${acc})` : acc;
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
      modeBadge.className = 'inline-block px-2 py-0.5 rounded bg-emerald-600 text-white font-semibold text-xs';
    }
    if (qrText) qrText.textContent = `${bin} - ${displayAcc} (${owner})`;
    if (subText) subText.textContent = 'Hệ thống đang hiển thị trực tiếp ảnh mã QR do bạn tải lên cho Phụ huynh quét.';
    if (clearBtn) clearBtn.classList.remove('hidden');
  } else {
    if (qrImg) qrImg.src = `https://img.vietqr.io/image/${encodeURIComponent(bin.trim())}-${encodeURIComponent(qrAcc.trim())}-compact2.png?addInfo=${encodeURIComponent('HP T10 HS001')}&accountName=${encodeURIComponent(owner.trim())}`;
    if (modeBadge) {
      modeBadge.textContent = 'XEM TRƯỚC MÃ VIETQR TỰ ĐỘNG';
      modeBadge.className = 'inline-block px-2 py-0.5 rounded bg-blue-600 text-white font-semibold text-xs';
    }
    if (qrText) qrText.textContent = `${bin} - ${displayAcc} (${owner})`;
    if (subText) subText.textContent = 'Khi phụ huynh tra cứu, mã QR sẽ tự động gắn đúng mã học sinh (và mã VA SePay nếu có).';
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
  if (isSandboxDraftMode) {
    showToast(
      'Đang ở Tab Nháp (Dùng Thử): Kết nối Google Sheet tại đây chỉ để minh họa, không làm thay đổi cấu hình Google Sheet thật của Quản lý chính!',
      'info'
    );
    return;
  }

  const url = document.getElementById('setting-gas-url').value.trim();
  const autoSync = document.getElementById('setting-auto-sync').checked;

  localStorage.setItem(STORAGE_KEYS.GAS_URL, url);
  localStorage.setItem(STORAGE_KEYS.AUTO_SYNC, String(autoSync));
  updateSyncStatusBanner();

  if (url) {
    showToast('Đã lưu link Google Sheet! Đang đẩy dữ liệu từ Web lên Sheet...', 'info');
    syncAllToGoogleSheet(true);
  } else {
    showToast('Đã chuyển về chế độ lưu trữ Local trên trình duyệt.', 'info');
  }
}

function saveGeneralSettings(event) {
  event.preventDefault();
  const passValue = document.getElementById('setting-admin-pass').value.trim();
  const savedAcc = document.getElementById('setting-bank-acc').value.trim();
  const typedVa = (document.getElementById('setting-sepay-va-acc')?.value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const nextVaMap = getSepayVaMap(appState.settings);
  if (typedVa) nextVaMap[savedAcc] = typedVa;
  else delete nextVaMap[savedAcc];

  if (isSandboxDraftMode) {
    appState.settings = {
      ...appState.settings,
      isSandboxData: true,
      centerName: document.getElementById('setting-center-name').value.trim(),
      defaultPeriod: document.getElementById('setting-default-period').value.trim(),
      bankBin: document.getElementById('setting-bank-bin').value,
      bankAccountNo: savedAcc,
      sepayVaByAccJson: JSON.stringify(nextVaMap),
      bankAccountName: document.getElementById('setting-bank-owner').value.trim().toUpperCase(),
      teacherPhone: document.getElementById('setting-teacher-phone').value.trim(),
      sandboxAdminPassword: passValue || 'DEMO-NHAP-2026'
    };
    delete appState.settings.adminPassword;
    saveStateToLocal();
    showToast('Đã lưu cài đặt trong Tab Nháp (Hoàn toàn độc lập với Quản lý chính)!', 'success');
    return;
  }

  appState.settings = {
    ...appState.settings,
    centerName: document.getElementById('setting-center-name').value.trim(),
    defaultPeriod: document.getElementById('setting-default-period').value.trim(),
    bankBin: document.getElementById('setting-bank-bin').value,
    bankAccountNo: savedAcc,
    sepayVaByAccJson: JSON.stringify(nextVaMap),
    bankAccountName: document.getElementById('setting-bank-owner').value.trim().toUpperCase(),
    teacherPhone: document.getElementById('setting-teacher-phone').value.trim(),
    adminPassword: passValue || appState.settings.adminPassword || '336699'
  };

  saveStateToLocal();
  triggerAutoSyncIfNeeded('Đã lưu cài đặt Ngân hàng VietQR & Lớp học!');
}

function updateSyncStatusBanner(lastSyncTimeStr = '') {
  const dot = document.getElementById('sync-status-dot');
  const text = document.getElementById('sync-status-text');
  const quickBtn = document.getElementById('btn-quick-sync');

  if (isSandboxDraftMode) {
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-[#FF4B16] inline-block shrink-0';
    if (text) text.textContent = 'Đang ở Tab Nháp (Dữ liệu mẫu độc lập)';
    if (quickBtn) {
      quickBtn.classList.add('hidden');
      quickBtn.style.display = 'none';
    }
    return;
  }

  const url = getGasUrl();
  if (url) {
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0';
    if (text) {
      text.textContent = lastSyncTimeStr
        ? `Đã đẩy lên Google Sheet (${lastSyncTimeStr})`
        : 'Đã kết nối Google Sheet (Web → Sheet)';
    }
    if (quickBtn) {
      quickBtn.classList.remove('hidden');
      quickBtn.style.display = '';
    }
  } else {
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-500 inline-block shrink-0';
    if (text) text.textContent = 'Chế độ Local Demo (Vào Quản lý -> Cài đặt để gắn Google Sheet)';
    if (quickBtn) {
      quickBtn.classList.add('hidden');
      quickBtn.style.display = 'none';
    }
  }
}

// Chế độ 1 chiều tuyệt đối (Web -> Google Sheet): Chỉ đẩy dữ liệu từ Web lên Google Sheet, tuyệt đối không kéo dữ liệu từ Google Sheet về Web
async function syncSepayTransactionsToWeb(showUserToast = true) {
  await syncAllToGoogleSheet(showUserToast);
}

async function syncFromGoogleSheet(showUserToast = true) {
  await syncAllToGoogleSheet(showUserToast);
}

// Đẩy toàn bộ dữ liệu từ Web App lên Google Sheet (Push)
async function syncAllToGoogleSheet(showUserToast = true) {
  if (isSandboxDraftMode) {
    if (showUserToast) {
      showToast(
        'Đang ở Tab Nháp (Dùng Thử): Đã lưu dữ liệu nháp trên trình duyệt! (Không ghi đè lên Google Sheet thật của bạn)',
        'success'
      );
    }
    return;
  }

  const gasUrl = getGasUrl();
  if (!gasUrl) {
    if (showUserToast) {
      showToast('Vui lòng nhập URL Google Apps Script trong mục Cài đặt trước!', 'warning');
      if (currentMode === 'admin') switchAdminTab('settings');
    }
    return;
  }

  inFlightSheetPushCount++;
  const pushStartedAtMs = lastLocalMutationAtMs;
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
      if (lastLocalMutationAtMs === pushStartedAtMs) {
        try {
          localStorage.removeItem(STORAGE_KEYS.DIRTY_SYNC);
        } catch (e) {}
      }
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
  } finally {
    inFlightSheetPushCount = Math.max(0, inFlightSheetPushCount - 1);
  }
}

async function triggerAutoSyncIfNeeded(toastMessage) {
  if (toastMessage && actionUndoStack.length > 0) {
    const topItem = actionUndoStack[actionUndoStack.length - 1];
    if (topItem && Date.now() - (topItem.createdAtMs || 0) < 1500) {
      topItem.desc = String(toastMessage).replace(/^[\s]+/, '').replace(/!$/, '');
      saveUndoRedoHistoryToLocal();
      updateUndoRedoButtonsUI();
    }
  }
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
      const mm = String(d.getMonth() + 1).padStart(2, '0'); /* taste-skill-ignore */
      const yyyy = d.getFullYear();
      return `Tháng ${mm}/${yyyy}`;
    }
  }
  return s;
}

function parseSepayRawVnd(raw) {
  if (typeof raw === 'number') return isFinite(raw) ? Math.round(Math.abs(raw)) : 0;
  let s = String(raw ?? '').trim().replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  s = s.replace(/[.,]\d{1,2}$/, '');
  const digits = s.replace(/[^0-9]/g, '');
  return digits ? Number(digits) || 0 : 0;
}

function getProcessedSepayTxIdsSet(stateObj = appState) {
  const target = stateObj || appState;
  const set = new Set();
  try {
    if (target?.settings?.processedSepayTxIdsJson) {
      const arr = JSON.parse(target.settings.processedSepayTxIdsJson);
      if (Array.isArray(arr)) {
        arr.forEach(k => {
          if (k) set.add(String(k).trim());
        });
      }
    }
  } catch (e) {}
  (target?.transactions || []).forEach(t => {
    const tid = String(t?.id || '').trim();
    if (tid) {
      set.add(tid);
      set.add(tid.replace(/^GD_SEPAY_/, '').replace(/^GD_/, ''));
    }
  });
  return set;
}

function markSepayTxIdsProcessed(stateObj = appState, extraKeys = []) {
  const target = stateObj || appState;
  if (!target) return;
  if (!target.settings) target.settings = {};
  const set = getProcessedSepayTxIdsSet(target);
  (Array.isArray(extraKeys) ? extraKeys : [extraKeys]).forEach(k => {
    const clean = String(k || '').trim();
    if (clean) {
      set.add(clean);
      set.add(clean.replace(/^GD_SEPAY_/, '').replace(/^GD_/, ''));
    }
  });
  target.settings.processedSepayTxIdsJson = JSON.stringify(Array.from(set).slice(-800));
}

function isTxDateOlderThanAction(txDateStr, actionDateStr) {
  if (!txDateStr || !actionDateStr) return false;
  const norm = s => {
    const str = String(s || '').trim();
    const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
    if (iso) {
      return `${iso[1]}-${iso[2]}-${iso[3]} ${iso[4] || '00'}:${iso[5] || '00'}`;
    }
    const vn = str.match(/(?:(\d{2}):(\d{2})\s+)?(\d{2})\/(\d{2})\/(\d{4})/);
    if (vn) {
      return `${vn[5]}-${vn[4]}-${vn[3]} ${vn[1] || '00'}:${vn[2] || '00'}`;
    }
    return '';
  };
  const a = norm(txDateStr);
  const b = norm(actionDateStr);
  if (!a || !b) return false;
  return a < b;
}

// Tự động đọc & đối soát giao dịch thật từ tab "Tích hợp Google Sheets" của SePay (trong rawClassSheets) mà không bị lỗi 302 Redirect
function reconcileSepaySheetTransactions(state, rawClassSheets) {
  if (!state || !Array.isArray(rawClassSheets)) return state;
  if (!state.settings) state.settings = {};
  delete state.settings._sepaySheetConnected;

  const findColIdx = (headers, candidates) =>
    headers.findIndex(h => candidates.includes(h));

  let sepaySheetFound = '';
  let reconciledAny = false;
  const nowStr = getCurrentDateTimeString();
  const todayDate = new Date().toISOString().slice(0, 10);
  const autoApproveOn =
    state.settings.autoApproveBankTransfer === undefined ||
    state.settings.autoApproveBankTransfer === '' ||
    String(state.settings.autoApproveBankTransfer) !== 'false';

  if (!Array.isArray(state.transactions)) state.transactions = [];
  if (!Array.isArray(state.paymentRequests)) state.paymentRequests = [];
  if (!Array.isArray(state.students)) state.students = [];

  const processedSepaySet = getProcessedSepayTxIdsSet(state);
  let processedSetMutated = false;
  let scheduleMapForCutoff = {};
  try {
    if (state.settings.classSchedulesJson) {
      scheduleMapForCutoff = JSON.parse(state.settings.classSchedulesJson) || {};
    }
  } catch (e) {}

  for (const sheetObj of rawClassSheets) {
    const rows = Array.isArray(sheetObj?.values) ? sheetObj.values : [];
    if (rows.length === 0 || !Array.isArray(rows[0])) continue;
    const normHeaders = rows[0].map(c =>
      removeVietnameseTones(String(c || '').toLowerCase()).replace(/[^a-z0-9]/g, '')
    );

    const idIdx = findColIdx(normHeaders, ['id', 'magd', 'magiaodich', 'idgiaodich']);
    const gatewayIdx = findColIdx(normHeaders, ['gateway', 'nganhang', 'bank']);
    const dateIdx = findColIdx(normHeaders, ['transactiondate', 'ngaygiaodich', 'thoigian', 'ngay', 'date']);
    const accIdx = findColIdx(normHeaders, ['accountnumber', 'sotaikhoan', 'stk', 'taikhoan']);
    const subAccIdx = findColIdx(normHeaders, ['subaccount', 'taikhoanphu', 'va', 'tkphu']);
    const codeIdx = findColIdx(normHeaders, ['code', 'codett', 'codethanhtoan', 'macode']);
    const typeIdx = findColIdx(normHeaders, ['transfertype', 'loai', 'loaigiaodich']);
    const amountIdx = findColIdx(normHeaders, ['transferamount', 'sotien', 'amount']);
    const amountInIdx = findColIdx(normHeaders, ['tienvao', 'amountin', 'in']);
    const amountOutIdx = findColIdx(normHeaders, ['tienra', 'amountout', 'out']);
    const accumIdx = findColIdx(normHeaders, ['accumulated', 'luyke', 'sodu', 'soduluyke', 'balance']);
    const contentIdx = findColIdx(normHeaders, ['content', 'noidung', 'noidungthanhtoan', 'noidungchuyenkhoan', 'description', 'mota']);
    const refIdx = findColIdx(normHeaders, ['referencenumber', 'referencecode', 'mathamchieu', 'sohieugd']);

    const isSepayTab =
      contentIdx !== -1 &&
      (amountIdx !== -1 || amountInIdx !== -1) &&
      (gatewayIdx !== -1 || accIdx !== -1 || accumIdx !== -1 || /sepay/i.test(String(sheetObj.sheetName || '')));
    if (!isSepayTab) continue;

    sepaySheetFound = String(sheetObj.sheetName || 'SePay');

    // Sắp xếp thứ tự thời gian từ cũ đến mới để số dư / thông báo mới nhất luôn ở cuối
    const dataRows = rows.slice(1).filter(r => Array.isArray(r) && r.some(cell => String(cell || '').trim() !== ''));
    if (dataRows.length >= 2 && idIdx !== -1) {
      const firstIdNum = Number(String(dataRows[0][idIdx] || '').replace(/[^0-9]/g, ''));
      const lastIdNum = Number(String(dataRows[dataRows.length - 1][idIdx] || '').replace(/[^0-9]/g, ''));
      if (firstIdNum > lastIdNum) dataRows.reverse();
    }

    // Ánh xạ ngày giờ chi tiết từ SePay_GiaoDich theo ID UUID và Mã tham chiếu
    const sepayRefDateMap = {};
    for (const r of dataRows) {
      const dTime = dateIdx !== -1 ? String(r[dateIdx] || '').trim() : '';
      const idCell = idIdx !== -1 ? String(r[idIdx] || '').trim() : '';
      const rf = refIdx !== -1 ? String(r[refIdx] || '').trim() : '';
      if (idCell && dTime && dTime.length > 10) sepayRefDateMap[idCell] = dTime;
      if (rf && dTime && dTime.length > 10) sepayRefDateMap[rf] = dTime;
    }

    // Cập nhật ngày giờ chính xác cho giao dịch SePay theo đúng ID/UUID hoặc khôi phục giờ tạo của giao dịch thủ công
    const manualFixedTimeByTxId = {
      GD_1792936777067: '2026-10-25 20:59:37',
      GD_1792936402245: '2026-10-25 20:53:22',
      GD_1792936393856: '2026-10-25 20:53:13',
      GD_1792936290375: '2026-10-25 20:51:30',
      GD_1792934741181: '2026-10-25 20:25:41',
      GD_1792934740649: '2026-10-25 20:25:40'
    };
    for (const tx of state.transactions) {
      if (!tx) continue;
      const tid = String(tx.id || '');
      const cleanTid = tid.replace(/^GD_SEPAY_/, '').replace(/^GD_/, '');
      if (sepayRefDateMap[cleanTid] && String(tx.date || '') !== sepayRefDateMap[cleanTid]) {
        tx.date = sepayRefDateMap[cleanTid];
      } else if (manualFixedTimeByTxId[tid] && (String(tx.date || '').length <= 10 || tx.date === '2026-10-25 20:40:14')) {
        tx.date = manualFixedTimeByTxId[tid];
      }
    }

    const pairedTxIds = new Set();
    for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
      const r = dataRows[rIdx];
      const rawContent = String(r[contentIdx] || '').trim();
      const rawCode = codeIdx !== -1 ? String(r[codeIdx] || '').trim() : '';
      const combinedContent = `${rawCode} ${rawContent}`.trim();
      const amtIn = amountInIdx !== -1 ? parseSepayRawVnd(r[amountInIdx]) : 0;
      const amtOut = amountOutIdx !== -1 ? parseSepayRawVnd(r[amountOutIdx]) : 0;
      const directAmt = amountIdx !== -1 ? parseSepayRawVnd(r[amountIdx]) : 0;
      const isOut =
        (amtOut > 0 && amtIn === 0) ||
        (typeIdx !== -1 && /^(out|ra|tien\s*ra|chi|debit|-)/i.test(removeVietnameseTones(String(r[typeIdx] || '').trim())));
      const amount = amtIn > 0 ? amtIn : amtOut > 0 ? amtOut : directAmt;
      if (amount <= 0) continue;

      const rawIdCell = idIdx !== -1 ? String(r[idIdx] || '').trim() : '';
      const rawRefCell = refIdx !== -1 ? String(r[refIdx] || '').trim() : '';
      const rawDateCell = dateIdx !== -1 ? String(r[dateIdx] || '').trim() : '';
      const txDateOnly = /^\d{4}-\d{2}-\d{2}/.test(rawDateCell) ? rawDateCell.slice(0, 10) : todayDate;
      const cleanKey = (rawIdCell || rawRefCell || `${rawDateCell}_${amount}_${rIdx}`).replace(/[^A-Za-z0-9_-]/g, '');
      if (!cleanKey) continue;
      const sepayTxId = `GD_SEPAY_${cleanKey}`;

      const gateway = (gatewayIdx !== -1 && String(r[gatewayIdx] || '').trim()) || state.settings.bankBin || 'BIDV';
      const subAccVal = subAccIdx !== -1 ? String(r[subAccIdx] || '').trim() : '';
      const accNum =
        (accIdx !== -1 && String(r[accIdx] || '').trim()) ||
        subAccVal ||
        state.settings.bankAccountNo ||
        '8601774789';
      const isDraftSepayAcc = isDraftBankAccountNumber(accNum, state) || isDraftBankAccountNumber(subAccVal, state);
      const draftDescPrefix = isDraftSepayAcc ? '[STK Nháp 5801434567] ' : '';
      const txMethodLabel = isDraftSepayAcc ? 'Chuyển khoản STK Nháp' : 'Chuyển khoản STK (Tự động)';

      const deletedTxSet = getDeletedTxIdsSet(state);
      const dismissedNotifSet = getDismissedNotifIdsSet(state);
      const rowSig = buildSepayTxSignature(txDateOnly, amount, `| ND: ${rawContent || combinedContent}`, isDraftSepayAcc);
      const candidateKeys = [
        sepayTxId,
        `GD_${cleanKey}`,
        `YC_SEPAY_${cleanKey}`,
        `YC_STK_${cleanKey}`,
        `YC_STK_SEPAY_${cleanKey}`,
        `DEL_REQ::YC_SEPAY_${cleanKey}`,
        `DEL_REQ::YC_STK_SEPAY_${cleanKey}`,
        rawRefCell ? `GD_${rawRefCell}` : '',
        rawRefCell ? `GD_SEPAY_${rawRefCell}` : '',
        isDraftSepayAcc ? rowSig : ''
      ].filter(Boolean);
      if (candidateKeys.some(k => deletedTxSet.has(k))) continue;

      const alreadyInPaymentReqs = (state.paymentRequests || []).some(req => {
        const rid = String(req?.id || '').trim();
        return rid === `YC_SEPAY_${cleanKey}` || rid === `YC_STK_${cleanKey}` || rid === `YC_STK_SEPAY_${cleanKey}`;
      });
      if (alreadyInPaymentReqs) continue;

      const accumVal = accumIdx !== -1 && String(r[accumIdx] || '').trim() !== '' ? parseSepayRawVnd(r[accumIdx]) : null;
      const alertTime = rawDateCell || nowStr;

      // Chỉ cập nhật thông báo biến động mới nhất nếu chưa bị người dùng xóa khỏi Trung tâm thông báo
      if (!dismissedNotifSet.has(sepayTxId) && !dismissedNotifSet.has(`ALERT::${sepayTxId}`)) {
        state.settings.lastBankAlertJson = JSON.stringify({
          id: sepayTxId,
          time: alertTime,
          type: isOut ? 'out' : 'in',
          rawVnd: true,
          amount,
          balance: accumVal !== null && accumVal > 0 ? accumVal : undefined,
          content: rawContent || combinedContent,
          gateway,
          accountNumber: accNum
        });
      }
      if (
        !isDraftSepayAcc &&
        accumVal !== null &&
        accumVal > 0 &&
        !state.settings.sepayBalanceManualAt &&
        state.settings.sepayBalanceMode !== 'auto'
      ) {
        state.settings.sepayBalance = String(accumVal);
      }

      const editedOverrides = getEditedTxOverridesMap(state);
      const existingMatchedTx = state.transactions.find(t => {
        if (!t) return false;
        const tid = String(t.id || '');
        if (pairedTxIds.has(tid)) return false;
        if (
          tid === sepayTxId ||
          tid === `GD_${cleanKey}` ||
          (rawRefCell && (tid === `GD_SEPAY_${rawRefCell}` || tid === `GD_${rawRefCell}`))
        ) {
          return true;
        }
        const ov = editedOverrides[tid];
        const descToMatch = ov && ov.origDesc ? `${t.description || ''} ${ov.origDesc}` : String(t.description || '');
        const amtToMatch = ov && ov.origAmount !== undefined ? Number(ov.origAmount) : Number(t.amount);
        if (rawRefCell && rawRefCell.length >= 5 && descToMatch.includes(rawRefCell)) {
          return true;
        }
        // Chỉ ghép fallback với bản ghi số nguyên từ API (GD_SEPAY_<digits>) cùng loại tài khoản, tuyệt đối không ghép nhầm sang UUID khác
        return Boolean(
          /^GD_SEPAY_\d+$/i.test(tid) &&
          isDraftBankTransaction(t, state) === isDraftSepayAcc &&
          (Number(t.amount) === amount || amtToMatch === amount) &&
          rawContent &&
          descToMatch.includes(rawContent)
        );
      });
      if (existingMatchedTx) {
        pairedTxIds.add(String(existingMatchedTx.id || ''));
        if (!processedSepaySet.has(sepayTxId) || !processedSepaySet.has(cleanKey)) {
          processedSepaySet.add(sepayTxId);
          processedSepaySet.add(cleanKey);
          processedSetMutated = true;
        }
        if (rawDateCell && rawDateCell.length > 10 && String(existingMatchedTx.date || '') !== rawDateCell) {
          existingMatchedTx.date = rawDateCell;
        }
        if (isDraftSepayAcc) {
          if (!isDraftBankTransaction(existingMatchedTx, state)) {
            markDraftBankTx(state, existingMatchedTx.id);
          }
          if (existingMatchedTx.method !== 'Chuyển khoản STK Nháp') {
            existingMatchedTx.method = 'Chuyển khoản STK Nháp';
          }
          if (!/STK\s*Nh[aá]p|5801434567|962478SJJ2/i.test(String(existingMatchedTx.description || ''))) {
            existingMatchedTx.description = `${draftDescPrefix}${existingMatchedTx.description || ''}`;
          }
        } else if (!isDraftSepayAcc && existingMatchedTx.method !== 'Chuyển khoản STK (Tự động)') {
          existingMatchedTx.method = 'Chuyển khoản STK (Tự động)';
        }
        // Không tự động đổi lại trạng thái học sinh cho các giao dịch cũ đã có trong Sổ Thu Chi
        // để bảo toàn mọi thao tác chuyển sang đợt mới hoặc chỉnh sửa thủ công của Quản lý trên Web
        continue;
      }

      if (amount > 0 && amount < 20000) {
        recordExactSmallAmount(state, sepayTxId, '', amount);
      }
      if (isDraftSepayAcc) {
        markDraftBankTx(state, sepayTxId);
      }

      const wasPreviouslyProcessed =
        processedSepaySet.has(sepayTxId) ||
        processedSepaySet.has(cleanKey) ||
        (rawRefCell && processedSepaySet.has(rawRefCell));
      processedSepaySet.add(sepayTxId);
      processedSepaySet.add(cleanKey);
      processedSetMutated = true;

      if (!isOut && !wasPreviouslyProcessed) {
        const matchedStu = findStudentFromTransferContent(
          combinedContent,
          amount,
          state.students,
          state.paymentRequests
        );
        const clsRolloverCutoff = matchedStu ? scheduleMapForCutoff[matchedStu.className]?.rolledOverAt || '' : '';
        const stuManualCutoff = matchedStu?.manualStatusUpdatedAt || '';
        const latestCutoff =
          clsRolloverCutoff && stuManualCutoff
            ? clsRolloverCutoff > stuManualCutoff
              ? clsRolloverCutoff
              : stuManualCutoff
            : clsRolloverCutoff || stuManualCutoff;
        const isOlderThanManualOrRollover =
          latestCutoff && isTxDateOlderThanAction(rawDateCell || txDateOnly, latestCutoff);

        if (matchedStu && !isOlderThanManualOrRollover) {
          if (amount > 0 && amount < 20000) {
            recordExactSmallAmount(state, sepayTxId, matchedStu.studentCode, amount);
          }
          if (autoApproveOn) {
            matchedStu.status = 'Đã hoàn thành';
            matchedStu.updatedAt = alertTime;
            matchedStu.note = `${draftDescPrefix}Đã CK thành công vào STK (SePay): +${formatCurrency(amount)} (${alertTime})`;

            let updatedPending = false;
            state.paymentRequests.forEach(req => {
              if (
                req &&
                req.status === 'Chờ duyệt' &&
                !isSimulatedBankTestItem(req) &&
                (req.studentRecordId === matchedStu.id ||
                  String(req.studentCode || '').toUpperCase() === String(matchedStu.studentCode || '').toUpperCase())
              ) {
                req.status = 'Đã duyệt';
                req.bankVerified = true;
                req.reviewedAt = alertTime;
                req.note = `${req.note ? req.note + ' • ' : ''}${draftDescPrefix}SePay đã ghi nhận +${formatCurrency(amount)} & duyệt tự động`;
                updatedPending = true;
              }
            });
            if (!updatedPending) {
              const autoReqId = `YC_SEPAY_${cleanKey}`;
              if (amount < 20000) recordExactSmallAmount(state, autoReqId, matchedStu.studentCode, amount);
              state.paymentRequests.unshift({
                id: autoReqId,
                submittedAt: alertTime,
                studentRecordId: matchedStu.id,
                studentCode: matchedStu.studentCode,
                studentName: matchedStu.fullName,
                className: matchedStu.className,
                period: matchedStu.period,
                amount,
                parentPhone: matchedStu.parentPhone || '',
                payerName: isDraftSepayAcc ? 'Chuyển khoản STK Nháp (SePay)' : 'Chuyển khoản SePay tự động',
                note: `${draftDescPrefix}SePay ghi nhận tiền vào STK | ND: ${rawContent}`,
                receiptUrl: matchedStu.receiptUrl || '',
                bankVerified: true,
                isDraftBank: isDraftSepayAcc,
                status: 'Đã duyệt',
                reviewedAt: alertTime
              });
            }

            state.transactions.unshift({
              id: sepayTxId,
              date: rawDateCell || txDateOnly,
              type: 'Thu',
              category: 'Thu học phí',
              amount,
              description: `${draftDescPrefix}Tự động lưu CK SePay: ${matchedStu.studentCode} - ${matchedStu.fullName} (${matchedStu.period}) | ND: ${rawContent}`,
              studentCode: matchedStu.studentCode,
              method: txMethodLabel,
              receiptUrl: matchedStu.receiptUrl || '',
              createdBy: 'Tự động từ STK (SePay)'
            });
          } else {
            if (matchedStu.status !== 'Đã hoàn thành') {
              matchedStu.status = 'Chờ duyệt';
            }
            matchedStu.updatedAt = alertTime;
            matchedStu.note = `${draftDescPrefix}SePay đã ghi nhận +${formatCurrency(amount)} vào STK - Chờ Quản lý duyệt`;

            let updatedPending = false;
            state.paymentRequests.forEach(req => {
              if (
                req &&
                req.status === 'Chờ duyệt' &&
                !isSimulatedBankTestItem(req) &&
                (req.studentRecordId === matchedStu.id ||
                  String(req.studentCode || '').toUpperCase() === String(matchedStu.studentCode || '').toUpperCase())
              ) {
                req.bankVerified = true;
                if (isDraftSepayAcc) req.isDraftBank = true;
                if (!String(req.note || '').includes('SePay đã ghi nhận')) {
                  req.note = `${req.note ? req.note + ' • ' : ''}${draftDescPrefix}SePay đã ghi nhận +${formatCurrency(amount)} vào STK`;
                }
                updatedPending = true;
              }
            });
            if (!updatedPending) {
              const autoReqId = `YC_SEPAY_${cleanKey}`;
              if (amount < 20000) recordExactSmallAmount(state, autoReqId, matchedStu.studentCode, amount);
              state.paymentRequests.unshift({
                id: autoReqId,
                submittedAt: alertTime,
                studentRecordId: matchedStu.id,
                studentCode: matchedStu.studentCode,
                studentName: matchedStu.fullName,
                className: matchedStu.className,
                period: matchedStu.period,
                amount,
                parentPhone: matchedStu.parentPhone || '',
                payerName: isDraftSepayAcc ? 'Chuyển khoản STK Nháp (SePay)' : 'Chuyển khoản STK (SePay)',
                note: `${draftDescPrefix}SePay đã ghi nhận +${formatCurrency(amount)} | ND: ${rawContent} - Chờ Quản lý duyệt`,
                receiptUrl: '',
                bankVerified: true,
                isDraftBank: isDraftSepayAcc,
                status: 'Chờ duyệt',
                reviewedAt: ''
              });
            }
          }
          reconciledAny = true;
          continue;
        }
      }

      state.transactions.unshift({
        id: sepayTxId,
        date: rawDateCell || txDateOnly,
        type: isOut ? 'Chi' : 'Thu',
        category: isOut ? 'Khác' : 'Thu học phí',
        amount,
        description: `${draftDescPrefix}Tự động lưu GD SePay (${accNum}): ${rawContent || 'Giao dịch ngân hàng'}`,
        studentCode: '',
        method: txMethodLabel,
        receiptUrl: '',
        createdBy: 'Tự động từ STK (SePay)'
      });
      reconciledAny = true;
    }
  }

  if (processedSetMutated) {
    state.settings.processedSepayTxIdsJson = JSON.stringify(Array.from(processedSepaySet).slice(-800));
  }
  if (Array.isArray(state.transactions)) {
    state.transactions.sort(sortTransactionsNewestFirst);
  }
  if (sepaySheetFound) {
    state.settings._sepaySheetConnected = sepaySheetFound;
  }
  if (reconciledAny) {
    state._sepayAutoReconciled = true;
  }
  return state;
}

// Chế độ 1 chiều tuyệt đối (Web -> Google Sheet): Không gộp hay ghi đè bất kỳ dữ liệu nào từ Google Sheet vào Web
function safeMergeServerData() {
  return { changed: false, newlyPaid: [], newTxs: [] };
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

async function resetDemoData() {
  if (isSandboxDraftMode) {
    if (
      !(await appConfirm('Khôi phục lại bộ dữ liệu nháp mẫu ban đầu của Tab Nháp?', {
        title: 'Khôi phục dữ liệu Tab Nháp',
        tone: 'amber',
        okText: 'Khôi phục'
      }))
    ) {
      return;
    }
    resetSandboxDraftData();
    return;
  }
  if (
    !(await appConfirm('Khôi phục lại bộ dữ liệu mẫu ban đầu? Các thay đổi chưa lưu lên Sheet sẽ bị đặt lại.', {
      title: 'Khôi phục dữ liệu mẫu',
      tone: 'amber',
      okText: 'Khôi phục'
    }))
  ) {
    return;
  }
  appState = getInitialDemoState();
  saveStateToLocal();
  showToast('Đã khôi phục dữ liệu mẫu thành công!', 'success');
}

function copyTextById(elementId) {
  let text = (document.getElementById(elementId)?.textContent || '').trim();
  if (elementId === 'pay-modal-acc' || elementId === 'group-qr-acc') {
    const rawAcc = appState.settings?.bankAccountNo || (isSandboxDraftMode ? '5801434567' : '8601774789');
    const effectiveVa = getEffectiveQrAccountNo(rawAcc, appState.settings);
    text = effectiveVa || rawAcc;
    navigator.clipboard.writeText(text);
    showToast(`Đã sao chép mã TK nhận tiền tự động (VA): ${text}`, 'success');
    return;
  }
  navigator.clipboard.writeText(text);
  showToast(`Đã sao chép: ${text}`, 'success');
}

async function copyGasCodeToClipboard() {
  const sanitizeForSandbox = rawCode => {
    if (!isSandboxDraftMode) return rawCode;
    return String(rawCode || '').replace(
      /1dObYu0uf1pdSvYLWDdi45zKK2n67TzfbrfkDuOlsvq0/g,
      'DIEN_ID_GOOGLE_SHEET_CUA_BAN_VAO_DAY'
    );
  };
  try {
    if (window.__EMBEDDED_GAS_CODE_B64__) {
      const codeText = sanitizeForSandbox(decodeURIComponent(escape(atob(window.__EMBEDDED_GAS_CODE_B64__))));
      await navigator.clipboard.writeText(codeText);
      showToast(
        isSandboxDraftMode
          ? 'Đã copy mã Code.gs mẫu (Dành cho Tab Nháp)! Bạn có thể thay ID Google Sheet riêng của bạn vào.'
          : 'Đã copy toàn bộ mã Code.gs mới nhất (hỗ trợ SePay báo số dư)! Hãy dán vào Google Sheet -> Apps Script.',
        'success'
      );
      return;
    }
    const res = await fetch('google-apps-script/Code.gs');
    if (res.ok) {
      const codeText = sanitizeForSandbox(await res.text());
      await navigator.clipboard.writeText(codeText);
      showToast(
        isSandboxDraftMode
          ? 'Đã copy mã Code.gs mẫu (Dành cho Tab Nháp)!'
          : 'Đã copy toàn bộ mã Code.gs (gắn sẵn ID Sheet của bạn)! Hãy dán vào Google Sheet -> Apps Script.',
        'success'
      );
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
  if (isSandboxDraftMode) {
    showToast('Tính năng đẩy code GitHub chỉ dành cho Quản lý chính ở chế độ Dữ liệu thật!', 'warning');
    return;
  }
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
      <p class="font-bold text-emerald-300">Đã đẩy lên GitHub & bật GitHub Pages thành công!</p>
      <p>Kho mã nguồn: <a href="${repoUrl}" target="_blank" class="underline text-white font-semibold">${repoUrl}</a></p>
      <p>Link Web gửi Phụ huynh (hoạt động sau ~45 giây): <a href="${pagesUrl}" target="_blank" class="underline text-amber-300 font-bold">${pagesUrl}</a></p>
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

function normalizeStoredVnd(val) {
  const num = parseRawMoneyDigits(val);
  if (num === 0) return 0;
  if (Math.abs(num) >= 1000 && num % 1000 === 0) {
    return num;
  }
  return Math.round(num * 1000);
}

function formatCurrency(val) {
  const num = val ? normalizeStoredVnd(val) : 0;
  return num.toLocaleString('vi-VN') + '\u00A0₫';
}

/**
 * Làm sạch chuỗi số tiền người dùng nhập vào:
 * - Hỗ trợ cả số nguyên (5, 5000, 600, 600000), chuỗi có dấu chấm/phẩy phân cách hàng nghìn tiếng Việt ("5.000", "600.000", "1.200", "1.200.000", "2,000,000")
 * - Hỗ trợ hậu tố "tr", "triệu" nếu người dùng gõ trong hộp thoại prompt (VD: "1.5tr" -> 1500000)
 */
function parseRawMoneyDigits(val) {
  if (typeof val === 'number') {
    return isFinite(val) ? Math.round(val) : 0;
  }
  const s = String(val ?? '').trim().toLowerCase();
  if (!s) return 0;

  const isNegative = s.startsWith('-');
  if (s.includes('tr')) {
    const floatStr = s.replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const floatVal = parseFloat(floatStr);
    if (!isNaN(floatVal)) {
      return (isNegative ? -1 : 1) * Math.round(floatVal * 1000000);
    }
  }

  // Trong tiền Việt (VNĐ), dấu chấm (.) hoặc phẩy (,) là dấu phân cách hàng nghìn (VD: 5.000, 600.000, 1.200, 1.200.000)
  const digitsOnly = s.replace(/[^0-9]/g, '');
  if (!digitsOnly) return 0;
  const num = Number(digitsOnly);
  if (!isFinite(num)) return 0;
  return (isNegative ? -1 : 1) * Math.round(num);
}

/**
 * Phân biệt thông minh giữa số tiền ĐÃ RÚT GỌN 3 SỐ 000 (đơn vị: nghìn đồng)
 * và số tiền ĐẦY ĐỦ VNĐ (đơn vị: đồng):
 * - Ở dạng ĐẦY ĐỦ VNĐ, mọi khoản học phí / thu chi / test nhỏ đều >= 3.000 ₫ và chia hết cho 1.000
 *   (VD: 5.000, 10.000, 20.000, 50.000, 100.000, 200.000, 500.000, 600.000, 1.000.000, 1.200.000, 2.000.000).
 * - Khi ĐÃ RÚT GỌN 3 số 000, các con số này nằm trong khoảng 1 -> 2.999
 *   (VD: 5, 10, 20, 50, 100, 200, 500, 600, 700, 1000, 1200, 1500, 2000)
 *   hoặc không chia hết cho 1.000.
 */
function isFullVndAmount(num) {
  const abs = Math.abs(Number(num) || 0);
  if (abs === 0) return true;
  return abs >= 3000 && abs % 1000 === 0;
}

// Rút gọn 3 số 000 cuối khi hiển thị trong ô nhập tiền (VD: 5000 -> 5, 600000 -> 600, 2000000 -> 2000, 50000 -> 50; nếu đã là 5, 600 hoặc 2000 thì giữ nguyên)
function toShortMoney(val) {
  const num = parseRawMoneyDigits(val);
  if (num === 0) return 0;
  if (isFullVndAmount(num)) {
    return Math.round(num / 1000);
  }
  return num;
}

// Chuyển từ số tiền rút gọn (VD: 5, 600, 2000, "1.200") HOẶC số tiền đầy đủ (VD: 5000, 600000, "600.000", 2000000, 50000)
// sang số tiền VNĐ đầy đủ chuẩn xác 100% (5000, 600000, 2000000, 1200000, 50000)
function fromShortMoney(val) {
  const num = parseRawMoneyDigits(val);
  if (num === 0) return 0;
  if (isFullVndAmount(num)) {
    return num;
  }
  return Math.round(num * 1000);
}

// Nếu người dùng gõ dư 3 số 000 (VD: 600000, 600.000, 50000, 2000000), tự động cắt gọn 3 số 000 trong ô nhập (thành 600, 50, 2000)
// Có chống giật khi đang gõ dở tay (debounce 450ms khi đang gõ, và thực thi ngay lập tức khi rời ô / nhấn Enter)
function autoShortenMoneyInput(inputEl, forceNow = false) {
  if (!inputEl) return;
  if (inputEl._shortenTimer) {
    clearTimeout(inputEl._shortenTimer);
    inputEl._shortenTimer = null;
  }

  const applyShorten = () => {
    const raw = String(inputEl.value || '').trim();
    if (!raw) return;
    const digits = parseRawMoneyDigits(raw);
    if (digits === 0) return;
    const shortened = toShortMoney(digits);
    const nextStr = String(shortened);
    if (inputEl.value !== nextStr && (forceNow || isFullVndAmount(digits) || /[^0-9]/.test(raw))) {
      inputEl.value = nextStr;
    }
    const fullVnd = fromShortMoney(shortened);
    inputEl.title = `Tương đương: ${formatCurrency(fullVnd)} (Đã rút gọn 3 số 000)`;
  };

  if (forceNow) {
    applyShorten();
  } else {
    // Chỉ lọc ký tự chữ ngay lập tức nếu có, và đợi 450ms sau khi ngừng gõ mới tự cắt 3 số 000 để không ngắt nhịp gõ các số hàng triệu (VD: 1200000)
    const rawNow = String(inputEl.value || '');
    const fullPreview = fromShortMoney(rawNow);
    if (fullPreview > 0) {
      inputEl.title = `Tương đương: ${formatCurrency(fullPreview)}`;
    }
    inputEl._shortenTimer = setTimeout(applyShorten, 450);
  }
}

function maskPhone(phone) {
  const p = String(phone || '').trim();
  if (p.length < 7) return p;
  return p.slice(0, 4) + '***' + p.slice(-3);
}

function getCurrentDateTimeString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0'); /* taste-skill-ignore */
  const dd = String(now.getDate()).padStart(2, '0'); /* taste-skill-ignore */
  const hh = String(now.getHours()).padStart(2, '0'); /* taste-skill-ignore */
  const min = String(now.getMinutes()).padStart(2, '0'); /* taste-skill-ignore */
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

// shortcut: xóa toàn bộ cache khi vượt 3000 chuỗi, nâng cấp sang LRU nếu dữ liệu >10.000 học sinh
var _vnToneCache = null;
function removeVietnameseTones(str) {
  const key = String(str || '');
  if (!key) return '';
  if (!_vnToneCache) _vnToneCache = new Map();
  const hit = _vnToneCache.get(key);
  if (hit !== undefined) return hit;
  const out = key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
  if (_vnToneCache.size > 3000) _vnToneCache.clear();
  _vnToneCache.set(key, out);
  return out;
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
    success: 'bg-emerald-600 text-white border border-emerald-400/40',
    error: 'bg-rose-600 text-white border border-rose-400/40',
    warning: 'bg-amber-500 text-white border border-amber-300/40',
    info: 'bg-slate-900 text-white border border-slate-700'
  };

  const icons = {
    success: 'check-circle-2',
    error: 'alert-octagon',
    warning: 'alert-triangle',
    info: 'sparkles'
  };

  // Loại bỏ các emoji thô đầu chuỗi để đồng bộ với icon vector chuyên nghiệp
  const cleanMsg = String(message || '')
    .replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{FE0F}\s]+/u, '')
    .trim();

  const toast = document.createElement('div');
  toast.className = `pointer-events-auto px-4 py-3 rounded-2xl  text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 animate-fade-in ${
    colors[type] || colors.info
  }`;
  toast.innerHTML = `
    <div class="flex items-center gap-2.5 min-w-0">
      <i data-lucide="${icons[type] || icons.info}" class="w-4 h-4 shrink-0"></i>
      <span class="leading-snug">${escapeHtml(cleanMsg || message)}</span>
    </div>
    <button onclick="this.parentElement.remove()" class="opacity-75 hover:opacity-100 p-1 rounded-lg hover:bg-white/15 transition cursor-pointer shrink-0">
      <i data-lucide="x" class="w-3.5 h-3.5"></i>
    </button>
  `;

  container.appendChild(toast);
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons({ nodes: [toast] });
  }
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
  const userDeleted = getDeletedClassesSet(appState);
  try {
    if (appState.settings && appState.settings.classSchedulesJson) {
      map = JSON.parse(appState.settings.classSchedulesJson) || {};
    }
  } catch (e) {
    map = {};
  }

  Object.keys(map).forEach(cls => {
    if (userDeleted.has(cls.trim())) {
      delete map[cls];
    }
  });

  // Đảm bảo mọi lớp đang có trong danh sách học sinh đều có cấu hình lịch
  const studentClasses = Array.from(
    new Set(
      (appState.students || [])
        .map(s => (s.className || '').trim())
        .filter(cls => cls && !userDeleted.has(cls))
    )
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

// ============================================================================
// HỆ THỐNG TẠO & QUẢN LÝ KHỐI LỚP (+ TẠO KHỐI)
// ============================================================================
const DEFAULT_BUILTIN_GRADES = [
  { key: '12', label: 'Khối 12' },
  { key: '11', label: 'Khối 11' },
  { key: '10', label: 'Khối 10' },
  { key: '9', label: 'Khối 9' },
  { key: '8', label: 'Khối 8' },
  { key: '7', label: 'Khối 7' },
  { key: '6', label: 'Khối 6' },
  { key: '6-8', label: 'Khối 6 - 8' }
];

function getCustomGradesList() {
  try {
    if (appState.settings && appState.settings.customGradesJson) {
      const parsed = JSON.parse(appState.settings.customGradesJson);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

function getDeletedGradesSet() {
  try {
    if (appState.settings && appState.settings.deletedGradesJson) {
      const parsed = JSON.parse(appState.settings.deletedGradesJson);
      if (Array.isArray(parsed)) return new Set(parsed.map(k => String(k).trim()));
    }
  } catch (e) {}
  return new Set();
}

function normalizeGradeKeyAndLabel(rawInput) {
  const raw = String(rawInput || '').trim();
  if (!raw) return { key: '', label: '' };

  // Nếu người dùng nhập "Khối 8" hoặc "8" hoặc "Lớp 8"
  const numMatch = raw.match(/^(?:khối|lớp)?\s*(\d{1,2})\s*$/i);
  if (numMatch) {
    const num = numMatch[1];
    return { key: num, label: `Khối ${num}` };
  }

  // Nếu người dùng nhập "6-8" hoặc "Khối 6-8" hoặc "Khối 6 - 8"
  if (/^(?:khối\s*)?6\s*-\s*8$/i.test(raw)) {
    return { key: '6-8', label: 'Khối 6 - 8' };
  }

  // Các tên khối tùy chỉnh (VD: "Khối Luyện Thi ĐH", "Khối Chuyên", "Cấp 2"...)
  const hasPrefix = /^khối\b/i.test(raw);
  const label = hasPrefix ? raw : `Khối ${raw}`;
  const key = raw
    .replace(/^khối\s*/i, '')
    .trim()
    .toUpperCase();
  return { key, label };
}

function getGradeCategoryForClassName(cls) {
  const s = String(cls || '').trim();
  if (!s) return 'OTHER';

  // 1. Kiểm tra nếu lớp đã được gán Khối cụ thể trong cấu hình lớp
  try {
    if (appState?.settings?.classSchedulesJson) {
      const rawMap = JSON.parse(appState.settings.classSchedulesJson) || {};
      const cfg = rawMap[s];
      if (cfg && cfg.gradeKey && cfg.gradeKey !== 'AUTO') {
        return String(cfg.gradeKey);
      }
    }
  } catch (e) {}

  // 2. Kiểm tra danh sách Khối do người dùng tạo (ưu tiên khớp số khối cụ thể như 8, 7, 6 hoặc tên khối)
  const customGrades = getCustomGradesList();
  for (let i = 0; i < customGrades.length; i++) {
    const cg = customGrades[i];
    if (!cg || !cg.key) continue;
    const k = String(cg.key).trim();
    if (/^\d+$/.test(k)) {
      const regex = new RegExp(`^${k}\\b`);
      if (regex.test(s)) return k;
    } else if (
      s.toUpperCase().startsWith(k.toUpperCase()) ||
      removeVietnameseTones(s.toLowerCase()).includes(removeVietnameseTones(k.toLowerCase()))
    ) {
      return k;
    }
  }

  // 3. Nhận diện mặc định theo đầu tên lớp (hỗ trợ cả "12 2K9" và "12A1")
  if (/^12(?:\D|$)/.test(s)) return '12';
  if (/^11(?:\D|$)/.test(s)) return '11';
  if (/^10(?:\D|$)/.test(s)) return '10';
  if (/^9(?:\D|$)/.test(s)) return '9';
  if (/^[678](?:\D|$)/.test(s)) return '6-8';
  return 'OTHER';
}

function getAllGradeGroupsForDisplay(classNames, allStudents) {
  const cList = Array.isArray(classNames) ? classNames : [];
  const sList = Array.isArray(allStudents) ? allStudents : [];
  const customGrades = getCustomGradesList();
  const customKeysSet = new Set(customGrades.map(g => String(g.key)));
  const deletedGrades = getDeletedGradesSet();

  const mergedDefs = [{ key: 'ALL', label: 'Tất cả', isAlwaysVisible: true }];
  const seenKeys = new Set(['ALL']);

  // Đưa các Khối chuẩn và Khối người dùng tạo vào danh sách
  DEFAULT_BUILTIN_GRADES.forEach(bg => {
    if (deletedGrades.has(bg.key) && !customKeysSet.has(bg.key)) return;
    seenKeys.add(bg.key);
    mergedDefs.push({
      key: bg.key,
      label: bg.label,
      isCustom: customKeysSet.has(bg.key)
    });
  });

  customGrades.forEach(cg => {
    if (!cg || !cg.key || seenKeys.has(cg.key)) return;
    seenKeys.add(cg.key);
    mergedDefs.push({
      key: cg.key,
      label: cg.label || `Khối ${cg.key}`,
      isCustom: true
    });
  });

  // Kiểm tra nếu có lớp thuộc nhóm OTHER
  const otherClassesCnt = cList.filter(c => getGradeCategoryForClassName(c) === 'OTHER').length;
  if (otherClassesCnt > 0 && !seenKeys.has('OTHER')) {
    mergedDefs.push({ key: 'OTHER', label: 'Khối Khác', isCustom: false });
  }

  return mergedDefs
    .map(def => {
      if (def.key === 'ALL') {
        return {
          key: 'ALL',
          label: 'Tất cả',
          count: cList.length,
          stuCount: sList.length,
          isCustom: false
        };
      }
      const count = cList.filter(c => getGradeCategoryForClassName(c) === def.key).length;
      const stuCount = sList.filter(s => getGradeCategoryForClassName(s.className) === def.key).length;
      return {
        key: def.key,
        label: def.label,
        count,
        stuCount,
        isCustom: Boolean(def.isCustom)
      };
    })
    .filter(g => g.key === 'ALL' || g.count > 0 || g.isCustom);
}

function getGradeLabelByKey(gradeKey) {
  if (!gradeKey || gradeKey === 'ALL') return 'Tất cả';
  const custom = getCustomGradesList().find(g => g.key === gradeKey);
  if (custom) return custom.label;
  const builtin = DEFAULT_BUILTIN_GRADES.find(g => g.key === gradeKey);
  if (builtin) return builtin.label;
  return `Khối ${gradeKey}`;
}

function setClassbookGradeFilter(gradeKey) {
  selectedClassbookGradeFilter = gradeKey || 'ALL';
  const map = getClassSchedulesMap();
  const classNames = sortClassNamesStandard(Object.keys(map));
  const filtered =
    selectedClassbookGradeFilter === 'ALL'
      ? classNames
      : classNames.filter(c => getGradeCategoryForClassName(c) === selectedClassbookGradeFilter);
  if (filtered.length > 0 && !filtered.includes(selectedClassbookClass)) {
    selectedClassbookClass = filtered[0];
  }
  saveUiViewState();
  renderAdminClassbook();
}

function parseClassDisplayTitle(cls) {
  const raw = String(cls || '').trim();
  const m = raw.match(/^([^(]+)\(([^)]+)\)$/);
  if (m) {
    return {
      mainTitle: `Lớp ${m[1].trim()}`,
      subLabel: m[2].trim()
    };
  }
  return {
    mainTitle: `Lớp ${raw}`,
    subLabel: 'Ca chính'
  };
}

function selectClassbookClass(className) {
  selectedClassbookClass = className;
  saveUiViewState();
  renderAdminClassbook();
  if (typeof renderAdminAttendance === 'function') {
    renderAdminAttendance();
  }
}

function renderAdminClassbook() {
  const pillsContainer = document.getElementById('classbook-class-pills');
  if (!pillsContainer) return;

  const map = getClassSchedulesMap();
  const classNames = sortClassNamesStandard(Object.keys(map));

  if (!selectedClassbookClass || !map[selectedClassbookClass]) {
    selectedClassbookClass = classNames[0] || '';
  }

  // 0. Render bộ lọc nhanh theo Khối lớp (Tầng 2 cân đối ngang hàng với nút + Tạo Khối / Xóa Khối bên phải)
  const gradeFiltersEl = document.getElementById('classbook-grade-filters');
  if (gradeFiltersEl) {
    const gradeGroups = getAllGradeGroupsForDisplay(classNames, appState.students || []);
    const activeGradeLabel =
      selectedClassbookGradeFilter && selectedClassbookGradeFilter !== 'ALL'
        ? getGradeLabelByKey(selectedClassbookGradeFilter)
        : '';

    const topDelBtnLabel = document.getElementById('btn-classbook-delete-grade-label');
    if (topDelBtnLabel) {
      topDelBtnLabel.textContent = activeGradeLabel ? `Xóa ${activeGradeLabel}` : 'Xóa Khối';
    }

    gradeFiltersEl.innerHTML = gradeGroups
      .map(g => {
        const active = selectedClassbookGradeFilter === g.key;
        return `
          <button
            type="button"
            onclick="setClassbookGradeFilter('${escapeAttr(g.key)}')"
            class="h-8 px-3 rounded-lg text-xs font-extrabold transition cursor-pointer inline-flex items-center gap-1.5 border whitespace-nowrap ${
              active
                ? 'bg-blue-600 text-white border-blue-600 '
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            }"
          >
            <span>${escapeHtml(g.label)}</span>
            <span class="px-1.5 py-0.2 rounded-full text-xs ${
              active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }">${g.count}</span>
          </button>
        `;
      })
      .join('');
  }

  const visibleClasses =
    selectedClassbookGradeFilter === 'ALL'
      ? classNames
      : classNames.filter(c => getGradeCategoryForClassName(c) === selectedClassbookGradeFilter);
  if (visibleClasses.length > 0 && !visibleClasses.includes(selectedClassbookClass)) {
    selectedClassbookClass = visibleClasses[0];
  }

  // 1. Render lưới thẻ chọn lớp cân đối (4 cột đều nhau, chuyên nghiệp + thanh tiến độ)
  if (visibleClasses.length === 0) {
    const currentGradeLabel = getGradeLabelByKey(selectedClassbookGradeFilter);
    pillsContainer.innerHTML = `
      <div class="col-span-full p-5 rounded-2xl bg-white border border-dashed border-slate-300 text-center flex flex-col sm:flex-row items-center justify-between gap-3">
        <div class="text-left">
          <div class="font-extrabold text-sm text-slate-800">
            ${escapeHtml(currentGradeLabel)} hiện chưa có lớp học nào.
          </div>
          <div class="text-xs text-slate-500 mt-0.5">
            Hãy bấm nút bên phải để tạo lớp học đầu tiên cho <strong>${escapeHtml(currentGradeLabel)}</strong>.
          </div>
        </div>
        <button
          type="button"
          onclick="openClassScheduleModalForGrade('${escapeAttr(selectedClassbookGradeFilter)}')"
          class="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-900 text-white text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer  shrink-0"
        >
          <i data-lucide="plus-circle" class="w-4 h-4"></i>
          <span>+ Tạo Lớp Mới thuộc ${escapeHtml(currentGradeLabel)}</span>
        </button>
      </div>
    `;
  } else {
    pillsContainer.innerHTML = visibleClasses
      .map(cls => {
      const isSelected = cls === selectedClassbookClass;
      const clsStudents = (appState.students || []).filter(s => s.className === cls);
      const count = clsStudents.length;
      const paidCnt = clsStudents.filter(s => s.status === 'Đã hoàn thành').length;
      const paidPct = count > 0 ? Math.round((paidCnt / count) * 100) : 0;
      const cCfg = map[cls] || {};
      const { mainTitle, subLabel } = parseClassDisplayTitle(cls);
      const batchTag = cCfg.batchLabel || 'ĐỢT 1';

      return `
        <div
          role="button"
          tabindex="0"
          onclick="selectClassbookClass('${escapeAttr(cls)}')"
          class="class-selector-item ${
            isSelected ? 'is-active' : ''
          } group w-full px-3.5 py-2.5 rounded-xl text-left transition cursor-pointer flex flex-col justify-between gap-1.5"
        >
          <div class="flex items-center justify-between gap-1.5 w-full">
            <span class="font-extrabold text-xs sm:text-sm truncate ${
              isSelected ? 'text-white' : 'text-slate-900 group-hover:text-blue-600'
            }">
              ${escapeHtml(mainTitle)}
            </span>
            <div class="flex items-center gap-1 shrink-0">
              <span class="px-2 py-0.5 rounded-full text-[11px] whitespace-nowrap ${
                isSelected
                  ? 'bg-amber-300 text-slate-950 font-black '
                  : 'bg-blue-50 text-blue-700 font-extrabold border border-blue-200'
              }">
                ${count} HS
              </span>
              <button
                type="button"
                onclick="event.stopPropagation(); deleteClassByName('${escapeAttr(cls)}')"
                title="Xóa lớp ${escapeAttr(cls)}"
                class="class-card-del-btn p-1 rounded-lg ${
                  isSelected
                    ? 'text-white/80 hover:text-white hover:bg-rose-500/80'
                    : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                } transition cursor-pointer"
              >
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>
          <div class="flex items-center justify-between gap-2 w-full text-[11px]">
            <span class="truncate font-semibold ${
              isSelected ? 'text-blue-100' : 'text-slate-500'
            }">
              ${escapeHtml(subLabel)} • ${escapeHtml(batchTag)}
            </span>
            <span class="shrink-0 font-bold whitespace-nowrap ${
              isSelected
                ? 'text-emerald-200'
                : paidCnt === count && count > 0
                ? 'text-emerald-600'
                : 'text-slate-500'
            }">
              ${paidCnt}/${count} đóng (${paidPct}%)
            </span>
          </div>
          <div class="class-card-progress-track">
            <div class="class-card-progress-fill" style="width: ${paidPct}%"></div>
          </div>
        </div>
      `;
      })
      .join('');
  }

  const classDropdown = document.getElementById('classbook-class-dropdown');
  if (classDropdown) {
    classDropdown.innerHTML = classNames
      .map(cls => {
        const count = (appState.students || []).filter(s => s.className === cls).length;
        const cCfg = map[cls] || {};
        return `<option value="${escapeAttr(cls)}" ${
          cls === selectedClassbookClass ? 'selected' : ''
        }>Lớp ${escapeHtml(cls)} - ${escapeHtml(cCfg.batchLabel || 'Đang học')} (${count} HS)</option>`;
      })
      .join('');
  }

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
    const cbStatsCtx = buildStudentStatsContext(map);
    stTbody.innerHTML = classStudents
      .map((s, idx) => {
        const isPaid = s.status === 'Đã hoàn thành';
        const isPending = s.status === 'Chờ duyệt';
        const stats = getStudentStatistics(s, cbStatsCtx);
        const statusCellClass = isPaid
          ? 'status-cell-paid'
          : isPending
          ? 'status-cell-pending'
          : 'status-cell-unpaid';

        return `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-2 px-2 text-center font-semibold text-slate-600">${idx + 1}</td>
            <td class="py-2 px-3">
              <div class="w-full flex items-center justify-between gap-2">
                <button
                  type="button"
                  onclick="openStudentDetailModal('${s.id}')"
                  title="Bấm để xem thông tin chi tiết của học sinh ${escapeAttr(s.fullName)}"
                  class="font-bold text-slate-900 hover:text-blue-600 hover:underline text-left cursor-pointer truncate"
                >
                  ${escapeHtml(s.fullName)}
                </button>
                <button
                  type="button"
                  onclick="openStudentDetailModal('${s.id}')"
                  title="Xem hồ sơ chi tiết của học sinh ${escapeAttr(s.fullName)}"
                  class="stu-detail-inline-btn shrink-0 ml-auto px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white text-xs font-extrabold border border-blue-200 transition cursor-pointer whitespace-nowrap"
                >
                  Chi tiết
                </button>
              </div>
              <div class="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                <span class="tabular-nums text-slate-400">${escapeHtml(s.studentCode)}</span>
                <span>• Học từ: <strong class="text-slate-700">${escapeHtml(stats.startDateVN)}</strong></span>
                <div class="inline-flex items-center rounded-md border ${
                  stats.paidBatchesCount > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-100 border-slate-200'
                } overflow-hidden">
                  <button
                    type="button"
                    onclick="adjustStudentPaidBatches('${s.id}', -1)"
                    title="Giảm 1 đợt đã đóng"
                    class="w-4 h-4 flex items-center justify-center font-black text-slate-600 hover:bg-rose-100 hover:text-rose-700 transition cursor-pointer select-none leading-none"
                  >−</button>
                  <span class="px-1.5 py-0.2 ${
                    stats.paidBatchesCount > 0 ? 'text-emerald-700 font-bold' : 'text-slate-500 font-semibold'
                  }">Đã đóng: ${stats.paidBatchesCount} đợt</span>
                  <button
                    type="button"
                    onclick="adjustStudentPaidBatches('${s.id}', 1)"
                    title="Tăng 1 đợt đã đóng"
                    class="w-4 h-4 flex items-center justify-center font-black text-slate-600 hover:bg-emerald-100 hover:text-emerald-700 transition cursor-pointer select-none leading-none"
                  >+</button>
                </div>
                ${
                  stats.previousClasses && stats.previousClasses.length > 0
                    ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[10px]" title="Lịch sử lớp học trước đây"><i data-lucide="arrow-right-left" class="w-2.5 h-2.5"></i><span>Đã học: Lớp ${escapeHtml(
                        stats.previousClasses.join(', ')
                      )}</span></span>`
                    : ''
                }
              </div>
            </td>
            <td class="py-1.5 px-2 text-right font-semibold text-slate-800">
              <select
                onchange="handleClassbookFeeSelect('${s.id}', this.value)"
                title="Bấm để tùy chọn mức học phí hoặc tính theo số buổi cho học sinh này"
                class="bg-transparent hover:bg-blue-50/70 rounded px-1 py-0.5 text-xs font-extrabold text-right text-slate-900 focus:outline-none cursor-pointer w-full"
              >
                ${getPresetTuitionOptionsHtml(s.tuitionFee, s, map)}
                <option value="PER_SESSION">⚡ Tính theo số buổi...</option>
                <option value="CUSTOM">+ Nhập số khác...</option>
              </select>
              ${
                stats.feeMode === 'PER_SESSION' && stats.perSessionRate > 0
                  ? `<button type="button" onclick="handleClassbookFeeSelect('${s.id}', 'PER_SESSION')" title="Đang tính học phí theo số buổi dạy của lớp (Bấm để đổi đơn giá/buổi)" class="block ml-auto mt-0.5 px-1.5 py-0.2 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-extrabold cursor-pointer whitespace-nowrap">${toShortMoney(
                      stats.perSessionRate
                    )}k/b × ${stats.lastSessionCount || getClassTotalSessionsCount(s.className, map)}b</button>`
                  : ''
              }
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
                class="status-select bg-transparent text-xs font-bold text-center focus:outline-none cursor-pointer w-full"
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
                <button onclick="openStudentDetailModal('${s.id}')" title="Xem thông tin chi tiết học sinh" class="p-1 text-blue-600 hover:bg-blue-50 rounded cursor-pointer">
                  <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="openTransferStudentModal('${s.id}')" title="Chuyển học sinh sang lớp khác (đồng bộ lịch sử)" class="p-1 text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer">
                  <i data-lucide="arrow-right-left" class="w-3.5 h-3.5"></i>
                </button>
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
  if (typeof scheduleStickyHeaderSync === 'function') {
    requestAnimationFrame(() => scheduleStickyHeaderSync(true));
  }
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

function getClassTotalSessionsCount(className, scheduleMap = null) {
  if (!className) return 0;
  const map = scheduleMap || (typeof getClassSchedulesMap === 'function' ? getClassSchedulesMap() : {});
  const cfg = map[className];
  if (!cfg) return 0;
  return typeof countCheckedSessionsInConfig === 'function' ? countCheckedSessionsInConfig(cfg) : 0;
}

function recalcPerSessionTuitionForClass(className, scheduleMap = null) {
  if (!className) return 0;
  const map = scheduleMap || (typeof getClassSchedulesMap === 'function' ? getClassSchedulesMap() : {});
  const sessionsCnt = getClassTotalSessionsCount(className, map);
  if (sessionsCnt <= 0) return 0;

  const metaMap = getStudentMetaMap();
  let updatedCount = 0;
  const nowStr = getCurrentDateTimeString();

  (appState.students || []).forEach(s => {
    if (s.className !== className) return;
    const codeKey = s.studentCode || s.id;
    const meta = metaMap[codeKey] || metaMap[String(codeKey).toUpperCase()];
    if (meta && meta.feeMode === 'PER_SESSION') {
      const rate = normalizeStoredVnd(meta.perSessionRate) || 0;
      if (rate > 0) {
        const nextFee = rate * sessionsCnt;
        meta.lastSessionCount = sessionsCnt;
        if (normalizeStoredVnd(s.tuitionFee) !== nextFee) {
          s.tuitionFee = nextFee;
          recordExactSmallAmount(appState, s.id, s.studentCode, nextFee);
          s.updatedAt = nowStr;
          updatedCount++;
        }
      }
    }
  });

  if (updatedCount > 0) {
    if (!appState.settings) appState.settings = {};
    appState.settings.studentMetaJson = JSON.stringify(metaMap);
  }
  return updatedCount;
}

function getPresetTuitionOptionsHtml(currentFee, student = null, scheduleMap = null) {
  const hasExplicitVal = currentFee !== undefined && currentFee !== null && String(currentFee).trim() !== '';
  const cur = hasExplicitVal ? normalizeStoredVnd(currentFee) : 600000;
  const presets = [0, 200000, 400000, 500000, 600000, 700000, 800000, 900000, 1000000, 1200000, 1500000, 2000000];
  if (cur >= 0 && !presets.includes(cur)) {
    presets.push(cur);
    presets.sort((a, b) => a - b);
  }
  return presets
    .map(val => `<option value="${val}" ${val === cur ? 'selected' : ''}>${val === 0 ? '0' : toShortMoney(val)}</option>`)
    .join('');
}

async function handleClassbookFeeSelect(studentId, selectedVal) {
  const s = appState.students.find(item => item.id === studentId);
  if (!s) return;

  const metaMap = getStudentMetaMap();
  const codeKey = s.studentCode || s.id;
  if (!metaMap[codeKey]) metaMap[codeKey] = {};

  if (selectedVal === 'PER_SESSION') {
    const map = typeof getClassSchedulesMap === 'function' ? getClassSchedulesMap() : {};
    const checkedSessions = getClassTotalSessionsCount(s.className, map);
    const curRate =
      metaMap[codeKey].perSessionRate !== undefined && metaMap[codeKey].perSessionRate !== null
        ? normalizeStoredVnd(metaMap[codeKey].perSessionRate)
        : 75000;
    const defaultSessionNum = checkedSessions > 0 ? checkedSessions : Number(metaMap[codeKey].lastSessionCount || 8);

    const res = await showTcAppDialog({
      mode: 'fields',
      tone: 'emerald',
      badge: 'THANH CHÍ EDU • TÍNH HỌC PHÍ THEO SỐ BUỔI',
      title: `Tính học phí theo số buổi - ${s.fullName}`,
      message: `Lớp ${s.className} hiện có Tổng cộng số buổi dạy: ${checkedSessions} buổi. Nhập đơn giá 1 buổi học, hệ thống sẽ nhân với số buổi dạy của lớp (và tự động cập nhật khi bạn tích thêm/bớt buổi dạy trên lịch):`,
      okText: 'Tính & Lưu học phí',
      moneyPreview: true,
      fields: [
        {
          key: 'rateInput',
          label: '1. Đơn giá 1 buổi học (Rút gọn 000 hoặc đầy đủ - VD: 50, 60, 75, 100 = 50.000₫..100.000₫/buổi)',
          type: 'text',
          defaultValue: String(toShortMoney(curRate)),
          placeholder: 'VD: 75 (= 75.000 ₫/buổi)',
          moneyPreview: true
        },
        {
          key: 'sessionCount',
          label: `2. Số buổi học để nhân (Mặc định lấy Tổng cộng số buổi dạy của lớp = ${checkedSessions} buổi)`,
          type: 'number',
          defaultValue: String(defaultSessionNum),
          placeholder: 'Nhập số buổi học...',
          moneyPreview: true
        },
        {
          key: 'applyScope',
          label: '3. Phạm vi áp dụng',
          type: 'select',
          defaultValue: 'SINGLE',
          options: [
            { value: 'SINGLE', label: `Chỉ áp dụng cho học sinh ${s.fullName}` },
            { value: 'WHOLE_CLASS', label: `Áp dụng đơn giá/buổi này cho toàn bộ học sinh Lớp ${s.className}` }
          ]
        }
      ]
    });

    if (!res) {
      renderAdminClassbook();
      renderAdminStudents();
      return;
    }

    const rateVnd = fromShortMoney(res.rateInput);
    const sessions = Math.max(1, parseInt(res.sessionCount, 10) || checkedSessions || 1);
    if (isNaN(rateVnd) || rateVnd < 0) {
      showToast('Đơn giá 1 buổi học không hợp lệ!', 'warning');
      renderAdminClassbook();
      renderAdminStudents();
      return;
    }

    const totalFee = rateVnd * sessions;
    const nowStr = getCurrentDateTimeString();
    const liveStu =
      (appState.students || []).find(
        item => item && (item.id === studentId || (s.studentCode && item.studentCode === s.studentCode))
      ) || s;
    const targetStudents =
      res.applyScope === 'WHOLE_CLASS'
        ? (appState.students || []).filter(item => item.className === liveStu.className)
        : [liveStu];

    targetStudents.forEach(stu => {
      const k = stu.studentCode || stu.id;
      if (!metaMap[k]) metaMap[k] = {};
      metaMap[k].feeMode = 'PER_SESSION';
      metaMap[k].perSessionRate = rateVnd;
      metaMap[k].lastSessionCount = sessions;
      stu.tuitionFee = totalFee;
      recordExactSmallAmount(appState, stu.id, stu.studentCode, totalFee);
      stu.updatedAt = nowStr;
    });

    if (!appState.settings) appState.settings = {};
    appState.settings.studentMetaJson = JSON.stringify(metaMap);
    saveStateToLocal();
    await triggerAutoSyncIfNeeded(
      res.applyScope === 'WHOLE_CLASS'
        ? `Đã áp dụng học phí theo buổi (${formatCurrency(rateVnd)}/buổi × ${sessions} buổi = ${formatCurrency(totalFee)}) cho cả Lớp ${liveStu.className}!`
        : `Đã cập nhật học phí theo buổi của ${liveStu.fullName}: ${formatCurrency(rateVnd)}/buổi × ${sessions} buổi = ${formatCurrency(totalFee)}!`
    );
    return;
  }

  let newFee = fromShortMoney(selectedVal);
  if (selectedVal === 'CUSTOM') {
    const input = await appPrompt(
      `Nhập mức học phí mới cho học sinh ${s.fullName} (Có thể nhập rút gọn 3 số 000 hoặc nhập đầy đủ - VD: nhập 600 hoặc 600000 đều = 600.000 ₫):`,
      String(s.tuitionFee !== undefined && s.tuitionFee !== null ? toShortMoney(s.tuitionFee) : 600),
      {
        title: `Cập nhật học phí - ${s.fullName}`,
        badge: 'THANH CHÍ EDU • HỌC PHÍ',
        tone: 'emerald',
        moneyPreview: true,
        okText: 'Lưu học phí'
      }
    );
    if (input === null) {
      renderAdminClassbook();
      renderAdminStudents();
      return;
    }
    newFee = fromShortMoney(input);
  }

  if (isNaN(newFee) || newFee < 0) {
    renderAdminClassbook();
    renderAdminStudents();
    return;
  }

  const liveStu =
    (appState.students || []).find(
      item => item && (item.id === studentId || (s.studentCode && item.studentCode === s.studentCode))
    ) || s;

  // Khi chọn mức học phí cố định, tắt chế độ nhân tự động theo buổi
  metaMap[codeKey].feeMode = 'FIXED';
  if (!appState.settings) appState.settings = {};
  appState.settings.studentMetaJson = JSON.stringify(metaMap);

  liveStu.tuitionFee = newFee;
  recordExactSmallAmount(appState, liveStu.id, liveStu.studentCode, newFee);
  liveStu.updatedAt = getCurrentDateTimeString();
  saveStateToLocal();
  await triggerAutoSyncIfNeeded(`Đã cập nhật học phí của ${liveStu.fullName} thành ${formatCurrency(newFee)}!`);
}

async function handleAllStudentsFeeSelect(studentId, selectedVal) {
  return handleClassbookFeeSelect(studentId, selectedVal);
}

function setClassbookQuickFee(amount) {
  const feeInput = document.getElementById('cb-quick-fee');
  if (feeInput) {
    feeInput.value = toShortMoney(amount);
  }
}

function generateNextStudentCode() {
  const list = appState.students || [];
  let maxNum = Math.max(130, list.length);
  const bumpFromCode = code => {
    const m = String(code || '').match(/(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  };
  list.forEach(s => bumpFromCode(s.studentCode));
  (appState.transactions || []).forEach(t => bumpFromCode(t.studentCode));
  (appState.paymentRequests || []).forEach(r => bumpFromCode(r.studentCode));
  const historyList = typeof getClassHistoryList === 'function' ? getClassHistoryList() : [];
  historyList.forEach(h => (h.studentsSnapshot || []).forEach(hs => bumpFromCode(hs.studentCode)));
  return 'HS' + String(maxNum + 1).padStart(3, '0');
}

async function quickAddStudentInClassbook(event) {
  event.preventDefault();
  const nameInput = document.getElementById('cb-quick-name');
  const phoneInput = document.getElementById('cb-quick-phone');
  const feeInput = document.getElementById('cb-quick-fee');

  const fullName = (nameInput?.value || '').trim();
  const parentPhone = (phoneInput?.value || '').trim();
  const tuitionFee = fromShortMoney(feeInput?.value);

  if (!fullName) {
    showToast('Vui lòng nhập Họ và tên học sinh!', 'warning');
    nameInput?.focus();
    return;
  }

  const map = getClassSchedulesMap();
  const activeClassNames = typeof sortClassNamesStandard === 'function'
    ? sortClassNamesStandard(Object.keys(map))
    : Object.keys(map);
  const dropdownClassVal = (document.getElementById('classbook-class-dropdown')?.value || '').trim();
  const targetClass =
    (selectedClassbookClass && map[selectedClassbookClass] ? selectedClassbookClass : '') ||
    (dropdownClassVal && map[dropdownClassVal] ? dropdownClassVal : '') ||
    activeClassNames[0] ||
    selectedClassbookClass ||
    'Lớp mới';
  selectedClassbookClass = targetClass;
  unmarkClassAsDeletedInState(targetClass);
  const cfg = map[targetClass] || { ...getDefaultClassScheduleConfig(targetClass), className: targetClass };
  if (!map[targetClass]) {
    map[targetClass] = cfg;
  }
  const period = cfg.periodLabel || appState.settings?.defaultPeriod || 'Tháng 10-11/2026';
  const nowStr = getCurrentDateTimeString();
  const newCode = generateNextStudentCode();
  const newId = 'ST_' + Date.now();

  recordExactSmallAmount(appState, newId, newCode, tuitionFee);

  const metaMap = getStudentMetaMap();
  metaMap[newCode] = {
    ...(metaMap[newCode] || {}),
    startDate: cfg.startDate || new Date().toISOString().slice(0, 10),
    manualPaidBatches: 0
  };
  if (!appState.settings) appState.settings = {};
  appState.settings.classSchedulesJson = JSON.stringify(map);
  appState.settings.studentMetaJson = JSON.stringify(metaMap);

  const newStudent = {
    id: newId,
    studentCode: newCode,
    fullName,
    className: targetClass,
    parentName: '',
    parentPhone,
    period,
    tuitionFee,
    status: 'Chưa đóng',
    receiptUrl: '',
    updatedAt: nowStr,
    note: ''
  };

  if (!appState.students) appState.students = [];
  appState.students.push(newStudent);

  if (nameInput) nameInput.value = '';
  if (phoneInput) phoneInput.value = '';
  nameInput?.focus();

  saveStateToLocal();
  await triggerAutoSyncIfNeeded(
    `Đã thêm học sinh "${fullName}" (${formatCurrency(tuitionFee)}) vào lớp ${targetClass} & cập nhật danh sách Tất cả Học sinh!`
  );
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
        const mm = String(cellDate.getMonth() + 1).padStart(2, '0'); /* taste-skill-ignore */
        const dd = String(cellDate.getDate()).padStart(2, '0'); /* taste-skill-ignore */
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
  const checkedSessions = taughtCount + confirmedCount;
  const colWidthPct = (100 / colCount).toFixed(2) + '%';
  const batchText = (cfg.batchLabel || 'ĐỢT SỐ 5').trim();
  const cleanPeriod =
    String(cfg.periodLabel || 'THÁNG 10-11/2026')
      .replace(/\(\s*ĐỢT[^)]*\)/gi, '')
      .trim() || 'THÁNG HIỆN TẠI';

  thead.innerHTML = `
    <tr class="sheet-navy-header">
      <th colspan="${colCount}" class="py-3 px-4 border-b border-blue-900/60">
        <div class="flex items-center justify-between gap-2.5">
          <span class="font-extrabold text-sm sm:text-base uppercase tracking-normal text-left leading-tight">
            SỐ BUỔI HỌC CỦA ${escapeHtml(cleanPeriod)}
          </span>
          <div class="inline-flex items-center rounded-xl bg-amber-400 text-slate-950 font-black text-sm sm:text-base uppercase tracking-normal shrink-0  overflow-hidden">
            <button
              type="button"
              onclick="adjustCurrentClassBatchNumber(-1)"
              title="Giảm đợt học của lớp"
              class="px-2.5 py-1.5 hover:bg-amber-500/80 active:bg-amber-600 text-slate-950 font-black transition cursor-pointer select-none leading-none"
            >−</button>
            <span class="px-2 py-1.5 border-x border-amber-500/40">
              ${escapeHtml(batchText)}
            </span>
            <button
              type="button"
              onclick="adjustCurrentClassBatchNumber(1)"
              title="Tăng đợt học của lớp"
              class="px-2.5 py-1.5 hover:bg-amber-500/80 active:bg-amber-600 text-slate-950 font-black transition cursor-pointer select-none leading-none"
            >+</button>
          </div>
        </div>
      </th>
    </tr>
    <tr class="bg-slate-100 border-b-2 border-slate-300">
      <td colspan="${colCount}" class="py-2.5 px-4">
        <div class="flex items-center justify-between gap-2.5">
          <span class="font-extrabold text-xs sm:text-sm uppercase tracking-normal text-slate-800">
            TỔNG CỘNG SỐ BUỔI DẠY
          </span>
          <span class="px-4 py-1 rounded-full bg-blue-600 text-white font-black text-sm sm:text-base  shrink-0">
            ${checkedSessions} buổi
          </span>
        </div>
      </td>
    </tr>
    <tr class="bg-[#25477d] text-white font-extrabold text-xs sm:text-sm uppercase tracking-normal">
      ${orderedCols
        .map(d => `<th style="width: ${colWidthPct}" class="py-2.5 px-1.5 border border-slate-300/40">${DAY_LABELS[d]}</th>`)
        .join('')}
    </tr>
  `;

  if (weeks.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${colCount}" class="py-8 text-center text-slate-400 text-xs">
          Chưa có ngày học trong khoảng đã chọn. Hãy bấm <strong>"Cài đặt Lịch học"</strong> để chọn Từ ngày &rarr; Đến ngày.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = weeks
    .map(row => {
      const cellsHtml = row
        .map(cell => {
          if (!cell.inRange) {
            return `<td style="width: ${colWidthPct}" class="py-2.5 px-1.5 bg-slate-50/80 text-slate-300 font-medium select-none h-[42px]">–</td>`;
          }
          const st = Number(states[cell.dateKey] || 0);
          const prefix = st === 1 ? '' : st === 2 ? '' : st === 3 ? '' : '';
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
              style="width: ${colWidthPct}"
              onclick="toggleSessionDateState('${escapeAttr(cfg.className)}', '${cell.dateKey}')"
              title="${titleTip}"
              class="py-2.5 px-1.5 session-cell session-state-${st} text-xs sm:text-sm"
            >
              ${prefix}${cell.label}
            </td>
          `;
        })
        .join('');

      return `
        <tr>
          ${cellsHtml}
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
  recalcPerSessionTuitionForClass(className, map);
  saveClassSchedulesMap(map);
}

// ============================================================================
// PHÂN HỆ ĐIỂM DANH HỌC SINH CHUYÊN BIỆT THEO LỚP & TỰ ĐỘNG QUA NGÀY HÔM SAU
// ============================================================================
let currentAttendanceBrush = 'cycle';
let selectedAttendanceGradeFilter = 'ALL';

const SHORT_DAY_LABELS = {
  1: 'T2',
  2: 'T3',
  3: 'T4',
  4: 'T5',
  5: 'T6',
  6: 'T7',
  0: 'CN'
};

function getTodayDateKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0'); /* taste-skill-ignore */
  const dd = String(now.getDate()).padStart(2, '0'); /* taste-skill-ignore */
  return `${yyyy}-${mm}-${dd}`;
}

function isAutoAttendanceEnabled() {
  const raw = appState?.settings?.autoAttendanceNextDay;
  if (raw === false || raw === 'false' || raw === '0') return false;
  return true;
}

function getStudentAttendanceMap() {
  try {
    if (appState?.settings?.studentAttendanceJson) {
      return JSON.parse(appState.settings.studentAttendanceJson) || {};
    }
  } catch (e) {}
  return {};
}

function saveStudentAttendanceMap(attMap, scheduleMap = null, syncMsg = '') {
  if (!appState.settings) appState.settings = {};
  appState.settings.studentAttendanceJson = JSON.stringify(attMap || {});
  if (scheduleMap) {
    appState.settings.classSchedulesJson = JSON.stringify(scheduleMap);
  }
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

function setAttendanceBrush(brushMode) {
  currentAttendanceBrush = brushMode;
  const modes = ['cycle', 1, 2, 3, 0];
  modes.forEach(m => {
    const btn = document.getElementById('att-brush-btn-' + m);
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

function setAttendanceGradeFilter(gradeKey) {
  selectedAttendanceGradeFilter = gradeKey || 'ALL';
  const map = getClassSchedulesMap();
  const classNames = getOrderedClassNamesList(map);
  if (selectedAttendanceGradeFilter !== 'ALL') {
    const matching = classNames.filter(c => getGradeCategoryForClassName(c) === selectedAttendanceGradeFilter);
    if (matching.length > 0 && !matching.includes(selectedClassbookClass)) {
      selectedClassbookClass = matching[0];
    }
  }
  renderAdminAttendance();
}

function getOrderedClassNamesList(mapObj) {
  const m = mapObj || getClassSchedulesMap();
  return typeof sortClassNamesStandard === 'function'
    ? sortClassNamesStandard(Object.keys(m))
    : Object.keys(m);
}

function selectAttendanceClass(className) {
  if (!className) return;
  selectedClassbookClass = className;
  renderAdminAttendance();
  renderAdminClassbook();
}

function getScheduledSessionListForConfig(cfg) {
  if (!cfg) return [];
  const { orderedCols, weeks } = generateScheduleWeeks(cfg.startDate, cfg.endDate, cfg.daysOfWeek);
  const sessions = [];
  weeks.forEach(row => {
    row.forEach((cell, colIdx) => {
      if (cell && cell.inRange && cell.dateKey) {
        const dayNum = orderedCols[colIdx] ?? 1;
        sessions.push({
          dateKey: cell.dateKey,
          label: cell.label,
          dayNum,
          dayShort: SHORT_DAY_LABELS[dayNum] || 'T2'
        });
      }
    });
  });
  sessions.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  return sessions.map((item, idx) => ({
    ...item,
    sessionNumber: idx + 1
  }));
}

function getEffectiveStudentSessionState(className, studentId, dateKey, cfg, attMap, todayKey, autoEnabled) {
  const manualVal = attMap?.[className]?.[dateKey]?.[studentId];
  if (manualVal !== undefined && manualVal !== null) {
    return {
      state: Number(manualVal) || 0,
      isAuto: false
    };
  }

  // Nếu giáo viên chưa bấm điểm danh và buổi học đã qua sang ngày hôm sau (dateKey < todayKey)
  const sessionCalState = Number(cfg?.sessionStates?.[dateKey] || 0);
  if (autoEnabled && dateKey < todayKey && sessionCalState !== 3) {
    return {
      state: 1, // Tự động điểm danh Có mặt
      isAuto: true
    };
  }

  return {
    state: 0,
    isAuto: false
  };
}

function toggleAutoAttendanceNextDay(enabled) {
  if (!appState.settings) appState.settings = {};
  appState.settings.autoAttendanceNextDay = Boolean(enabled);
  saveStateToLocal();
  const msg = enabled
    ? 'Đã BẬT cơ chế tự động điểm danh khi sang ngày hôm sau!'
    : 'Đã TẮT cơ chế tự động điểm danh qua ngày (chỉ hiển thị các buổi điểm danh thủ công).';
  triggerAutoSyncIfNeeded(msg);
}

function commitAutoAttendanceForCurrentClass() {
  const map = getClassSchedulesMap();
  const classNames = getOrderedClassNamesList(map);
  const targetClass = selectedClassbookClass || classNames[0] || '';
  if (!targetClass) return;

  const cfg = map[targetClass] || getDefaultClassScheduleConfig(targetClass);
  const sessions = getScheduledSessionListForConfig(cfg);
  const classStudents = (appState.students || []).filter(s => s.className === targetClass);
  if (classStudents.length === 0 || sessions.length === 0) {
    showToast('Lớp này chưa có học sinh hoặc lịch buổi học để chốt!', 'warning');
    return;
  }

  const todayKey = getTodayDateKey();
  const attMap = getStudentAttendanceMap();
  if (!attMap[targetClass]) attMap[targetClass] = {};
  if (!cfg.sessionStates) cfg.sessionStates = {};

  let committedSessions = 0;
  sessions.forEach(sess => {
    if (sess.dateKey < todayKey && Number(cfg.sessionStates[sess.dateKey] || 0) !== 3) {
      if (!attMap[targetClass][sess.dateKey]) attMap[targetClass][sess.dateKey] = {};
      let anyAutoInSession = false;
      classStudents.forEach(stu => {
        if (attMap[targetClass][sess.dateKey][stu.id] === undefined) {
          attMap[targetClass][sess.dateKey][stu.id] = 1;
          anyAutoInSession = true;
        }
      });
      if (!cfg.sessionStates[sess.dateKey]) {
        cfg.sessionStates[sess.dateKey] = 1;
      }
      if (anyAutoInSession) committedSessions++;
    }
  });

  map[targetClass] = cfg;
  saveStudentAttendanceMap(
    attMap,
    map,
    committedSessions > 0
      ? `Đã chốt cố định ${committedSessions} buổi điểm danh tự động cho lớp ${targetClass}!`
      : `Tất cả các buổi đã qua của lớp ${targetClass} đều đã được chốt lưu!`
  );
}

function syncSessionCalendarStateFromStudents(cfg, classStudents, classAttObj, dateKey) {
  if (!cfg.sessionStates) cfg.sessionStates = {};
  const dayObj = classAttObj?.[dateKey] || {};
  let hasPresentOrExcused = false;
  let allExplicitZero = classStudents.length > 0;

  classStudents.forEach(stu => {
    const v = Number(dayObj[stu.id] || 0);
    if (v === 1 || v === 3) hasPresentOrExcused = true;
    if (v !== 0) allExplicitZero = false;
  });

  if (hasPresentOrExcused) {
    if (!cfg.sessionStates[dateKey] || cfg.sessionStates[dateKey] === 3) {
      cfg.sessionStates[dateKey] = 1;
    }
  } else if (allExplicitZero) {
    delete cfg.sessionStates[dateKey];
  }
}

function toggleStudentSessionAttendance(className, studentId, dateKey) {
  if (!className || !studentId || !dateKey) return;
  const map = getClassSchedulesMap();
  const cfg = map[className] || getDefaultClassScheduleConfig(className);
  const classStudents = (appState.students || []).filter(s => s.className === className);
  const attMap = getStudentAttendanceMap();
  const todayKey = getTodayDateKey();
  const autoEnabled = isAutoAttendanceEnabled();

  if (!attMap[className]) attMap[className] = {};
  if (!attMap[className][dateKey]) attMap[className][dateKey] = {};

  // Nếu buổi này đang là tự động điểm danh, khi giáo viên bấm sửa 1 học sinh thì giữ nguyên các bạn còn lại là Có mặt (1)
  if (autoEnabled && dateKey < todayKey && Number(cfg.sessionStates?.[dateKey] || 0) !== 3) {
    classStudents.forEach(stu => {
      if (stu.id !== studentId && attMap[className][dateKey][stu.id] === undefined) {
        attMap[className][dateKey][stu.id] = 1;
      }
    });
  }

  const eff = getEffectiveStudentSessionState(
    className,
    studentId,
    dateKey,
    cfg,
    attMap,
    todayKey,
    autoEnabled
  );

  let nextState = 1;
  if (currentAttendanceBrush === 'cycle') {
    // 0 (Chưa ĐD) -> 1 (Có mặt) -> 2 (Vắng) -> 3 (Có phép) -> 0
    nextState = (eff.state + 1) % 4;
  } else {
    const targetBrush = Number(currentAttendanceBrush) || 0;
    nextState = eff.state === targetBrush && !eff.isAuto ? 0 : targetBrush;
  }

  attMap[className][dateKey][studentId] = nextState;
  syncSessionCalendarStateFromStudents(cfg, classStudents, attMap[className], dateKey);
  map[className] = cfg;
  saveStudentAttendanceMap(attMap, map);
}

function toggleWholeSessionAttendance(className, dateKey) {
  if (!className || !dateKey) return;
  const map = getClassSchedulesMap();
  const cfg = map[className] || getDefaultClassScheduleConfig(className);
  const classStudents = (appState.students || []).filter(s => s.className === className);
  if (classStudents.length === 0) {
    showToast('Lớp này chưa có học sinh để điểm danh!', 'warning');
    return;
  }

  const attMap = getStudentAttendanceMap();
  if (!attMap[className]) attMap[className] = {};
  if (!attMap[className][dateKey]) attMap[className][dateKey] = {};
  if (!cfg.sessionStates) cfg.sessionStates = {};

  const allManualPresent = classStudents.every(stu => attMap[className][dateKey][stu.id] === 1);
  const targetVal = allManualPresent ? 0 : 1;

  classStudents.forEach(stu => {
    attMap[className][dateKey][stu.id] = targetVal;
  });

  if (targetVal === 1) {
    cfg.sessionStates[dateKey] = 1;
  } else {
    delete cfg.sessionStates[dateKey];
  }

  map[className] = cfg;
  saveStudentAttendanceMap(
    attMap,
    map,
    targetVal === 1
      ? `Đã điểm danh Có mặt toàn bộ ${classStudents.length} HS cho buổi ngày ${formatShortDateVN(dateKey)}!`
      : `Đã bỏ chọn điểm danh buổi ngày ${formatShortDateVN(dateKey)}.`
  );
}

function markAllSessionsForSingleStudent(className, studentId) {
  if (!className || !studentId) return;
  const map = getClassSchedulesMap();
  const cfg = map[className] || getDefaultClassScheduleConfig(className);
  const sessions = getScheduledSessionListForConfig(cfg);
  const stu = (appState.students || []).find(s => s.id === studentId);
  if (!stu || sessions.length === 0) return;

  const attMap = getStudentAttendanceMap();
  if (!attMap[className]) attMap[className] = {};
  if (!cfg.sessionStates) cfg.sessionStates = {};

  const allPresent = sessions.every(sess => attMap[className]?.[sess.dateKey]?.[studentId] === 1);
  const targetVal = allPresent ? 0 : 1;

  sessions.forEach(sess => {
    if (!attMap[className][sess.dateKey]) attMap[className][sess.dateKey] = {};
    attMap[className][sess.dateKey][studentId] = targetVal;
    if (targetVal === 1 && !cfg.sessionStates[sess.dateKey]) {
      cfg.sessionStates[sess.dateKey] = 1;
    }
  });

  map[className] = cfg;
  saveStudentAttendanceMap(
    attMap,
    map,
    targetVal === 1
      ? `Đã điểm danh Có mặt tất cả ${sessions.length} buổi cho học sinh ${stu.fullName}!`
      : `Đã đặt lại điểm danh các buổi của học sinh ${stu.fullName}.`
  );
}

function markAllAttendanceLatestSession() {
  const map = getClassSchedulesMap();
  const classNames = getOrderedClassNamesList(map);
  const targetClass = selectedClassbookClass || classNames[0] || '';
  if (!targetClass) return;

  const cfg = map[targetClass] || getDefaultClassScheduleConfig(targetClass);
  const sessions = getScheduledSessionListForConfig(cfg);
  const classStudents = (appState.students || []).filter(s => s.className === targetClass);
  if (classStudents.length === 0 || sessions.length === 0) {
    showToast('Vui lòng thêm học sinh và lịch buổi học trước khi điểm danh!', 'warning');
    return;
  }

  const todayKey = getTodayDateKey();
  // Ưu tiên buổi hôm nay, nếu không có thì lấy buổi gần nhất <= hôm nay, hoặc buổi đầu tiên
  let targetSession = sessions.find(s => s.dateKey === todayKey);
  if (!targetSession) {
    const pastOrToday = sessions.filter(s => s.dateKey <= todayKey);
    targetSession = pastOrToday.length > 0 ? pastOrToday[pastOrToday.length - 1] : sessions[0];
  }

  const attMap = getStudentAttendanceMap();
  if (!attMap[targetClass]) attMap[targetClass] = {};
  if (!attMap[targetClass][targetSession.dateKey]) attMap[targetClass][targetSession.dateKey] = {};
  if (!cfg.sessionStates) cfg.sessionStates = {};

  classStudents.forEach(stu => {
    attMap[targetClass][targetSession.dateKey][stu.id] = 1;
  });
  cfg.sessionStates[targetSession.dateKey] = 1;

  map[targetClass] = cfg;
  saveStudentAttendanceMap(
    attMap,
    map,
    `Đã điểm danh Có mặt toàn bộ ${classStudents.length} HS cho Buổi ${targetSession.sessionNumber} (${targetSession.dayShort} ${targetSession.label})!`
  );
}

function markAllAttendanceUpToToday() {
  const map = getClassSchedulesMap();
  const classNames = getOrderedClassNamesList(map);
  const targetClass = selectedClassbookClass || classNames[0] || '';
  if (!targetClass) return;

  const cfg = map[targetClass] || getDefaultClassScheduleConfig(targetClass);
  const sessions = getScheduledSessionListForConfig(cfg);
  const classStudents = (appState.students || []).filter(s => s.className === targetClass);
  if (classStudents.length === 0 || sessions.length === 0) {
    showToast('Vui lòng thêm học sinh và lịch buổi học trước khi điểm danh!', 'warning');
    return;
  }

  const todayKey = getTodayDateKey();
  let targetSessions = sessions.filter(s => s.dateKey <= todayKey);
  if (targetSessions.length === 0) {
    targetSessions = sessions;
  }

  const attMap = getStudentAttendanceMap();
  if (!attMap[targetClass]) attMap[targetClass] = {};
  if (!cfg.sessionStates) cfg.sessionStates = {};

  targetSessions.forEach(sess => {
    if (!attMap[targetClass][sess.dateKey]) attMap[targetClass][sess.dateKey] = {};
    classStudents.forEach(stu => {
      const cur = attMap[targetClass][sess.dateKey][stu.id];
      // Giữ nguyên nếu giáo viên đã đánh dấu Vắng (2) hoặc Có phép (3) thủ công
      if (cur !== 2 && cur !== 3) {
        attMap[targetClass][sess.dateKey][stu.id] = 1;
      }
    });
    if (cfg.sessionStates[sess.dateKey] !== 3) {
      cfg.sessionStates[sess.dateKey] = 1;
    }
  });

  map[targetClass] = cfg;
  saveStudentAttendanceMap(
    attMap,
    map,
    `Đã điểm danh toàn bộ ${targetSessions.length} buổi tính đến hôm nay cho lớp ${targetClass}!`
  );
}

function markAllAttendanceEntireBatch() {
  const map = getClassSchedulesMap();
  const classNames = getOrderedClassNamesList(map);
  const targetClass = selectedClassbookClass || classNames[0] || '';
  if (!targetClass) return;

  const cfg = map[targetClass] || getDefaultClassScheduleConfig(targetClass);
  const sessions = getScheduledSessionListForConfig(cfg);
  const classStudents = (appState.students || []).filter(s => s.className === targetClass);
  if (classStudents.length === 0 || sessions.length === 0) {
    showToast('Vui lòng thêm học sinh và lịch buổi học trước khi điểm danh!', 'warning');
    return;
  }

  const attMap = getStudentAttendanceMap();
  if (!attMap[targetClass]) attMap[targetClass] = {};
  if (!cfg.sessionStates) cfg.sessionStates = {};

  sessions.forEach(sess => {
    if (!attMap[targetClass][sess.dateKey]) attMap[targetClass][sess.dateKey] = {};
    classStudents.forEach(stu => {
      attMap[targetClass][sess.dateKey][stu.id] = 1;
    });
    cfg.sessionStates[sess.dateKey] = 1;
  });

  map[targetClass] = cfg;
  saveStudentAttendanceMap(
    attMap,
    map,
    `Đã điểm danh Có mặt toàn bộ cả đợt (${sessions.length} buổi × ${classStudents.length} HS) cho lớp ${targetClass}!`
  );
}

function clearAllAttendanceForCurrentClass() {
  const map = getClassSchedulesMap();
  const classNames = getOrderedClassNamesList(map);
  const targetClass = selectedClassbookClass || classNames[0] || '';
  if (!targetClass) return;

  const cfg = map[targetClass] || getDefaultClassScheduleConfig(targetClass);
  const sessions = getScheduledSessionListForConfig(cfg);
  const classStudents = (appState.students || []).filter(s => s.className === targetClass);

  const attMap = getStudentAttendanceMap();
  attMap[targetClass] = {};
  // Đặt rõ trạng thái 0 cho các buổi đã qua để không bị tự động điền lại nếu người dùng chủ động xóa trắng lớp này
  sessions.forEach(sess => {
    attMap[targetClass][sess.dateKey] = {};
    classStudents.forEach(stu => {
      attMap[targetClass][sess.dateKey][stu.id] = 0;
    });
  });
  cfg.sessionStates = {};
  map[targetClass] = cfg;

  saveStudentAttendanceMap(
    attMap,
    map,
    `Đã đặt lại toàn bộ dữ liệu điểm danh của lớp ${targetClass} (Có thể bấm Quay lại nếu nhầm)!`
  );
}

function getClassAttendanceStats(className, cfg, classStudents, attMap, todayKey, autoEnabled) {
  const sessions = getScheduledSessionListForConfig(cfg);
  let presentSlots = 0;
  let absentSlots = 0;
  let excusedSlots = 0;
  let trackedSlots = 0;
  let completedSessions = 0;
  let autoSessionsCount = 0;

  sessions.forEach(sess => {
    let sessionHasAny = false;
    let sessionHasAuto = false;

    if (classStudents.length === 0) {
      const calSt = Number(cfg?.sessionStates?.[sess.dateKey] || 0);
      if (calSt === 1 || calSt === 2 || (autoEnabled && sess.dateKey < todayKey && calSt !== 3)) {
        completedSessions++;
      }
      return;
    }

    classStudents.forEach(stu => {
      const eff = getEffectiveStudentSessionState(
        className,
        stu.id,
        sess.dateKey,
        cfg,
        attMap,
        todayKey,
        autoEnabled
      );
      if (eff.state === 1) {
        presentSlots++;
        trackedSlots++;
        sessionHasAny = true;
        if (eff.isAuto) sessionHasAuto = true;
      } else if (eff.state === 2) {
        absentSlots++;
        trackedSlots++;
        sessionHasAny = true;
      } else if (eff.state === 3) {
        excusedSlots++;
        trackedSlots++;
        sessionHasAny = true;
      }
    });

    if (sessionHasAny) completedSessions++;
    if (sessionHasAuto) autoSessionsCount++;
  });

  const ratePct =
    trackedSlots > 0 ? ((presentSlots + excusedSlots * 0.5) / trackedSlots) * 100 : 100;

  return {
    sessions,
    totalSessions: sessions.length,
    completedSessions,
    autoSessionsCount,
    presentSlots,
    absentSlots,
    excusedSlots,
    trackedSlots,
    ratePct: Math.min(100, Math.max(0, ratePct))
  };
}

function getGlobalAttendanceSummary() {
  const map = getClassSchedulesMap();
  const classNames = getOrderedClassNamesList(map);
  const attMap = getStudentAttendanceMap();
  const todayKey = getTodayDateKey();
  const autoEnabled = isAutoAttendanceEnabled();
  const allStudents = appState.students || [];

  let totalTaughtSessions = 0;
  let totalPresentSlots = 0;
  let totalAbsentOrExcusedSlots = 0;
  let totalTrackedSlots = 0;

  classNames.forEach(cls => {
    const cfg = map[cls] || getDefaultClassScheduleConfig(cls);
    const clsStudents = allStudents.filter(s => s.className === cls);
    const st = getClassAttendanceStats(cls, cfg, clsStudents, attMap, todayKey, autoEnabled);
    totalTaughtSessions += st.completedSessions;
    totalPresentSlots += st.presentSlots;
    totalAbsentOrExcusedSlots += st.absentSlots + st.excusedSlots;
    totalTrackedSlots += st.trackedSlots;
  });

  const attendanceRateNum =
    totalTrackedSlots > 0
      ? Math.min(100, Math.max(0, ((totalPresentSlots) / totalTrackedSlots) * 100))
      : 96.5;

  const totalStuCount = allStudents.length;
  const absentStudentsEst =
    totalTrackedSlots > 0
      ? Math.min(totalStuCount, Math.round(totalStuCount * ((100 - attendanceRateNum) / 100)))
      : 0;
  const presentStudentsEst = Math.max(0, totalStuCount - absentStudentsEst);

  return {
    classCount: classNames.length,
    taughtSessionsCount: totalTaughtSessions,
    attendanceRateNum,
    presentStudentsEst,
    absentStudentsEst
  };
}

function renderAdminAttendance() {
  const dropdown = document.getElementById('att-class-dropdown');
  const pillsContainer = document.getElementById('att-class-pills');
  const gradeFiltersEl = document.getElementById('att-grade-filters');
  const thead = document.getElementById('att-matrix-thead');
  const tbody = document.getElementById('att-matrix-tbody');
  if (!dropdown || !pillsContainer || !thead || !tbody) return;

  const map = getClassSchedulesMap();
  const classNames = getOrderedClassNamesList(map);
  if (!selectedClassbookClass || !classNames.includes(selectedClassbookClass)) {
    selectedClassbookClass = classNames[0] || '12 2K8';
  }

  const todayKey = getTodayDateKey();
  const autoEnabled = isAutoAttendanceEnabled();
  const attMap = getStudentAttendanceMap();

  // Cập nhật nhãn Hôm nay & Trạng thái Tự động điểm danh qua ngày
  const todayLabelEl = document.getElementById('att-today-label');
  if (todayLabelEl) {
    todayLabelEl.textContent = `Hôm nay: ${formatShortDateVN(todayKey)}`;
  }

  const toggleInput = document.getElementById('att-auto-nextday-toggle');
  if (toggleInput) toggleInput.checked = autoEnabled;

  const statusBadge = document.getElementById('att-auto-status-badge');
  const toggleLabel = document.getElementById('att-auto-toggle-label');
  const tabAutoBadge = document.getElementById('tab-attendance-auto-badge');
  const bannerEl = document.getElementById('att-auto-mechanism-banner');
  const iconBoxEl = document.getElementById('att-auto-icon-box');

  if (autoEnabled) {
    if (statusBadge) {
      statusBadge.textContent = 'ĐANG BẬT (Tự động qua ngày)';
      statusBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-600 text-white whitespace-nowrap';
    }
    if (toggleLabel) {
      toggleLabel.textContent = 'Đang BẬT tự động điểm danh';
      toggleLabel.className = 'text-xs font-extrabold text-emerald-700 whitespace-nowrap';
    }
    if (tabAutoBadge) {
      tabAutoBadge.textContent = 'Tự động: BẬT';
      tabAutoBadge.className = 'px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-800 font-extrabold whitespace-nowrap';
    }
    if (bannerEl) {
      bannerEl.className = 'p-3.5 rounded-2xl border border-emerald-200 bg-[#141414]  via-white  flex flex-col lg:flex-row lg:items-center justify-between gap-3 ';
    }
    if (iconBoxEl) {
      iconBoxEl.className = 'w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 ';
    }
  } else {
    if (statusBadge) {
      statusBadge.textContent = 'ĐANG TẮT (Chỉ điểm danh thủ công)';
      statusBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-slate-500 text-white whitespace-nowrap';
    }
    if (toggleLabel) {
      toggleLabel.textContent = 'Đang TẮT tự động điểm danh';
      toggleLabel.className = 'text-xs font-extrabold text-slate-600 whitespace-nowrap';
    }
    if (tabAutoBadge) {
      tabAutoBadge.textContent = 'Tự động: TẮT';
      tabAutoBadge.className = 'px-2 py-0.5 text-xs rounded-full bg-slate-200 text-slate-700 font-extrabold whitespace-nowrap';
    }
    if (bannerEl) {
      bannerEl.className = 'p-3.5 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ';
    }
    if (iconBoxEl) {
      iconBoxEl.className = 'w-10 h-10 rounded-2xl bg-slate-500 text-white flex items-center justify-center shrink-0 ';
    }
  }

  // 1. Render bộ lọc Khối lớp
  const gradeDefs =
    typeof getAllGradeGroupsForDisplay === 'function'
      ? getAllGradeGroupsForDisplay(classNames, appState.students || [])
      : [{ key: 'ALL', label: 'Tất cả', count: classNames.length }];
  if (gradeFiltersEl) {
    gradeFiltersEl.innerHTML = gradeDefs
      .map(g => {
        const cnt =
          typeof g.count === 'number'
            ? g.count
            : g.key === 'ALL'
            ? classNames.length
            : classNames.filter(c => getGradeCategoryForClassName(c) === g.key).length;
        const active = selectedAttendanceGradeFilter === g.key;
        return `
          <button
            type="button"
            onclick="setAttendanceGradeFilter('${escapeAttr(g.key)}')"
            class="px-2.5 py-1 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
              active
                ? 'bg-slate-900 text-white '
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }"
          >
            <span>${escapeHtml(g.label)}</span>
            <span class="px-1.5 py-0.2 rounded-full text-xs ${
              active ? 'bg-white/20 text-white' : 'bg-white text-slate-600'
            }">${cnt}</span>
          </button>
        `;
      })
      .join('');
  }

  // 2. Render Dropdown & Lưới thẻ chọn Lớp
  dropdown.innerHTML = classNames
    .map(cls => {
      const count = (appState.students || []).filter(s => s.className === cls).length;
      const cCfg = map[cls] || {};
      return `<option value="${escapeAttr(cls)}" ${
        cls === selectedClassbookClass ? 'selected' : ''
      }>Lớp ${escapeHtml(cls)} - ${escapeHtml(cCfg.batchLabel || 'Đang học')} (${count} HS)</option>`;
    })
    .join('');

  const visibleClasses =
    selectedAttendanceGradeFilter === 'ALL'
      ? classNames
      : classNames.filter(c => getGradeCategoryForClassName(c) === selectedAttendanceGradeFilter);
  if (visibleClasses.length > 0 && !visibleClasses.includes(selectedClassbookClass)) {
    selectedClassbookClass = visibleClasses[0];
    if (dropdown) dropdown.value = selectedClassbookClass;
  }

  pillsContainer.innerHTML = visibleClasses
    .map(cls => {
      const isSelected = cls === selectedClassbookClass;
      const clsStudents = (appState.students || []).filter(s => s.className === cls);
      const cCfg = map[cls] || getDefaultClassScheduleConfig(cls);
      const st = getClassAttendanceStats(cls, cCfg, clsStudents, attMap, todayKey, autoEnabled);
      const { mainTitle, subLabel } = parseClassDisplayTitle(cls);
      const progPct = st.totalSessions > 0 ? Math.round((st.completedSessions / st.totalSessions) * 100) : 0;

      return `
        <div
          role="button"
          tabindex="0"
          onclick="selectAttendanceClass('${escapeAttr(cls)}')"
          class="class-selector-item ${
            isSelected ? 'is-active' : ''
          } group w-full px-3.5 py-2.5 rounded-xl text-left transition cursor-pointer flex flex-col justify-between gap-1.5"
        >
          <div class="flex items-center justify-between gap-1.5 w-full">
            <span class="font-extrabold text-xs sm:text-sm truncate ${
              isSelected ? 'text-white' : 'text-slate-900 group-hover:text-blue-600'
            }">
              ${escapeHtml(mainTitle)}
            </span>
            <span class="px-2 py-0.5 rounded-full text-[11px] whitespace-nowrap shrink-0 ${
              isSelected
                ? 'bg-amber-300 text-slate-950 font-black '
                : 'bg-emerald-50 text-emerald-700 font-extrabold border border-emerald-200'
            }">
              ${st.completedSessions}/${st.totalSessions} buổi
            </span>
          </div>
          <div class="flex items-center justify-between gap-2 w-full text-[11px]">
            <span class="truncate font-semibold ${isSelected ? 'text-blue-100' : 'text-slate-500'}">
              ${escapeHtml(subLabel)} • ${clsStudents.length} HS
            </span>
            <span class="shrink-0 font-bold whitespace-nowrap ${
              isSelected ? 'text-emerald-200' : 'text-slate-900'
            }">
              Chuyên cần: ${st.ratePct.toFixed(0)}%
            </span>
          </div>
          <div class="class-card-progress-track">
            <div class="class-card-progress-fill" style="width: ${progPct}%"></div>
          </div>
        </div>
      `;
    })
    .join('');

  // 3. Render thông tin Lớp đang chọn & 4 Ô KPI
  const cfg = map[selectedClassbookClass] || getDefaultClassScheduleConfig(selectedClassbookClass);
  const classStudents = (appState.students || []).filter(s => s.className === selectedClassbookClass);
  const stats = getClassAttendanceStats(
    selectedClassbookClass,
    cfg,
    classStudents,
    attMap,
    todayKey,
    autoEnabled
  );

  const metaClassEl = document.getElementById('att-meta-classname');
  if (metaClassEl) metaClassEl.textContent = cfg.className;
  const metaPeriodEl = document.getElementById('att-meta-period');
  if (metaPeriodEl) {
    metaPeriodEl.textContent = `${cfg.periodLabel || 'Tháng hiện tại'} (${formatShortDateVN(cfg.startDate)} → ${formatShortDateVN(cfg.endDate)})`;
  }
  const metaDaysEl = document.getElementById('att-meta-schedule-days');
  if (metaDaysEl) {
    metaDaysEl.textContent = cfg.batchLabel || 'ĐỢT HIỆN TẠI';
  }

  const kpiSessionsEl = document.getElementById('att-kpi-sessions');
  if (kpiSessionsEl) kpiSessionsEl.textContent = `${stats.completedSessions} / ${stats.totalSessions} buổi`;
  const kpiStuSubEl = document.getElementById('att-kpi-students-sub');
  if (kpiStuSubEl) kpiStuSubEl.textContent = `${classStudents.length} học sinh trong lớp`;

  const kpiRateEl = document.getElementById('att-kpi-rate');
  if (kpiRateEl) kpiRateEl.textContent = `${stats.ratePct.toFixed(1).replace('.', ',')}%`;
  const kpiRateSubEl = document.getElementById('att-kpi-rate-sub');
  if (kpiRateSubEl) {
    kpiRateSubEl.textContent =
      stats.ratePct >= 90 ? 'Chuyên cần rất tốt' : stats.ratePct >= 75 ? 'Chuyên cần khá' : 'Cần nhắc nhở chuyên cần';
  }

  const kpiPresentEl = document.getElementById('att-kpi-present');
  if (kpiPresentEl) kpiPresentEl.textContent = `${stats.presentSlots} lượt`;
  const kpiAutoSubEl = document.getElementById('att-kpi-auto-sub');
  if (kpiAutoSubEl) {
    kpiAutoSubEl.textContent = autoEnabled
      ? `Tự động qua ngày: ${stats.autoSessionsCount} buổi`
      : 'Tự động qua ngày: Đang tắt';
  }

  const kpiAbsentEl = document.getElementById('att-kpi-absent');
  if (kpiAbsentEl) kpiAbsentEl.textContent = `${stats.absentSlots + stats.excusedSlots} lượt`;
  const kpiAbsentSubEl = document.getElementById('att-kpi-absent-sub');
  if (kpiAbsentSubEl) {
    kpiAbsentSubEl.textContent = `${stats.absentSlots} vắng • ${stats.excusedSlots} có phép`;
  }

  // 4. Render Bảng Ma Trận Điểm Danh (Học sinh × Từng buổi học)
  const sessions = stats.sessions;
  if (sessions.length === 0) {
    thead.innerHTML = '';
    tbody.innerHTML = `
      <tr>
        <td class="py-10 px-4 text-center text-slate-500 text-xs sm:text-sm">
          Lớp <strong>${escapeHtml(cfg.className)}</strong> chưa có lịch buổi học. Hãy bấm <strong>"Cài đặt Lịch buổi học"</strong> để chọn ngày bắt đầu, ngày kết thúc và các thứ trong tuần.
        </td>
      </tr>
    `;
    return;
  }

  // Hàng tiêu đề các cột Buổi học + Hàng Tổng kết theo từng buổi
  const sessionHeaderColsHtml = sessions
    .map(sess => {
      const isToday = sess.dateKey === todayKey;
      const isPast = sess.dateKey < todayKey;
      const allManualPresent =
        classStudents.length > 0 &&
        classStudents.every(stu => attMap?.[cfg.className]?.[sess.dateKey]?.[stu.id] === 1);

      const timeBadge = isToday
        ? `<span class="px-1.5 py-0.2 rounded bg-amber-300 text-slate-950 text-xs font-black uppercase">Hôm nay</span>`
        : isPast
        ? `<span class="px-1.5 py-0.2 rounded bg-emerald-400/25 text-emerald-200 text-xs font-bold">Đã qua</span>`
        : `<span class="px-1.5 py-0.2 rounded bg-white/10 text-blue-200 text-xs font-semibold">Sắp tới</span>`;

      return `
        <th class="py-2.5 px-2 text-center min-w-[96px] border-l border-blue-800/50 whitespace-nowrap">
          <div class="flex flex-col items-center gap-1">
            <div class="flex items-center gap-1">
              <span class="text-[11px] font-black text-amber-300 uppercase">Buổi ${sess.sessionNumber}</span>
              ${timeBadge}
            </div>
            <span class="text-xs font-extrabold text-white">${sess.dayShort} • ${sess.label}</span>
            <button
              type="button"
              onclick="toggleWholeSessionAttendance('${escapeAttr(cfg.className)}', '${sess.dateKey}')"
              title="Bấm để điểm danh Có mặt toàn bộ học sinh cho Buổi ${sess.sessionNumber} (${sess.dayShort} ${sess.label})"
              class="mt-0.5 px-2 py-0.5 rounded-full text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
                allManualPresent
                  ? 'bg-emerald-400 text-slate-950 hover:bg-rose-500 hover:text-white'
                  : 'bg-white/15 hover:bg-emerald-500 text-white border border-white/25'
              }"
            >
              ${allManualPresent ? 'Đủ cả lớp' : 'Cả lớp'}
            </button>
          </div>
        </th>
      `;
    })
    .join('');

  const sessionSummaryColsHtml = sessions
    .map(sess => {
      let presentCnt = 0;
      let absentCnt = 0;
      let autoCnt = 0;
      classStudents.forEach(stu => {
        const eff = getEffectiveStudentSessionState(
          cfg.className,
          stu.id,
          sess.dateKey,
          cfg,
          attMap,
          todayKey,
          autoEnabled
        );
        if (eff.state === 1) {
          presentCnt++;
          if (eff.isAuto) autoCnt++;
        } else if (eff.state === 2 || eff.state === 3) {
          absentCnt++;
        }
      });

      const isFull = classStudents.length > 0 && presentCnt === classStudents.length;
      return `
        <td class="py-2 px-2 text-center border-l border-slate-200 whitespace-nowrap">
          <div class="text-[11px] font-extrabold ${
            isFull ? 'text-emerald-700' : presentCnt > 0 ? 'text-blue-700' : 'text-slate-400'
          }">
            ${presentCnt}/${classStudents.length} có mặt
          </div>
          <div class="text-xs font-semibold ${
            absentCnt > 0 ? 'text-rose-600' : autoCnt > 0 ? 'text-teal-600' : 'text-slate-400'
          }">
            ${absentCnt > 0 ? `${absentCnt} vắng/phép` : autoCnt > 0 ? 'Tự động ĐD' : '-'}
          </div>
        </td>
      `;
    })
    .join('');

  thead.innerHTML = `
    <tr class="sheet-navy-header text-xs font-extrabold whitespace-nowrap">
      <th class="py-3 px-2.5 w-11 text-center">STT</th>
      <th class="py-3 px-3 text-left min-w-[190px]">Học Sinh Trong Lớp</th>
      <th class="py-3 px-2.5 text-center w-32">Chuyên cần</th>
      <th class="py-3 px-2 text-center w-24">Chọn nhanh</th>
      ${sessionHeaderColsHtml}
    </tr>
    <tr class="bg-slate-100 border-b-2 border-slate-300 text-xs font-extrabold whitespace-nowrap">
      <td colspan="4" class="py-2 px-3 text-left uppercase tracking-normal text-slate-800">
        SĨ SỐ TỪNG BUỔI (${classStudents.length} HỌC SINH)
      </td>
      ${sessionSummaryColsHtml}
    </tr>
  `;

  if (classStudents.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${sessions.length + 4}" class="py-10 text-center text-slate-400 text-xs sm:text-sm">
          Lớp <strong>${escapeHtml(cfg.className)}</strong> hiện chưa có học sinh nào.
          <button onclick="openStudentModalForCurrentClass()" class="text-blue-600 font-extrabold hover:underline ml-1 cursor-pointer">+ Thêm học sinh ngay</button>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = classStudents
    .map((stu, idx) => {
      let stuPresent = 0;
      let stuAbsent = 0;
      let stuExcused = 0;

      const cellsHtml = sessions
        .map(sess => {
          const eff = getEffectiveStudentSessionState(
            cfg.className,
            stu.id,
            sess.dateKey,
            cfg,
            attMap,
            todayKey,
            autoEnabled
          );

          if (eff.state === 1) stuPresent++;
          else if (eff.state === 2) stuAbsent++;
          else if (eff.state === 3) stuExcused++;

          let btnLabel = '-';
          let tip = `Buổi ${sess.sessionNumber} (${sess.dayShort} ${sess.label}) - Chưa điểm danh (Bấm để điểm danh)`;
          if (eff.state === 1) {
            btnLabel = eff.isAuto ? 'Tự động' : 'Có mặt';
            tip = eff.isAuto
              ? `Buổi ${sess.sessionNumber} (${sess.dayShort} ${sess.label}) - Đã tự động điểm danh Có mặt khi qua ngày (Bấm để đổi sang Vắng / Có phép)`
              : `Buổi ${sess.sessionNumber} (${sess.dayShort} ${sess.label}) - Có mặt (Bấm để đổi sang Vắng / Có phép)`;
          } else if (eff.state === 2) {
            btnLabel = 'Vắng';
            tip = `Buổi ${sess.sessionNumber} (${sess.dayShort} ${sess.label}) - Vắng không phép (Bấm để đổi sang Có phép / Xóa)`;
          } else if (eff.state === 3) {
            btnLabel = 'P Có phép';
            tip = `Buổi ${sess.sessionNumber} (${sess.dayShort} ${sess.label}) - Nghỉ có phép / Dạy bù (Bấm để đổi)`;
          }

          return `
            <td class="py-2 px-1.5 text-center border-l border-slate-100 whitespace-nowrap">
              <button
                type="button"
                onclick="toggleStudentSessionAttendance('${escapeAttr(cfg.className)}', '${stu.id}', '${sess.dateKey}')"
                title="${escapeAttr(tip)}"
                class="att-cell-btn att-cell-state-${eff.state} ${eff.isAuto ? 'is-auto-att' : ''}"
              >
                <span>${btnLabel}</span>
              </button>
            </td>
          `;
        })
        .join('');

      const allStuManualPresent = sessions.every(
        sess => attMap?.[cfg.className]?.[sess.dateKey]?.[stu.id] === 1
      );

      return `
        <tr class="hover:bg-slate-50/90 transition border-b border-slate-200/80">
          <td class="py-2.5 px-2 text-center font-bold text-slate-500">${idx + 1}</td>
          <td class="py-2.5 px-3">
            <div class="font-extrabold text-slate-900 text-xs sm:text-sm whitespace-nowrap truncate max-w-[200px]" title="${escapeAttr(stu.fullName)}">
              ${escapeHtml(stu.fullName)}
            </div>
            <div class="text-[11px] text-slate-400 tabular-nums whitespace-nowrap">
              ${escapeHtml(stu.studentCode || '')}
            </div>
          </td>
          <td class="py-2.5 px-2 text-center whitespace-nowrap">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
              ${stuPresent}/${sessions.length}
            </span>
            ${
              stuAbsent > 0 || stuExcused > 0
                ? `<div class="text-xs font-bold text-rose-600 mt-0.5">${stuAbsent} vắng • ${stuExcused} phép</div>`
                : `<div class="text-xs font-semibold text-slate-400 mt-0.5">Đầy đủ</div>`
            }
          </td>
          <td class="py-2.5 px-2 text-center whitespace-nowrap">
            <button
              type="button"
              onclick="markAllSessionsForSingleStudent('${escapeAttr(cfg.className)}', '${stu.id}')"
              title="Điểm danh Có mặt tất cả các buổi trong đợt cho học sinh ${escapeAttr(stu.fullName)}"
              class="px-2.5 py-1 rounded-full text-[11px] font-extrabold transition cursor-pointer whitespace-nowrap ${
                allStuManualPresent
                  ? 'bg-emerald-600 text-white hover:bg-rose-600'
                  : 'bg-slate-100 text-slate-900 hover:bg-slate-900 hover:text-white border border-slate-200'
              }"
            >
              ${allStuManualPresent ? 'Đủ 100%' : 'Tất cả'}
            </button>
          </td>
          ${cellsHtml}
        </tr>
      `;
    })
    .join('');
}


// ============================================================================
// CHỤP HÌNH BẢNG SỐ BUỔI HỌC CHUẨN MẪU & TỰ ĐỘNG LƯU VÀO CLIPBOARD (CHỈ VIỆC DÁN)
// ============================================================================
function drawRoundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function renderScheduleConfigToCanvas(cfg) {
  const { orderedCols, weeks } = generateScheduleWeeks(
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
  const checkedSessions = taughtCount + confirmedCount;
  const batchText = String(cfg.batchLabel || 'ĐỢT 5')
    .replace(/ĐỢT\s+SỐ\s+/i, 'ĐỢT ')
    .trim()
    .toUpperCase();
  const cleanPeriod = (
    String(cfg.periodLabel || 'THÁNG 9-10/2026')
      .replace(/\(\s*ĐỢT[^)]*\)/gi, '')
      .trim() || 'THÁNG HIỆN TẠI'
  ).toUpperCase();

  // Kích thước chuẩn theo đúng ảnh mẫu người dùng gửi (vẽ ở độ phân giải 3x Retina siêu nét, tăng kích thước Đợt & Số buổi)
  const scale = 3;
  const pad = 14;
  const cardW = 620;
  const headerH = 66;
  const subH = 58;
  const weekdayH = 48;
  const rowH = 54;
  const weekRowsCount = Math.max(1, weeks.length);
  const cardH = headerH + subH + weekdayH + weekRowsCount * rowH;
  const totalW = cardW + pad * 2;
  const totalH = cardH + pad * 2;
  const cornerRadius = 22;

  const canvas = document.createElement('canvas');
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  // Nền ngoài trắng tinh khiết để khi dán vào Zalo / Messenger nổi bật góc bo tròn
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalW, totalH);

  // Bóng đổ nhẹ dưới khung thẻ
  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 3;
  drawRoundedRectPath(ctx, pad, pad, cardW, cardH, cornerRadius);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  // Cắt (Clip) theo khung bo góc
  ctx.save();
  drawRoundedRectPath(ctx, pad, pad, cardW, cardH, cornerRadius);
  ctx.clip();

  // 1. HÀNG TIÊU ĐỀ TRÊN CÙNG (Gradient Xanh Tím Đậm + Nhãn Vàng ĐỢT LỚN NỔI BẬT)
  const headerGrad = ctx.createLinearGradient(pad, pad, pad + cardW, pad + headerH);
  headerGrad.addColorStop(0, '#1e1b4b');
  headerGrad.addColorStop(0.5, '#312e81');
  headerGrad.addColorStop(1, '#3b3898');
  ctx.fillStyle = headerGrad;
  ctx.fillRect(pad, pad, cardW, headerH);

  // Chữ tiêu đề trái: SỐ BUỔI HỌC CỦA THÁNG ...
  ctx.font = '800 18.5px "Plus Jakarta Sans", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(`SỐ BUỔI HỌC CỦA ${cleanPeriod}`, pad + 20, pad + headerH / 2 + 0.5);

  // Nhãn Vàng góc phải (Lớn & Đậm): ĐỢT 5
  ctx.font = '900 17.5px "Plus Jakarta Sans", "Inter", -apple-system, sans-serif';
  const batchTextW = ctx.measureText(batchText).width;
  const badgeW = Math.max(96, batchTextW + 34);
  const badgeH = 38;
  const badgeX = pad + cardW - 18 - badgeW;
  const badgeY = pad + (headerH - badgeH) / 2;
  drawRoundedRectPath(ctx, badgeX, badgeY, badgeW, badgeH, 10);
  ctx.fillStyle = '#fbbf24';
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.fillText(batchText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 0.5);

  // 2. HÀNG TỔNG CỘNG SỐ BUỔI DẠY (Pill Số buổi lớn & nổi bật)
  const subY = pad + headerH;
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(pad, subY, cardW, subH);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad, subY + subH);
  ctx.lineTo(pad + cardW, subY + subH);
  ctx.stroke();

  ctx.font = '800 15.5px "Plus Jakarta Sans", "Inter", -apple-system, sans-serif';
  ctx.fillStyle = '#1e293b';
  ctx.textAlign = 'left';
  ctx.fillText('TỔNG CỘNG SỐ BUỔI DẠY', pad + 20, subY + subH / 2 + 0.5);

  // Pill Xanh dương Lớn: 12 buổi
  const sessionCountText = `${checkedSessions} buổi`;
  ctx.font = '900 18px "Plus Jakarta Sans", "Inter", -apple-system, sans-serif';
  const sessTextW = ctx.measureText(sessionCountText).width;
  const pillW = Math.max(114, sessTextW + 38);
  const pillH = 38;
  const pillX = pad + cardW - 18 - pillW;
  const pillY = subY + (subH - pillH) / 2;
  drawRoundedRectPath(ctx, pillX, pillY, pillW, pillH, 19);
  ctx.fillStyle = '#1d5fbf';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(sessionCountText, pillX + pillW / 2, pillY + pillH / 2 + 0.5);

  // 3. HÀNG THỨ TRONG TUẦN (THỨ 3 | THỨ 5 | THỨ 7 ...)
  const wkY = subY + subH;
  ctx.fillStyle = '#234270';
  ctx.fillRect(pad, wkY, cardW, weekdayH);

  const colW = cardW / colCount;
  orderedCols.forEach((d, cIdx) => {
    const cx = pad + cIdx * colW;
    ctx.font = '800 14.5px "Plus Jakarta Sans", "Inter", -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(DAY_LABELS[d] || '', cx + colW / 2, wkY + weekdayH / 2 + 0.5);

    if (cIdx > 0) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, wkY);
      ctx.lineTo(cx, wkY + weekdayH);
      ctx.stroke();
    }
  });

  // 4. LƯỚI CÁC Ô NGÀY HỌC
  const gridStartY = wkY + weekdayH;
  if (weeks.length === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(pad, gridStartY, cardW, rowH);
    ctx.font = '600 14px "Inter", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText('Chưa có lịch buổi học', pad + cardW / 2, gridStartY + rowH / 2);
  } else {
    weeks.forEach((row, rIdx) => {
      const cy = gridStartY + rIdx * rowH;
      row.forEach((cell, cIdx) => {
        const cx = pad + cIdx * colW;
        const st = cell.inRange && cell.dateKey ? Number(states[cell.dateKey] || 0) : -1;

        if (!cell.inRange) {
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(cx, cy, colW, rowH);
          ctx.font = '600 16px "Inter", sans-serif';
          ctx.fillStyle = '#94a3b8';
          ctx.textAlign = 'center';
          ctx.fillText('–', cx + colW / 2, cy + rowH / 2 + 0.5);
        } else if (st === 1) {
          // Đã dạy (Màu Xanh lá chuẩn mẫu)
          ctx.fillStyle = '#05a66b';
          ctx.fillRect(cx, cy, colW, rowH);
          ctx.font = '800 16.5px "Plus Jakarta Sans", "Inter", sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText(`${cell.label}`, cx + colW / 2, cy + rowH / 2 + 0.5);
        } else if (st === 2) {
          // Đã xác nhận (Màu Cam)
          ctx.fillStyle = '#b45309';
          ctx.fillRect(cx, cy, colW, rowH);
          ctx.font = '800 16.5px "Plus Jakarta Sans", "Inter", sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText(`${cell.label}`, cx + colW / 2, cy + rowH / 2 + 0.5);
        } else if (st === 3) {
          // Nghỉ / Dạy bù (Màu Đỏ hồng gạch ngang)
          ctx.fillStyle = '#ffe4e6';
          ctx.fillRect(cx, cy, colW, rowH);
          const textStr = `${cell.label}`;
          ctx.font = '800 16px "Plus Jakarta Sans", "Inter", sans-serif';
          ctx.fillStyle = '#be123c';
          ctx.textAlign = 'center';
          ctx.fillText(textStr, cx + colW / 2, cy + rowH / 2 + 0.5);
          const tw = ctx.measureText(textStr).width;
          ctx.strokeStyle = '#be123c';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(cx + colW / 2 - tw / 2, cy + rowH / 2 + 0.5);
          ctx.lineTo(cx + colW / 2 + tw / 2, cy + rowH / 2 + 0.5);
          ctx.stroke();
        } else {
          // Chưa dạy (Trắng)
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cx, cy, colW, rowH);
          ctx.font = '700 16px "Plus Jakarta Sans", "Inter", sans-serif';
          ctx.fillStyle = '#1e293b';
          ctx.textAlign = 'center';
          ctx.fillText(cell.label, cx + colW / 2, cy + rowH / 2 + 0.5);
        }

        // Đường kẻ ô
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy, colW, rowH);
      });
    });
  }

  ctx.restore();

  // Viền ngoài bo góc sắc nét
  drawRoundedRectPath(ctx, pad, pad, cardW, cardH, cornerRadius);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  return canvas;
}

function flashScheduleCaptureButtonSuccess(btnEl) {
  if (!btnEl) return;
  if (!btnEl.dataset.origHtml) {
    btnEl.dataset.origHtml = btnEl.innerHTML;
  }
  btnEl.innerHTML = `
    <i data-lucide="check-circle-2" class="w-5 h-5 text-emerald-300 shrink-0"></i>
    <span>Đã Copy ảnh! Chỉ việc nhấn Ctrl+V để dán</span>
  `;
  btnEl.classList.add('ring-2', 'ring-emerald-400');
  lucide.createIcons();
  setTimeout(() => {
    if (btnEl && btnEl.dataset.origHtml) {
      btnEl.innerHTML = btnEl.dataset.origHtml;
      btnEl.classList.remove('ring-2', 'ring-emerald-400');
      lucide.createIcons();
    }
  }, 3200);
}

async function captureScheduleConfigToClipboard(cfg, triggerBtn = null) {
  if (!cfg) return;
  try {
    const canvas = renderScheduleConfigToCanvas(cfg);
    const classTitle = cfg.className || selectedClassbookClass || 'Lớp';

    if (navigator.clipboard && window.ClipboardItem) {
      const blobPromise = new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Không thể tạo ảnh PNG'));
        }, 'image/png');
      });

      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blobPromise
        })
      ]);

      flashScheduleCaptureButtonSuccess(triggerBtn);
      showToast(
        `Đã chụp & lưu ảnh Số buổi học (${classTitle}) vào bộ nhớ tạm! Bạn chỉ việc nhấn Ctrl + V để dán ngay vào Zalo / Messenger.`,
        'success'
      );
      return;
    }

    // Fallback nếu trình duyệt không hỗ trợ ClipboardItem: tự động tải về máy
    downloadCanvasAsPng(canvas, cfg);
    showToast(
      `Đã tải ảnh Số buổi học (${classTitle}) về máy!`,
      'success'
    );
  } catch (err) {
    console.warn('Clipboard write fallback:', err);
    try {
      const canvas = renderScheduleConfigToCanvas(cfg);
      downloadCanvasAsPng(canvas, cfg);
      showToast(
        `Trình duyệt chặn tự động Copy, hệ thống đã tải thẳng ảnh Số buổi học về máy cho bạn!`,
        'warning'
      );
    } catch (e) {
      showToast('Không thể chụp bảng lịch: ' + e.message, 'error');
    }
  }
}

function downloadCanvasAsPng(canvas, cfg) {
  const dataUrl = canvas.toDataURL('image/png');
  const safeClass = String(cfg?.className || 'Lop').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeBatch = String(cfg?.batchLabel || 'Dot').replace(/[^a-zA-Z0-9_-]/g, '_');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `SoBuoiHoc_${safeClass}_${safeBatch}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function captureCurrentScheduleToClipboard(triggerBtn = null) {
  const map = getClassSchedulesMap();
  const targetClass = selectedClassbookClass || Object.keys(map)[0] || '12 2K8';
  const cfg = map[targetClass] || getDefaultClassScheduleConfig(targetClass);
  captureScheduleConfigToClipboard(cfg, triggerBtn);
}

function downloadCurrentScheduleImage() {
  const map = getClassSchedulesMap();
  const targetClass = selectedClassbookClass || Object.keys(map)[0] || '12 2K8';
  const cfg = map[targetClass] || getDefaultClassScheduleConfig(targetClass);
  const canvas = renderScheduleConfigToCanvas(cfg);
  downloadCanvasAsPng(canvas, cfg);
  showToast(`Đã tải file ảnh PNG Số buổi học Lớp ${targetClass}!`, 'success');
}

function captureHistoryScheduleToClipboard(histId, triggerBtn = null) {
  const historyList = getClassHistoryList();
  const hist = historyList.find(h => h.id === histId);
  if (!hist) return;
  captureScheduleConfigToClipboard(hist, triggerBtn);
}

// Mở Modal Tạo Khối Mới & Quản Lý Khối Lớp
function openGradeManagerModal() {
  const modal = document.getElementById('grade-manager-modal');
  if (!modal) return;
  const labelInput = document.getElementById('new-grade-label-input');
  const firstClassInput = document.getElementById('new-grade-first-class-input');
  if (labelInput) labelInput.value = '';
  if (firstClassInput) firstClassInput.value = '';
  renderGradeManagerList();
  modal.classList.remove('hidden');
  lucide.createIcons();
}

function closeGradeManagerModal() {
  const modal = document.getElementById('grade-manager-modal');
  if (modal) modal.classList.add('hidden');
}

function renderGradeManagerList() {
  const listEl = document.getElementById('grade-manager-list');
  if (!listEl) return;

  const map = getClassSchedulesMap();
  const classNames = sortClassNamesStandard(Object.keys(map));
  const allStudents = appState.students || [];
  const gradeGroups = getAllGradeGroupsForDisplay(classNames, allStudents).filter(g => g.key !== 'ALL');

  if (gradeGroups.length === 0) {
    listEl.innerHTML = `
      <div class="col-span-full py-6 text-center text-slate-400 text-xs">
        Chưa có Khối lớp nào. Hãy nhập tên Khối ở trên để tạo mới!
      </div>
    `;
    return;
  }

  listEl.innerHTML = gradeGroups
    .map(g => {
      return `
        <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2.5">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-extrabold text-xs sm:text-sm text-slate-900 truncate">${escapeHtml(g.label)}</span>
              <span class="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-extrabold whitespace-nowrap">
                ${g.count} lớp • ${g.stuCount} HS
              </span>
            </div>
            <div class="text-[11px] text-slate-500 mt-0.5 truncate">
              Mã nhận diện: <strong class="tabular-nums text-slate-700">${escapeHtml(g.key)}</strong>
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onclick="closeGradeManagerModal(); openClassScheduleModalForGrade('${escapeAttr(g.key)}');"
              title="Tạo thêm lớp mới thuộc ${escapeAttr(g.label)}"
              class="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-900 text-slate-900 hover:text-white border border-slate-200 text-xs font-extrabold transition cursor-pointer whitespace-nowrap"
            >
              + Thêm lớp
            </button>
            <button
              type="button"
              onclick="deleteGradeByKey('${escapeAttr(g.key)}')"
              title="Xóa ${escapeAttr(g.label)}"
              class="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 text-xs font-extrabold transition cursor-pointer flex items-center gap-1 whitespace-nowrap"
            >
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              <span>Xóa Khối</span>
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  lucide.createIcons();
}

async function addOrEnableGrade(key, label, firstClassName = '') {
  const cleanKey = String(key || '').trim();
  const cleanLabel = String(label || '').trim();
  if (!cleanKey || !cleanLabel) return;

  if (!appState.settings) appState.settings = {};

  // Bỏ khỏi danh sách Khối đã ẩn/xóa (nếu có)
  const deletedSet = getDeletedGradesSet();
  if (deletedSet.has(cleanKey)) {
    deletedSet.delete(cleanKey);
    appState.settings.deletedGradesJson = JSON.stringify(Array.from(deletedSet));
  }

  // Lưu vào customGradesJson
  const customList = getCustomGradesList();
  const existingIdx = customList.findIndex(g => String(g.key).toUpperCase() === cleanKey.toUpperCase());
  if (existingIdx !== -1) {
    customList[existingIdx].label = cleanLabel;
  } else {
    customList.push({ key: cleanKey, label: cleanLabel });
  }
  appState.settings.customGradesJson = JSON.stringify(customList);

  // Nếu người dùng nhập kèm tên lớp đầu tiên của Khối này thì tạo luôn lớp đó
  const cleanFirstCls = String(firstClassName || '').trim();
  if (cleanFirstCls) {
    unmarkClassAsDeletedInState(cleanFirstCls);
    const map = getClassSchedulesMap();
    if (!map[cleanFirstCls]) {
      map[cleanFirstCls] = {
        ...getDefaultClassScheduleConfig(cleanFirstCls),
        gradeKey: cleanKey
      };
    } else {
      map[cleanFirstCls].gradeKey = cleanKey;
    }
    appState.settings.classSchedulesJson = JSON.stringify(map);
    selectedClassbookClass = cleanFirstCls;
  }

  selectedClassbookGradeFilter = cleanKey;
  selectedAllStuGradeFilter = cleanKey;

  saveStateToLocal();
  renderGradeManagerList();
  populateClassScheduleGradeSelect(cleanKey);

  await triggerAutoSyncIfNeeded(
    cleanFirstCls
      ? `Đã tạo "${cleanLabel}" cùng lớp "${cleanFirstCls}" & đồng bộ lên Google Sheet!`
      : `Đã tạo "${cleanLabel}" trên thanh chọn Khối!`
  );
}

async function handleCreateCustomGrade(event) {
  event.preventDefault();
  const labelInput = document.getElementById('new-grade-label-input');
  const firstClassInput = document.getElementById('new-grade-first-class-input');
  const rawLabel = (labelInput?.value || '').trim();
  const firstClass = (firstClassInput?.value || '').trim();

  if (!rawLabel) {
    showToast('Vui lòng nhập tên Khối cần tạo (VD: Khối 8, Khối 7, Khối Luyện Thi...)', 'warning');
    labelInput?.focus();
    return;
  }

  const { key, label } = normalizeGradeKeyAndLabel(rawLabel);
  if (labelInput) labelInput.value = '';
  if (firstClassInput) firstClassInput.value = '';

  await addOrEnableGrade(key, label, firstClass);
}

async function quickAddPresetGrade(key, label) {
  await addOrEnableGrade(key, label, '');
}

function handleToolbarDeleteGrade(context = 'classbook') {
  const activeKey =
    context === 'students' ? selectedAllStuGradeFilter : selectedClassbookGradeFilter;
  if (activeKey && activeKey !== 'ALL') {
    deleteGradeByKey(activeKey);
    return;
  }
  openGradeManagerModal();
  showToast('Hãy nhấn nút "Xóa Khối" màu đỏ cạnh Khối bạn muốn xóa!', 'info');
}

async function deleteGradeByKey(gradeKey) {
  const cleanKey = String(gradeKey || '').trim();
  if (!cleanKey || cleanKey === 'ALL') return;
  const label = getGradeLabelByKey(cleanKey);

  const map = getClassSchedulesMap();
  const classesInGrade = Object.keys(map).filter(c => getGradeCategoryForClassName(c) === cleanKey);
  const studentsInGrade = (appState.students || []).filter(
    s => getGradeCategoryForClassName(s.className) === cleanKey
  );

  const confirmMsg =
    classesInGrade.length > 0 || studentsInGrade.length > 0
      ? `XÁC NHẬN XÓA "${label.toUpperCase()}":\n\n` +
        `- Số lớp thuộc ${label}: ${classesInGrade.length} lớp${classesInGrade.length ? ` (${classesInGrade.join(', ')})` : ''}\n` +
        `- Số học sinh thuộc ${label}: ${studentsInGrade.length} em\n\n` +
        `Nhấn OK để xóa "${label}" (bạn vẫn có thể nhấn nút "Hoàn tác" hoặc Ctrl+Z nếu xóa nhầm).`
      : `Bạn có chắc chắn muốn xóa "${label}" khỏi danh sách Khối?`;

  if (
    !(await appConfirm(confirmMsg, {
      title: `Xác nhận xóa ${label}`,
      tone: 'rose',
      okText: `Xóa ${label}`
    }))
  ) {
    return;
  }

  // Lưu snapshot để có thể Hoàn tác (Ctrl + Z) 100%
  if (typeof pushUndoSnapshot === 'function') {
    pushUndoSnapshot(`Xóa ${label}`);
  }

  if (!appState.settings) appState.settings = {};

  // 1. Xóa khỏi danh sách Khối tùy chỉnh
  const customList = getCustomGradesList().filter(
    g => String(g.key).trim().toUpperCase() !== cleanKey.toUpperCase()
  );
  appState.settings.customGradesJson = JSON.stringify(customList);

  // 2. Đánh dấu Khối đã xóa vào deletedGradesJson
  const deletedSet = getDeletedGradesSet();
  deletedSet.add(cleanKey);
  appState.settings.deletedGradesJson = JSON.stringify(Array.from(deletedSet));

  // 3. Nếu Khối có các lớp bên trong thì xóa luôn các lớp và học sinh thuộc Khối đó để biến mất hoàn toàn
  if (classesInGrade.length > 0) {
    classesInGrade.forEach(cls => {
      markClassAsDeletedInState(cls);
      delete map[cls];
    });
    appState.settings.classSchedulesJson = JSON.stringify(map);
  }
  if (studentsInGrade.length > 0) {
    const classSetUpper = new Set(classesInGrade.map(c => normalizeClassNameKey(c)));
    appState.students = (appState.students || []).filter(
      s =>
        getGradeCategoryForClassName(s.className) !== cleanKey &&
        !classSetUpper.has(normalizeClassNameKey(s.className))
    );
  }

  // 4. Đưa bộ lọc về Tất cả nếu đang chọn đúng Khối vừa xóa
  if (selectedClassbookGradeFilter === cleanKey) selectedClassbookGradeFilter = 'ALL';
  if (selectedAllStuGradeFilter === cleanKey) selectedAllStuGradeFilter = 'ALL';

  const remainingClasses = sortClassNamesStandard(Object.keys(map));
  if (classesInGrade.includes(selectedClassbookClass)) {
    selectedClassbookClass = remainingClasses[0] || '';
  }
  if (classesInGrade.includes(selectedAllStudentsClassFilter)) {
    selectedAllStudentsClassFilter = 'ALL';
  }

  saveStateToLocal();
  renderGradeManagerList();
  populateClassScheduleGradeSelect('AUTO');
  await triggerAutoSyncIfNeeded(`Đã xóa "${label}" & đồng bộ lên Google Sheet!`);
}

function populateClassScheduleGradeSelect(selectedVal = 'AUTO') {
  const gradeSelect = document.getElementById('cs-form-grade');
  if (!gradeSelect) return;

  const customGrades = getCustomGradesList();
  const allOptions = [...DEFAULT_BUILTIN_GRADES];
  const seen = new Set(allOptions.map(o => o.key));
  customGrades.forEach(cg => {
    if (cg && cg.key && !seen.has(cg.key)) {
      seen.add(cg.key);
      allOptions.push({ key: cg.key, label: cg.label || `Khối ${cg.key}` });
    }
  });

  gradeSelect.innerHTML =
    `<option value="AUTO">Tự động nhận diện theo tên lớp</option>` +
    allOptions
      .map(
        o =>
          `<option value="${escapeAttr(o.key)}" ${
            String(selectedVal) === String(o.key) ? 'selected' : ''
          }>${escapeHtml(o.label)}</option>`
      )
      .join('');
}

function openClassScheduleModalForGrade(gradeKey) {
  openClassScheduleModal(true);
  if (gradeKey && gradeKey !== 'ALL') {
    populateClassScheduleGradeSelect(gradeKey);
    const nameInput = document.getElementById('cs-form-classname');
    if (nameInput && !nameInput.value.trim() && /^\d+$/.test(gradeKey)) {
      nameInput.value = `${gradeKey} `;
      nameInput.focus();
    }
  }
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
    const defaultGrade =
      selectedClassbookGradeFilter && selectedClassbookGradeFilter !== 'ALL'
        ? selectedClassbookGradeFilter
        : 'AUTO';
    populateClassScheduleGradeSelect(defaultGrade);
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
    populateClassScheduleGradeSelect(cfg.gradeKey || getGradeCategoryForClassName(cfg.className) || 'AUTO');
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
  const gradeKey = (document.getElementById('cs-form-grade')?.value || 'AUTO').trim();
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

  unmarkClassAsDeletedInState(className);
  const map = getClassSchedulesMap();
  const prevCfg = (!isNew && oldName && map[oldName]) ? map[oldName] : map[className];
  const rawStates = (prevCfg && prevCfg.sessionStates) ? prevCfg.sessionStates : {};
  const existingStates = {};
  Object.keys(rawStates).forEach(dateKey => {
    if ((!startDate || dateKey >= startDate) && (!endDate || dateKey <= endDate)) {
      existingStates[dateKey] = rawStates[dateKey];
    }
  });
  const nowStr = getCurrentDateTimeString();
  const batchOrPeriodChanged = Boolean(
    prevCfg && (prevCfg.batchLabel !== batchLabel || prevCfg.periodLabel !== periodLabel)
  );

  // Nếu người dùng đổi sang Đợt mới trực tiếp trong Cài đặt Lịch học, tự động lưu Đợt cũ vào Lịch sử để không bị mất
  if (!isNew && prevCfg && prevCfg.batchLabel && prevCfg.batchLabel !== batchLabel) {
    const targetClsName = oldName || className;
    const clsStudents = (appState.students || []).filter(s => s && (s.className === targetClsName || s.className === className));
    const historyList = getClassHistoryList();
    const alreadyArchived = historyList.some(
      h => h && h.className === className && h.batchLabel === prevCfg.batchLabel && h.periodLabel === prevCfg.periodLabel
    );
    if (!alreadyArchived && clsStudents.length > 0) {
      const paidSt = clsStudents.filter(item => item.status === 'Đã hoàn thành');
      const totalExp = clsStudents.reduce((s, item) => s + (Number(item.tuitionFee) || 0), 0);
      const totalCol = paidSt.reduce((s, item) => s + (Number(item.tuitionFee) || 0), 0);
      historyList.unshift({
        id: 'HIST_' + Date.now(),
        archivedAt: nowStr,
        className,
        subject: prevCfg.subject || subject || 'Toán',
        periodLabel: prevCfg.periodLabel || periodLabel,
        batchLabel: prevCfg.batchLabel,
        startDate: prevCfg.startDate,
        endDate: prevCfg.endDate,
        daysOfWeek: Array.isArray(prevCfg.daysOfWeek) ? [...prevCfg.daysOfWeek] : daysOfWeek,
        sessionStates: { ...(prevCfg.sessionStates || {}) },
        checkedSessions: countCheckedSessionsInConfig(prevCfg),
        totalStudents: clsStudents.length,
        paidCount: paidSt.length,
        totalExpected: totalExp,
        totalCollected: totalCol,
        totalMissing: Math.max(0, totalExp - totalCol),
        studentsSnapshot: clsStudents.map(st => ({ ...st }))
      });
      if (!appState.settings) appState.settings = {};
      appState.settings.classHistoryJson = JSON.stringify(historyList);
    }
  }

  if (!isNew && oldName && oldName !== className) {
    delete map[oldName];
    markClassAsDeletedInState(oldName);
    // Đổi tên lớp cho các học sinh thuộc lớp cũ
    (appState.students || []).forEach(s => {
      if (s.className === oldName) {
        s.className = className;
      }
    });
  }

  // Đồng bộ kỳ học mới cho toàn bộ học sinh của lớp này để không bị lệch kỳ cũ
  (appState.students || []).forEach(s => {
    if (s && s.className === className) {
      s.period = periodLabel;
      if (batchOrPeriodChanged) {
        s.updatedAt = nowStr;
      }
    }
  });

  map[className] = {
    ...(prevCfg || {}),
    className,
    gradeKey: gradeKey !== 'AUTO' ? gradeKey : undefined,
    subject,
    periodLabel,
    batchLabel,
    status,
    startDate,
    endDate,
    daysOfWeek,
    sessionStates: existingStates,
    rolledOverAt: batchOrPeriodChanged ? nowStr : prevCfg?.rolledOverAt
  };
  markSepayTxIdsProcessed(appState);

  selectedClassbookClass = className;
  if (gradeKey && gradeKey !== 'AUTO') {
    selectedClassbookGradeFilter = gradeKey;
  }
  recalcPerSessionTuitionForClass(className, map);
  closeClassScheduleModal();
  saveClassSchedulesMap(map, `Đã cập nhật lịch học lớp "${className}"!`);
}

async function deleteClassByName(className) {
  const cleanTarget = String(className || '').trim();
  if (!cleanTarget || cleanTarget === 'ALL') {
    openDeleteClassPickerModal();
    return;
  }

  const stuInClass = (appState.students || []).filter(
    s => String(s.className || '').trim() === cleanTarget
  );
  const stuCount = stuInClass.length;
  const confirmMsg =
    stuCount > 0
      ? `Bạn có chắc chắn muốn XÓA LỚP "${cleanTarget}" (cùng ${stuCount} học sinh trong lớp này) khỏi hệ thống?\n\nBạn vẫn có thể bấm nút "Quay lại thao tác" (Ctrl + Z) nếu muốn khôi phục lại.`
      : `Bạn có chắc chắn muốn XÓA LỚP "${cleanTarget}" khỏi hệ thống?\n\nBạn vẫn có thể bấm nút "Quay lại thao tác" (Ctrl + Z) nếu muốn khôi phục lại.`;

  if (
    !(await appConfirm(confirmMsg, {
      title: `Xác nhận xóa lớp "${cleanTarget}"`,
      tone: 'rose',
      okText: `Xóa lớp ${cleanTarget}`
    }))
  ) {
    return;
  }

  // 1. Xóa toàn bộ học sinh thuộc lớp này khỏi appState.students
  appState.students = (appState.students || []).filter(
    s => String(s.className || '').trim() !== cleanTarget
  );

  // 2. Đánh dấu lớp đã xóa trong settings để không bị tái tạo khi đồng bộ ngầm
  markClassAsDeletedInState(cleanTarget);

  // 3. Xóa cấu hình lịch của lớp trong classSchedulesJson
  let map = {};
  try {
    if (appState.settings && appState.settings.classSchedulesJson) {
      map = JSON.parse(appState.settings.classSchedulesJson) || {};
    }
  } catch (e) {
    map = {};
  }
  delete map[cleanTarget];
  if (!appState.settings) appState.settings = {};
  appState.settings.classSchedulesJson = JSON.stringify(map);

  // 4. Cập nhật lại lớp đang chọn ở Sổ Theo Dõi và Bộ lọc ở Thống Kê Tất Cả Học Sinh
  const remainingClasses = sortClassNamesStandard(
    Array.from(
      new Set([
        ...Object.keys(map),
        ...(appState.students || []).map(s => String(s.className || '').trim()).filter(Boolean)
      ])
    )
  );
  if (selectedClassbookClass === cleanTarget) {
    selectedClassbookClass = remainingClasses[0] || '';
  }
  const classFilterEl = document.getElementById('filter-student-class');
  if (classFilterEl && classFilterEl.value === cleanTarget) {
    classFilterEl.value = 'ALL';
  }

  closeClassScheduleModal();
  closeDeleteClassPickerModal();
  saveStateToLocal();
  await triggerAutoSyncIfNeeded(
    `Đã xóa lớp "${cleanTarget}"${stuCount > 0 ? ` (${stuCount} HS)` : ''} khỏi hệ thống!`
  );
}

function deleteCurrentClassSchedule() {
  if (!selectedClassbookClass) {
    openDeleteClassPickerModal();
    return;
  }
  deleteClassByName(selectedClassbookClass);
}

function handleDeleteClassInAllStudents() {
  const currentClass = document.getElementById('filter-student-class')?.value || 'ALL';
  if (currentClass && currentClass !== 'ALL') {
    deleteClassByName(currentClass);
  } else {
    openDeleteClassPickerModal();
  }
}

function openDeleteClassPickerModal() {
  const modal = document.getElementById('delete-class-picker-modal');
  const listEl = document.getElementById('delete-class-picker-list');
  if (!modal || !listEl) return;

  const scheduleMap = getClassSchedulesMap();
  const allStudents = appState.students || [];
  const classNames = sortClassNamesStandard(
    Array.from(
      new Set([
        ...Object.keys(scheduleMap),
        ...allStudents.map(s => (s.className || '').trim()).filter(Boolean)
      ])
    )
  );

  if (classNames.length === 0) {
    listEl.innerHTML = `
      <div class="col-span-full py-8 text-center text-slate-400 text-xs sm:text-sm">
        Hiện không còn lớp học nào trong hệ thống.
      </div>
    `;
  } else {
    listEl.innerHTML = classNames
      .map(cls => {
        const clsStudents = allStudents.filter(s => s.className === cls);
        const count = clsStudents.length;
        const paidCnt = clsStudents.filter(s => s.status === 'Đã hoàn thành').length;
        const { mainTitle, subLabel } = parseClassDisplayTitle(cls);
        return `
          <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="font-extrabold text-xs sm:text-sm text-slate-900 truncate">${escapeHtml(mainTitle)}</div>
              <div class="text-[11px] text-slate-500 font-semibold truncate">
                ${escapeHtml(subLabel)} • ${count} HS (${paidCnt} đóng)
              </div>
            </div>
            <button
              type="button"
              onclick="deleteClassByName('${escapeAttr(cls)}')"
              class="shrink-0 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center gap-1 transition cursor-pointer "
            >
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              <span>Xóa lớp</span>
            </button>
          </div>
        `;
      })
      .join('');
  }

  modal.classList.remove('hidden');
  lucide.createIcons();
}

function closeDeleteClassPickerModal() {
  const modal = document.getElementById('delete-class-picker-modal');
  if (modal) modal.classList.add('hidden');
}

function openStudentModalForCurrentClass() {
  const attCls = currentAdminTab === 'attendance' ? (document.getElementById('att-class-dropdown')?.value || '').trim() : '';
  const cbCls = (document.getElementById('classbook-class-dropdown')?.value || '').trim();
  const targetCls = attCls || selectedClassbookClass || cbCls || '';
  openStudentModal('', targetCls);
}

function formatShortDateVN(isoDate) {
  if (!isoDate) return '';
  const parts = String(isoDate).split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// ============================================================================
// LƯU LỊCH SỬ CÁC ĐỢT / THÁNG CŨ & CHUYỂN SANG ĐỢT TIẾP THEO (ROLLOVER & ARCHIVE)
// ============================================================================
function getClassHistoryList() {
  try {
    if (appState.settings && appState.settings.classHistoryJson) {
      const parsed = JSON.parse(appState.settings.classHistoryJson);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

function saveClassHistoryList(list, syncMsg = '') {
  if (!appState.settings) appState.settings = {};
  appState.settings.classHistoryJson = JSON.stringify(list || []);
  saveStateToLocal();
  if (syncMsg) {
    triggerAutoSyncIfNeeded(syncMsg);
  }
}

function countCheckedSessionsInConfig(cfg) {
  if (!cfg) return 0;
  const { weeks } = generateScheduleWeeks(cfg.startDate, cfg.endDate, cfg.daysOfWeek);
  const states = cfg.sessionStates || {};
  let checked = 0;
  weeks.forEach(row => {
    row.forEach(cell => {
      if (cell.inRange && cell.dateKey) {
        const st = Number(states[cell.dateKey] || 0);
        if (st === 1 || st === 2) checked++;
      }
    });
  });
  return checked;
}

function openRolloverBatchModal() {
  const modal = document.getElementById('rollover-batch-modal');
  if (!modal) return;

  const map = getClassSchedulesMap();
  const targetClass = selectedClassbookClass || Object.keys(map)[0] || '12 2K8';
  unmarkClassAsDeletedInState(targetClass);
  const cfg = map[targetClass] || getDefaultClassScheduleConfig(targetClass);
  const classStudents = (appState.students || []).filter(s => s.className === targetClass);
  const paidCount = classStudents.filter(s => s.status === 'Đã hoàn thành').length;
  const checkedSessions = countCheckedSessionsInConfig(cfg);

  const summaryEl = document.getElementById('rollover-old-summary');
  if (summaryEl) {
    summaryEl.textContent = `Lớp ${targetClass} • ${cfg.periodLabel || 'Tháng hiện tại'} (${
      cfg.batchLabel || 'ĐỢT HIỆN TẠI'
    }) • Đã tích dạy: ${checkedSessions} buổi • Sĩ số: ${classStudents.length} HS (Đã đóng: ${paidCount}/${
      classStudents.length
    } HS)`;
  }

  // Tự động gợi ý tên Đợt tiếp theo (VD: ĐỢT SỐ 5 -> ĐỢT SỐ 6)
  let nextBatch = 'ĐỢT SỐ 2';
  const batchMatch = String(cfg.batchLabel || '').match(/(\d+)/);
  if (batchMatch) {
    const nextNum = parseInt(batchMatch[1], 10) + 1;
    nextBatch = String(cfg.batchLabel).replace(/\d+/, String(nextNum));
  }

  // Tự động gợi ý ngày bắt đầu và kết thúc cho đợt tiếp theo
  let nextStartStr = new Date().toISOString().slice(0, 10);
  let nextEndStr = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  if (cfg.endDate) {
    const oldEnd = new Date(cfg.endDate + 'T00:00:00');
    if (!isNaN(oldEnd.getTime())) {
      const nStart = new Date(oldEnd);
      nStart.setDate(oldEnd.getDate() + 1);
      const nEnd = new Date(nStart);
      nEnd.setDate(nStart.getDate() + 35); // Khoảng 5 tuần (~12-15 buổi)
      nextStartStr = nStart.toISOString().slice(0, 10);
      nextEndStr = nEnd.toISOString().slice(0, 10);
    }
  }

  const nextStartDateObj = new Date(nextStartStr + 'T00:00:00');
  const suggestedPeriod = !isNaN(nextStartDateObj.getTime())
    ? `Tháng ${nextStartDateObj.getMonth() + 1}/${nextStartDateObj.getFullYear()}`
    : `Đợt mới`;

  document.getElementById('rollover-new-period').value = suggestedPeriod;
  document.getElementById('rollover-new-batch').value = nextBatch;
  document.getElementById('rollover-new-start').value = nextStartStr;
  document.getElementById('rollover-new-end').value = nextEndStr;

  modal.classList.remove('hidden');
  lucide.createIcons();
}

function closeRolloverBatchModal() {
  const modal = document.getElementById('rollover-batch-modal');
  if (modal) modal.classList.add('hidden');
}

async function confirmRolloverClassBatch(event) {
  event.preventDefault();
  const newPeriod = document.getElementById('rollover-new-period').value.trim();
  const newBatch = document.getElementById('rollover-new-batch').value.trim();
  const newStart = document.getElementById('rollover-new-start').value;
  const newEnd = document.getElementById('rollover-new-end').value;

  if (!newPeriod || !newBatch) {
    showToast('Vui lòng nhập Kỳ học / Tháng mới và Nhãn Đợt mới!', 'warning');
    return;
  }

  const map = getClassSchedulesMap();
  const targetClass = selectedClassbookClass || Object.keys(map)[0] || '12 2K8';
  const oldCfg = map[targetClass] || getDefaultClassScheduleConfig(targetClass);
  const classStudents = (appState.students || []).filter(s => s.className === targetClass);

  const totalExpected = classStudents.reduce((s, item) => s + (Number(item.tuitionFee) || 0), 0);
  const paidStudents = classStudents.filter(item => item.status === 'Đã hoàn thành');
  const totalCollected = paidStudents.reduce((s, item) => s + (Number(item.tuitionFee) || 0), 0);
  const totalMissing = Math.max(0, totalExpected - totalCollected);
  const checkedSessions = countCheckedSessionsInConfig(oldCfg);
  const nowStr = getCurrentDateTimeString();

  // 1. Tạo bản ghi lưu trữ toàn bộ đợt cũ vào Lịch sử
  const archiveRecord = {
    id: 'HIST_' + Date.now(),
    archivedAt: nowStr,
    className: targetClass,
    subject: oldCfg.subject || 'Toán',
    periodLabel: oldCfg.periodLabel || 'Đợt trước',
    batchLabel: oldCfg.batchLabel || 'ĐỢT CŨ',
    startDate: oldCfg.startDate,
    endDate: oldCfg.endDate,
    daysOfWeek: Array.isArray(oldCfg.daysOfWeek) ? [...oldCfg.daysOfWeek] : [1, 3, 5, 0],
    sessionStates: { ...(oldCfg.sessionStates || {}) },
    checkedSessions,
    totalStudents: classStudents.length,
    paidCount: paidStudents.length,
    totalExpected,
    totalCollected,
    totalMissing,
    studentsSnapshot: classStudents.map(st => ({ ...st }))
  };

  const historyList = getClassHistoryList();
  historyList.unshift(archiveRecord);
  if (!appState.settings) appState.settings = {};
  appState.settings.classHistoryJson = JSON.stringify(historyList);

  // 2. Cập nhật cấu hình lớp sang Đợt / Tháng mới (xóa màu lịch cũ để bắt đầu tích chọn buổi mới)
  map[targetClass] = {
    ...oldCfg,
    periodLabel: newPeriod,
    batchLabel: newBatch,
    startDate: newStart,
    endDate: newEnd,
    sessionStates: {},
    rolledOverAt: nowStr
  };
  appState.settings.classSchedulesJson = JSON.stringify(map);
  markSepayTxIdsProcessed(appState);

  // Xóa điểm danh buổi cũ của lớp để bắt đầu đợt mới từ 0 buổi
  if (typeof getStudentAttendanceMap === 'function') {
    const attMap = getStudentAttendanceMap();
    if (attMap && attMap[targetClass]) {
      archiveRecord.studentAttendanceSnapshot = { ...attMap[targetClass] };
      appState.settings.classHistoryJson = JSON.stringify(historyList);
      delete attMap[targetClass];
      appState.settings.studentAttendanceJson = JSON.stringify(attMap);
    }
  }

  // 3. Giữ nguyên toàn bộ Học sinh & Số tiền học phí của lớp, đặt lại trạng thái đóng học phí cho Đợt mới
  (appState.students || []).forEach(st => {
    if (st.className === targetClass) {
      st.period = newPeriod;
      st.status = 'Chưa đóng';
      st.note = '';
      st.receiptUrl = '';
      st.updatedAt = nowStr;
      st.manualStatusUpdatedAt = nowStr;
    }
  });

  closeRolloverBatchModal();
  saveStateToLocal();
  await triggerAutoSyncIfNeeded(
    `Đã lưu "${oldCfg.periodLabel} (${oldCfg.batchLabel})" vào mục Lịch Sử và chuyển lớp ${targetClass} sang "${newPeriod}" (giữ nguyên ${classStudents.length} học sinh & mức học phí)!`
  );
}

function openHistoryForCurrentClass() {
  switchAdminTab('history');
  const filterEl = document.getElementById('history-filter-class');
  if (filterEl && selectedClassbookClass) {
    const histList = getClassHistoryList();
    const hasClass = histList.some(h => h.className === selectedClassbookClass);
    filterEl.value = hasClass ? selectedClassbookClass : 'ALL';
    renderAdminHistory();
  }
}

function toggleHistoryBatchDetail(histId) {
  if (expandedHistoryIds.has(histId)) {
    expandedHistoryIds.delete(histId);
  } else {
    expandedHistoryIds.add(histId);
  }
  renderAdminHistory();
}

function renderAdminHistory() {
  const container = document.getElementById('history-batches-container');
  const filterSelect = document.getElementById('history-filter-class');
  if (!container) return;

  const historyList = getClassHistoryList();

  // Cập nhật dropdown lọc theo lớp trong mục Lịch sử
  if (filterSelect) {
    const curVal = filterSelect.value || 'ALL';
    const classes = Array.from(new Set(historyList.map(h => h.className).filter(Boolean)));
    filterSelect.innerHTML =
      `<option value="ALL">Tất cả các lớp (${historyList.length} đợt đã lưu)</option>` +
      classes
        .map(c => {
          const cnt = historyList.filter(h => h.className === c).length;
          return `<option value="${escapeAttr(c)}">Lớp ${escapeHtml(c)} (${cnt} đợt)</option>`;
        })
        .join('');
    if (classes.includes(curVal)) {
      filterSelect.value = curVal;
    }
  }

  const activeClassFilter = filterSelect ? filterSelect.value : 'ALL';
  const filteredHistory =
    activeClassFilter === 'ALL'
      ? historyList
      : historyList.filter(h => h.className === activeClassFilter);

  if (filteredHistory.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2 ">
        <div class="w-12 h-12 rounded-2xl bg-slate-100 text-slate-900 flex items-center justify-center mx-auto">
          <i data-lucide="archive" class="w-6 h-6"></i>
        </div>
        <h4 class="font-bold text-slate-800 text-base">Chưa có đợt học cũ nào trong mục Lịch Sử</h4>
        <p class="text-xs text-slate-500 max-w-lg mx-auto">
          Khi một lớp học xong đủ số buổi (VD: hết 12 buổi), bạn chỉ cần bấm nút <strong>"Sang Đợt / Tháng Tiếp Theo (Lưu Lịch Sử)"</strong> ở mục Sổ Theo Dõi Lớp Học. Toàn bộ đợt cũ sẽ được lưu trữ tại đây và lớp sẽ sang đợt mới (giữ nguyên danh sách học sinh &amp; số tiền).
        </p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = filteredHistory
    .map(hist => {
      const isExpanded = expandedHistoryIds.has(hist.id);
      const dateRangeText =
        hist.startDate && hist.endDate
          ? `${formatShortDateVN(hist.startDate)} → ${formatShortDateVN(hist.endDate)}`
          : hist.archivedAt || '';

      // Nếu chưa bấm chọn xem chi tiết -> Chỉ hiển thị gọn: Tên lớp, Đợt, Ngày tháng
      if (!isExpanded) {
        return `
          <div
            onclick="toggleHistoryBatchDetail('${hist.id}')"
            class="bg-white hover:bg-slate-100/40 transition rounded-2xl border border-slate-200 hover:border-slate-500 p-4  flex flex-wrap items-center justify-between gap-3 cursor-pointer"
          >
            <div class="flex flex-wrap items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-[#1f3d6e] text-white flex items-center justify-center font-extrabold text-xs shrink-0">
                LỚP
              </div>
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-extrabold text-slate-900 text-sm sm:text-base">
                    Lớp ${escapeHtml(hist.className)}
                  </span>
                  <span class="px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-xs uppercase">
                    ${escapeHtml(hist.batchLabel || 'ĐỢT CŨ')}
                  </span>
                  <span class="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-900 font-bold text-xs">
                    ${escapeHtml(hist.periodLabel)}
                  </span>
                </div>
                <p class="text-xs text-slate-500 mt-1 flex items-center gap-1.5 font-medium">
                  <i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400"></i>
                  <span>Ngày tháng: <strong>${escapeHtml(dateRangeText)}</strong></span>
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2" onclick="event.stopPropagation()">
              <button
                type="button"
                onclick="captureHistoryScheduleToClipboard('${hist.id}', this)"
                title="Chụp hình bảng Số buổi học của đợt này lưu vào bộ nhớ tạm (chỉ việc nhấn Ctrl+V để dán)"
                class="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer "
              >
                <i data-lucide="camera" class="w-3.5 h-3.5"></i>
                <span>Chụp Số buổi học</span>
              </button>
              <button
                type="button"
                onclick="toggleHistoryBatchDetail('${hist.id}')"
                class="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-900 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer "
              >
                <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                <span>Xem đầy đủ</span>
              </button>
              <button
                type="button"
                onclick="deleteHistoryBatch('${hist.id}')"
                class="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                title="Xóa bản lưu lịch sử này"
              >
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
        `;
      }

      const students = hist.studentsSnapshot || [];
      const totalCount = students.length;
      const paidStudents = students.filter(s => s.status === 'Đã hoàn thành');
      const paidCount = paidStudents.length;
      const paidRate = totalCount > 0 ? ((paidCount / totalCount) * 100).toFixed(1).replace('.', ',') + '%' : '0%';
      const totalExpected = students.reduce((s, item) => s + (Number(item.tuitionFee) || 0), 0);
      const totalCollected = paidStudents.reduce((s, item) => s + (Number(item.tuitionFee) || 0), 0);
      const totalMissing = Math.max(0, totalExpected - totalCollected);

      // Tạo bảng lịch của đợt cũ
      const { orderedCols, weeks } = generateScheduleWeeks(hist.startDate, hist.endDate, hist.daysOfWeek);
      const states = hist.sessionStates || {};
      const colCount = Math.max(1, orderedCols.length);
      const colWidthPct = (100 / colCount).toFixed(2) + '%';
      const checkedSessions = countCheckedSessionsInConfig(hist);
      const histCleanPeriod =
        String(hist.periodLabel || 'THÁNG CŨ')
          .replace(/\(\s*ĐỢT[^)]*\)/gi, '')
          .trim() || 'ĐỢT CŨ';

      const scheduleRowsHtml = weeks
        .map(row => {
          const cells = row
            .map(cell => {
              if (!cell.inRange) return `<td style="width: ${colWidthPct}" class="py-2.5 px-1.5 bg-slate-50/80 text-slate-300 h-[40px]">–</td>`;
              const st = Number(states[cell.dateKey] || 0);
              const prefix = st === 1 ? '' : st === 2 ? '' : st === 3 ? '' : '';
              return `<td style="width: ${colWidthPct}" class="py-2.5 px-1.5 session-state-${st} text-xs sm:text-sm h-[40px] font-semibold">${prefix}${cell.label}</td>`;
            })
            .join('');
          return `
            <tr>
              ${cells}
            </tr>
          `;
        })
        .join('');

      const studentRowsHtml =
        students.length === 0
          ? `<tr><td colspan="6" class="py-6 text-center text-slate-400 text-xs">Không có học sinh trong đợt lưu trữ này.</td></tr>`
          : students
              .map((s, idx) => {
                const isPaid = s.status === 'Đã hoàn thành';
                return `
                  <tr class="hover:bg-slate-50">
                    <td class="py-2 px-2 text-center font-semibold text-slate-600">${idx + 1}</td>
                    <td class="py-2 px-3">
                      <div class="font-bold text-slate-900">${escapeHtml(s.fullName)}</div>
                      <div class="text-[11px] text-slate-400 tabular-nums">${escapeHtml(s.studentCode)} • SĐT: ${escapeHtml(
                  s.parentPhone || '---'
                )}</div>
                    </td>
                    <td class="py-2 px-2.5 text-right font-bold text-slate-800">${formatCurrency(s.tuitionFee)}</td>
                    <td class="py-2 px-2 text-center">
                      <input
                        type="checkbox"
                        ${isPaid ? 'checked' : ''}
                        onchange="toggleHistoryStudentPaid('${hist.id}', ${idx}, this.checked)"
                        title="Tích chọn nếu học sinh đóng bù học phí của đợt cũ này"
                        class="w-4 h-4 rounded text-emerald-600 cursor-pointer"
                      />
                    </td>
                    <td class="py-2 px-2 text-center font-bold text-xs ${
                      isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-50 text-rose-700'
                    }">
                      ${escapeHtml(s.status)}
                    </td>
                    <td class="py-2 px-2.5 text-xs text-slate-600">${escapeHtml(s.note || '')}</td>
                  </tr>
                `;
              })
              .join('');

      return `
        <div class="bg-white rounded-2xl border-2 border-slate-900/80  overflow-hidden animate-fade-in">
          <!-- Banner Đợt Lịch Sử -->
          <div class="bg-[#141414] from-[#1f3d6e]  text-white py-3 px-4 flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2.5 py-0.5 rounded-md bg-amber-400 text-slate-950 font-extrabold text-xs uppercase">
                ${escapeHtml(hist.batchLabel || 'ĐỢT CŨ')}
              </span>
              <span class="font-extrabold text-sm sm:text-base uppercase">
                LỚP ${escapeHtml(hist.className)} - ${escapeHtml(hist.periodLabel)}
              </span>
              <span class="text-xs text-slate-200">
                (Ngày học: ${escapeHtml(dateRangeText)})
              </span>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onclick="captureHistoryScheduleToClipboard('${hist.id}', this)"
                title="Chụp hình bảng Số buổi học của đợt này lưu vào bộ nhớ tạm (chỉ việc nhấn Ctrl+V để dán)"
                class="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold transition cursor-pointer flex items-center gap-1 "
              >
                <i data-lucide="camera" class="w-3.5 h-3.5"></i>
                <span>Chụp hình Số buổi học (Chỉ việc dán)</span>
              </button>
              <button
                type="button"
                onclick="toggleHistoryBatchDetail('${hist.id}')"
                class="px-3 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold transition cursor-pointer flex items-center gap-1"
              >
                <i data-lucide="chevron-up" class="w-3.5 h-3.5"></i>
                <span>Thu gọn</span>
              </button>
              <button
                type="button"
                onclick="restoreHistoryBatch('${hist.id}')"
                class="px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1"
                title="Khôi phục lại đợt này làm đợt đang học hiện tại của lớp"
              >
                <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
                <span>Khôi phục đợt này</span>
              </button>
              <button
                type="button"
                onclick="deleteHistoryBatch('${hist.id}')"
                class="px-2.5 py-1 rounded-lg bg-rose-500/30 hover:bg-rose-600 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1"
                title="Xóa bản lưu lịch sử này"
              >
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                <span>Xóa</span>
              </button>
            </div>
          </div>

          <!-- KPI Đợt Cũ -->
          <div class="p-4 space-y-4">
            <div class="grid grid-cols-2 lg:grid-cols-4 border border-slate-300 rounded-lg overflow-hidden text-center">
              <div class="border-r border-b lg:border-b-0 border-slate-300">
                <div class="sheet-kpi-label py-1.5 text-[11px] font-bold uppercase text-slate-600 border-b border-slate-300">SĨ SỐ LỚP</div>
                <div class="py-2.5 text-xl font-extrabold text-blue-600">${totalCount}</div>
              </div>
              <div class="border-b lg:border-b-0 lg:border-r border-slate-300">
                <div class="sheet-kpi-label py-1.5 text-[11px] font-bold uppercase text-slate-600 border-b border-slate-300">TỶ LỆ ĐÃ NỘP</div>
                <div class="py-2.5 text-xl font-extrabold text-slate-900">${paidRate}</div>
              </div>
              <div class="border-r border-slate-300">
                <div class="sheet-kpi-label py-1.5 text-[11px] font-bold uppercase text-slate-600 border-b border-slate-300">TỔNG THỰC THU</div>
                <div class="py-2.5 text-xl font-extrabold text-emerald-700">${formatCurrency(totalCollected)}</div>
              </div>
              <div>
                <div class="sheet-kpi-label py-1.5 text-[11px] font-bold uppercase text-slate-600 border-b border-slate-300">KHOẢN CÒN THIẾU</div>
                <div class="py-2.5 text-xl font-extrabold text-rose-600">${formatCurrency(totalMissing)}</div>
              </div>
            </div>

            <!-- 2 Bảng Học sinh & Lịch dạy của Đợt Cũ -->
            <div class="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
              <div class="xl:col-span-7 overflow-x-auto">
                <table class="sheet-table text-xs sm:text-sm">
                  <thead>
                    <tr class="sheet-navy-header text-center font-bold text-xs">
                      <th class="py-2 px-2 w-10">STT</th>
                      <th class="py-2 px-3 text-left">Họ và tên</th>
                      <th class="py-2 px-2.5 text-right">Học phí</th>
                      <th class="py-2 px-2 w-24">Đã thanh toán</th>
                      <th class="py-2 px-2.5 w-32">Tình trạng</th>
                      <th class="py-2 px-2.5 text-left">Ghi chú</th>
                    </tr>
                    <tr class="bg-slate-100 font-extrabold text-xs border-b-2 border-slate-400">
                      <td colspan="2" class="py-2 px-3 text-center uppercase">TỔNG CỘNG ĐỢT CŨ</td>
                      <td class="py-2 px-2.5 text-right">${formatCurrency(totalExpected)}</td>
                      <td class="py-2 px-2 text-center">${paidCount} em</td>
                      <td class="py-2 px-2.5 text-right text-emerald-700">${formatCurrency(totalCollected)}</td>
                      <td class="py-2 px-2.5 text-right text-rose-600">${formatCurrency(totalMissing)}</td>
                    </tr>
                  </thead>
                  <tbody>
                    ${studentRowsHtml}
                  </tbody>
                </table>
              </div>

              <div class="xl:col-span-5">
                <div class="rounded-xl overflow-hidden border-2 border-[#1f3d6e]  bg-white">
                  <table class="sheet-table table-fixed w-full text-xs sm:text-sm text-center">
                    <thead>
                      <tr class="sheet-navy-header">
                        <th colspan="${colCount}" class="py-3 px-4 border-b border-blue-900/60">
                          <div class="flex items-center justify-between gap-2.5">
                            <span class="font-extrabold text-sm sm:text-base uppercase tracking-normal text-left">
                              SỐ BUỔI HỌC CỦA ${escapeHtml(histCleanPeriod)}
                            </span>
                            <span class="px-3.5 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-black text-sm sm:text-base uppercase tracking-normal shrink-0 ">
                              ${escapeHtml(hist.batchLabel)}
                            </span>
                          </div>
                        </th>
                      </tr>
                      <tr class="bg-slate-100 border-b-2 border-slate-300">
                        <td colspan="${colCount}" class="py-2.5 px-4">
                          <div class="flex items-center justify-between gap-2.5">
                            <span class="font-extrabold text-xs sm:text-sm uppercase tracking-normal text-slate-800">
                              TỔNG CỘNG SỐ BUỔI DẠY
                            </span>
                            <span class="px-4 py-1 rounded-full bg-blue-600 text-white font-black text-sm sm:text-base  shrink-0">
                              ${checkedSessions} buổi
                            </span>
                          </div>
                        </td>
                      </tr>
                      <tr class="bg-[#25477d] text-white font-extrabold text-xs uppercase tracking-normal">
                        ${orderedCols
                          .map(d => `<th style="width: ${colWidthPct}" class="py-2.5 px-1.5 border border-slate-300/40">${DAY_LABELS[d]}</th>`)
                          .join('')}
                      </tr>
                    </thead>
                    <tbody>
                      ${scheduleRowsHtml}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  lucide.createIcons();
}

async function toggleHistoryStudentPaid(histId, studentIdx, isChecked) {
  const historyList = getClassHistoryList();
  const hist = historyList.find(h => h.id === histId);
  if (!hist || !hist.studentsSnapshot || !hist.studentsSnapshot[studentIdx]) return;

  const st = hist.studentsSnapshot[studentIdx];
  st.status = isChecked ? 'Đã hoàn thành' : 'Chưa đóng';
  if (isChecked && !st.note) {
    st.note = 'Đã đóng bù đợt cũ';
    // Tự động ghi phiếu thu vào Sổ Thu - Chi
    appState.transactions.unshift({
      id: 'GD_HIST_' + Date.now(),
      date: new Date().toISOString().slice(0, 10),
      type: 'Thu',
      category: 'Thu học phí',
      amount: Number(st.tuitionFee) || 0,
      description: `Thu học phí đợt cũ (${hist.periodLabel} - ${hist.batchLabel}) - ${st.studentCode} ${st.fullName}`,
      studentCode: st.studentCode,
      method: 'Chuyển khoản',
      receiptUrl: '',
      createdBy: 'Quản lý (Lịch sử)'
    });
  }

  saveClassHistoryList(historyList, `Đã cập nhật học phí đợt cũ của học sinh ${st.fullName}!`);
}

async function restoreHistoryBatch(histId) {
  const historyList = getClassHistoryList();
  const idx = historyList.findIndex(h => h.id === histId);
  if (idx === -1) return;
  const hist = historyList[idx];

  if (
    !(await appConfirm(
      `Bạn có muốn khôi phục lại đợt "${hist.periodLabel} (${hist.batchLabel})" của lớp ${hist.className} về lại Sổ Theo Dõi Lớp Học hiện tại không?`,
      {
        title: `Khôi phục đợt học - Lớp ${hist.className}`,
        tone: 'indigo',
        okText: 'Khôi phục ngay'
      }
    ))
  ) {
    return;
  }

  const map = getClassSchedulesMap();
  map[hist.className] = {
    className: hist.className,
    subject: hist.subject || 'Toán',
    periodLabel: hist.periodLabel,
    batchLabel: hist.batchLabel,
    status: 'Đang diễn ra',
    startDate: hist.startDate,
    endDate: hist.endDate,
    daysOfWeek: hist.daysOfWeek || [1, 3, 5, 0],
    sessionStates: hist.sessionStates || {}
  };

  // Khôi phục trạng thái học sinh của lớp này theo bản lưu
  const otherStudents = (appState.students || []).filter(s => s.className !== hist.className);
  appState.students = [...otherStudents, ...(hist.studentsSnapshot || [])];

  // Xóa bản lưu vừa khôi phục khỏi danh sách lịch sử
  historyList.splice(idx, 1);
  if (!appState.settings) appState.settings = {};
  appState.settings.classSchedulesJson = JSON.stringify(map);
  appState.settings.classHistoryJson = JSON.stringify(historyList);

  selectedClassbookClass = hist.className;
  switchAdminTab('classbook');
  saveStateToLocal();
  await triggerAutoSyncIfNeeded(`Đã khôi phục đợt "${hist.periodLabel}" của lớp ${hist.className}!`);
}

async function deleteHistoryBatch(histId) {
  const historyList = getClassHistoryList();
  const idx = historyList.findIndex(h => h.id === histId);
  if (idx === -1) return;
  const hist = historyList[idx];

  if (
    !(await appConfirm(
      `Bạn có chắc chắn muốn xóa bản lưu lịch sử "${hist.periodLabel} (${hist.batchLabel})" của lớp ${hist.className}?`,
      {
        title: 'Xóa bản lưu lịch sử đợt học',
        tone: 'rose',
        okText: 'Xóa bản lưu'
      }
    ))
  ) {
    return;
  }

  historyList.splice(idx, 1);
  saveClassHistoryList(historyList, 'Đã xóa bản lưu lịch sử đợt học.');
}

// ============================================================================
// TỰ ĐỘNG CẬP NHẬT SỐ DƯ SEPAY.VN, CHỌN STK NHẬN TIỀN & TỰ KẾT NỐI WEBHOOK
// ============================================================================
const BUILTIN_RECEIVING_BANK_ACCOUNTS = [
  {
    id: 'MAIN_BIDV',
    label: 'STK Chính: BIDV • 8601774789 (HKD TRUNG TAM HUYNH THANH CHI)',
    shortLabel: 'STK Chính: BIDV • 8601774789',
    bankBin: 'BIDV',
    bankAccountNo: '8601774789',
    bankAccountName: 'HKD TRUNG TAM HUYNH THANH CHI',
    isTest: false
  },
  {
    id: 'TEST_BIDV',
    label: 'STK Nháp (Test thử SePay): BIDV • 5801434567 (HKD TRUNG TAM HUYNH THANH CHI)',
    shortLabel: 'STK Nháp (Test): BIDV • 5801434567',
    bankBin: 'BIDV',
    bankAccountNo: '5801434567',
    bankAccountName: 'HKD TRUNG TAM HUYNH THANH CHI',
    isTest: true
  }
];

function getReceivingBankAccountsList() {
  const list = [...BUILTIN_RECEIVING_BANK_ACCOUNTS];
  const seenAcc = new Set(list.map(a => `${a.bankBin}_${a.bankAccountNo}`));

  try {
    const raw = appState.settings?.receivingAccountsJson;
    if (raw) {
      const customArr = JSON.parse(raw);
      if (Array.isArray(customArr)) {
        customArr.forEach(item => {
          if (!item || !item.bankAccountNo) return;
          const bin = String(item.bankBin || 'BIDV').trim().toUpperCase();
          const acc = String(item.bankAccountNo || '').trim();
          const owner = String(item.bankAccountName || 'HKD TRUNG TAM HUYNH THANH CHI').trim().toUpperCase();
          const key = `${bin}_${acc}`;
          if (!seenAcc.has(key)) {
            seenAcc.add(key);
            list.push({
              id: item.id || `CUSTOM_${bin}_${acc}`,
              label: item.label || `STK Nhận Tiền: ${bin} • ${acc} (${owner})`,
              shortLabel: item.shortLabel || `${bin} • ${acc}`,
              bankBin: bin,
              bankAccountNo: acc,
              bankAccountName: owner,
              isTest: Boolean(item.isTest)
            });
          }
        });
      }
    }
  } catch (e) {}

  // Nếu trong settings đang có một STK khác chưa nằm trong danh sách trên thì tự động bổ sung vào
  const curBin = String(appState.settings?.bankBin || 'BIDV').trim().toUpperCase();
  const curAcc = String(appState.settings?.bankAccountNo || '').trim();
  const curOwner = String(appState.settings?.bankAccountName || 'HKD TRUNG TAM HUYNH THANH CHI').trim().toUpperCase();
  if (curAcc && curAcc !== '0999888777' && !seenAcc.has(`${curBin}_${curAcc}`)) {
    list.push({
      id: `CUSTOM_${curBin}_${curAcc}`,
      label: `STK Tùy chỉnh: ${curBin} • ${curAcc} (${curOwner})`,
      shortLabel: `${curBin} • ${curAcc}`,
      bankBin: curBin,
      bankAccountNo: curAcc,
      bankAccountName: curOwner,
      isTest: false
    });
  }

  return list;
}

function getCurrentActiveBankProfile() {
  const stg = appState.settings || {};
  const list = getReceivingBankAccountsList();
  const curAcc = String(stg.bankAccountNo || (isSandboxDraftMode ? '5801434567' : '8601774789')).trim();
  const curBin = String(stg.bankBin || 'BIDV').trim().toUpperCase();

  const byAcc = list.find(a => a.bankAccountNo === curAcc && a.bankBin === curBin) ||
    list.find(a => a.bankAccountNo === curAcc);
  if (byAcc) return byAcc;

  if (stg.activeBankProfileId) {
    const byId = list.find(a => a.id === stg.activeBankProfileId);
    if (byId) return byId;
  }

  return isSandboxDraftMode ? list[1] : list[0];
}

function isAutoApprovePaymentEnabled() {
  const raw = appState.settings?.autoApproveBankTransfer;
  if (raw === undefined || raw === null || raw === '') return true;
  return raw === true || raw === 'true' || raw === '1';
}

function updateAutoApprovePaymentUI() {
  const isEnabled = isAutoApprovePaymentEnabled();

  const bannerBtn = document.getElementById('btn-sepay-auto-approve-toggle');
  const bannerText =
    document.getElementById('sepay-auto-approve-label') ||
    document.getElementById('sepay-auto-approve-text');
  if (bannerBtn && bannerText) {
    bannerText.textContent = isEnabled
      ? 'Tự động duyệt khi CK thành công: ĐANG BẬT'
      : 'Tự động duyệt: ĐANG TẮT (Chờ Quản lý bấm Duyệt)';
    bannerBtn.className = isEnabled
      ? 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white border border-emerald-300/60 text-[11px] font-extrabold cursor-pointer transition max-w-full '
      : 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 border border-amber-200 text-[11px] font-extrabold cursor-pointer transition max-w-full ';
  }

  const dashBtn = document.getElementById('btn-dashboard-auto-approve-toggle');
  const dashText = document.getElementById('dashboard-auto-approve-text');
  const dashDesc = document.getElementById('dashboard-pending-mode-desc');
  if (dashBtn && dashText) {
    dashText.textContent = isEnabled
      ? 'Duyệt tự động (Khi tiền vào STK): BẬT'
      : 'Duyệt tự động: TẮT (Do Quản lý duyệt)';
    dashBtn.className = isEnabled
      ? 'px-3 py-1.5 rounded-full text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white  flex items-center gap-1.5 cursor-pointer transition'
      : 'px-3 py-1.5 rounded-full text-xs font-extrabold bg-amber-500 hover:bg-amber-600 text-slate-950  flex items-center gap-1.5 cursor-pointer transition';
  }
  if (dashDesc) {
    dashDesc.innerHTML = isEnabled
      ? 'Chế độ <strong>Duyệt tự động đang BẬT</strong>: Hệ thống tự động duyệt sang <strong>Đã hoàn thành</strong> &amp; ghi Sổ Thu Chi ngay khi <strong>ngân hàng ghi nhận chuyển tiền thành công vào STK</strong>.'
      : 'Chế độ <strong>Duyệt tự động đang TẮT</strong>: Mọi khoản chuyển khoản (kể cả đã vào STK) đều nằm ở danh sách <strong>Chờ duyệt</strong> bên dưới để Quản lý kiểm tra và bấm <strong>"Duyệt (Đã nhận tiền)"</strong>.';
  }

  const settingCheckbox = document.getElementById('setting-auto-approve-checkbox');
  if (settingCheckbox) {
    settingCheckbox.checked = isEnabled;
  }
  const financeAutoCheckbox = document.getElementById('finance-auto-approve-toggle');
  if (financeAutoCheckbox) {
    financeAutoCheckbox.checked = isEnabled;
  }
}

async function toggleAutoApproveSetting(forceVal) {
  return toggleAutoApprovePayment(forceVal);
}

async function toggleAutoApprovePayment(forceVal) {
  const current = isAutoApprovePaymentEnabled();
  const nextVal = typeof forceVal === 'boolean' ? forceVal : !current;

  if (!appState.settings) appState.settings = {};
  appState.settings.autoApproveBankTransfer = String(nextVal);

  // Nếu bật lại Duyệt tự động, tự động duyệt ngay các yêu cầu Chờ duyệt ĐÃ CÓ xác nhận tiền vào STK (bankVerified = true)
  let autoApprovedCount = 0;
  if (nextVal) {
    const nowStr = getCurrentDateTimeString();
    const todayDate = new Date().toISOString().slice(0, 10);
    (appState.paymentRequests || []).forEach(req => {
      if (req.status !== 'Chờ duyệt') return;
      const stu = (appState.students || []).find(
        s => s.id === req.studentRecordId || s.studentCode === req.studentCode
      );
      const isVerified = Boolean(req.bankVerified || checkHasVerifiedBankTransfer(stu, req.studentName));
      if (isVerified) {
        req.status = 'Đã duyệt';
        req.reviewedAt = nowStr;
        req.bankVerified = true;
        autoApprovedCount++;
        if (stu) {
          stu.status = 'Đã hoàn thành';
          stu.updatedAt = nowStr;
        }
        const alreadyHasTx = (appState.transactions || []).some(
          t =>
            t.type === 'Thu' &&
            t.studentCode === req.studentCode &&
            t.description &&
            t.description.includes(req.period)
        );
        if (!alreadyHasTx) {
          const autoId = 'GD_AUTO_' + Date.now() + '_' + autoApprovedCount;
          const isDraftReq = isDraftPaymentRequest(req, appState) || isActiveBankAccountDraft(appState);
          if (isDraftReq) markDraftBankTx(appState, autoId);
          appState.transactions.unshift({
            id: autoId,
            date: todayDate,
            type: 'Thu',
            category: 'Thu học phí',
            amount: Number(req.amount) || (stu ? stu.tuitionFee : 600000),
            description: `${isDraftReq ? '[STK Nháp 5801434567] ' : ''}Tự động duyệt học phí đã nhận vào STK - ${req.studentCode} ${req.studentName} (${req.period})`,
            studentCode: req.studentCode,
            method: isDraftReq ? 'Chuyển khoản STK Nháp' : 'Chuyển khoản STK (Tự động)',
            receiptUrl: req.receiptUrl || '',
            createdBy: 'Duyệt tự động SePay'
          });
        }
      }
    });
  }

  updateAutoApprovePaymentUI();
  saveStateToLocal();

  const statusMsg = nextVal
    ? `Đã BẬT chế độ Duyệt tự động khi có kết quả chuyển tiền thành công vào STK!${
        autoApprovedCount > 0 ? ` (Đã tự động duyệt ${autoApprovedCount} yêu cầu đã nhận tiền)` : ''
      }`
    : 'Đã TẮT chế độ Duyệt tự động! Từ giờ mọi thông tin chuyển khoản sẽ chờ bạn bấm "Duyệt (Đã nhận tiền)".';

  await triggerAutoSyncIfNeeded(statusMsg);
}

function renderReceivingBankAccountSelectors() {
  const list = getReceivingBankAccountsList();
  const activeProfile = getCurrentActiveBankProfile();
  // Lưu ý: Phụ huynh KHÔNG được chọn STK chuyển tiền, chỉ Quản lý mới có quyền cài đặt ở 3 vị trí quản trị
  const selectIds = [
    'sepay-banner-account-select',
    'setting-receiving-account-select',
    'sepay-modal-account-select'
  ];

  selectIds.forEach(selId => {
    const el = document.getElementById(selId);
    if (!el) return;
    el.innerHTML = list
      .map(
        item =>
          `<option value="${escapeAttr(item.id)}" ${
            item.id === activeProfile.id ? 'selected' : ''
          }>${escapeHtml(item.label)}</option>`
      )
      .join('');
    el.value = activeProfile.id;
  });

  // Cập nhật trạng thái nổi bật của 2 nút chuyển nhanh trên thanh SePay
  const btnMain = document.getElementById('btn-quick-stk-main');
  const btnTest = document.getElementById('btn-quick-stk-test');
  if (btnMain && btnTest) {
    const isTest = activeProfile.bankAccountNo === '5801434567' || activeProfile.id === 'TEST_BIDV';
    if (isTest) {
      btnTest.className =
        'px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition cursor-pointer whitespace-nowrap bg-amber-400 text-slate-950 ';
      btnMain.className =
        'px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition cursor-pointer whitespace-nowrap text-blue-100 hover:text-white';
    } else {
      btnMain.className =
        'px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition cursor-pointer whitespace-nowrap bg-amber-400 text-slate-950 ';
      btnTest.className =
        'px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition cursor-pointer whitespace-nowrap text-blue-100 hover:text-white';
    }
  }
}

function refreshOpenPaymentModalBankQr() {
  const modal = document.getElementById('payment-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  const studentRecordId = document.getElementById('pay-student-record-id')?.value || '';
  const student = studentRecordId ? (appState.students || []).find(s => s.id === studentRecordId) : null;
  const stg = appState.settings || {};
  const feeAmount = student ? student.tuitionFee : 600000;
  const memo = student ? buildTransferMemo(student) : 'HP HOC SINH';
  const qrUrl = stg.customQrUrl
    ? stg.customQrUrl
    : buildVietQrUrl(stg.bankBin || 'BIDV', stg.bankAccountNo || '8601774789', stg.bankAccountName || 'HKD TRUNG TAM HUYNH THANH CHI', feeAmount, memo);

  const qrImg = document.getElementById('pay-modal-qr-img');
  const bankEl = document.getElementById('pay-modal-bank');
  const ownerEl = document.getElementById('pay-modal-owner');
  const accEl = document.getElementById('pay-modal-acc');
  const autoBankLabel = document.getElementById('pay-modal-auto-bank-label');

  const rawModalAcc = stg.bankAccountNo || '8601774789';
  if (qrImg) qrImg.src = qrUrl;
  if (bankEl) bankEl.textContent = stg.bankBin || 'BIDV';
  if (ownerEl) ownerEl.textContent = stg.bankAccountName || 'HKD TRUNG TAM HUYNH THANH CHI';
  if (accEl) accEl.textContent = formatDisplayBankAccWithVa(rawModalAcc, stg);
  if (autoBankLabel) autoBankLabel.textContent = `${formatDisplayBankAccWithVa(rawModalAcc, stg)} (${stg.bankBin || 'BIDV'})`;
}

async function selectReceivingBankAccount(profileId, silent = false) {
  const list = getReceivingBankAccountsList();
  const target = list.find(item => item.id === profileId);
  if (!target) return;

  if (!appState.settings) appState.settings = {};
  appState.settings.bankBin = target.bankBin;
  appState.settings.bankAccountNo = target.bankAccountNo;
  appState.settings.bankAccountName = target.bankAccountName;
  appState.settings.activeBankProfileId = target.id;
  appState.settings.sepayLinkedAccount = `${target.bankBin} • ${target.bankAccountNo}`;

  // Đồng bộ ngay vào các ô input trong tab Cài đặt (nếu đang hiển thị)
  const binInput = document.getElementById('setting-bank-bin');
  const accInput = document.getElementById('setting-bank-acc');
  const vaInput = document.getElementById('setting-sepay-va-acc');
  const ownerInput = document.getElementById('setting-bank-owner');
  if (binInput) binInput.value = target.bankBin;
  if (accInput) accInput.value = target.bankAccountNo;
  if (vaInput) vaInput.value = getSepayVaMap(appState.settings)[target.bankAccountNo] || '';
  if (ownerInput) ownerInput.value = target.bankAccountName;

  updateQrPreviewInSettings();
  renderReceivingBankAccountSelectors();
  updateAutoApprovePaymentUI();
  renderSepayBalanceBanner();
  refreshOpenPaymentModalBankQr();
  refreshSepayGuideModalDynamicText();
  const grpBankEl = document.getElementById('group-qr-bank');
  const grpOwnerEl = document.getElementById('group-qr-owner');
  const grpAccEl = document.getElementById('group-qr-acc');
  if (grpBankEl) grpBankEl.textContent = target.bankBin;
  if (grpOwnerEl) grpOwnerEl.textContent = target.bankAccountName;
  if (grpAccEl) grpAccEl.textContent = formatDisplayBankAccWithVa(target.bankAccountNo, appState.settings);
  const grpModal = document.getElementById('group-qr-modal');
  if (grpModal && !grpModal.classList.contains('hidden')) {
    refreshGroupQrPreview();
  }
  saveStateToLocal();

  if (!silent) {
    const modeTag = target.isTest ? 'STK Nháp (Test thử SePay)' : 'STK Nhận Tiền Chính';
    await triggerAutoSyncIfNeeded(
      `Đã chuyển sang ${modeTag}: ${target.bankBin} • ${target.bankAccountNo} (${target.bankAccountName}) & tự động kết nối SePay!`
    );
    autoConnectAndVerifySepay(false);
  }
}

async function promptAddReceivingBankAccount() {
  const res = await showTcAppDialog({
    mode: 'fields',
    tone: 'indigo',
    badge: 'THANH CHÍ EDU • TÀI KHOẢN NHẬN TIỀN',
    title: 'Thêm Tài Khoản Ngân Hàng Nhận Học Phí',
    message: 'Nhập thông tin tài khoản nhận tiền để tạo mã VietQR và kết nối tự động với SePay:',
    okText: 'Lưu & Kết nối STK',
    fields: [
      {
        key: 'bankBin',
        label: 'Mã Ngân Hàng (VD: BIDV, MB, VCB, TCB, ACB, ICB, VPB, TPB)',
        defaultValue: 'BIDV',
        placeholder: 'VD: BIDV'
      },
      {
        key: 'bankAccountNo',
        label: 'Số Tài Khoản Nhận Tiền',
        defaultValue: '',
        placeholder: 'Nhập số tài khoản ngân hàng...'
      },
      {
        key: 'bankAccountName',
        label: 'Tên Chủ Tài Khoản (Viết hoa không dấu)',
        defaultValue: appState.settings?.bankAccountName || 'HKD TRUNG TAM HUYNH THANH CHI',
        placeholder: 'VD: HKD TRUNG TAM HUYNH THANH CHI'
      }
    ]
  });
  if (!res) return;
  const bankBin = String(res.bankBin || 'BIDV').trim().toUpperCase() || 'BIDV';
  const bankAccountNo = String(res.bankAccountNo || '').trim();
  if (!bankAccountNo) {
    showToast('Vui lòng nhập Số tài khoản hợp lệ!', 'warning');
    return;
  }
  const bankAccountName = String(res.bankAccountName || 'HKD TRUNG TAM HUYNH THANH CHI').trim().toUpperCase();

  let customArr = [];
  try {
    if (appState.settings?.receivingAccountsJson) {
      customArr = JSON.parse(appState.settings.receivingAccountsJson) || [];
    }
  } catch (e) {
    customArr = [];
  }

  const newId = `CUSTOM_${bankBin}_${bankAccountNo}`;
  customArr = customArr.filter(a => a && a.bankAccountNo !== bankAccountNo);
  customArr.push({
    id: newId,
    label: `STK Nhận Tiền: ${bankBin} • ${bankAccountNo} (${bankAccountName})`,
    shortLabel: `${bankBin} • ${bankAccountNo}`,
    bankBin,
    bankAccountNo,
    bankAccountName,
    isTest: false
  });

  if (!appState.settings) appState.settings = {};
  appState.settings.receivingAccountsJson = JSON.stringify(customArr);
  saveStateToLocal();
  await selectReceivingBankAccount(newId, false);
}

// Số dư tính theo thống kê của Web: Tổng Thu thực tế - Tổng Chi thực tế (chỉ cộng STK Nháp khi đã bật Cộng TK chính)
function getWebStatsBalanceBreakdown() {
  const realTransactions = (appState.transactions || []).filter(t => isCountedInMainFinance(t));
  const totalIn = realTransactions
    .filter(t => t.type === 'Thu')
    .reduce((s, t) => s + (normalizeStoredVnd(t.amount) || 0), 0);
  const totalOut = realTransactions
    .filter(t => t.type === 'Chi')
    .reduce((s, t) => s + (normalizeStoredVnd(t.amount) || 0), 0);
  return {
    totalIn,
    totalOut,
    net: totalIn - totalOut,
    countIn: realTransactions.filter(t => t.type === 'Thu').length,
    countOut: realTransactions.filter(t => t.type === 'Chi').length
  };
}

function isSepayBalanceAutoByWebStats() {
  return String(appState.settings?.sepayBalanceMode || '') === 'auto';
}

function getComputedSepayBalance() {
  const stg = appState.settings || {};
  const netBalance = getWebStatsBalanceBreakdown().net;

  // Chế độ Tự động: Số dư luôn bằng thống kê Thu - Chi trên Web
  if (isSepayBalanceAutoByWebStats()) {
    return netBalance;
  }

  if (stg.sepayBalance !== undefined && stg.sepayBalance !== '' && !isNaN(Number(stg.sepayBalance))) {
    const savedBal = Number(stg.sepayBalance);
    // Nếu Quản lý đã chủ động sửa số dư (kể cả sửa về 0) thì luôn hiển thị đúng số đã sửa
    if (stg.sepayBalanceManualAt) {
      return savedBal;
    }
    // Dữ liệu cũ: sepayBalance đang là 0 mặc định nhưng hệ thống đã có phiếu thu thực tế -> hiển thị theo thống kê Web
    if (savedBal === 0 && netBalance !== 0) {
      return netBalance;
    }
    return savedBal;
  }
  return netBalance;
}

function updateSepayBalanceModeUI() {
  const isAuto = isSepayBalanceAutoByWebStats();
  const autoBtn = document.getElementById('btn-sepay-balance-auto-toggle');
  const autoLabel = document.getElementById('sepay-balance-auto-label');
  const modeBadge = document.getElementById('sepay-balance-mode-badge');
  if (autoBtn) {
    autoBtn.className = isAuto
      ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 border border-emerald-300/60 text-[11px] font-extrabold text-white transition cursor-pointer whitespace-nowrap'
      : 'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] font-semibold text-blue-100 hover:text-white transition cursor-pointer whitespace-nowrap';
  }
  if (autoLabel) autoLabel.textContent = isAuto ? 'Tự động theo Web: BẬT' : 'Tự động theo Web: TẮT';
  if (modeBadge) {
    const stg = appState.settings || {};
    modeBadge.textContent = isAuto
      ? 'Đang tự động theo thống kê Thu - Chi của Web'
      : stg.sepayBalanceManualAt
      ? `Sửa tay lúc ${stg.sepayBalanceManualAt}`
      : 'Theo SePay / số dư gốc';
  }
}

async function syncSepayBalanceWithWebStats() {
  const b = getWebStatsBalanceBreakdown();
  const currentBal = getComputedSepayBalance();
  const ok = await appConfirm(
    `• Tổng Thu thực tế: +${formatCurrency(b.totalIn)} (${b.countIn} phiếu)\n` +
      `• Tổng Chi thực tế: -${formatCurrency(b.totalOut)} (${b.countOut} phiếu)\n` +
      `• Số dư theo thống kê Web: ${formatCurrency(b.net)}\n` +
      `• Số dư đang hiển thị: ${formatCurrency(currentBal)}\n\n` +
      `Xác nhận đồng bộ số dư hiển thị = ${formatCurrency(b.net)} (không tính các giao dịch Test STK)?`,
    {
      title: 'Đồng bộ số dư theo thống kê Web',
      badge: 'THANH CHÍ EDU • ĐỒNG BỘ SỐ DƯ',
      tone: 'emerald',
      okText: 'Cập nhật ngay'
    }
  );
  if (!ok) return;
  if (!appState.settings) appState.settings = {};
  appState.settings.sepayBalance = String(b.net);
  appState.settings.sepayBalanceManualAt = getCurrentDateTimeString();
  saveStateToLocal();
  renderSepayBalanceBanner();
  await triggerAutoSyncIfNeeded(`Đã cập nhật số dư theo thống kê Web: ${formatCurrency(b.net)}!`);
}

async function toggleSepayBalanceAutoMode() {
  if (!appState.settings) appState.settings = {};
  const nextAuto = !isSepayBalanceAutoByWebStats();
  appState.settings.sepayBalanceMode = nextAuto ? 'auto' : 'manual';
  if (!nextAuto) {
    // Khi tắt tự động, giữ nguyên con số đang hiển thị làm số dư gốc để không bị nhảy số
    appState.settings.sepayBalance = String(getWebStatsBalanceBreakdown().net);
    appState.settings.sepayBalanceManualAt = getCurrentDateTimeString();
  }
  saveStateToLocal();
  renderSepayBalanceBanner();
  await triggerAutoSyncIfNeeded(
    nextAuto
      ? `Đã BẬT tự động cập nhật số dư theo thống kê Thu - Chi của Web (${formatCurrency(getComputedSepayBalance())})!`
      : 'Đã TẮT tự động - Số dư sẽ giữ theo số bạn sửa tay / SePay báo về.'
  );
}

function isSepayActuallyConnected(stateObj = appState) {
  if (isSandboxDraftMode) return true;
  const stg = stateObj?.settings || {};
  if (stg._sepaySheetConnected) return true;
  if (stg.sepayApiVerifiedAt) return true;
  if (stg.hasSepayApiToken === 'true' || (stg.sepayApiToken && stg.sepayApiToken !== '***MASKED***')) return true;
  if (stg.lastBankAlertJson) {
    try {
      const a = JSON.parse(stg.lastBankAlertJson);
      if (
        a &&
        !a.isTest &&
        !String(a.id || '').includes('TEST_STK_') &&
        !String(a.id || '').includes('SEPAY_STK_')
      ) {
        return true;
      }
    } catch (e) {}
  }
  return (stateObj?.transactions || []).some(
    t => t && !isSimulatedBankTestItem(t) && String(t.id || '').startsWith('GD_SEPAY_')
  );
}

function renderSepayBalanceBanner() {
  const stg = appState.settings || {};
  const activeProfile = getCurrentActiveBankProfile();
  const curBin = stg.bankBin || activeProfile.bankBin || 'BIDV';
  const curAcc = stg.bankAccountNo || activeProfile.bankAccountNo || (isSandboxDraftMode ? '5801434567' : '8601774789');
  const effectiveVaAcc = getEffectiveQrAccountNo(curAcc, stg);
  const hasBidvVa = /^96247[A-Z0-9]+$/i.test(effectiveVaAcc);
  const isTestAcc = curAcc === '5801434567';
  const isRealConnected = isSepayActuallyConnected(appState);

  const bankBadge = document.getElementById('sepay-bank-badge');
  const balanceEl = document.getElementById('sepay-live-balance');
  const alertTimeEl = document.getElementById('sepay-last-alert-time');
  const alertTextEl = document.getElementById('sepay-last-alert-text');
  const testAlertBadge = document.getElementById('sepay-test-alert-badge');
  const clearTestBtn = document.getElementById('btn-clear-sepay-test');
  const connBadgeEl = document.getElementById('sepay-auto-connect-badge');
  const connTextEl = document.getElementById('sepay-auto-connect-text');
  const settingConnEl = document.getElementById('setting-sepay-conn-status');
  const modalConnEl = document.getElementById('sepay-modal-conn-status');

  renderReceivingBankAccountSelectors();
  updateAutoApprovePaymentUI();

  if (bankBadge) {
    bankBadge.textContent = `${curBin} • ${effectiveVaAcc !== curAcc ? `${effectiveVaAcc} (VA -> ${curAcc})` : curAcc}${isTestAcc ? ' (STK Nháp Test)' : ' (STK Chính)'}`;
  }
  if (balanceEl) {
    balanceEl.textContent = formatCurrency(getComputedSepayBalance());
  }
  updateSepayBalanceModeUI();

  const sourceTag = stg._sepaySheetConnected ? `Sheet: ${stg._sepaySheetConnected}` : 'API/Webhook';
  const bidvVaWarn = curBin === 'BIDV' && !hasBidvVa && !stg.customQrUrl ? ' • Thiếu mã VA 96247... cho BIDV' : '';
  if (isRealConnected && !bidvVaWarn) {
    const connLabel = `Đã kết nối SePay (${curBin} • ${effectiveVaAcc !== curAcc ? `VA ${effectiveVaAcc}` : curAcc})`;
    if (connBadgeEl) {
      connBadgeEl.className =
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[11px] font-extrabold text-emerald-200 cursor-pointer hover:bg-emerald-500/30 transition max-w-full';
    }
    if (connTextEl) connTextEl.textContent = connLabel;
    if (settingConnEl) settingConnEl.textContent = `${connLabel} - Đang đồng bộ (${sourceTag})`;
    if (modalConnEl) modalConnEl.textContent = `${connLabel} - Đang nhận giao dịch thực tế (${sourceTag})`;
  } else {
    const warnShort = !isRealConnected
      ? `Chưa nhận dữ liệu từ SePay (${curBin} • ${curAcc}) - Bấm để kết nối`
      : `Đã nối SePay nhưng QR BIDV thiếu mã VA 96247... - Bấm nhập VA`;
    if (connBadgeEl) {
      connBadgeEl.className =
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-400 border border-amber-200 text-[11px] font-extrabold text-slate-950 cursor-pointer hover:bg-amber-300 transition max-w-full ';
    }
    if (connTextEl) connTextEl.textContent = warnShort;
    if (settingConnEl) {
      settingConnEl.textContent = `Chưa hoàn tất nối my.sepay.vn (${!isRealConnected ? 'Chưa bật Tích hợp Google Sheets / API Token' : 'Thiếu mã VA 96247... của BIDV'})`;
    }
    if (modalConnEl) {
      modalConnEl.textContent = `Cần hoàn tất 2 bước bên dưới để SePay tự báo giao dịch vào Google Sheet${bidvVaWarn}`;
    }
  }

  const hasAnyTestRecords =
    (appState.transactions || []).some(t => isSimulatedBankTestItem(t)) ||
    (appState.paymentRequests || []).some(r => isSimulatedBankTestItem(r));

  if (alertTextEl && alertTimeEl) {
    if (stg.lastBankAlertJson) {
      try {
        const alertObj = JSON.parse(stg.lastBankAlertJson);
        const isTestAlert = Boolean(
          alertObj.isTest ||
            String(alertObj.id || '').includes('TEST_STK_') ||
            String(alertObj.id || '').includes('SEPAY_STK_')
        );
        const isOut = alertObj.type === 'out';
        const sign = isOut ? '-' : '+';
        const accTag = alertObj.accountNumber ? `[${alertObj.gateway || 'BIDV'} ${alertObj.accountNumber}] ` : '';
        alertTimeEl.textContent = alertObj.time || 'Vừa xong';

        if (testAlertBadge) {
          if (isTestAlert) {
            testAlertBadge.classList.remove('hidden');
          } else {
            testAlertBadge.classList.add('hidden');
          }
        }
        if (clearTestBtn) {
          if (isTestAlert || hasAnyTestRecords) {
            clearTestBtn.classList.remove('hidden');
            clearTestBtn.classList.add('inline-flex');
          } else {
            clearTestBtn.classList.add('hidden');
            clearTestBtn.classList.remove('inline-flex');
          }
        }

        if (isTestAlert) {
          alertTextEl.className = 'text-xs sm:text-sm font-extrabold mt-1 truncate text-amber-300';
          alertTextEl.textContent = `Test không cộng tiền • ${formatCurrency(
            alertObj.amount || 0
          )} | ${accTag}ND: ${alertObj.content || 'Test hoạt động STK'}`;
        } else {
          alertTextEl.className = `text-xs sm:text-sm font-bold mt-1 truncate ${
            isOut ? 'text-rose-300' : 'text-emerald-300'
          }`;
          alertTextEl.textContent = `${accTag}${sign}${formatCurrency(alertObj.amount || 0)} | ND: ${
            alertObj.content || 'Giao dịch ngân hàng'
          }`;
        }
      } catch (e) {
        if (testAlertBadge) testAlertBadge.classList.add('hidden');
        alertTimeEl.textContent = 'Đã kết nối';
        alertTextEl.textContent = `Đang lắng nghe biến động số dư SePay cho STK ${curBin} • ${curAcc}...`;
      }
    } else {
      if (testAlertBadge) testAlertBadge.classList.add('hidden');
      if (clearTestBtn) {
        if (hasAnyTestRecords) {
          clearTestBtn.classList.remove('hidden');
          clearTestBtn.classList.add('inline-flex');
        } else {
          clearTestBtn.classList.add('hidden');
          clearTestBtn.classList.remove('inline-flex');
        }
      }
      alertTimeEl.textContent = isRealConnected ? 'Đang lắng nghe 24/7' : 'Chưa liên kết SePay';
      alertTextEl.textContent = isRealConnected
        ? `Đang lắng nghe giao dịch thực tế SePay cho ${curBin} • ${effectiveVaAcc}...`
        : `Chưa có giao dịch từ my.sepay.vn đẩy về Google Sheet. Bấm nút vàng "Chưa nhận dữ liệu từ SePay" ở trên để kết nối trong 1 phút!`;
    }
  }
  if (typeof renderHeaderNotificationState === 'function') {
    renderHeaderNotificationState();
  }
}

async function promptEditSepayBalance() {
  const currentBal = getComputedSepayBalance();
  const curBin = appState.settings?.bankBin || 'BIDV';
  const curAcc = appState.settings?.bankAccountNo || (isSandboxDraftMode ? '5801434567' : '8601774789');
  const bankLabel = `${curBin} (${curAcc})${curAcc === '5801434567' ? ' [STK Nháp Test]' : ''}`;
  const input = await appPrompt(
    `Nhập số dư hiện tại trong tài khoản ${bankLabel}\n(Có thể nhập rút gọn 3 số 000 hoặc nhập đầy đủ - VD: nhập 2800 hoặc 2800000 đều = 2.800.000 ₫):`,
    String(toShortMoney(currentBal)),
    {
      title: 'Cập nhật số dư tài khoản ngân hàng',
      badge: 'THANH CHÍ EDU • SỐ DƯ NGÂN HÀNG',
      tone: 'emerald',
      moneyPreview: true,
      okText: 'Lưu số dư'
    }
  );
  if (input === null) return;
  const cleaned = String(input).trim() === '0' ? 0 : fromShortMoney(input);
  if (isNaN(cleaned)) {
    showToast('Số tiền không hợp lệ!', 'error');
    return;
  }
  if (!appState.settings) appState.settings = {};
  appState.settings.sepayBalance = String(cleaned);
  appState.settings.sepayBalanceManualAt = getCurrentDateTimeString();
  // Sửa tay thì tự động tắt chế độ "Tự động theo Web" để con số vừa sửa được giữ nguyên
  appState.settings.sepayBalanceMode = 'manual';
  saveStateToLocal();
  renderSepayBalanceBanner();
  await triggerAutoSyncIfNeeded(`Đã cập nhật số dư ngân hàng hiện tại: ${formatCurrency(cleaned)}!`);
}

function refreshSepayGuideModalDynamicText() {
  const urlEl = document.getElementById('modal-sepay-webhook-url');
  const summaryEl = document.getElementById('sepay-modal-bank-summary');
  const step2Title = document.getElementById('sepay-modal-step2-title');
  const step2Desc = document.getElementById('sepay-modal-step2-desc');
  const tokenInput = document.getElementById('sepay-api-token-input');
  const vaInput = document.getElementById('sepay-va-account-input');
  const stg = appState.settings || {};

  const bin = stg.bankBin || 'BIDV';
  const acc = stg.bankAccountNo || (isSandboxDraftMode ? '5801434567' : '8601774789');
  const currentVa = getSepayVaMap(stg)[acc] || (/^96247[A-Z0-9]+$/i.test(acc) ? acc : '');
  const owner = stg.bankAccountName || 'HKD TRUNG TAM HUYNH THANH CHI';
  const isTest = acc === '5801434567';

  if (summaryEl) {
    summaryEl.textContent = `${bin} • ${currentVa ? `VA ${currentVa} -> ${acc}` : acc} (${isTest ? 'STK Nháp Test' : 'STK Chính'}) • ${owner}`;
  }
  if (step2Title) {
    step2Title.textContent = `Bước 1: Liên kết STK ${bin} (${acc}) trên my.sepay.vn & lấy mã TK ảo VA 96247...`;
  }
  if (step2Desc) {
    step2Desc.innerHTML =
      `Lưu ý bắt buộc của BIDV &amp; SePay: Chuyển thẳng vào STK gốc <strong>${escapeHtml(acc)}</strong> sẽ <strong>KHÔNG báo về SePay</strong>! Sau khi liên kết STK <strong>${escapeHtml(acc)}</strong> trên <code>my.sepay.vn</code>, hãy copy mã <strong>Tài khoản ảo VA (bắt đầu bằng 96247...)</strong> dán vào ô <strong>Mã TK Ảo VA SePay</strong> ở trên (tiền vẫn vào thẳng STK ${escapeHtml(acc)} của bạn 100%).`;
  }
  if (urlEl) {
    urlEl.textContent = '1dObYu0uf1pdSvYLWDdi45zKK2n67TzfbrfkDuOlsvq0';
  }
  if (vaInput) {
    vaInput.value = currentVa;
  }
  if (tokenInput) {
    tokenInput.value = stg.sepayApiToken && stg.sepayApiToken !== '***MASKED***' ? stg.sepayApiToken : '';
    if (stg.hasSepayApiToken === 'true' || stg.sepayApiToken === '***MASKED***') {
      tokenInput.placeholder = 'Đã lưu API Token trên Google Sheet (Nhập mới nếu muốn đổi)';
    }
  }
}

async function saveSepayVaAccountFromModal() {
  const vaInput = document.getElementById('sepay-va-account-input');
  const rawVa = (vaInput?.value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const stg = appState.settings || {};
  const acc = stg.bankAccountNo || (isSandboxDraftMode ? '5801434567' : '8601774789');
  if (rawVa && (stg.bankBin || 'BIDV') === 'BIDV' && !rawVa.startsWith('96247')) {
    showToast('Lưu ý: Mã tài khoản ảo (VA) của BIDV trên SePay luôn bắt đầu bằng 96247...!', 'warning');
  }
  if (!appState.settings) appState.settings = {};
  const map = getSepayVaMap(appState.settings);
  if (rawVa) map[acc] = rawVa;
  else delete map[acc];
  appState.settings.sepayVaByAccJson = JSON.stringify(map);

  const settingVaEl = document.getElementById('setting-sepay-va-acc');
  if (settingVaEl) settingVaEl.value = rawVa;

  updateQrPreviewInSettings();
  renderSepayBalanceBanner();
  refreshOpenPaymentModalBankQr();
  refreshSepayGuideModalDynamicText();
  saveStateToLocal();
  await triggerAutoSyncIfNeeded(
    rawVa
      ? `Đã gắn mã VA SePay (${rawVa}) lên VietQR cho STK ${acc}! Khi quét QR tiền vẫn vào ${acc} và SePay báo tức thì.`
      : `Đã xóa mã VA, mã QR quay về STK gốc ${acc}.`
  );
}

function openSepayGuideModal() {
  const modal = document.getElementById('sepay-guide-modal');
  renderReceivingBankAccountSelectors();
  updateAutoApprovePaymentUI();
  renderSepayBalanceBanner();
  refreshSepayGuideModalDynamicText();
  if (modal) {
    modal.classList.remove('hidden');
    lucide.createIcons();
  }
}

function closeSepayGuideModal() {
  const modal = document.getElementById('sepay-guide-modal');
  if (modal) modal.classList.add('hidden');
}

async function autoConnectAndVerifySepay(showSuccessToast = true) {
  const stg = appState.settings || {};
  const bin = stg.bankBin || 'BIDV';
  const acc = stg.bankAccountNo || (isSandboxDraftMode ? '5801434567' : '8601774789');
  const nowStr = getCurrentDateTimeString();

  if (!appState.settings) appState.settings = {};
  appState.settings.sepayLinkedAccount = `${bin} • ${acc}`;
  appState.settings.sepayLinkedAt = nowStr;

  startLiveBankPolling();

  // Chế độ 1 chiều (Web -> Sheet): Không lấy dữ liệu từ Google Sheet về ghi đè Web
  const gasUrl = getGasUrl() || DEFAULT_GAS_WEBAPP_URL;
  if (showSuccessToast && gasUrl && !isSandboxDraftMode) {
    try {
      await syncAllToGoogleSheet(false).catch(() => {});
    } catch (e) {}
  }

  renderSepayBalanceBanner();
  refreshSepayGuideModalDynamicText();
  try {
    if (!showSuccessToast) isSilentServerSync = true;
    saveStateToLocal();
  } finally {
    isSilentServerSync = false;
  }

  if (showSuccessToast) {
    const effectiveVa = getEffectiveQrAccountNo(acc, appState.settings);
    playTingSound();
    showToast(`Đã lưu cấu hình (${bin} • ${effectiveVa}) & đẩy dữ liệu từ Web lên Google Sheet!`, 'success');
  }
}

function openSepayDirectLink(mode = 'bank') {
  const stg = appState.settings || {};
  const bin = stg.bankBin || 'BIDV';
  const acc = stg.bankAccountNo || (isSandboxDraftMode ? '5801434567' : '8601774789');
  const sheetId = '1dObYu0uf1pdSvYLWDdi45zKK2n67TzfbrfkDuOlsvq0';

  if (mode === 'gsheet' || mode === 'webhook') {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(sheetId).catch(() => {});
    }
    showToast(
      'Đã Copy ID Google Sheet! Trên my.sepay.vn, hãy vào mục "Tích hợp Google Sheets" và chọn file Sheet của bạn.',
      'success'
    );
    window.open('https://my.sepay.vn', '_blank', 'noopener');
  } else {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(acc).catch(() => {});
    }
    showToast(
      `Đã Copy STK ${acc} (${bin})! Sau khi thêm trên my.sepay.vn, hãy copy mã VA (96247...) dán lại vào Web.`,
      'success'
    );
    window.open('https://my.sepay.vn/bankaccount', '_blank', 'noopener');
  }
}

async function saveSepayApiTokenFromModal() {
  const input = document.getElementById('sepay-api-token-input');
  const token = (input?.value || '').trim();
  if (!appState.settings) appState.settings = {};
  appState.settings.sepayApiToken = token;
  saveStateToLocal();
  await autoConnectAndVerifySepay(true);
}

async function testSepayDraftAccount5801434567() {
  // Chuyển sang STK Nháp 5801434567 BIDV để test chuẩn thực tế
  await selectReceivingBankAccount('TEST_BIDV', true);

  const targetStu =
    (appState.students || []).find(s => s.status !== 'Đã hoàn thành') ||
    (appState.students || [])[0];

  const simContentEl = document.getElementById('sim-bank-content');
  const simAmountEl = document.getElementById('sim-bank-amount');

  if (targetStu) {
    const cleanName = removeVietnameseTones(targetStu.fullName).toUpperCase();
    if (simContentEl) simContentEl.value = `HP ${targetStu.studentCode} ${cleanName}`;
    if (simAmountEl) simAmountEl.value = toShortMoney(targetStu.tuitionFee || 600000);
  } else {
    if (simContentEl) simContentEl.value = 'HP TEST SEPAY BIDV 5801434567';
    if (simAmountEl) simAmountEl.value = toShortMoney(600000);
  }

  await simulateIncomingBankTransfer();
}

function playTingSound() {
  const soundToggle = document.getElementById('sepay-sound-toggle');
  if (soundToggle && !soundToggle.checked) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    // Nốt 1 (Ting)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
    gain1.gain.setValueAtTime(0.25, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.35);

    // Nốt 2 (Ting cao hơn)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.5, ctx.currentTime + 0.16); // E6
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.16);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.75);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.16);
    osc2.stop(ctx.currentTime + 0.75);
  } catch (e) {
    // Trình duyệt chặn autoplay âm thanh nếu chưa tương tác
  }
}

function getNotifiedBankTxIds() {
  try {
    const raw = localStorage.getItem('TC_NOTIFIED_BANK_TX_IDS');
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (e) {
    return new Set();
  }
}

function markBankTxAsNotified(id) {
  if (!id) return;
  try {
    const set = getNotifiedBankTxIds();
    set.add(String(id).trim());
    const arr = Array.from(set).slice(-400);
    localStorage.setItem('TC_NOTIFIED_BANK_TX_IDS', JSON.stringify(arr));
  } catch (e) {}
}

function seedCurrentBankTxAsNotified(stateObj = appState) {
  try {
    const set = getNotifiedBankTxIds();
    (stateObj?.transactions || []).forEach(t => {
      if (t && t.id) set.add(String(t.id).trim());
    });
    (stateObj?.paymentRequests || []).forEach(r => {
      if (r && r.id) {
        extractPaymentRequestSyncBlockKeys(r.id).forEach(k => set.add(k));
      }
    });
    getDeletedTxIdsSet(stateObj).forEach(k => set.add(k));
    if (stateObj?.settings?.lastBankAlertJson) {
      try {
        const a = JSON.parse(stateObj.settings.lastBankAlertJson);
        const aid = String(a?.id || a?.time || '').trim();
        if (aid) set.add(aid);
      } catch (e) {}
    }
    (stateObj?.students || []).forEach(s => {
      if (s && s.status === 'Đã hoàn thành') {
        set.add(`PAID_${s.id}_${s.period || 'cur'}`);
      }
    });
    const arr = Array.from(set).slice(-500);
    localStorage.setItem('TC_NOTIFIED_BANK_TX_IDS', JSON.stringify(arr));
  } catch (e) {}
}

function isAnyAdminModalOpen() {
  const modalIds = [
    'tc-app-dialog-modal',
    'student-modal',
    'student-detail-modal',
    'transaction-modal',
    'bulk-edit-transaction-modal',
    'batch-period-modal',
    'class-schedule-modal'
  ];
  return modalIds.some(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  });
}

// Chế độ 1 chiều (Web -> Google Sheet): Tắt hoàn toàn việc tự động kéo dữ liệu từ Google Sheet về Web
// Chế độ 1 chiều (Web -> Google Sheet): Tắt hoàn toàn việc tự động kéo dữ liệu từ Google Sheet về Web
function startLiveBankPolling() {
  if (livePollingTimer) {
    clearInterval(livePollingTimer);
    livePollingTimer = null;
  }
  seedCurrentBankTxAsNotified(appState);
  const webhookDisplay = document.getElementById('bank-webhook-url-display');
  if (webhookDisplay && getGasUrl()) {
    webhookDisplay.textContent = getGasUrl();
  }
}

function toggleLiveBankPolling(enabled) {
  if (livePollingTimer) {
    clearInterval(livePollingTimer);
    livePollingTimer = null;
  }
  showToast('Đang bật chế độ 1 chiều (Web → Google Sheet): Không lấy dữ liệu từ Google Sheet về Web.', 'info');
}

async function quickTestSepayAlert() {
  // Tìm 1 học sinh đang Chưa đóng hoặc lấy học sinh đầu tiên để test báo số dư + tự động gạch nợ
  const targetStu =
    (appState.students || []).find(s => s.status !== 'Đã hoàn thành') ||
    (appState.students || [])[0];

  const simContentEl = document.getElementById('sim-bank-content');
  const simAmountEl = document.getElementById('sim-bank-amount');

  if (targetStu) {
    const cleanName = removeVietnameseTones(targetStu.fullName).toUpperCase();
    if (simContentEl) simContentEl.value = `HP ${targetStu.studentCode} ${cleanName}`;
    if (simAmountEl) simAmountEl.value = toShortMoney(targetStu.tuitionFee || 600000);
  } else {
    if (simContentEl && !simContentEl.value) simContentEl.value = 'CHUYEN KHOAN HOC PHI TEST SEPAY';
    if (simAmountEl && !simAmountEl.value) simAmountEl.value = toShortMoney(600000);
  }

  await simulateIncomingBankTransfer();
}

function findStudentFromTransferContent(rawContent, txAmount = 0, studentsList = null, requestsList = null) {
  const cleanContent = removeVietnameseTones(rawContent || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleanContent) return null;

  const contentForName = cleanContent
    .replace(/\b(HO KINH DOANH\s+|HKD\s+)?(TRUNG TAM\s+)?HUYNH THANH CHI\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const paddedContent = ` ${contentForName} `;
  const students = Array.isArray(studentsList) ? studentsList : appState.students || [];
  const requests = Array.isArray(requestsList) ? requestsList : appState.paymentRequests || [];
  const stopwords = new Set([
    'HP', 'HOC', 'PHI', 'THANG', 'LOP', 'CK', 'BIDV', 'MB', 'VCB', 'TCB', 'ACB', 'ICB',
    'VPB', 'TPB', 'IBFT', 'MBVCB', 'CHUYEN', 'KHOAN', 'TIEN', 'EM', 'PH', 'CT', 'TU', 'DEN'
  ]);

  const pendingStudentIds = new Set();
  const pendingExactAmtIds = new Set();
  requests.forEach(r => {
    if (!r || r.status !== 'Chờ duyệt' || isSimulatedBankTestItem(r)) return;
    const key = r.studentRecordId || String(r.studentCode || '').toUpperCase();
    if (key) {
      pendingStudentIds.add(key);
      if (txAmount > 0 && Number(r.amount) === Number(txAmount)) {
        pendingExactAmtIds.add(key);
      }
    }
  });

  const pickBestCandidate = candidates => {
    if (candidates.length <= 1) return candidates[0] || null;
    return (
      candidates.find(s => pendingExactAmtIds.has(s.id) || pendingExactAmtIds.has(String(s.studentCode || '').toUpperCase())) ||
      candidates.find(s => pendingStudentIds.has(s.id) || pendingStudentIds.has(String(s.studentCode || '').toUpperCase())) ||
      candidates.find(s => s.status !== 'Đã hoàn thành' && txAmount > 0 && Number(s.tuitionFee) === Number(txAmount)) ||
      candidates.find(s => s.status !== 'Đã hoàn thành') ||
      candidates[0]
    );
  };

  // Vòng 1: Khớp chính xác Mã HS hoặc SĐT phụ huynh
  for (const s of students) {
    const code = removeVietnameseTones(s.studentCode || '').toUpperCase().trim();
    const phone = String(s.parentPhone || '').replace(/[^0-9]/g, '');
    if ((code && code.length >= 3 && cleanContent.includes(code)) || (phone && phone.length >= 8 && cleanContent.includes(phone))) {
      return s;
    }
  }

  // Vòng 2: Khớp Họ tên đầy đủ (hỗ trợ cả tên ngắn >= 2 ký tự như def, Nam, Đô theo ranh giới từ)
  const fullMatches = students.filter(s => {
    const name = removeVietnameseTones(s.fullName || '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (!name || stopwords.has(name)) return false;
    if (name.length >= 5 && name.includes(' ') && contentForName.includes(name)) return true;
    return name.length >= 2 && paddedContent.includes(` ${name} `);
  });
  if (fullMatches.length > 0) return pickBestCandidate(fullMatches);

  // Vòng 3: Khớp 2 từ cuối của tên học sinh (VD: MINH ANH, GIA HUY, BAO NGOC)
  const tailMatches = students.filter(s => {
    const name = removeVietnameseTones(s.fullName || '').toUpperCase().replace(/\s+/g, ' ').trim();
    const words = name.split(' ').filter(Boolean);
    if (words.length < 2) return false;
    const shortName = words.slice(-2).join(' ');
    return shortName.length >= 4 && !stopwords.has(shortName) && paddedContent.includes(` ${shortName} `);
  });
  if (tailMatches.length > 0) return pickBestCandidate(tailMatches);

  return null;
}

async function clearSimulatedBankTests() {
  if (!appState.settings) appState.settings = {};
  if (appState.settings.lastBankAlertJson) {
    try {
      const alertObj = JSON.parse(appState.settings.lastBankAlertJson);
      if (
        alertObj &&
        (alertObj.isTest ||
          String(alertObj.id || '').includes('TEST_STK_') ||
          String(alertObj.id || '').includes('SEPAY_STK_'))
      ) {
        appState.settings.lastBankAlertJson = '';
      }
    } catch (e) {
      appState.settings.lastBankAlertJson = '';
    }
  }

  if (Array.isArray(appState.transactions)) {
    appState.transactions = appState.transactions.filter(t => !isSimulatedBankTestItem(t));
  }
  if (Array.isArray(appState.paymentRequests)) {
    appState.paymentRequests = appState.paymentRequests.filter(r => !isSimulatedBankTestItem(r));
  }

  saveStateToLocal();
  await triggerAutoSyncIfNeeded('Đã xóa toàn bộ lịch sử & đánh dấu Test thử STK!');
}

async function simulateIncomingBankTransfer() {
  const contentInput = document.getElementById('sim-bank-content');
  const amountInput = document.getElementById('sim-bank-amount');
  const rawContent = (contentInput?.value || 'HP HS001 NGUYEN MINH ANH').trim();
  const amount = fromShortMoney(amountInput?.value) || 600000;

  if (!rawContent) {
    showToast('Vui lòng nhập nội dung chuyển khoản giả lập (VD: HP HS001 NGUYEN MINH ANH)!', 'warning');
    return;
  }

  const nowStr = getCurrentDateTimeString();
  const todayDate = new Date().toISOString().slice(0, 10);
  const activeBin = appState.settings?.bankBin || 'BIDV';
  const activeAcc = appState.settings?.bankAccountNo || (isSandboxDraftMode ? '5801434567' : '8601774789');

  // Tìm học sinh khớp Mã HS, Họ tên đầy đủ, Tên gọi hoặc SĐT trong nội dung chuyển khoản
  const matchedStudent = findStudentFromTransferContent(rawContent);

  const simulatedAmount = amount > 0 ? amount : matchedStudent ? matchedStudent.tuitionFee : 600000;
  // QUAN TRỌNG: Đây là thao tác bấm TEST THỬ HOẠT ĐỘNG STK của Quản lý -> Tuyệt đối KHÔNG cộng tiền vào số dư Web!
  const currentRealBalance = getComputedSepayBalance();
  const txRefId = 'TEST_STK_' + Date.now();

  if (!appState.settings) appState.settings = {};
  // Không thay đổi sepayBalance thực tế, chỉ ghi nhận thông báo kèm cờ isTest: true
  appState.settings.lastBankAlertJson = JSON.stringify({
    id: txRefId,
    time: nowStr,
    type: 'in',
    isTest: true,
    testTag: 'TEST THỬ STK (Không cộng tiền vào Web)',
    amount: simulatedAmount,
    balance: currentRealBalance,
    content: rawContent,
    gateway: activeBin,
    accountNumber: activeAcc
  });

  const autoApproveOn = isAutoApprovePaymentEnabled();

  // Ghi nhận bản ghi đánh dấu "Test thử STK" (amount = 0 để KHÔNG cộng tiền vào bất kỳ thống kê nào của Web, và KHÔNG tự ý đổi học sinh thật sang Đã hoàn thành)
  if (!appState.paymentRequests) appState.paymentRequests = [];
  appState.paymentRequests.unshift({
    id: 'YC_' + txRefId,
    submittedAt: nowStr,
    studentRecordId: matchedStudent ? matchedStudent.id : '',
    studentCode: matchedStudent ? matchedStudent.studentCode : 'TEST_STK',
    studentName: matchedStudent ? `${matchedStudent.fullName} (Test thử STK)` : 'Kiểm tra kết nối STK',
    className: matchedStudent ? matchedStudent.className : `${activeBin} • ${activeAcc}`,
    period: matchedStudent ? matchedStudent.period : (appState.settings?.defaultPeriod || 'Test STK'),
    amount: 0,
    testDisplayAmount: simulatedAmount,
    isTest: true,
    parentPhone: matchedStudent ? matchedStudent.parentPhone || '' : '',
    payerName: `Test thử STK ${activeAcc} (${activeBin})`,
    note: `[TEST THỬ STK - Không cộng tiền vào Web] Kiểm tra hoạt động STK (${activeBin} • ${activeAcc}) | ND: ${rawContent}`,
    receiptUrl: '',
    bankVerified: true,
    status: autoApproveOn ? 'Đã duyệt' : 'Chờ duyệt',
    reviewedAt: autoApproveOn ? nowStr : ''
  });

  // Lưu 1 dòng đánh dấu Test thử STK vào Sổ Thu - Chi với số tiền thực tính = 0 ₫ (không cộng vào Tổng Thu hay Tồn Quỹ)
  if (!appState.transactions) appState.transactions = [];
  appState.transactions.unshift({
    id: 'GD_' + txRefId,
    date: todayDate,
    type: 'Thu',
    category: 'Test thử STK',
    amount: 0,
    testDisplayAmount: simulatedAmount,
    isTest: true,
    description: matchedStudent
      ? `[TEST THỬ STK - Không cộng tiền vào Web] Kiểm tra STK (${activeBin} ${activeAcc}) khớp HS ${matchedStudent.studentCode} - ${matchedStudent.fullName} | ND: ${rawContent}`
      : `[TEST THỬ STK - Không cộng tiền vào Web] Kiểm tra hoạt động STK (${activeBin} ${activeAcc}) | ND: ${rawContent}`,
    studentCode: matchedStudent ? matchedStudent.studentCode : '',
    method: 'Test thử STK (0₫)',
    receiptUrl: '',
    createdBy: `Quản lý (Test Thử STK)`
  });

  playTingSound();
  saveStateToLocal();

  const msg = `[TEST THỬ STK • KHÔNG CỘNG TIỀN VÀO WEB] Đã kiểm tra hoạt động STK ${activeAcc} (${activeBin}) thành công! Số dư Web giữ nguyên (${formatCurrency(
    currentRealBalance
  )}).`;

  await triggerAutoSyncIfNeeded(msg);
}


// ============================================================================
// HỆ THỐNG CÀI ĐẶT MÀU SẮC GIAO DIỆN & CHẾ ĐỘ SÁNG / TỐI (LIGHT / DARK MODE)
// ============================================================================
const THEME_STORAGE_KEY = 'edupay_ui_theme_v2';
const CUSTOM_SAVED_THEMES_KEY = 'edupay_custom_saved_themes_v1';

const THEME_PRESETS = {
  thanhchi: {
    key: 'thanhchi',
    name: 'Thanh Chí Edu (Achromatic & Navy)',
    desc: 'Đen #141414 & Xanh Chart #1D5FBF chuẩn sổ cái tài chính',
    primary: '#141414',
    primaryHover: '#262626',
    primaryRgb: '20, 20, 20',
    primaryDark: '#3b82f6',
    navy: '#0f294a',
    navyMid: '#1e3a6d',
    soft: '#f1f5f9',
    border: '#cbd5e1',
    bannerFrom: '#0f172a',
    bannerVia: '#1e293b',
    bannerTo: '#334155'
  },
  navy: {
    key: 'navy',
    name: 'Xanh Navy Chuẩn',
    desc: 'Chuyên nghiệp, chuẩn giáo dục',
    primary: '#1d5fbf',
    primaryHover: '#174ea6',
    primaryRgb: '29, 95, 191',
    primaryDark: '#60a5fa',
    navy: '#1f3d6e',
    navyMid: '#25477d',
    soft: '#eff6ff',
    border: '#bfdbfe',
    bannerFrom: '#0f294a',
    bannerVia: '#173b6c',
    bannerTo: '#1e4b85'
  },
  emerald: {
    key: 'emerald',
    name: 'Xanh Ngọc Lục Bảo',
    desc: 'Tươi mát, dịu mắt, tài chính',
    primary: '#059669',
    primaryHover: '#047857',
    primaryRgb: '5, 150, 105',
    primaryDark: '#10b981',
    navy: '#064e3b',
    navyMid: '#065f46',
    soft: '#ecfdf5',
    border: '#a7f3d0',
    bannerFrom: '#022c22',
    bannerVia: '#064e3b',
    bannerTo: '#047857'
  },
  indigo: {
    key: 'indigo',
    name: 'Tím Indigo Hiện Đại',
    desc: 'Sang trọng, công nghệ cao',
    primary: '#4f46e5',
    primaryHover: '#4338ca',
    primaryRgb: '79, 70, 229',
    primaryDark: '#818cf8',
    navy: '#312e81',
    navyMid: '#3730a3',
    soft: '#eef2ff',
    border: '#c7d2fe',
    bannerFrom: '#1e1b4b',
    bannerVia: '#312e81',
    bannerTo: '#4338ca'
  },
  teal: {
    key: 'teal',
    name: 'Xanh Cổ Vịt (Teal)',
    desc: 'Thanh lịch, cân bằng, hiện đại',
    primary: '#0d9488',
    primaryHover: '#0f766e',
    primaryRgb: '13, 148, 136',
    primaryDark: '#2dd4bf',
    navy: '#134e4a',
    navyMid: '#115e59',
    soft: '#f0fdfa',
    border: '#99f6e4',
    bannerFrom: '#042f2e',
    bannerVia: '#134e4a',
    bannerTo: '#0f766e'
  },
  rose: {
    key: 'rose',
    name: 'Đỏ Ruby Nổi Bật',
    desc: 'Ấm áp, năng động, ấn tượng',
    primary: '#e11d48',
    primaryHover: '#be123c',
    primaryRgb: '225, 29, 72',
    primaryDark: '#f43f5e',
    navy: '#881337',
    navyMid: '#9f1239',
    soft: '#fff1f2',
    border: '#fecdd3',
    bannerFrom: '#4c0519',
    bannerVia: '#881337',
    bannerTo: '#be123c'
  },
  amber: {
    key: 'amber',
    name: 'Cam Hoàng Kim',
    desc: 'Tươi sáng, nhiệt huyết',
    primary: '#d97706',
    primaryHover: '#b45309',
    primaryRgb: '217, 119, 6',
    primaryDark: '#f59e0b',
    navy: '#78350f',
    navyMid: '#92400e',
    soft: '#fffbeb',
    border: '#fde68a',
    bannerFrom: '#451a03',
    bannerVia: '#78350f',
    bannerTo: '#b45309'
  }
};

function getCustomSavedThemes() {
  try {
    const raw = localStorage.getItem(CUSTOM_SAVED_THEMES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

function saveCustomSavedThemes(list) {
  try {
    localStorage.setItem(CUSTOM_SAVED_THEMES_KEY, JSON.stringify(list || []));
  } catch (e) {}
}

function getSavedThemePreferences() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {}
  return {
    darkMode: false,
    themeKey: 'thanhchi',
    customHex: '',
    customName: ''
  };
}

function saveThemePreferences(prefs) {
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(prefs));
}

function hexToRgbTuple(hex) {
  let clean = String(hex || '#1d5fbf').replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  if (clean.length !== 6) return [37, 99, 235];
  const r = parseInt(clean.slice(0, 2), 16) || 37;
  const g = parseInt(clean.slice(2, 4), 16) || 99;
  const b = parseInt(clean.slice(4, 6), 16) || 235;
  return [r, g, b];
}

function getLuminance(r, g, b) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function darkenHex(hex, factor = 0.7) {
  const [r, g, b] = hexToRgbTuple(hex);
  const toHex = n => Math.max(0, Math.min(255, Math.round(n * factor))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lightenHex(hex, mixWhite = 0.92) {
  const [r, g, b] = hexToRgbTuple(hex);
  const mix = c => Math.round(c + (255 - c) * mixWhite).toString(16).padStart(2, '0');
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

function adaptColorForDarkMode(hex) {
  const [r, g, b] = hexToRgbTuple(hex);
  const lum = getLuminance(r, g, b);
  if (lum < 0.2) {
    return lightenHex(hex, 0.45);
  }
  return hex;
}

function applyCssThemeVariables(cfg) {
  const root = document.documentElement;
  const isDark = root.classList.contains('dark-mode');

  const [r, g, b] = hexToRgbTuple(cfg.primary);
  const lum = getLuminance(r, g, b);
  const onPrimary = lum > 0.6 ? '#0a0a0a' : '#ffffff';

  let darkPrimary = cfg.primaryDark || cfg.primary;
  if (!cfg.primaryDark && lum < 0.22) {
    darkPrimary = adaptColorForDarkMode(cfg.primary);
  }
  const [dr, dg, db] = hexToRgbTuple(darkPrimary);
  const darkLum = getLuminance(dr, dg, db);
  const onDarkPrimary = darkLum > 0.6 ? '#0a0a0a' : '#ffffff';

  root.style.setProperty('--brand-primary', cfg.primary);
  root.style.setProperty('--brand-primary-hover', cfg.primaryHover || darkenHex(cfg.primary, 0.85));
  root.style.setProperty('--brand-primary-rgb', `${r}, ${g}, ${b}`);
  root.style.setProperty('--brand-on-primary', onPrimary);

  root.style.setProperty('--brand-primary-darkmode', darkPrimary);
  root.style.setProperty('--brand-on-primary-darkmode', onDarkPrimary);

  root.style.setProperty('--brand-navy', cfg.navy || darkenHex(cfg.primary, 0.52));
  root.style.setProperty('--brand-navy-mid', cfg.navyMid || darkenHex(cfg.primary, 0.65));
  root.style.setProperty('--brand-soft', cfg.soft || lightenHex(cfg.primary, 0.92));
  root.style.setProperty('--brand-border', cfg.border || lightenHex(cfg.primary, 0.72));

  root.style.setProperty('--brand-banner-from', cfg.bannerFrom || darkenHex(cfg.primary, 0.35));
  root.style.setProperty('--brand-banner-via', cfg.bannerVia || darkenHex(cfg.primary, 0.5));
  root.style.setProperty('--brand-banner-to', cfg.bannerTo || darkenHex(cfg.primary, 0.68));

  const swatchDot = document.getElementById('header-theme-color-dot') || document.getElementById('header-theme-swatch-dot');
  if (swatchDot) {
    swatchDot.style.backgroundColor = isDark ? darkPrimary : cfg.primary;
  }
}

function updateDarkModeHeaderUI(isDark) {
  const root = document.documentElement;
  if (isDark) {
    root.classList.add('dark-mode');
  } else {
    root.classList.remove('dark-mode');
  }
  const themeMeta = document.getElementById('meta-theme-color');
  if (themeMeta) {
    themeMeta.setAttribute('content', isDark ? '#060b16' : '#FAFAFC');
  }

  const iconEl = document.getElementById('darkmode-toggle-icon');
  const labelEl = document.getElementById('darkmode-toggle-label');
  if (iconEl) {
    iconEl.innerHTML = isDark
      ? `<i data-lucide="sun" class="w-3.5 h-3.5 text-amber-400"></i>`
      : `<i data-lucide="moon" class="w-3.5 h-3.5 text-slate-900"></i>`;
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons({ nodes: [iconEl] });
    }
  }
  if (labelEl) labelEl.textContent = isDark ? 'Sáng' : 'Tối';

  // Re-apply variables so dark mode adapt tokens update
  const prefs = getSavedThemePreferences();
  if (prefs.themeKey === 'custom' && prefs.customHex) {
    applyCustomHexTheme(prefs.customHex, false, false, prefs.customName);
  } else {
    const preset = THEME_PRESETS[prefs.themeKey] || THEME_PRESETS.thanhchi || THEME_PRESETS.navy;
    applyCssThemeVariables(preset);
  }
}

function initThemeSystem() {
  const prefs = getSavedThemePreferences();
  updateDarkModeHeaderUI(Boolean(prefs.darkMode));
  if (prefs.themeKey === 'custom' && prefs.customHex) {
    applyCustomHexTheme(prefs.customHex, false, false, prefs.customName);
  } else {
    const preset = THEME_PRESETS[prefs.themeKey] || THEME_PRESETS.thanhchi || THEME_PRESETS.navy;
    applyCssThemeVariables(preset);
  }
}

function toggleDarkModeQuick() {
  const prefs = getSavedThemePreferences();
  const nextDark = !prefs.darkMode;
  setDarkMode(nextDark, true);
}

function setDarkMode(isDark, showMsg = true) {
  const prefs = getSavedThemePreferences();
  prefs.darkMode = Boolean(isDark);
  saveThemePreferences(prefs);
  updateDarkModeHeaderUI(prefs.darkMode);
  renderThemeCustomizerControls();
  if (typeof renderAdminDashboard === 'function') {
    renderAdminDashboard();
  }
  if (showMsg) {
    showToast(
      prefs.darkMode ? 'Đã bật Chế độ Tối (Dark Mode) dịu mắt & tương phản cao!' : 'Đã chuyển về Chế độ Sáng (Light Mode)!',
      'info'
    );
  }
}

function applyColorTheme(themeKey, showMsg = true) {
  const preset = THEME_PRESETS[themeKey] || THEME_PRESETS.thanhchi || THEME_PRESETS.navy;
  const prefs = getSavedThemePreferences();
  prefs.themeKey = preset.key;
  prefs.customHex = '';
  prefs.customName = '';
  saveThemePreferences(prefs);
  applyCssThemeVariables(preset);
  renderThemeCustomizerControls();
  if (showMsg) {
    showToast(`Đã đổi tông màu giao diện sang "${preset.name}"!`, 'success');
  }
}

function applyCustomHexTheme(hexColor, savePref = true, showMsg = false, customName = '') {
  let cleanHex = String(hexColor || '#141414').trim();
  if (!cleanHex.startsWith('#')) cleanHex = '#' + cleanHex;
  const [r, g, b] = hexToRgbTuple(cleanHex);
  const darkAdapted = adaptColorForDarkMode(cleanHex);
  const displayName = customName || `Màu tùy chỉnh (${cleanHex.toUpperCase()})`;

  const customCfg = {
    key: 'custom',
    name: displayName,
    primary: cleanHex,
    primaryHover: darkenHex(cleanHex, 0.85),
    primaryRgb: `${r}, ${g}, ${b}`,
    primaryDark: darkAdapted,
    navy: darkenHex(cleanHex, 0.45),
    navyMid: darkenHex(cleanHex, 0.6),
    soft: lightenHex(cleanHex, 0.94),
    border: lightenHex(cleanHex, 0.75),
    bannerFrom: darkenHex(cleanHex, 0.35),
    bannerVia: darkenHex(cleanHex, 0.5),
    bannerTo: darkenHex(cleanHex, 0.68)
  };

  applyCssThemeVariables(customCfg);

  if (savePref) {
    const prefs = getSavedThemePreferences();
    prefs.themeKey = 'custom';
    prefs.customHex = cleanHex.toUpperCase();
    if (customName) prefs.customName = customName;
    saveThemePreferences(prefs);
    renderThemeCustomizerControls();
  }

  if (showMsg) {
    showToast(`Đã áp dụng màu "${displayName}"!`, 'success');
  }
}

function handleCustomColorPickerInput(hexVal) {
  const cleanHex = String(hexVal || '#1D5FBF').toUpperCase();
  const hexInput = document.getElementById('theme-custom-hex-input');
  if (hexInput) hexInput.value = cleanHex;
  applyCustomHexTheme(cleanHex, true, false);
}

function handleCustomHexTextInput(textVal) {
  let raw = String(textVal || '').trim();
  if (!raw.startsWith('#')) raw = '#' + raw;
  if (/^#([0-9A-Fa-f]{6})$/.test(raw)) {
    const picker = document.getElementById('theme-custom-color-picker');
    if (picker) picker.value = raw;
    applyCustomHexTheme(raw, true, false);
  }
}

function saveCustomNamedTheme() {
  const hexInput = document.getElementById('theme-custom-hex-input');
  const picker = document.getElementById('theme-custom-color-picker');
  const nameInput = document.getElementById('theme-custom-name-input');

  let hex = (hexInput?.value || picker?.value || '#1D5FBF').trim();
  if (!hex.startsWith('#')) hex = '#' + hex;
  if (!/^#([0-9A-Fa-f]{6})$/.test(hex)) {
    showToast('Mã màu HEX không hợp lệ! Vui lòng nhập đúng định dạng (VD: #2563EB)', 'error');
    if (hexInput) hexInput.focus();
    return;
  }

  hex = hex.toUpperCase();
  const name = (nameInput?.value || '').trim() || `Màu ${hex}`;

  const savedList = getCustomSavedThemes();
  const existingIdx = savedList.findIndex(t => t && (t.hex === hex || t.name.toLowerCase() === name.toLowerCase()));
  if (existingIdx !== -1) {
    savedList[existingIdx] = { ...savedList[existingIdx], name, hex, updatedAt: Date.now() };
  } else {
    savedList.unshift({
      id: 'CT_' + Date.now(),
      name,
      hex,
      createdAt: Date.now()
    });
  }

  // Cap at 20 themes
  saveCustomSavedThemes(savedList.slice(0, 20));
  applyCustomHexTheme(hex, true, false, name);

  if (nameInput) nameInput.value = '';
  showToast(`Đã lưu và áp dụng bộ màu "${name}" (${hex}) thành công!`, 'success');
  renderThemeCustomizerControls();
}

function applySavedCustomTheme(themeId) {
  const savedList = getCustomSavedThemes();
  const found = savedList.find(t => t && t.id === themeId);
  if (!found) return;
  applyCustomHexTheme(found.hex, true, true, found.name);
}

function deleteSavedCustomTheme(themeId, event) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  const savedList = getCustomSavedThemes();
  const nextList = savedList.filter(t => t && t.id !== themeId);
  saveCustomSavedThemes(nextList);

  const prefs = getSavedThemePreferences();
  if (prefs.themeKey === 'custom') {
    // If deleted theme was active, check if another exists or fall back to default
    const stillExists = nextList.some(t => t.hex.toUpperCase() === (prefs.customHex || '').toUpperCase());
    if (!stillExists) {
      applyColorTheme('thanhchi', false);
    }
  }

  showToast('Đã xóa màu tùy chọn khỏi danh sách lưu.', 'info');
  renderThemeCustomizerControls();
}

function resetDefaultTheme() {
  const prefs = { darkMode: false, themeKey: 'thanhchi', customHex: '', customName: '' };
  saveThemePreferences(prefs);
  updateDarkModeHeaderUI(false);
  applyCssThemeVariables(THEME_PRESETS.thanhchi || THEME_PRESETS.navy);
  renderThemeCustomizerControls();
  if (typeof renderAdminDashboard === 'function') renderAdminDashboard();
  showToast('Đã khôi phục giao diện Thanh Chí Edu mặc định!', 'success');
}

function openThemeCustomizerModal() {
  const modal = document.getElementById('theme-customizer-modal');
  if (!modal) return;
  renderThemeCustomizerControls();
  modal.classList.remove('hidden');
  lucide.createIcons();
}

function closeThemeCustomizerModal() {
  const modal = document.getElementById('theme-customizer-modal');
  if (modal) modal.classList.add('hidden');
}

function renderThemeCustomizerControls() {
  const prefs = getSavedThemePreferences();
  const isDark = Boolean(prefs.darkMode);

  // 1. Sáng / Tối High Contrast Toggle Buttons
  const lightBtn = document.getElementById('theme-mode-light-btn');
  const darkBtn = document.getElementById('theme-mode-dark-btn');
  const lightBadge = document.getElementById('theme-light-active-badge');
  const darkBadge = document.getElementById('theme-dark-active-badge');

  if (lightBtn && darkBtn) {
    if (!isDark) {
      lightBtn.className =
        'p-3.5 rounded-2xl border-2 border-amber-500 bg-amber-50/90 text-amber-950 flex items-center justify-between gap-3 text-left transition cursor-pointer ring-2 ring-amber-400 shadow-md';
      darkBtn.className =
        'p-3.5 rounded-2xl border-2 border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300 flex items-center justify-between gap-3 text-left transition cursor-pointer opacity-75';
    } else {
      darkBtn.className =
        'p-3.5 rounded-2xl border-2 border-blue-500 bg-slate-900 text-white flex items-center justify-between gap-3 text-left transition cursor-pointer ring-2 ring-blue-400 shadow-md';
      lightBtn.className =
        'p-3.5 rounded-2xl border-2 border-slate-700 bg-slate-800/80 text-slate-300 hover:border-slate-600 flex items-center justify-between gap-3 text-left transition cursor-pointer opacity-75';
    }
  }

  if (lightBadge && darkBadge) {
    if (!isDark) {
      lightBadge.className = 'px-2 py-0.5 rounded-full bg-amber-600 text-white text-[11px] font-extrabold shrink-0 shadow-sm';
      lightBadge.textContent = '✓ Đang bật';
      darkBadge.className = 'px-2 py-0.5 rounded-full bg-slate-200 text-slate-500 text-[11px] font-bold shrink-0';
      darkBadge.textContent = 'Tắt';
    } else {
      darkBadge.className = 'px-2 py-0.5 rounded-full bg-blue-600 text-white text-[11px] font-extrabold shrink-0 shadow-sm';
      darkBadge.textContent = '✓ Đang bật';
      lightBadge.className = 'px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[11px] font-bold shrink-0 border border-slate-700';
      lightBadge.textContent = 'Tắt';
    }
  }

  // 2. Active Theme Label & Custom Inputs
  const labelEl = document.getElementById('theme-current-label');
  if (labelEl) {
    if (prefs.themeKey === 'custom' && prefs.customHex) {
      const activeName = prefs.customName || 'Màu tự chọn';
      labelEl.textContent = `${activeName} (${prefs.customHex.toUpperCase()})`;
      labelEl.className = 'text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200';
    } else {
      const p = THEME_PRESETS[prefs.themeKey] || THEME_PRESETS.thanhchi;
      labelEl.textContent = p.name;
      labelEl.className = 'text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200';
    }
  }

  const pickerEl = document.getElementById('theme-custom-color-picker');
  const hexInputEl = document.getElementById('theme-custom-hex-input');
  if (pickerEl && hexInputEl) {
    const activeHex = prefs.customHex || (THEME_PRESETS[prefs.themeKey] || THEME_PRESETS.navy).primary;
    pickerEl.value = activeHex;
    hexInputEl.value = activeHex.toUpperCase();
  }

  // 3. Preset Cards Grid
  const gridEl = document.getElementById('theme-preset-grid');
  if (gridEl) {
    gridEl.innerHTML = Object.values(THEME_PRESETS)
      .map(p => {
        const isSelected = prefs.themeKey === p.key;
        return `
          <button
            type="button"
            onclick="applyColorTheme('${p.key}')"
            class="p-3 rounded-2xl border-2 text-left transition cursor-pointer flex flex-col justify-between gap-2 ${
              isSelected
                ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-300 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5">
                <span class="w-5 h-5 rounded-full border border-white/60 inline-block shrink-0 shadow-sm" style="background-color: ${p.primary}"></span>
                <span class="w-3.5 h-3.5 rounded-full inline-block shrink-0" style="background-color: ${p.navy}"></span>
              </div>
              ${
                isSelected
                  ? `<span class="px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[10px] font-extrabold">Đang dùng</span>`
                  : ''
              }
            </div>
            <div class="min-w-0">
              <div class="font-extrabold text-xs text-slate-900 truncate">${escapeHtml(p.name)}</div>
              <div class="text-[11px] text-slate-500 truncate">${escapeHtml(p.desc)}</div>
            </div>
          </button>
        `;
      })
      .join('');
  }

  // 4. Saved Custom Themes List
  const savedList = getCustomSavedThemes();
  const countEl = document.getElementById('theme-saved-custom-count');
  if (countEl) countEl.textContent = String(savedList.length);

  const savedListEl = document.getElementById('theme-saved-custom-list');
  if (savedListEl) {
    if (savedList.length === 0) {
      savedListEl.innerHTML = `
        <div class="sm:col-span-2 p-3 text-center text-xs text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
          Chưa có màu tự chọn nào được lưu. Bạn có thể chọn màu bất kỳ ở trên và bấm <strong>"Lưu màu"</strong> để lưu giữ.
        </div>
      `;
    } else {
      savedListEl.innerHTML = savedList
        .map(item => {
          const isActive =
            prefs.themeKey === 'custom' &&
            String(prefs.customHex || '').toUpperCase() === String(item.hex || '').toUpperCase();
          return `
            <div
              onclick="applySavedCustomTheme('${escapeAttr(item.id)}')"
              class="p-2.5 rounded-xl border-2 flex items-center justify-between gap-2 transition cursor-pointer ${
                isActive
                  ? 'border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-300 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }"
            >
              <div class="flex items-center gap-2 min-w-0">
                <span class="w-6 h-6 rounded-lg border border-white/60 inline-block shrink-0 shadow-sm" style="background-color: ${item.hex}"></span>
                <div class="min-w-0">
                  <div class="font-extrabold text-xs text-slate-900 truncate">${escapeHtml(item.name)}</div>
                  <div class="text-[11px] font-mono font-semibold text-slate-500">${escapeHtml(item.hex)}</div>
                </div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0" onclick="event.stopPropagation()">
                ${
                  isActive
                    ? `<span class="px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold">Đang dùng</span>`
                    : ''
                }
                <button
                  type="button"
                  onclick="deleteSavedCustomTheme('${escapeAttr(item.id)}', event)"
                  title="Xóa màu này khỏi danh sách lưu"
                  class="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                >
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
          `;
        })
        .join('');
    }
  }

  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

// ============================================================================
// CỐ ĐỊNH THANH TIÊU ĐỀ BẢNG (STICKY TABLE HEADER) KHI CUỘN XEM HỌC SINH
// ============================================================================
let floatingStickyBarEl = null;
let floatingStickyTableEl = null;
let activeStickySourceTable = null;
let stickyHeaderRafId = null;

function ensureFloatingStickyBar() {
  if (floatingStickyBarEl && document.body.contains(floatingStickyBarEl)) {
    return floatingStickyBarEl;
  }
  const bar = document.createElement('div');
  bar.id = 'floating-sticky-thead-bar';
  bar.className = 'hidden';
  const tbl = document.createElement('table');
  tbl.className = 'sheet-table text-xs sm:text-sm';
  bar.appendChild(tbl);
  document.body.appendChild(bar);
  floatingStickyBarEl = bar;
  floatingStickyTableEl = tbl;
  return bar;
}

function syncFloatingStickyTableHeader(forceRebuild = false) {
  const bar = ensureFloatingStickyBar();
  if (currentMode !== 'admin') {
    bar.classList.add('hidden');
    activeStickySourceTable = null;
    return;
  }

  const topNav = document.querySelector('header.sticky');
  const stickyTopOffset = topNav ? Math.max(0, Math.round(topNav.getBoundingClientRect().bottom)) : 0;

  const candidateTables = Array.from(document.querySelectorAll('table.js-sticky-header-table'));
  let targetTable = null;
  let targetThead = null;
  let targetTableRect = null;
  let targetTheadRect = null;

  for (let i = 0; i < candidateTables.length; i++) {
    const tbl = candidateTables[i];
    if (!tbl || tbl.offsetParent === null) continue;
    const thead = tbl.querySelector('thead');
    if (!thead) continue;
    const tblRect = tbl.getBoundingClientRect();
    const thRect = thead.getBoundingClientRect();
    if (tblRect.width < 50 || thRect.height < 10) continue;

    // Khi đỉnh bảng đã cuộn vượt qua thanh Header trên cùng, và đáy bảng vẫn còn đủ dòng học sinh bên dưới
    if (tblRect.top < stickyTopOffset && tblRect.bottom > stickyTopOffset + thRect.height + 34) {
      targetTable = tbl;
      targetThead = thead;
      targetTableRect = tblRect;
      targetTheadRect = thRect;
      break;
    }
  }

  if (!targetTable || !targetThead) {
    bar.classList.add('hidden');
    activeStickySourceTable = null;
    return;
  }

  const wrap = targetTable.closest('.js-sticky-table-wrap') || targetTable.parentElement;
  const wrapRect = wrap ? wrap.getBoundingClientRect() : targetTableRect;
  const needRebuild = forceRebuild || activeStickySourceTable !== targetTable || !floatingStickyTableEl.innerHTML;

  // Đọc toàn bộ kích thước cột trước khi ghi DOM để tránh ép trình duyệt reflow lặp lại khi cuộn
  let measuredColWidths = null;
  if (needRebuild) {
    const origFirstRowCells = targetThead.querySelectorAll('tr:first-child > th, tr:first-child > td');
    measuredColWidths = Array.from(origFirstRowCells, cell => cell.getBoundingClientRect().width);
  }

  bar.classList.remove('hidden');
  const nextTop = `${stickyTopOffset}px`;
  const nextLeft = `${Math.round(wrapRect.left)}px`;
  const nextWidth = `${Math.round(wrapRect.width)}px`;
  if (bar.style.top !== nextTop) bar.style.top = nextTop;
  if (bar.style.left !== nextLeft) bar.style.left = nextLeft;
  if (bar.style.width !== nextWidth) bar.style.width = nextWidth;

  if (needRebuild) {
    activeStickySourceTable = targetTable;
    floatingStickyTableEl.className = targetTable.className.replace('js-sticky-header-table', '');
    const clonedThead = targetThead.cloneNode(true);
    clonedThead.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    floatingStickyTableEl.innerHTML = '';
    floatingStickyTableEl.appendChild(clonedThead);

    const tblWidthPx = `${targetTableRect.width}px`;
    floatingStickyTableEl.style.width = tblWidthPx;
    floatingStickyTableEl.style.minWidth = tblWidthPx;

    const cloneFirstRowCells = floatingStickyTableEl.querySelectorAll('thead tr:first-child > th, thead tr:first-child > td');
    for (let c = 0; c < measuredColWidths.length && c < cloneFirstRowCells.length; c++) {
      const px = `${measuredColWidths[c].toFixed(2)}px`;
      cloneFirstRowCells[c].style.width = px;
      cloneFirstRowCells[c].style.minWidth = px;
      cloneFirstRowCells[c].style.maxWidth = px;
      cloneFirstRowCells[c].style.boxSizing = 'border-box';
    }
  }

  const scrollLeft = wrap ? wrap.scrollLeft : 0;
  floatingStickyTableEl.style.transform = `translate3d(${-scrollLeft}px, 0, 0)`;
}

function scrollToPageTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleGoToHomePage() {
  const isAuth = isAdminAuthenticated();
  if (currentMode === 'admin' && isAuth) {
    if (currentAdminTab !== 'classbook') {
      switchAdminTab('classbook');
    }
  } else {
    switchAppMode('parent');
  }
  scrollToPageTop();
}

let _scrollTopBtnShown = false;
function updateScrollToTopButtonVisibility() {
  const shouldShow = window.scrollY > 220;
  if (shouldShow === _scrollTopBtnShown) return;
  const btn = document.getElementById('btn-scroll-to-top');
  if (!btn) return;
  _scrollTopBtnShown = shouldShow;
  if (shouldShow) {
    btn.classList.remove('hidden');
    btn.classList.add('inline-flex');
  } else {
    btn.classList.add('hidden');
    btn.classList.remove('inline-flex');
  }
}

function scheduleStickyHeaderSync(forceRebuild = false) {
  if (forceRebuild) {
    updateScrollToTopButtonVisibility();
    syncFloatingStickyTableHeader(true);
    return;
  }
  if (stickyHeaderRafId) return;
  stickyHeaderRafId = requestAnimationFrame(() => {
    stickyHeaderRafId = null;
    updateScrollToTopButtonVisibility();
    syncFloatingStickyTableHeader(false);
  });
}

function initStickyTableHeaderEngine() {
  window.addEventListener('scroll', () => scheduleStickyHeaderSync(false), { passive: true });
  window.addEventListener('resize', () => scheduleStickyHeaderSync(true), { passive: true });
  document.querySelectorAll('.js-sticky-table-wrap').forEach(wrap => {
    wrap.addEventListener('scroll', () => scheduleStickyHeaderSync(false), { passive: true });
  });
  updateScrollToTopButtonVisibility();
}

// ============================================================================
// HỘP HỘI THOẠI & BỘ CHỌN LỊCH ĐỒNG BỘ PHONG CÁCH THANH CHÍ EDU (SAAS PREMIUM)
// ============================================================================
let _activeTcDialogResolver = null;
let _activeTcDialogConfig = null;

function inferTcDialogTone(text = '', mode = 'confirm') {
  const s = String(text || '').toLowerCase();
  if (s.includes('xóa') || s.includes('hủy')) return 'rose';
  if (s.includes('số dư') || s.includes('học phí') || s.includes('đồng bộ')) return 'emerald';
  if (s.includes('mật khẩu') || s.includes('khôi phục') || s.includes('nháp') || s.includes('')) return 'amber';
  return mode === 'prompt' ? 'indigo' : 'indigo';
}

function updateTcDialogMoneyPreview(rawVal) {
  const wrap = document.getElementById('tc-dialog-money-preview');
  const valEl = document.getElementById('tc-dialog-money-preview-val');
  if (!wrap || !valEl) return;
  if (!_activeTcDialogConfig || !_activeTcDialogConfig.moneyPreview) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  if (_activeTcDialogConfig.mode === 'fields') {
    const rateEl = document.querySelector('#tc-dialog-fields-wrap [data-field-key="rateInput"]');
    const sessEl = document.querySelector('#tc-dialog-fields-wrap [data-field-key="sessionCount"]');
    if (rateEl && sessEl) {
      const rateVnd = fromShortMoney(rateEl.value);
      const sess = Math.max(1, parseInt(sessEl.value, 10) || 1);
      valEl.textContent = isNaN(rateVnd)
        ? '0 ₫'
        : `${formatCurrency(rateVnd)}/b × ${sess}b = ${formatCurrency(rateVnd * sess)}`;
      return;
    }
  }
  const str = String(rawVal ?? '').trim();
  const vnd = str === '0' ? 0 : fromShortMoney(str);
  valEl.textContent = isNaN(vnd) ? '0 ₫' : formatCurrency(vnd);
}

function showTcAppDialog(options = {}) {
  const modal = document.getElementById('tc-app-dialog-modal');
  const isRealBrowserDom =
    Boolean(modal) && (Boolean(window.__FORCE_TC_DIALOG_UI__) || typeof window.HTMLElement !== 'undefined');

  const mode = options.mode || 'confirm';
  const message = String(options.message || '').trim();
  const defaultValue = options.defaultValue !== undefined ? String(options.defaultValue) : '';

  if (!isRealBrowserDom) {
    if (mode === 'confirm') {
      return Promise.resolve(typeof confirm === 'function' ? Boolean(confirm(message)) : true);
    }
    if (mode === 'fields') {
      const out = {};
      for (const f of options.fields || []) {
        const ans = typeof prompt === 'function' ? prompt(f.label, f.defaultValue || '') : f.defaultValue || '';
        if (ans === null) return Promise.resolve(null);
        out[f.key] = ans;
      }
      return Promise.resolve(out);
    }
    return Promise.resolve(typeof prompt === 'function' ? prompt(message, defaultValue) : defaultValue);
  }

  if (_activeTcDialogResolver) {
    const prev = _activeTcDialogResolver;
    _activeTcDialogResolver = null;
    prev(mode === 'confirm' ? false : null);
  }

  const tone = options.tone || inferTcDialogTone(`${options.title || ''} ${message}`, mode);
  const title =
    options.title ||
    (mode === 'confirm'
      ? tone === 'rose'
        ? 'Xác nhận thao tác xóa'
        : 'Xác nhận thao tác'
      : 'Nhập thông tin');
  const badge =
    options.badge ||
    (mode === 'confirm'
      ? tone === 'rose'
        ? 'THANH CHÍ EDU • CẢNH BÁO XÓA'
        : 'THANH CHÍ EDU • XÁC NHẬN'
      : 'THANH CHÍ EDU • NHẬP LIỆU');

  _activeTcDialogConfig = { ...options, mode, tone, title, badge, message, defaultValue };

  const stripEl = document.getElementById('tc-dialog-header-strip');
  const iconWrap = document.getElementById('tc-dialog-icon-wrap');
  const badgeEl = document.getElementById('tc-dialog-badge');
  const titleEl = document.getElementById('tc-dialog-title');
  const msgEl = document.getElementById('tc-dialog-message');
  const formEl = document.getElementById('tc-dialog-form');
  const fieldsWrap = document.getElementById('tc-dialog-fields-wrap');
  const okBtn = document.getElementById('tc-dialog-ok-btn');
  const cancelBtn = document.getElementById('tc-dialog-cancel-btn');

  const toneMeta = {
    indigo: {
      strip: 'h-1.5 w-full bg-[#141414] from-[#0a0a0a] via-[#141414] to-[#141414]',
      iconWrap: 'w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-slate-100 text-slate-900 border border-slate-200 ',
      icon: mode === 'prompt' ? 'edit-3' : 'Sparkles',
      okBtn: 'px-4 py-2.5 rounded-xl bg-[#141414] from-[#141414] to-[#141414] hover:from-[#4A44F2] hover:to-[#6956F5] text-white text-xs sm:text-sm font-extrabold  transition inline-flex items-center gap-1.5 cursor-pointer'
    },
    emerald: {
      strip: 'h-1.5 w-full bg-[#141414]   ',
      iconWrap: 'w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-emerald-50 text-emerald-600 border border-emerald-200 ',
      icon: 'wallet',
      okBtn: 'px-4 py-2.5 rounded-xl bg-[#141414]   hover: hover: text-white text-xs sm:text-sm font-extrabold  transition inline-flex items-center gap-1.5 cursor-pointer'
    },
    amber: {
      strip: 'h-1.5 w-full bg-[#141414]   ',
      iconWrap: 'w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-amber-50 text-amber-600 border border-amber-200 ',
      icon: 'shield-alert',
      okBtn: 'px-4 py-2.5 rounded-xl bg-[#141414]   hover: hover: text-white text-xs sm:text-sm font-extrabold  transition inline-flex items-center gap-1.5 cursor-pointer'
    },
    rose: {
      strip: 'h-1.5 w-full bg-[#141414]   ',
      iconWrap: 'w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-rose-50 text-rose-600 border border-rose-200 ',
      icon: 'trash-2',
      okBtn: 'px-4 py-2.5 rounded-xl bg-[#141414]   hover: hover: text-white text-xs sm:text-sm font-extrabold  transition inline-flex items-center gap-1.5 cursor-pointer'
    }
  }[tone] || {
    strip: 'h-1.5 w-full bg-[#141414] from-[#0a0a0a] via-[#141414] to-[#141414]',
    iconWrap: 'w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-slate-100 text-slate-900 border border-slate-200 ',
    icon: 'check-circle-2',
    okBtn: 'px-4 py-2.5 rounded-xl bg-[#141414] from-[#141414] to-[#141414] text-white text-xs sm:text-sm font-extrabold  transition inline-flex items-center gap-1.5 cursor-pointer'
  };

  if (stripEl) stripEl.className = toneMeta.strip;
  if (iconWrap) {
    iconWrap.className = toneMeta.iconWrap;
    iconWrap.innerHTML = `<i data-lucide="${toneMeta.icon}" class="w-5 h-5"></i>`;
  }
  if (badgeEl) badgeEl.textContent = badge;
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (cancelBtn) cancelBtn.textContent = options.cancelText || 'Hủy';
  if (okBtn) {
    okBtn.className = toneMeta.okBtn;
    okBtn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i><span>${escapeHtml(
      options.okText || (mode === 'confirm' ? 'Xác nhận' : 'Lưu lại')
    )}</span>`;
  }

  if (formEl && fieldsWrap) {
    formEl.classList.remove('hidden');
    if (mode === 'confirm') {
      fieldsWrap.classList.add('hidden');
      fieldsWrap.innerHTML = '';
      updateTcDialogMoneyPreview('');
    } else if (mode === 'fields') {
      fieldsWrap.classList.remove('hidden');
      const fields = Array.isArray(options.fields) ? options.fields : [];
      fieldsWrap.innerHTML = fields
        .map((f, idx) => {
          if (f.type === 'select' && Array.isArray(f.options)) {
            const optsHtml = f.options
              .map(
                o =>
                  `<option value="${escapeAttr(o.value)}" ${
                    String(o.value) === String(f.defaultValue ?? '') ? 'selected' : ''
                  }>${escapeHtml(o.label)}</option>`
              )
              .join('');
            return `
              <div>
                <label class="block text-[11px] font-bold text-slate-600 mb-1">${escapeHtml(f.label || '')}</label>
                <select
                  id="tc-dialog-input-${idx}"
                  data-field-key="${escapeAttr(f.key || String(idx))}"
                  class="tc-dialog-input cursor-pointer"
                >${optsHtml}</select>
              </div>
            `;
          }
          return `
          <div>
            <label class="block text-[11px] font-bold text-slate-600 mb-1">${escapeHtml(f.label || '')}</label>
            <input
              id="tc-dialog-input-${idx}"
              data-field-key="${escapeAttr(f.key || String(idx))}"
              type="${escapeAttr(f.type || 'text')}"
              value="${escapeAttr(f.defaultValue || '')}"
              placeholder="${escapeAttr(f.placeholder || '')}"
              oninput="${f.moneyPreview ? 'updateTcDialogMoneyPreview(this.value)' : ''}"
              class="tc-dialog-input"
              autocomplete="off"
            />
          </div>
        `;
        })
        .join('');
      const moneyField = fields.find(f => f.moneyPreview);
      updateTcDialogMoneyPreview(moneyField ? moneyField.defaultValue || '' : '');
    } else {
      fieldsWrap.classList.remove('hidden');
      const inputType = options.inputType || 'text';
      fieldsWrap.innerHTML = `
        <div>
          <input
            id="tc-dialog-input-0"
            type="${escapeAttr(inputType)}"
            value="${escapeAttr(defaultValue)}"
            placeholder="${escapeAttr(options.placeholder || 'Nhập giá trị...')}"
            oninput="updateTcDialogMoneyPreview(this.value)"
            class="tc-dialog-input ${options.moneyPreview ? 'text-base font-black tracking-tight' : ''}"
            autocomplete="off"
          />
        </div>
      `;
      updateTcDialogMoneyPreview(defaultValue);
    }
  }

  modal.classList.remove('hidden');
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }

  setTimeout(() => {
    const firstInput = document.getElementById('tc-dialog-input-0');
    if (firstInput && typeof firstInput.focus === 'function') {
      firstInput.focus();
      if (typeof firstInput.select === 'function') firstInput.select();
    } else if (okBtn && typeof okBtn.focus === 'function') {
      okBtn.focus();
    }
  }, 20);

  return new Promise(resolve => {
    _activeTcDialogResolver = resolve;
  });
}

function resolveTcAppDialog(confirmed = false) {
  const modal = document.getElementById('tc-app-dialog-modal');
  if (modal) modal.classList.add('hidden');

  const resolver = _activeTcDialogResolver;
  const cfg = _activeTcDialogConfig || { mode: 'confirm' };
  _activeTcDialogResolver = null;
  _activeTcDialogConfig = null;
  if (!resolver) return;

  if (cfg.mode === 'confirm') {
    resolver(Boolean(confirmed));
    return;
  }
  if (!confirmed) {
    resolver(null);
    return;
  }
  if (cfg.mode === 'fields') {
    const out = {};
    const fields = Array.isArray(cfg.fields) ? cfg.fields : [];
    fields.forEach((f, idx) => {
      const el = document.getElementById(`tc-dialog-input-${idx}`);
      out[f.key || String(idx)] = el ? el.value : f.defaultValue || '';
    });
    resolver(out);
    return;
  }
  const inputEl = document.getElementById('tc-dialog-input-0');
  resolver(inputEl ? String(inputEl.value ?? '') : cfg.defaultValue || '');
}

function submitTcAppDialogForm(event) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }
  resolveTcAppDialog(true);
}

function appConfirm(message, opts = {}) {
  return showTcAppDialog({ ...opts, mode: 'confirm', message });
}

function appPrompt(message, defaultValue = '', opts = {}) {
  return showTcAppDialog({ ...opts, mode: 'prompt', message, defaultValue });
}

// ============================================================================
// BỘ CHỌN NGÀY THÁNG (CUSTOM DATE PICKER POPOVER) ĐỒNG BỘ GIAO DIỆN APP
// ============================================================================
let _tcDatePickerState = {
  open: false,
  anchorEl: null,
  selectedIso: '',
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth() + 1,
  title: 'Chọn ngày',
  allowClear: true,
  onSelect: null
};

function parseIsoYearMonthDay(isoStr) {
  const m = String(isoStr || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function formatYearMonthDayIso(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; /* taste-skill-ignore */
}

function positionTcDatePickerPopover() {
  const pop = document.getElementById('tc-datepicker-popover');
  const anchor = _tcDatePickerState.anchorEl;
  if (!pop || !anchor || typeof anchor.getBoundingClientRect !== 'function') return;

  pop.style.maxHeight = '';
  pop.style.overflowY = '';

  const rect = anchor.getBoundingClientRect();
  const popWidth = pop.offsetWidth || 296;
  const popHeight = pop.offsetHeight || 338;
  const vw = window.innerWidth || 1024;
  const vh = window.innerHeight || 768;

  let left = rect.left;
  if (left + popWidth > vw - 12) {
    left = Math.max(12, vw - popWidth - 12);
  }
  left = Math.max(12, left);

  const spaceBelow = vh - rect.bottom - 12;
  const spaceAbove = rect.top - 12;
  let top = rect.bottom + 6;

  // Không bao giờ đặt hộp lịch đè lên ô input đang bấm (tránh lỗi mousedown/mouseup khác phần tử làm tự đóng hộp thoại)
  if (spaceBelow >= popHeight || spaceBelow >= spaceAbove) {
    top = rect.bottom + 6;
    if (top + popHeight > vh - 8) {
      const availH = Math.max(180, vh - top - 8);
      pop.style.maxHeight = `${Math.round(availH)}px`;
      pop.style.overflowY = 'auto';
    }
  } else {
    const availH = Math.min(popHeight, Math.max(180, spaceAbove - 6));
    if (availH < popHeight) {
      pop.style.maxHeight = `${Math.round(availH)}px`;
      pop.style.overflowY = 'auto';
    }
    top = Math.max(8, rect.top - availH - 6);
  }

  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

function renderTcDatePickerPopover() {
  const pop = document.getElementById('tc-datepicker-popover');
  if (!pop) return;

  const { viewYear, viewMonth, selectedIso, title, allowClear } = _tcDatePickerState;
  const now = new Date();
  const todayIso = formatYearMonthDayIso(now.getFullYear(), now.getMonth() + 1, now.getDate());

  const firstDayDate = new Date(viewYear, viewMonth - 1, 1);
  // Quy đổi Thứ Hai = 0 ... Chủ Nhật = 6
  const startOffset = (firstDayDate.getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth - 1, 0).getDate();

  const cells = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const prevM = viewMonth === 1 ? 12 : viewMonth - 1;
    const prevY = viewMonth === 1 ? viewYear - 1 : viewYear;
    cells.push({
      iso: formatYearMonthDayIso(prevY, prevM, d),
      day: d,
      outside: true
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      iso: formatYearMonthDayIso(viewYear, viewMonth, d),
      day: d,
      outside: false
    });
  }
  while (cells.length < 42) {
    const d = cells.length - (startOffset + daysInMonth) + 1;
    const nextM = viewMonth === 12 ? 1 : viewMonth + 1;
    const nextY = viewMonth === 12 ? viewYear + 1 : viewYear;
    cells.push({
      iso: formatYearMonthDayIso(nextY, nextM, d),
      day: d,
      outside: true
    });
  }

  const monthOptions = Array.from({ length: 12 }, (_, idx) => {
    const m = idx + 1;
    return `<option value="${m}" ${m === viewMonth ? 'selected' : ''}>Tháng ${m}</option>`;
  }).join('');

  const minYear = Math.min(2020, viewYear - 3);
  const maxYear = Math.max(2032, viewYear + 3);
  let yearOptions = '';
  for (let y = minYear; y <= maxYear; y++) {
    yearOptions += `<option value="${y}" ${y === viewYear ? 'selected' : ''}>Năm ${y}</option>`;
  }

  const selectedLabel = selectedIso ? formatShortDateVN(selectedIso) : 'Chưa chọn';

  pop.innerHTML = `
    <div class="tc-datepicker-header">
      <div class="flex items-center justify-between gap-2 mb-2">
        <span class="text-xs font-extrabold uppercase tracking-normal text-slate-200 flex items-center gap-1.5">
          <i data-lucide="calendar-days" class="w-3.5 h-3.5 text-amber-300"></i>
          <span>${escapeHtml(title || 'Chọn ngày')}</span>
        </span>
        <button
          type="button"
          onclick="closeTcDatePickerPopover()"
          class="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition cursor-pointer"
          title="Đóng lịch"
        >
          <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
      </div>
      <div class="flex items-center justify-between gap-1.5">
        <div class="flex items-center gap-1.5">
          <select
            id="tc-dp-month-select"
            onchange="changeTcDatePickerMonthYear(this.value, null)"
            class="tc-dp-select"
          >
            ${monthOptions}
          </select>
          <select
            id="tc-dp-year-select"
            onchange="changeTcDatePickerMonthYear(null, this.value)"
            class="tc-dp-select"
          >
            ${yearOptions}
          </select>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            onclick="stepTcDatePickerMonth(-1)"
            class="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
            title="Tháng trước"
          >
            <i data-lucide="chevron-left" class="w-4 h-4"></i>
          </button>
          <button
            type="button"
            onclick="stepTcDatePickerMonth(1)"
            class="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
            title="Tháng sau"
          >
            <i data-lucide="chevron-right" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    </div>
    <div class="p-3">
      <div class="grid grid-cols-7 gap-1 mb-1 text-center">
        <span class="text-xs font-extrabold text-slate-400 py-1">T2</span>
        <span class="text-xs font-extrabold text-slate-400 py-1">T3</span>
        <span class="text-xs font-extrabold text-slate-400 py-1">T4</span>
        <span class="text-xs font-extrabold text-slate-400 py-1">T5</span>
        <span class="text-xs font-extrabold text-slate-400 py-1">T6</span>
        <span class="text-xs font-extrabold text-slate-700 py-1">T7</span>
        <span class="text-xs font-extrabold text-rose-500 py-1">CN</span>
      </div>
      <div class="grid grid-cols-7 gap-1">
        ${cells
          .map(c => {
            const isSel = c.iso === selectedIso;
            const isToday = c.iso === todayIso;
            return `<button
              type="button"
              onclick="selectTcDatePickerDay('${c.iso}')"
              class="tc-dp-day ${isSel ? 'is-selected' : ''} ${isToday ? 'is-today' : ''} ${
              c.outside ? 'is-outside' : ''
            }"
            >${c.day}</button>`;
          })
          .join('')}
      </div>
      <div class="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
        ${
          allowClear
            ? `<button
                type="button"
                onclick="selectTcDatePickerDay('')"
                class="px-2.5 py-1 rounded-lg text-[11px] font-bold text-rose-600 hover:bg-rose-50 transition cursor-pointer"
              >
                Xóa
              </button>`
            : `<span class="text-[11px] font-semibold text-slate-400">Đang chọn:</span>`
        }
        <span class="text-[11px] font-extrabold text-slate-900">${escapeHtml(selectedLabel)}</span>
        <button
          type="button"
          onclick="selectTcDatePickerDay('${todayIso}')"
          class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-100 text-slate-900 text-[11px] font-extrabold transition cursor-pointer"
        >
          Hôm nay
        </button>
      </div>
    </div>
  `;

  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

function openTcDatePicker(options = {}) {
  const pop = document.getElementById('tc-datepicker-popover');
  if (!pop) return;

  const parsed = parseIsoYearMonthDay(options.selectedIso);
  const now = new Date();
  _tcDatePickerState = {
    open: true,
    openedAt: Date.now(),
    pointerDownInside: true,
    anchorEl: options.anchorEl || null,
    selectedIso: parsed ? options.selectedIso : '',
    viewYear: parsed ? parsed.year : now.getFullYear(),
    viewMonth: parsed ? parsed.month : now.getMonth() + 1,
    title: options.title || 'Chọn ngày',
    allowClear: options.allowClear !== false,
    onSelect: typeof options.onSelect === 'function' ? options.onSelect : null
  };

  renderTcDatePickerPopover();
  pop.classList.remove('hidden');
  positionTcDatePickerPopover();
}

function stepTcDatePickerMonth(delta) {
  let m = _tcDatePickerState.viewMonth + Number(delta || 0);
  let y = _tcDatePickerState.viewYear;
  if (m < 1) {
    m = 12;
    y -= 1;
  } else if (m > 12) {
    m = 1;
    y += 1;
  }
  _tcDatePickerState.viewMonth = m;
  _tcDatePickerState.viewYear = y;
  renderTcDatePickerPopover();
}

function changeTcDatePickerMonthYear(newMonth, newYear) {
  if (newMonth !== null && newMonth !== undefined) {
    _tcDatePickerState.viewMonth = Math.min(12, Math.max(1, parseInt(newMonth, 10) || 1));
  }
  if (newYear !== null && newYear !== undefined) {
    _tcDatePickerState.viewYear = parseInt(newYear, 10) || new Date().getFullYear();
  }
  renderTcDatePickerPopover();
}

function selectTcDatePickerDay(isoStr) {
  const cb = _tcDatePickerState.onSelect;
  closeTcDatePickerPopover();
  if (typeof cb === 'function') {
    cb(String(isoStr || ''));
  }
}

function closeTcDatePickerPopover() {
  _tcDatePickerState.open = false;
  const pop = document.getElementById('tc-datepicker-popover');
  if (pop) pop.classList.add('hidden');
}

function openStudentStartDatePicker(arg1, arg2, arg3) {
  const isFirstEl = Boolean(arg1 && typeof arg1 === 'object');
  const btnEl = isFirstEl ? arg1 : arg3;
  const studentId = isFirstEl ? String(arg2 || '') : String(arg1 || '');
  const currentIso = isFirstEl ? String(arg3 || '') : String(arg2 || '');
  const s = (appState.students || []).find(item => item.id === studentId);
  const stuTitle = s ? `Bắt đầu học - ${s.fullName}` : 'Ngày bắt đầu học';
  openTcDatePicker({
    anchorEl: btnEl,
    selectedIso: currentIso || '',
    title: stuTitle,
    allowClear: false,
    onSelect: nextIso => {
      if (nextIso) {
        updateStudentStartDate(studentId, nextIso);
      }
    }
  });
}

function openTcDatePickerForInput(inputEl, customTitle = '') {
  if (!inputEl) return;
  const labelEl = inputEl.closest('div')?.querySelector('label');
  const titleText =
    customTitle ||
    inputEl.getAttribute('title') ||
    (labelEl ? labelEl.textContent.trim() : '') ||
    'Chọn ngày tháng';
  openTcDatePicker({
    anchorEl: inputEl,
    selectedIso: inputEl.value || '',
    title: titleText,
    allowClear: true,
    onSelect: nextIso => {
      inputEl.value = nextIso;
      if (typeof Event === 'function') {
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (typeof inputEl.onchange === 'function') {
        inputEl.onchange();
      }
    }
  });
}

function initTcCustomDatePickerEngine() {
  if (typeof document.addEventListener !== 'function') return;

  const handleDateInputTrigger = e => {
    const target = e.target;
    if (!target || typeof target.closest !== 'function') return false;
    const dateInput = target.closest('input[type="date"]');
    if (dateInput && !dateInput.disabled && !dateInput.readOnly) {
      e.preventDefault();
      if (_tcDatePickerState.open && _tcDatePickerState.anchorEl === dateInput) {
        _tcDatePickerState.openedAt = Date.now();
        _tcDatePickerState.pointerDownInside = true;
        positionTcDatePickerPopover();
        return true;
      }
      openTcDatePickerForInput(dateInput);
      return true;
    }
    return false;
  };

  document.addEventListener(
    'mousedown',
    e => {
      if (handleDateInputTrigger(e)) return;
      if (_tcDatePickerState.open) {
        const target = e.target;
        const pop = document.getElementById('tc-datepicker-popover');
        const insidePop = Boolean(pop && target && typeof pop.contains === 'function' && pop.contains(target));
        const insideAnchor = Boolean(
          _tcDatePickerState.anchorEl &&
            target &&
            typeof _tcDatePickerState.anchorEl.contains === 'function' &&
            _tcDatePickerState.anchorEl.contains(target)
        );
        _tcDatePickerState.pointerDownInside = insidePop || insideAnchor;
        if (!insidePop && !insideAnchor) {
          if (_tcDatePickerState.openedAt && Date.now() - _tcDatePickerState.openedAt < 350) {
            return;
          }
          closeTcDatePickerPopover();
        }
      }
    },
    true
  );

  document.addEventListener(
    'click',
    e => {
      const t = e.target;
      if (t && typeof t.closest === 'function') {
        if (!t.closest('[id^="quick-assign-suggest-box"]') && !t.closest('[id^="quick-assign-stu-input"]')) {
          document.querySelectorAll('[id^="quick-assign-suggest-box"]').forEach(el => el.classList.add('hidden'));
        }
      }
      if (handleDateInputTrigger(e)) return;
      const target = e.target;
      if (!target || typeof target.closest !== 'function') return;

      if (_tcNotifPopoverOpen) {
        const notifPop = document.getElementById('tc-notification-popover');
        const notifBtn = document.getElementById('btn-header-notifications');
        const insideNotif = notifPop && typeof notifPop.contains === 'function' && notifPop.contains(target);
        const insideBtn = notifBtn && typeof notifBtn.contains === 'function' && notifBtn.contains(target);
        if (!insideNotif && !insideBtn) {
          closeTcNotificationPopover();
        }
      }

      if (_tcDatePickerState.open) {
        if (_tcDatePickerState.pointerDownInside) {
          _tcDatePickerState.pointerDownInside = false;
          return;
        }
        if (_tcDatePickerState.openedAt && Date.now() - _tcDatePickerState.openedAt < 450) {
          return;
        }
        const pop = document.getElementById('tc-datepicker-popover');
        const clickedInsidePop = pop && typeof pop.contains === 'function' && pop.contains(target);
        const clickedAnchor =
          _tcDatePickerState.anchorEl &&
          typeof _tcDatePickerState.anchorEl.contains === 'function' &&
          _tcDatePickerState.anchorEl.contains(target);
        if (!clickedInsidePop && !clickedAnchor) {
          closeTcDatePickerPopover();
        }
      }
    },
    true
  );

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (_tcNotifPopoverOpen) {
        closeTcNotificationPopover();
      }
      if (_tcDatePickerState.open) {
        closeTcDatePickerPopover();
      }
      if (_activeTcDialogResolver) {
        resolveTcAppDialog(false);
      }
    }
  });

  window.addEventListener(
    'scroll',
    () => {
      if (_tcDatePickerState.open) positionTcDatePickerPopover();
    },
    { passive: true }
  );
  window.addEventListener(
    'resize',
    () => {
      if (_tcDatePickerState.open) positionTcDatePickerPopover();
    },
    { passive: true }
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    bootstrapApp();
    initStickyTableHeaderEngine();
    initTcCustomDatePickerEngine();
  });
} else {
  bootstrapApp();
  initStickyTableHeaderEngine();
  initTcCustomDatePickerEngine();
}
