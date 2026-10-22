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

    // 2. Phụ huynh gửi xác nhận đã chuyển khoản + tải ảnh biên lai lên Google Drive
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

      // Ghi vào sheet XacNhanChuyenKhoan
      const shReq = ss.getSheetByName(SHEET_NAMES.PAYMENT_REQUESTS);
      shReq.appendRow([
        req.id,
        req.submittedAt,
        req.studentRecordId,
        req.studentCode,
        req.studentName,
        req.className,
        req.period,
        Number(req.amount) || 0,
        "'" + (req.parentPhone || ''),
        req.payerName || '',
        req.note || '',
        receiptUrl,
        'Chờ duyệt',
        ''
      ]);

      // Cập nhật trạng thái của Học sinh trong sheet HocSinh_HocPhi sang 'Chờ duyệt'
      const shStudents = ss.getSheetByName(SHEET_NAMES.STUDENTS);
      const stValues = shStudents.getDataRange().getValues();
      for (let i = 1; i < stValues.length; i++) {
        const rowId = String(stValues[i][0]);
        const rowCode = String(stValues[i][1]);
        const rowPeriod = String(stValues[i][6]);
        if (rowId === String(req.studentRecordId) || (rowCode === String(req.studentCode) && rowPeriod === String(req.period))) {
          // Chỉ chuyển sang Chờ duyệt nếu chưa phải Đã hoàn thành
          if (String(stValues[i][8]) !== 'Đã hoàn thành') {
            shStudents.getRange(i + 1, 9).setValue('Chờ duyệt');
          }
          if (receiptUrl) {
            shStudents.getRange(i + 1, 10).setValue(receiptUrl);
          }
          shStudents.getRange(i + 1, 11).setValue(req.submittedAt);
          break;
        }
      }

      return jsonResponse({
        success: true,
        receiptUrl: receiptUrl,
        message: 'Đã gửi xác nhận thanh toán lên hệ thống!',
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

  return {
    students: students,
    transactions: transactions,
    paymentRequests: paymentRequests,
    settings: settings
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
