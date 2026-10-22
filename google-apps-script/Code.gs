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

    // 2. Phụ huynh / Học sinh chuyển khoản vào STK & gửi xác nhận -> TỰ ĐỘNG LƯU THÔNG TIN & HOÀN THÀNH HỌC PHÍ
    if (action === 'submitParentPayment') {
      const req = payload.request;
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

      // Ghi vào sheet XacNhanChuyenKhoan (Trạng thái: Đã duyệt - Tự động lưu)
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
        req.note || 'Tự động lưu khi chuyển khoản vào STK',
        receiptUrl,
        'Đã duyệt',
        nowStr
      ]);

      // Tự động cập nhật trạng thái của Học sinh trong sheet HocSinh_HocPhi sang 'Đã hoàn thành' (hoặc thêm mới nếu chưa có)
      const shStudents = ss.getSheetByName(SHEET_NAMES.STUDENTS);
      const stValues = shStudents.getDataRange().getValues();
      let foundStudent = false;
      for (let i = 1; i < stValues.length; i++) {
        const rowId = String(stValues[i][0]);
        const rowCode = String(stValues[i][1]);
        const rowPeriod = String(stValues[i][6]);
        if (rowId === String(req.studentRecordId) || (rowCode === String(req.studentCode) && rowPeriod === String(req.period))) {
          foundStudent = true;
          shStudents.getRange(i + 1, 9).setValue('Đã hoàn thành');
          if (receiptUrl) {
            shStudents.getRange(i + 1, 10).setValue(receiptUrl);
          }
          shStudents.getRange(i + 1, 11).setValue(nowStr);
          shStudents.getRange(i + 1, 12).setValue(req.note || ('Đã CK vào STK: ' + paidAmount.toLocaleString('vi-VN') + 'đ'));
          break;
        }
      }

      if (!foundStudent && req.studentName) {
        shStudents.appendRow([
          req.studentRecordId || ('ST_' + Date.now()),
          req.studentCode || ('HS' + String(stValues.length).padStart(3, '0')),
          req.studentName,
          req.className || '12 2K8',
          req.payerName || '',
          "'" + (req.parentPhone || ''),
          req.period || 'Tháng 10/2026',
          paidAmount || 600000,
          'Đã hoàn thành',
          receiptUrl,
          nowStr,
          req.note || 'Tự động lưu học sinh mới khi CK vào STK'
        ]);
      }

      // Tự động ghi phiếu Thu vào sheet SoThuChi
      const shTrans = ss.getSheetByName(SHEET_NAMES.TRANSACTIONS);
      shTrans.appendRow([
        'GD_STK_' + Date.now(),
        todayDate,
        'Thu',
        'Thu học phí',
        paidAmount,
        'Tự động lưu CK vào STK - ' + (req.studentCode || '') + ' ' + (req.studentName || '') + ' (' + (req.period || '') + ')',
        req.studentCode || '',
        'Chuyển khoản STK (Tự động)',
        receiptUrl,
        req.payerName || 'Tự động lưu STK'
      ]);

      return jsonResponse({
        success: true,
        receiptUrl: receiptUrl,
        message: 'Đã tự động lưu thông tin chuyển khoản & cập nhật số đợt đã đóng!',
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

    // 4. WEBHOOK NGÂN HÀNG TỰ ĐỘNG (Hỗ trợ SePay.vn, Casso.vn, SMS/Notification Forwarder & Test)
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
      tuitionFee: Number(r[7]) || 0,
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
      amount: Number(r[4]) || 0,
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
      amount: Number(r[7]) || 0,
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
    const range = sh.getDataRange();
    rawClassSheets.push({
      sheetName: shName,
      values: range.getDisplayValues(),
      backgrounds: range.getBackgrounds()
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
    Number(s.tuitionFee) || 0,
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
  const rows = transactions.map(t => [
    t.id || '',
    t.date || '',
    t.type || 'Thu',
    t.category || '',
    Number(t.amount) || 0,
    t.description || '',
    t.studentCode || '',
    t.method || 'Chuyển khoản',
    t.receiptUrl || '',
    t.createdBy || 'Quản lý'
  ]);
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
    Number(r.amount) || 0,
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
    teacherPhone: 'Số điện thoại/Zalo liên hệ giáo viên'
  };
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).clearContent();
  }
  const keys = Object.keys(settings || {});
  if (keys.length === 0) return;
  const rows = keys.map(k => [k, "'" + String(settings[k] ?? ''), descriptions[k] || '']);
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
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
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
      accountNumber: String(payload.accountNumber || '8601774789'),
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
      amount: Number(payload.amount) || 0,
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
  const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const todayDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  let matchedCount = 0;
  const matchedStudents = [];

  // Lưu thông báo số dư mới nhất từ SePay vào sheet CaiDat để hiển thị trên Web App
  if (incomingList.length > 0 && shSettings) {
    const latestTx = incomingList[incomingList.length - 1];
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
      amount: latestTx.amount || 0,
      balance: computedBalance,
      content: latestTx.content || '',
      gateway: latestTx.gateway || 'BIDV',
      accountNumber: latestTx.accountNumber || '8601774789'
    };
    upsertSettingKey(shSettings, 'lastBankAlertJson', JSON.stringify(alertObj), 'Thông báo biến động số dư gần nhất từ SePay');
    upsertSettingKey(shSettings, 'sepayBalance', String(computedBalance), 'Số dư tài khoản ngân hàng thực tế từ SePay');
  }

  incomingList.forEach(tx => {
    const cleanContent = removeAccentsGas(tx.content).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const isOut = tx.transferType === 'out';
    let matchedRowIdx = -1;

    if (!isOut && cleanContent) {
      // Vòng 1: Khớp theo Mã HS, Họ tên đầy đủ hoặc SĐT
      for (let i = 1; i < stValues.length; i++) {
        const stCode = removeAccentsGas(String(stValues[i][1] || '')).toUpperCase().trim();
        const stName = removeAccentsGas(String(stValues[i][2] || '')).toUpperCase().replace(/\s+/g, ' ').trim();
        const stPhone = String(stValues[i][5] || '').replace(/[^0-9]/g, '');

        const matchByCode = stCode && stCode.length >= 3 && cleanContent.indexOf(stCode) !== -1;
        const matchByName = stName && stName.length >= 5 && cleanContent.indexOf(stName) !== -1;
        const matchByPhone = stPhone && stPhone.length >= 8 && cleanContent.indexOf(stPhone) !== -1;

        if (matchByCode || matchByName || matchByPhone) {
          matchedRowIdx = i;
          break;
        }
      }

      // Vòng 2: Nếu chưa khớp, thử khớp theo 2 từ cuối của tên học sinh (VD: MINH ANH, GIA HUY)
      if (matchedRowIdx === -1) {
        for (let i = 1; i < stValues.length; i++) {
          const stName = removeAccentsGas(String(stValues[i][2] || '')).toUpperCase().replace(/\s+/g, ' ').trim();
          const words = stName.split(' ').filter(Boolean);
          if (words.length >= 2) {
            const shortName = words.slice(-2).join(' ');
            if (shortName.length >= 5 && cleanContent.indexOf(shortName) !== -1) {
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

      // 1. Tự động cập nhật trạng thái học sinh sang Đã hoàn thành
      shStudents.getRange(i + 1, 9).setValue('Đã hoàn thành');
      shStudents.getRange(i + 1, 11).setValue(nowStr);
      shStudents.getRange(i + 1, 12).setValue('Đã CK vào STK: +' + paidAmount.toLocaleString('vi-VN') + 'đ (' + nowStr + ')');

      // 2. Tự động lưu / cập nhật vào bảng XacNhanChuyenKhoan
      let updatedExistingReq = false;
      for (let j = 1; j < reqValues.length; j++) {
        if (String(reqValues[j][3]).toUpperCase() === stCode.toUpperCase() && String(reqValues[j][12]) === 'Chờ duyệt') {
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
          'Chuyển khoản STK tự động',
          'ND CK: ' + tx.content,
          '',
          'Đã duyệt',
          nowStr
        ]);
      }

      // 3. Tự động lưu vào Sổ Thu Chi
      shTrans.appendRow([
        'GD_' + tx.refCode,
        todayDate,
        'Thu',
        'Thu học phí',
        paidAmount,
        'Tự động lưu CK vào STK: ' + stCode + ' - ' + stName + ' (' + stPeriod + ') | ND: ' + tx.content,
        stCode,
        'Chuyển khoản STK (Tự động)',
        '',
        'Tự động từ STK (SePay)'
      ]);

      matchedCount++;
      matchedStudents.push(stCode + ' - ' + stName);
    } else {
      // Ngay cả khi nội dung CK chưa khớp Mã HS có sẵn, vẫn TỰ ĐỘNG LƯU giao dịch vào Sổ Thu Chi để không bỏ sót bất kỳ khoản chuyển khoản nào vào STK
      const txAmount = Number(tx.amount) || 0;
      if (txAmount > 0) {
        shTrans.appendRow([
          'GD_' + tx.refCode,
          todayDate,
          isOut ? 'Chi' : 'Thu',
          isOut ? 'Khác' : 'Thu học phí',
          txAmount,
          'Tự động lưu GD từ STK (' + (tx.accountNumber || '8601774789') + '): ' + (tx.content || 'Chuyển khoản ngân hàng'),
          '',
          'Chuyển khoản STK (Tự động)',
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
