/**
 * ============================================================================
 * GOOGLE APPS SCRIPT - BACKEND ĐỒNG BỘ 2 CHIỀU CHO WEB APP QUẢN LÝ HỌC SINH & THU CHI
 * ============================================================================
 * Hướng dẫn cài đặt:
 * 1. Mở một file Google Sheet mới trên Google Drive của bạn.
 * 2. Vào menu Tiện ích mở rộng (Extensions) -> Apps Script.
 * 3. Xóa toàn bộ code mặc định trong file Code.gs và dán toàn bộ đoạn code này vào.
 * 4. Bấm biểu tượng Đĩa mềm (Lưu) -> Chọn hàm "setupSheets" trên thanh công cụ -> Bấm "Chạy" (Run) để tạo sẵn các bảng.
 * 5. Bấm nút "Triển khai" (Deploy) -> "Tùy chọn triển khai mới" (New deployment).
 *    - Loại: "Ứng dụng web" (Web app)
 *    - Thực thi dưới dạng (Execute as): "Tôi" (Me)
 *    - Ai có quyền truy cập (Who has access): "Bất kỳ ai" (Anyone)
 * 6. Bấm "Triển khai" (Deploy), cấp quyền truy cập và sao chép URL Web App (có đuôi /exec) dán vào mục Cài đặt trên Web App.
 * ============================================================================
 */

const SPREADSHEET_ID = '1dObYu0uf1pdSvYLWDdi45zKK2n67TzfbrfkDuOlsvq0';

const SHEET_NAMES = {
  STUDENTS: 'HocSinh_HocPhi',
  TRANSACTIONS: 'SoThuChi',
  PAYMENT_REQUESTS: 'XacNhanChuyenKhoan',
  SETTINGS: 'CaiDat'
};

const DRIVE_FOLDER_NAME = 'BienLai_HocPhi_App';

function getTargetSpreadsheet() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

/**
 * Khởi tạo cấu trúc các Sheet tự động nếu chưa có
 */
function setupSheets() {
  const ss = getTargetSpreadsheet();

  // Tự động xóa tab nháp "Sheet mẫu" nếu còn tồn tại
  try {
    const shMau = ss.getSheetByName('Sheet mẫu');
    if (shMau && ss.getSheets().length > 1) {
      ss.deleteSheet(shMau);
    }
  } catch (e) {}

  // 1. Sheet Học sinh & Học phí
  let shStudents = ss.getSheetByName(SHEET_NAMES.STUDENTS);
  if (!shStudents) {
    shStudents = ss.insertSheet(SHEET_NAMES.STUDENTS);
    shStudents.appendRow([
      'ID', 'MaHS', 'HoTen', 'Lop', 'TenPhuHuynh', 'SDTPhuHuynh',
      'KyHocPhi', 'MucHocPhi', 'TrangThai', 'LinkBienLai', 'NgayCapNhat', 'GhiChu'
    ]);
    styleHeader(shStudents, 12, '#1e40af');
    // Thêm quy tắc chọn trạng thái (Data Validation) trên Google Sheet để dễ chỉnh tay
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Chưa đóng', 'Chờ duyệt', 'Đã hoàn thành'], true)
      .setAllowInvalid(true)
      .build();
    shStudents.getRange('I2:I500').setDataValidation(rule);
  }

  // 2. Sheet Sổ Thu Chi
  let shTrans = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  if (!shTrans) {
    shTrans = ss.insertSheet(SHEET_NAMES.TRANSACTIONS);
    shTrans.appendRow([
      'MaGD', 'NgayGD', 'Loai', 'DanhMuc', 'SoTien',
      'NoiDung', 'MaHS', 'PhuongThuc', 'LinkBienLai', 'NguoiTao'
    ]);
    styleHeader(shTrans, 10, '#047857');
    const ruleLoai = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Thu', 'Chi'], true)
      .setAllowInvalid(true)
      .build();
    shTrans.getRange('C2:C1000').setDataValidation(ruleLoai);
  }

  // 3. Sheet Yêu cầu xác nhận chuyển khoản từ Phụ huynh
  let shReq = ss.getSheetByName(SHEET_NAMES.PAYMENT_REQUESTS);
  if (!shReq) {
    shReq = ss.insertSheet(SHEET_NAMES.PAYMENT_REQUESTS);
    shReq.appendRow([
      'MaYC', 'ThoiGianGui', 'StudentRecordID', 'MaHS', 'HoTenHS',
      'Lop', 'KyHocPhi', 'SoTien', 'SDTPhuHuynh', 'NguoiChuyen',
      'GhiChuPH', 'LinkBienLai', 'TrangThaiDuyet', 'ThoiGianDuyet'
    ]);
    styleHeader(shReq, 14, '#b45309');
    const ruleDuyet = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Chờ duyệt', 'Đã duyệt', 'Từ chối'], true)
      .setAllowInvalid(true)
      .build();
    shReq.getRange('M2:M500').setDataValidation(ruleDuyet);
  }

  // 4. Sheet Cài đặt (Thông tin Ngân hàng VietQR, Mật khẩu Admin...)
  let shSettings = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (!shSettings) {
    shSettings = ss.insertSheet(SHEET_NAMES.SETTINGS);
    shSettings.appendRow(['Key', 'Value', 'MoTa']);
    styleHeader(shSettings, 3, '#4338ca');
    const defaultSettings = [
      ['centerName', 'Trung Tâm / Lớp Học Của Tôi', 'Tên lớp học hoặc trung tâm'],
      ['bankBin', 'MB', 'Mã ngân hàng VietQR (VD: MB, VCB, TCB, ACB, ICB, BIDV, VPB, TPB)'],
      ['bankAccountNo', '090123456789', 'Số tài khoản nhận học phí'],
      ['bankAccountName', 'NGUYEN VAN A', 'Tên chủ tài khoản'],
      ['defaultPeriod', 'Tháng 10/2026', 'Kỳ thu học phí mặc định hiện tại'],
      ['adminPassword', '123456', 'Mật khẩu đăng nhập Quản lý trên Web App'],
      ['teacherPhone', '0901234567', 'Số điện thoại/Zalo liên hệ giáo viên']
    ];
    defaultSettings.forEach(r => shSettings.appendRow(r));
  }

  // 5. Sheet nhận giao dịch trực tiếp từ Tích hợp Google Sheets của SePay
  if (!ss.getSheetByName('SePay_GiaoDich')) {
    ss.insertSheet('SePay_GiaoDich');
  }

  return true;
}

function styleHeader(sheet, cols, bgColor) {
  const range = sheet.getRange(1, 1, 1, cols);
  range.setBackground(bgColor)
       .setFontColor('#ffffff')
       .setFontWeight('bold')
       .setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
}

/**
 * Xử lý GET Request: Đọc toàn bộ dữ liệu từ Google Sheet trả về cho Web App
 */
function doGet(e) {
  try {
    setupSheets();
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'getAll';

    if (action === 'getAll') {
      const forceSepay = String(e.parameter.forceSepay || '') === '1';
      try {
        pullSepayApiTransactions(getTargetSpreadsheet(), '', !forceSepay);
      } catch (sepayErr) {}
      const data = getAllSheetData();
      return jsonResponse({ success: true, data: data, timestamp: new Date().toISOString() });
    }

    return jsonResponse({ success: false, message: 'Action không hợp lệ' });
  } catch (err) {
    return jsonResponse({ success: false, message: err.toString() });
  }
}

/**
 * Xử lý POST Request: Cập nhật dữ liệu từ Web App / Phụ huynh gửi biên lai lên Google Sheet
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(15000);

  try {
    setupSheets();
    let payload = {};
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }

    const action = payload.action;
    const ss = getTargetSpreadsheet();

    // 1. Đồng bộ toàn bộ dữ liệu từ App lên Sheet (Full Sync / Save State)
    if (action === 'syncAllToSheet') {
      if (payload.students) writeStudentsToSheet(ss.getSheetByName(SHEET_NAMES.STUDENTS), payload.students);
      if (payload.transactions) writeTransactionsToSheet(ss.getSheetByName(SHEET_NAMES.TRANSACTIONS), payload.transactions);
      if (payload.paymentRequests) writeRequestsToSheet(ss.getSheetByName(SHEET_NAMES.PAYMENT_REQUESTS), payload.paymentRequests);
      if (payload.settings) writeSettingsToSheet(ss.getSheetByName(SHEET_NAMES.SETTINGS), payload.settings);

      return jsonResponse({
        success: true,
        message: 'Đã đồng bộ dữ liệu lên Google Sheet thành công!',
        data: getAllSheetData()
      });
    }

    // 2. Phụ huynh / Học sinh gửi thông tin xác nhận chuyển khoản
    // Chỉ duyệt tự động khi ĐÃ CÓ kết quả chuyển tiền thành công vào STK và đang bật Duyệt tự động
    if (action === 'submitParentPayment') {
      try {
        pullSepayApiTransactions(ss, '', false);
      } catch (sepayErr) {}
      const req = payload.request;
      const shouldAutoApprove = Boolean(payload.autoApprove && req.status === 'Đã duyệt');
      const finalReqStatus = shouldAutoApprove ? 'Đã duyệt' : 'Chờ duyệt';
      const finalStudentStatus = shouldAutoApprove ? 'Đã hoàn thành' : 'Chờ duyệt';

      let receiptUrl = req.receiptUrl || '';

      // Nếu có ảnh Base64 đính kèm thì lưu vào Google Drive và lấy link xem ảnh
      if (req.receiptBase64 && req.receiptBase64.startsWith('data:image')) {
        receiptUrl = saveBase64ImageToDrive(
          req.receiptBase64,
          'BienLai_' + (req.studentCode || 'HS') + '_' + new Date().getTime() + '.jpg'
        );
      }

      const paidAmount = Number(req.amount) || 0;
      const nowStr = req.submittedAt || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
      const todayDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

      // Ghi vào sheet XacNhanChuyenKhoan
      const shReq = ss.getSheetByName(SHEET_NAMES.PAYMENT_REQUESTS);
      shReq.appendRow([
        req.id,
        nowStr,
        req.studentRecordId,
        req.studentCode,
        req.studentName,
        req.className,
        req.period,
        paidAmount,
        "'" + (req.parentPhone || ''),
        req.payerName || '',
        req.note || 'Phụ huynh gửi xác nhận chuyển khoản',
        receiptUrl,
        finalReqStatus,
        shouldAutoApprove ? nowStr : ''
      ]);

      // Cập nhật trạng thái của Học sinh trong sheet HocSinh_HocPhi
      const shStudents = ss.getSheetByName(SHEET_NAMES.STUDENTS);
      const stValues = shStudents.getDataRange().getValues();
      let foundStudent = false;
      for (let i = 1; i < stValues.length; i++) {
        const rowId = String(stValues[i][0]);
        const rowCode = String(stValues[i][1]);
        const rowPeriod = String(stValues[i][6]);
        if (rowId === String(req.studentRecordId) || (rowCode === String(req.studentCode) && rowPeriod === String(req.period))) {
          foundStudent = true;
          const currentRowStatus = String(stValues[i][8] || '');
          if (currentRowStatus !== 'Đã hoàn thành') {
            shStudents.getRange(i + 1, 9).setValue(finalStudentStatus);
          }
          if (receiptUrl) {
            shStudents.getRange(i + 1, 10).setValue(receiptUrl);
          }
          shStudents.getRange(i + 1, 11).setValue(nowStr);
          shStudents.getRange(i + 1, 12).setValue(req.note || ('Phụ huynh báo CK: ' + paidAmount.toLocaleString('vi-VN') + 'đ'));
          break;
        }
      }

      if (!foundStudent && req.studentName) {
        shStudents.appendRow([
          req.studentRecordId || ('ST_' + Date.now()),
          req.studentCode || ('HS' + String(stValues.length).padStart(3, '0')),
          req.studentName,
          req.className || '12 2K9 (Ca 1 - T3,5,7)',
          req.payerName || '',
          "'" + (req.parentPhone || ''),
          req.period || 'Tháng 9-10/2026',
          paidAmount || 600000,
          finalStudentStatus,
          receiptUrl,
          nowStr,
          req.note || 'Phụ huynh gửi xác nhận chuyển khoản'
        ]);
      }

      // CHỈ tự động ghi phiếu Thu vào sheet SoThuChi khi ĐÃ ĐƯỢC DUYỆT
      if (shouldAutoApprove) {
        const shTrans = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
        shTrans.appendRow([
          'GD_STK_' + Date.now(),
          todayDate,
          'Thu',
          'Thu học phí',
          paidAmount,
          'Tự động duyệt CK vào STK - ' + (req.studentCode || '') + ' ' + (req.studentName || '') + ' (' + (req.period || '') + ')',
          req.studentCode || '',
          'Chuyển khoản STK (Tự động)',
          receiptUrl,
          req.payerName || 'Tự động duyệt STK'
        ]);
      }

      return jsonResponse({
        success: true,
        receiptUrl: receiptUrl,
        message: shouldAutoApprove
          ? 'Đã xác thực chuyển tiền thành công vào STK & tự động duyệt học phí!'
          : 'Đã lưu yêu cầu xác nhận chuyển khoản vào trạng thái Chờ duyệt!',
        data: getAllSheetData()
      });
    }

    // 3. Quản lý duyệt hoặc từ chối yêu cầu chuyển khoản
    if (action === 'approvePaymentRequest') {
      const { requestId, status, reviewedAt, transaction } = payload;
      const shReq = ss.getSheetByName(SHEET_NAMES.PAYMENT_REQUESTS);
      const reqValues = shReq.getDataRange().getValues();
      let targetStudentRecordId = '';
      let targetStudentCode = '';
      let targetPeriod = '';
      let receiptUrl = '';

      for (let i = 1; i < reqValues.length; i++) {
        if (String(reqValues[i][0]) === String(requestId)) {
          targetStudentRecordId = String(reqValues[i][2]);
          targetStudentCode = String(reqValues[i][3]);
          targetPeriod = String(reqValues[i][6]);
          receiptUrl = String(reqValues[i][11]);
          shReq.getRange(i + 1, 13).setValue(status); // Đã duyệt / Từ chối
          shReq.getRange(i + 1, 14).setValue(reviewedAt);
          break;
        }
      }

      // Cập nhật trạng thái trong sheet HocSinh_HocPhi
      const shStudents = ss.getSheetByName(SHEET_NAMES.STUDENTS);
      const stValues = shStudents.getDataRange().getValues();
      for (let i = 1; i < stValues.length; i++) {
        const rowId = String(stValues[i][0]);
        const rowCode = String(stValues[i][1]);
        const rowPeriod = String(stValues[i][6]);
        if (rowId === targetStudentRecordId || (rowCode === targetStudentCode && rowPeriod === targetPeriod)) {
          const newStudentStatus = status === 'Đã duyệt' ? 'Đã hoàn thành' : 'Chưa đóng';
          shStudents.getRange(i + 1, 9).setValue(newStudentStatus);
          shStudents.getRange(i + 1, 11).setValue(reviewedAt);
          break;
        }
      }

      // Nếu duyệt thành công và có phiếu thu đi kèm -> thêm vào SoThuChi
      if (status === 'Đã duyệt' && transaction) {
        const shTrans = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
        shTrans.appendRow([
          transaction.id,
          transaction.date,
          'Thu',
          transaction.category || 'Thu học phí',
          Number(transaction.amount) || 0,
          transaction.description || '',
          transaction.studentCode || targetStudentCode,
          transaction.method || 'Chuyển khoản',
          transaction.receiptUrl || receiptUrl,
          transaction.createdBy || 'Quản lý (Duyệt CK)'
        ]);
      }

      return jsonResponse({
        success: true,
        message: 'Đã cập nhật trạng thái duyệt trên Google Sheet!',
        data: getAllSheetData()
      });
    }

    // 4. Kiểm tra & Tự động liên kết SePay (Auto-Connect & Verify SePay Link + Pull REST API)
    if (action === 'verifySepayConnection') {
      const shSettings = ss.getSheetByName(SHEET_NAMES.SETTINGS);
      const bankBin = String(payload.bankBin || 'BIDV');
      const bankAccountNo = String(payload.bankAccountNo || '5801434567');
      const bankAccountName = String(payload.bankAccountName || 'HKD TRUNG TAM HUYNH THANH CHI');
      const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

      if (shSettings) {
        if (payload.sepayApiToken !== undefined && payload.sepayApiToken !== '***MASKED***') {
          upsertSettingKey(shSettings, 'sepayApiToken', String(payload.sepayApiToken || '').trim(), 'API Token kết nối trực tiếp my.sepay.vn');
        }
        if (payload.sepayVaByAccJson !== undefined) {
          upsertSettingKey(shSettings, 'sepayVaByAccJson', String(payload.sepayVaByAccJson || ''), 'Mã tài khoản ảo VA SePay (96247...)');
        }
        upsertSettingKey(shSettings, 'sepayLinkedAt', nowStr, 'Thời điểm kiểm tra kết nối SePay gần nhất');
        upsertSettingKey(shSettings, 'sepayLinkedAccount', bankBin + ' • ' + bankAccountNo, 'Tài khoản đang cấu hình SePay');
      }

      const apiRes = pullSepayApiTransactions(ss, '', false);
      if (shSettings && apiRes.ok) {
        upsertSettingKey(shSettings, 'sepayLinkedStatus', 'CONNECTED', 'Trạng thái kết nối SePay API');
        upsertSettingKey(shSettings, 'sepayApiVerifiedAt', nowStr, 'Xác thực SePay API thành công');
      }

      return jsonResponse({
        success: true,
        connected: Boolean(apiRes.ok),
        apiResult: apiRes,
        linkedAccount: bankBin + ' • ' + bankAccountNo,
        linkedOwner: bankAccountName,
        connectedAt: nowStr,
        message: apiRes.ok
          ? 'Đã kết nối SePay API thành công & đồng bộ ' + (apiRes.ingestedCount || 0) + ' giao dịch mới!'
          : (apiRes.error || 'Đã kiểm tra Google Sheet cho STK ' + bankAccountNo + ' (' + bankBin + ').'),
        data: getAllSheetData()
      });
    }

    // 5. WEBHOOK NGÂN HÀNG TỰ ĐỘNG (Hỗ trợ SePay.vn, Casso.vn, SMS/Notification Forwarder & Test)
    if (
      action === 'bankWebhook' ||
      payload.transferAmount !== undefined ||
      payload.gateway !== undefined ||
      Array.isArray(payload.data)
    ) {
      const bankResult = processIncomingBankWebhook(ss, payload);
      return jsonResponse({
        success: true,
        matchedCount: bankResult.matchedCount,
        matchedStudents: bankResult.matchedStudents,
        message: bankResult.message,
        data: getAllSheetData()
      });
    }

    return jsonResponse({ success: false, message: 'Không tìm thấy action phù hợp: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function normalizeMoneyVnd(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') {
    if (!isFinite(val) || val === 0) return 0;
    const abs = Math.abs(Math.round(val));
    return (abs >= 1000 && abs % 1000 === 0) ? Math.round(val) : Math.round(val * 1000);
  }
  const s = String(val).trim();
  if (!s) return 0;
  const isNeg = s.startsWith('-');
  const digits = s.replace(/[^0-9]/g, '');
  if (!digits) return 0;
  const num = Number(digits);
  if (!isFinite(num) || num === 0) return 0;
  const full = (num >= 1000 && num % 1000 === 0) ? Math.round(num) : Math.round(num * 1000);
  return isNeg ? -full : full;
}

/**
 * Đọc toàn bộ 4 bảng trong Google Sheet
 */
function getAllSheetData() {
  const ss = getTargetSpreadsheet();

  // 1. Đọc Học sinh
  const shStudents = ss.getSheetByName(SHEET_NAMES.STUDENTS);
  const stRows = shStudents.getDataRange().getValues();
  const students = [];
  for (let i = 1; i < stRows.length; i++) {
    const r = stRows[i];
    if (!r[1] && !r[2]) continue; // Bỏ qua dòng trống
    students.push({
      id: String(r[0] || ('ST_' + i)),
      studentCode: String(r[1] || '').trim(),
      fullName: String(r[2] || '').trim(),
      className: String(r[3] || '').trim(),
      parentName: String(r[4] || '').trim(),
      parentPhone: String(r[5] || '').replace(/^'/, '').trim(),
      period: String(r[6] || '').trim(),
      tuitionFee: normalizeMoneyVnd(r[7]),
      status: String(r[8] || 'Chưa đóng').trim(),
      receiptUrl: String(r[9] || '').trim(),
      updatedAt: String(r[10] || '').trim(),
      note: String(r[11] || '').trim()
    });
  }

  // 2. Đọc Sổ Thu Chi
  const shTrans = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  const trRows = shTrans.getDataRange().getValues();
  const transactions = [];
  for (let i = 1; i < trRows.length; i++) {
    const r = trRows[i];
    if (!r[0] && !r[4]) continue;
    transactions.push({
      id: String(r[0] || ('GD_' + i)),
      date: formatDateValue(r[1]),
      type: String(r[2] || 'Thu').trim(),
      category: String(r[3] || '').trim(),
      amount: normalizeMoneyVnd(r[4]),
      description: String(r[5] || '').trim(),
      studentCode: String(r[6] || '').trim(),
      method: String(r[7] || 'Chuyển khoản').trim(),
      receiptUrl: String(r[8] || '').trim(),
      createdBy: String(r[9] || 'Quản lý').trim()
    });
  }

  // 3. Đọc Yêu cầu xác nhận chuyển khoản
  const shReq = ss.getSheetByName(SHEET_NAMES.PAYMENT_REQUESTS);
  const rqRows = shReq.getDataRange().getValues();
  const paymentRequests = [];
  for (let i = 1; i < rqRows.length; i++) {
    const r = rqRows[i];
    if (!r[0] && !r[3]) continue;
    paymentRequests.push({
      id: String(r[0] || ('YC_' + i)),
      submittedAt: String(r[1] || ''),
      studentRecordId: String(r[2] || ''),
      studentCode: String(r[3] || '').trim(),
      studentName: String(r[4] || '').trim(),
      className: String(r[5] || '').trim(),
      period: String(r[6] || '').trim(),
      amount: normalizeMoneyVnd(r[7]),
      parentPhone: String(r[8] || '').replace(/^'/, '').trim(),
      payerName: String(r[9] || '').trim(),
      note: String(r[10] || '').trim(),
      receiptUrl: String(r[11] || '').trim(),
      status: String(r[12] || 'Chờ duyệt').trim(),
      reviewedAt: String(r[13] || '').trim()
    });
  }

  // 4. Đọc Cài đặt
  const shSettings = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  const stgRows = shSettings.getDataRange().getValues();
  const settings = {};
  for (let i = 1; i < stgRows.length; i++) {
    const key = String(stgRows[i][0] || '').trim();
    const val = String(stgRows[i][1] || '').replace(/^'/, '').trim();
    if (key) settings[key] = val;
  }
  if (settings.sepayApiToken && settings.sepayApiToken !== '***MASKED***') {
    settings.hasSepayApiToken = 'true';
    settings.sepayApiToken = '***MASKED***';
  }

  // 5. Đọc toàn bộ các Sheet lớp học gốc trong file Google Sheet (ngoài 4 sheet hệ thống)
  const systemSheetSet = new Set([
    SHEET_NAMES.STUDENTS,
    SHEET_NAMES.TRANSACTIONS,
    SHEET_NAMES.PAYMENT_REQUESTS,
    SHEET_NAMES.SETTINGS
  ]);
  const rawClassSheets = [];
  const allSheets = ss.getSheets();
  for (let sIdx = 0; sIdx < allSheets.length; sIdx++) {
    const sh = allSheets[sIdx];
    const shName = sh.getName();
    if (systemSheetSet.has(shName)) continue;
    const isSepayNamed = /sepay/i.test(shName);
    const lastRow = sh.getLastRow();
    const lastCol = Math.min(sh.getLastColumn(), 20);
    if (lastRow === 0 || lastCol === 0) {
      if (isSepayNamed) rawClassSheets.push({ sheetName: shName, values: [] });
      continue;
    }
    const headerVals = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    if (!isSepayNamed && !/gateway|ngan\s*hang|ngân\s*hàng|transferamount|amount_in|tien\s*vao|tiền\s*vào/i.test(headerVals.join(' '))) {
      continue;
    }
    const startRow = Math.max(2, lastRow - 199);
    const bodyValues = lastRow >= 2
      ? [headerVals].concat(sh.getRange(startRow, 1, lastRow - startRow + 1, lastCol).getDisplayValues())
      : [headerVals];
    rawClassSheets.push({
      sheetName: shName,
      values: bodyValues
    });
  }

  return {
    students: students,
    transactions: transactions,
    paymentRequests: paymentRequests,
    settings: settings,
    rawClassSheets: rawClassSheets
  };
}

function writeStudentsToSheet(sheet, students) {
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).clearContent();
  }
  if (!students || students.length === 0) return;
  const rows = students.map(s => [
    s.id || '',
    s.studentCode || '',
    s.fullName || '',
    s.className || '',
    s.parentName || '',
    "'" + (s.parentPhone || ''),
    s.period || '',
    normalizeMoneyVnd(s.tuitionFee),
    s.status || 'Chưa đóng',
    s.receiptUrl || '',
    s.updatedAt || '',
    s.note || ''
  ]);
  sheet.getRange(2, 1, rows.length, 12).setValues(rows);
}

function writeTransactionsToSheet(sheet, transactions) {
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).clearContent();
  }
  if (!transactions || transactions.length === 0) return;
  const rows = transactions.map(t => {
    const dStr = String(t.date || '').trim();
    const safeDateCell = /\d{2}:\d{2}/.test(dStr) && !dStr.startsWith("'") ? "'" + dStr : dStr;
    return [
      t.id || '',
      safeDateCell,
      t.type || 'Thu',
      t.category || '',
      normalizeMoneyVnd(t.amount),
      t.description || '',
      t.studentCode || '',
      t.method || 'Chuyển khoản',
      t.receiptUrl || '',
      t.createdBy || 'Quản lý'
    ];
  });
  sheet.getRange(2, 1, rows.length, 10).setValues(rows);
}

function writeRequestsToSheet(sheet, requests) {
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).clearContent();
  }
  if (!requests || requests.length === 0) return;
  const rows = requests.map(r => [
    r.id || '',
    r.submittedAt || '',
    r.studentRecordId || '',
    r.studentCode || '',
    r.studentName || '',
    r.className || '',
    r.period || '',
    normalizeMoneyVnd(r.amount),
    "'" + (r.parentPhone || ''),
    r.payerName || '',
    r.note || '',
    r.receiptUrl || '',
    r.status || 'Chờ duyệt',
    r.reviewedAt || ''
  ]);
  sheet.getRange(2, 1, rows.length, 14).setValues(rows);
}

function writeSettingsToSheet(sheet, settings) {
  const descriptions = {
    centerName: 'Tên lớp học hoặc trung tâm',
    bankBin: 'Mã ngân hàng VietQR',
    bankAccountNo: 'Số tài khoản nhận học phí',
    bankAccountName: 'Tên chủ tài khoản',
    defaultPeriod: 'Kỳ thu học phí mặc định hiện tại',
    adminPassword: 'Mật khẩu đăng nhập Quản lý trên Web App',
    teacherPhone: 'Số điện thoại/Zalo liên hệ giáo viên',
    sepayApiToken: 'API Token kết nối trực tiếp my.sepay.vn',
    sepayVaByAccJson: 'Mã tài khoản ảo VA SePay (96247...)'
  };
  const existingToken = getSettingValueByKey(sheet, 'sepayApiToken');
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).clearContent();
  }
  const safeSettings = Object.assign({}, settings || {});
  delete safeSettings._sepaySheetConnected;
  if (safeSettings.sepayApiToken === '***MASKED***' || (safeSettings.sepayApiToken === undefined && existingToken)) {
    safeSettings.sepayApiToken = existingToken;
  }
  const keys = Object.keys(safeSettings);
  if (keys.length === 0) return;
  const rows = keys.map(k => [k, "'" + String(safeSettings[k] ?? ''), descriptions[k] || '']);
  sheet.getRange(2, 1, rows.length, 3).setValues(rows);
}

/**
 * Lưu ảnh biên lai Base64 lên thư mục Google Drive và trả về link hiển thị trực tiếp
 */
function saveBase64ImageToDrive(base64Data, fileName) {
  try {
    const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
    let folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME);

    const parts = base64Data.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const contentType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const byteCharacters = Utilities.base64Decode(parts[1]);
    const blob = Utilities.newBlob(byteCharacters, contentType, fileName);

    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return 'https://drive.google.com/uc?export=view&id=' + file.getId();
  } catch (e) {
    // Nếu không cấp quyền Drive thì trả lại chuỗi ảnh thu nhỏ Base64
    return base64Data;
  }
}

function formatDateValue(val) {
  if (!val) return '';
  if (Object.prototype.toString.call(val) === '[object Date]') {
    const hours = val.getHours();
    const mins = val.getMinutes();
    const secs = val.getSeconds();
    const hasTime = (hours !== 0 || mins !== 0 || secs !== 0);
    return Utilities.formatDate(val, Session.getScriptTimeZone(), hasTime ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd');
  }
  return String(val);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Xử lý tự động bản tin Webhook biến động số dư từ Ngân hàng (SePay, Casso, SMS/Notification Forwarder)
 */
function processIncomingBankWebhook(ss, payload) {
  const incomingList = [];

  // 1. Định dạng của SePay.vn (Hỗ trợ trực tiếp BIDV)
  if (payload.transferAmount !== undefined) {
    incomingList.push({
      transferType: String(payload.transferType || 'in'),
      amount: Number(payload.transferAmount) || 0,
      accumulated: payload.accumulated !== undefined ? Number(payload.accumulated) : null,
      gateway: String(payload.gateway || 'BIDV'),
      accountNumber: String(payload.accountNumber || payload.subAccount || payload.sub_account || '8601774789'),
      subAccount: String(payload.subAccount || payload.sub_account || ''),
      content: String(payload.content || payload.description || ''),
      refCode: String(payload.referenceCode || payload.id || ('SEPAY_' + Date.now())),
      dateStr: String(payload.transactionDate || new Date().toISOString().slice(0, 10))
    });
  }
  // 2. Định dạng của Casso.vn
  else if (Array.isArray(payload.data)) {
    payload.data.forEach(item => {
      if (Number(item.amount) > 0) {
        incomingList.push({
          amount: Number(item.amount) || 0,
          content: String(item.description || ''),
          refCode: String(item.tid || item.id || ('BANK_' + Date.now())),
          dateStr: String(item.when || new Date().toISOString().slice(0, 10))
        });
      }
    });
  }
  // 3. Định dạng Chung / SMS / Notification Forwarder / Test trên Web App
  else {
    incomingList.push({
      transferType: String(payload.transferType || 'in'),
      amount: Number(payload.amount || payload.transferAmount) || 0,
      accumulated: payload.accumulated !== undefined ? Number(payload.accumulated) : null,
      gateway: String(payload.gateway || payload.bankBin || 'BIDV'),
      accountNumber: String(payload.accountNumber || payload.bankAccountNo || payload.subAccount || '5801434567'),
      subAccount: String(payload.subAccount || payload.sub_account || ''),
      content: String(payload.content || payload.description || payload.text || ''),
      refCode: String(payload.referenceCode || ('AUTO_' + Date.now())),
      dateStr: new Date().toISOString().slice(0, 10)
    });
  }

  const shStudents = ss.getSheetByName(SHEET_NAMES.STUDENTS);
  const shTrans = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  const shReq = ss.getSheetByName(SHEET_NAMES.PAYMENT_REQUESTS);
  const shSettings = ss.getSheetByName(SHEET_NAMES.SETTINGS);

  const stValues = shStudents.getDataRange().getValues();
  const reqValues = shReq.getDataRange().getValues();
  const trValues = shTrans.getDataRange().getValues();
  const deletedKeys = {};
  if (shSettings) {
    try {
      const rawDel = getSettingValueByKey(shSettings, 'deletedTxIdsJson');
      const arrDel = rawDel ? JSON.parse(rawDel) : [];
      if (Array.isArray(arrDel)) {
        arrDel.forEach(function (k) {
          if (k) deletedKeys[String(k).trim()] = true;
        });
      }
    } catch (e) {}
  }
  const buildGasSig = function (dStr, amtVal, txt, isDraftFlag) {
    const amt = Number(amtVal) || 0;
    if (!amt) return '';
    const rawTxt = String(txt || '');
    const m = rawTxt.match(/\|\s*ND:\s*(.+)$/i) || rawTxt.match(/Tự động lưu (?:CK|GD)[^:]*:\s*(.+)$/i);
    const core = removeAccentsGas(String(m ? m[1] : rawTxt).toLowerCase())
      .replace(/\[stk\s*nhap[^\]]*\]/g, '')
      .replace(/[^a-z0-9]/g, '');
    const accTag = isDraftFlag ? 'DRAFT_' : 'MAIN_';
    return core ? 'SIG_' + accTag + String(dStr || '').slice(0, 10) + '_' + amt + '_' + core.slice(0, 48) : '';
  };
  const existingTxIds = {};
  for (let tIdx = 1; tIdx < trValues.length; tIdx++) {
    const tid = String(trValues[tIdx][0] || '').trim();
    if (tid) existingTxIds[tid] = true;
    const rowDesc = String(trValues[tIdx][5] || '');
    const rowMethod = String(trValues[tIdx][7] || '');
    const rowIsDraft = /5801434567|962478SJJ2|STK\s*Nh[aá]p/i.test(rowDesc + ' ' + rowMethod);
    const tSig = buildGasSig(formatDateValue(trValues[tIdx][1]), trValues[tIdx][4], rowDesc, rowIsDraft);
    if (tSig) existingTxIds[tSig] = true;
  }
  const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const todayDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  let matchedCount = 0;
  const matchedStudents = [];
  const nameStopwords = { HP: 1, HOC: 1, PHI: 1, THANG: 1, LOP: 1, CK: 1, BIDV: 1, MB: 1, VCB: 1, CHUYEN: 1, KHOAN: 1, IBFT: 1, EM: 1, PH: 1 };

  // Lưu thông báo số dư mới nhất từ SePay vào sheet CaiDat để hiển thị trên Web App
  if (incomingList.length > 0 && shSettings) {
    const latestTx = incomingList[incomingList.length - 1];
    const isLatestDraftAcc =
      /^(5801434567|962478SJJ2)$/i.test(String(latestTx.accountNumber || '').trim()) ||
      /^(5801434567|962478SJJ2)$/i.test(String(latestTx.subAccount || '').trim());
    let computedBalance = latestTx.accumulated !== undefined && latestTx.accumulated !== null ? Number(latestTx.accumulated) : null;
    if (computedBalance === null) {
      const curBal = Number(getSettingValueByKey(shSettings, 'sepayBalance') || 0);
      const delta = (latestTx.transferType === 'out' ? -1 : 1) * (Number(latestTx.amount) || 0);
      computedBalance = curBal + delta;
    }
    const alertObj = {
      id: latestTx.refCode || ('TX_' + Date.now()),
      time: nowStr,
      type: latestTx.transferType || 'in',
      rawVnd: true,
      amount: latestTx.amount || 0,
      balance: computedBalance,
      content: latestTx.content || '',
      gateway: latestTx.gateway || 'BIDV',
      accountNumber: isLatestDraftAcc ? '5801434567' : (latestTx.accountNumber || '8601774789')
    };
    upsertSettingKey(shSettings, 'lastBankAlertJson', JSON.stringify(alertObj), 'Thông báo biến động số dư gần nhất từ SePay');
    if (!isLatestDraftAcc) {
      upsertSettingKey(shSettings, 'sepayBalance', String(computedBalance), 'Số dư tài khoản ngân hàng thực tế từ SePay');
    }
  }

  incomingList.forEach(tx => {
    const txIdKey = 'GD_' + tx.refCode;
    const txDateOnly = /^\d{4}-\d{2}-\d{2}/.test(String(tx.dateStr || '')) ? String(tx.dateStr).slice(0, 10) : todayDate;
    const isDraftAcc =
      /^(5801434567|962478SJJ2)$/i.test(String(tx.accountNumber || '').trim()) ||
      /^(5801434567|962478SJJ2)$/i.test(String(tx.subAccount || '').trim());
    const incomingSig = buildGasSig(txDateOnly, tx.amount, '| ND: ' + tx.content, isDraftAcc);
    if (
      deletedKeys[txIdKey] ||
      deletedKeys['GD_SEPAY_' + tx.refCode] ||
      (incomingSig && deletedKeys[incomingSig]) ||
      existingTxIds[txIdKey] ||
      existingTxIds['GD_SEPAY_' + tx.refCode] ||
      (incomingSig && existingTxIds[incomingSig])
    ) {
      return;
    }
    existingTxIds[txIdKey] = true;
    if (incomingSig) existingTxIds[incomingSig] = true;

    const draftPrefix = isDraftAcc ? '[STK Nháp 5801434567] ' : '';
    const txMethodLabel = isDraftAcc ? 'Chuyển khoản STK Nháp' : 'Chuyển khoản STK (Tự động)';

    const cleanContent = removeAccentsGas(tx.content).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const contentForName = cleanContent.replace(/\b(HO KINH DOANH\s+|HKD\s+)?(TRUNG TAM\s+)?HUYNH THANH CHI\b/g, ' ').replace(/\s+/g, ' ').trim();
    const isOut = tx.transferType === 'out';
    let matchedRowIdx = -1;

    if (!isOut && cleanContent) {
      // Vòng 1: Khớp theo Mã HS, Họ tên đầy đủ (hỗ trợ tên ngắn >= 2 ký tự như def, Nam) hoặc SĐT
      for (let i = 1; i < stValues.length; i++) {
        const stCode = removeAccentsGas(String(stValues[i][1] || '')).toUpperCase().trim();
        const stName = removeAccentsGas(String(stValues[i][2] || '')).toUpperCase().replace(/\s+/g, ' ').trim();
        const stPhone = String(stValues[i][5] || '').replace(/[^0-9]/g, '');

        const matchByCode = stCode && stCode.length >= 3 && cleanContent.indexOf(stCode) !== -1;
        const matchByName = stName && stName.length >= 2 && !nameStopwords[stName] && (` ${contentForName} `).indexOf(` ${stName} `) !== -1;
        const matchByPhone = stPhone && stPhone.length >= 8 && cleanContent.indexOf(stPhone) !== -1;

        if (matchByCode || matchByName || matchByPhone) {
          matchedRowIdx = i;
          break;
        }
      }

      // Vòng 2: Nếu chưa khớp, thử khớp theo 2 từ cuối của tên học sinh (VD: MINH ANH, GIA HUY)
      if (matchedRowIdx === -1 && contentForName) {
        for (let i = 1; i < stValues.length; i++) {
          const stName = removeAccentsGas(String(stValues[i][2] || '')).toUpperCase().replace(/\s+/g, ' ').trim();
          const words = stName.split(' ').filter(Boolean);
          if (words.length >= 2) {
            const shortName = words.slice(-2).join(' ');
            if (shortName.length >= 5 && contentForName.indexOf(shortName) !== -1) {
              matchedRowIdx = i;
              break;
            }
          }
        }
      }
    }

    if (matchedRowIdx !== -1) {
      const i = matchedRowIdx;
      const stCode = String(stValues[i][1] || '');
      const stName = String(stValues[i][2] || '');
      const stClass = String(stValues[i][3] || '');
      const stPhone = String(stValues[i][5] || '');
      const stPeriod = String(stValues[i][6] || '');
      const stFee = Number(stValues[i][7]) || 0;
      const paidAmount = tx.amount > 0 ? tx.amount : stFee;

      const rawAutoApprove = shSettings ? getSettingValueByKey(shSettings, 'autoApproveBankTransfer') : 'true';
      const isAutoApproveOn = rawAutoApprove === '' || rawAutoApprove === null || String(rawAutoApprove) !== 'false';

      if (isAutoApproveOn) {
        // 1. Chế độ Duyệt tự động BẬT + Đã có kết quả chuyển tiền thành công -> Cập nhật sang Đã hoàn thành
        shStudents.getRange(i + 1, 9).setValue('Đã hoàn thành');
        shStudents.getRange(i + 1, 11).setValue(nowStr);
        shStudents.getRange(i + 1, 12).setValue(draftPrefix + 'Đã CK thành công vào STK: +' + paidAmount.toLocaleString('vi-VN') + 'đ (' + nowStr + ')');

        // 2. Tự động lưu / cập nhật vào bảng XacNhanChuyenKhoan
        let updatedExistingReq = false;
        for (let j = 1; j < reqValues.length; j++) {
          if (String(reqValues[j][3]).toUpperCase() === stCode.toUpperCase() && String(reqValues[j][12]) === 'Chờ duyệt') {
            shReq.getRange(j + 1, 11).setValue(String(reqValues[j][10] || '') + ' • ' + draftPrefix + '✅ Đã ghi nhận tiền vào STK & duyệt tự động');
            shReq.getRange(j + 1, 13).setValue('Đã duyệt');
            shReq.getRange(j + 1, 14).setValue(nowStr);
            updatedExistingReq = true;
          }
        }
        if (!updatedExistingReq) {
          shReq.appendRow([
            'YC_STK_' + tx.refCode,
            nowStr,
            stValues[i][0] || '',
            stCode,
            stName,
            stClass,
            stPeriod,
            paidAmount,
            "'" + stPhone,
            isDraftAcc ? 'Chuyển khoản STK Nháp' : 'Chuyển khoản STK tự động',
            draftPrefix + '✅ Đã ghi nhận tiền vào STK | ND CK: ' + tx.content,
            '',
            'Đã duyệt',
            nowStr
          ]);
        }

        // 3. Tự động lưu vào Sổ Thu Chi
        shTrans.appendRow([
          'GD_' + tx.refCode,
          String(tx.dateStr || '').trim() || txDateOnly,
          'Thu',
          'Thu học phí',
          paidAmount,
          draftPrefix + 'Tự động lưu CK vào STK: ' + stCode + ' - ' + stName + ' (' + stPeriod + ') | ND: ' + tx.content,
          stCode,
          txMethodLabel,
          '',
          'Tự động từ STK (SePay)'
        ]);
      } else {
        // Chế độ Duyệt tự động TẮT -> Ghi nhận kết quả chuyển tiền thành công nhưng giữ ở trạng thái Chờ duyệt để Quản lý bấm Duyệt
        const curStatus = String(stValues[i][8] || '');
        if (curStatus !== 'Đã hoàn thành') {
          shStudents.getRange(i + 1, 9).setValue('Chờ duyệt');
        }
        shStudents.getRange(i + 1, 11).setValue(nowStr);
        shStudents.getRange(i + 1, 12).setValue(draftPrefix + '✅ Đã ghi nhận CK +' + paidAmount.toLocaleString('vi-VN') + 'đ vào STK — Chờ Quản lý duyệt');

        let updatedPending = false;
        for (let j = 1; j < reqValues.length; j++) {
          if (String(reqValues[j][3]).toUpperCase() === stCode.toUpperCase() && String(reqValues[j][12]) === 'Chờ duyệt') {
            shReq.getRange(j + 1, 11).setValue(String(reqValues[j][10] || '') + ' • ' + draftPrefix + '✅ Đã ghi nhận chuyển tiền thành công vào STK');
            updatedPending = true;
          }
        }
        if (!updatedPending) {
          shReq.appendRow([
            'YC_STK_' + tx.refCode,
            nowStr,
            stValues[i][0] || '',
            stCode,
            stName,
            stClass,
            stPeriod,
            paidAmount,
            "'" + stPhone,
            isDraftAcc ? 'Chuyển khoản STK Nháp' : 'Chuyển khoản STK (SePay)',
            draftPrefix + '✅ Đã ghi nhận chuyển tiền thành công vào STK | ND: ' + tx.content + ' — Chờ Quản lý duyệt',
            '',
            'Chờ duyệt',
            ''
          ]);
        }
      }

      matchedCount++;
      matchedStudents.push(stCode + ' - ' + stName);
    } else {
      // Ngay cả khi nội dung CK chưa khớp Mã HS có sẵn, vẫn TỰ ĐỘNG LƯU giao dịch vào Sổ Thu Chi để không bỏ sót bất kỳ khoản chuyển khoản nào vào STK
      const txAmount = Number(tx.amount) || 0;
      if (txAmount > 0) {
        shTrans.appendRow([
          'GD_' + tx.refCode,
          String(tx.dateStr || '').trim() || txDateOnly,
          isOut ? 'Chi' : 'Thu',
          isOut ? 'Khác' : 'Thu học phí',
          txAmount,
          draftPrefix + 'Tự động lưu GD từ STK (' + (isDraftAcc ? '5801434567' : (tx.accountNumber || '8601774789')) + '): ' + (tx.content || 'Chuyển khoản ngân hàng'),
          '',
          txMethodLabel,
          '',
          'Tự động từ STK (SePay)'
        ]);
      }
    }
  });

  return {
    matchedCount: matchedCount,
    matchedStudents: matchedStudents,
    message:
      matchedCount > 0
        ? 'Đã tự động lưu thông tin & xác nhận hoàn thành học phí cho: ' + matchedStudents.join(', ')
        : 'Đã tự động lưu giao dịch chuyển khoản từ STK vào Sổ Thu - Chi.'
  };
}

function getSettingValueByKey(shSettings, key) {
  const rows = shSettings.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key) {
      return String(rows[i][1] || '').replace(/^'/, '').trim();
    }
  }
  return '';
}

function upsertSettingKey(shSettings, key, val, desc) {
  const rows = shSettings.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key) {
      shSettings.getRange(i + 1, 2).setValue("'" + String(val));
      return;
    }
  }
  shSettings.appendRow([key, "'" + String(val), desc || '']);
}

function removeAccentsGas(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Chủ động đọc danh sách giao dịch thực tế từ SePay REST API (tránh lỗi Google Apps Script redirect 302 khi nhận Webhook)
 */
function pullSepayApiTransactions(ss, tokenOverride, useThrottle) {
  const shSettings = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (!shSettings) return { ok: false, skipped: true };
  const token = String(tokenOverride || getSettingValueByKey(shSettings, 'sepayApiToken') || '').trim();
  if (!token || token === '***MASKED***') {
    return { ok: false, skipped: true, error: 'Chưa nhập SePay API Token' };
  }

  if (useThrottle) {
    try {
      const cache = CacheService.getScriptCache();
      if (cache.get('SEPAY_LAST_PULL_LOCK')) {
        return { ok: true, throttled: true, ingestedCount: 0 };
      }
      cache.put('SEPAY_LAST_PULL_LOCK', '1', 10);
    } catch (e) {}
  }

  const endpoints = [
    'https://my.sepay.vn/userapi/transactions/list?limit=25',
    'https://userapi.sepay.vn/v2/transactions?per_page=25'
  ];

  let list = null;
  let lastErr = '';
  for (let idx = 0; idx < endpoints.length; idx++) {
    try {
      const resp = UrlFetchApp.fetch(endpoints[idx], {
        method: 'get',
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/json'
        },
        muteHttpExceptions: true
      });
      const code = resp.getResponseCode();
      if (code === 200) {
        const parsed = JSON.parse(resp.getContentText() || '{}');
        const arr = parsed.transactions || parsed.data || [];
        if (Array.isArray(arr)) {
          list = arr;
          break;
        }
      } else {
        lastErr = 'HTTP ' + code;
      }
    } catch (fetchErr) {
      lastErr = fetchErr.toString();
    }
  }

  if (!list) {
    return { ok: false, error: 'Không kết nối được API SePay (' + (lastErr || 'Kiểm tra lại API Token') + ')' };
  }

  const shTrans = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  const trValues = shTrans ? shTrans.getDataRange().getValues() : [];
  const seenIds = {};
  for (let i = 1; i < trValues.length; i++) {
    const tid = String(trValues[i][0] || '').trim();
    if (tid) seenIds[tid] = true;
  }
  try {
    const rawDel = getSettingValueByKey(shSettings, 'deletedTxIdsJson');
    const arrDel = rawDel ? JSON.parse(rawDel) : [];
    if (Array.isArray(arrDel)) {
      arrDel.forEach(function (k) {
        if (k) seenIds[String(k).trim()] = true;
      });
    }
  } catch (e) {}

  const chronological = list.slice().reverse();
  let ingestedCount = 0;
  for (let k = 0; k < chronological.length; k++) {
    const item = chronological[k] || {};
    const rawId = String(item.id || item.reference_number || item.referenceCode || '').trim();
    const rawRef = String(item.reference_number || item.referenceCode || '').trim();
    if (!rawId) continue;
    const refCode = 'SEPAY_' + rawId;
    if (
      seenIds['GD_' + refCode] ||
      seenIds['GD_SEPAY_' + rawId] ||
      seenIds['GD_' + rawId] ||
      (rawRef && (seenIds['GD_' + rawRef] || seenIds['GD_SEPAY_' + rawRef]))
    ) {
      continue;
    }

    const amtIn = Number(String(item.amount_in || '0').replace(/\.\d{1,2}$/, '')) || 0;
    const amtOut = Number(String(item.amount_out || '0').replace(/\.\d{1,2}$/, '')) || 0;
    const directAmt = Number(String(item.transferAmount || item.amount || '0').replace(/\.\d{1,2}$/, '')) || 0;
    const isOut = (amtOut > 0 && amtIn === 0) || String(item.transferType || '').toLowerCase() === 'out';
    const finalAmt = amtIn > 0 ? amtIn : (amtOut > 0 ? amtOut : directAmt);
    if (finalAmt <= 0) continue;

    const accumRaw = item.accumulated !== undefined && item.accumulated !== null
      ? Number(String(item.accumulated).replace(/\.\d{1,2}$/, ''))
      : undefined;

    processIncomingBankWebhook(ss, {
      transferType: isOut ? 'out' : 'in',
      transferAmount: finalAmt,
      accumulated: isFinite(accumRaw) ? accumRaw : undefined,
      gateway: item.bank_brand_name || item.gateway || 'BIDV',
      accountNumber: item.account_number || item.accountNumber || item.sub_account || '',
      subAccount: item.sub_account || item.subAccount || '',
      content: item.transaction_content || item.content || item.description || '',
      referenceCode: refCode,
      transactionDate: item.transaction_date || item.transactionDate || ''
    });
    seenIds['GD_' + refCode] = true;
    ingestedCount++;
  }

  return { ok: true, ingestedCount: ingestedCount };
}
