# Hệ Thống Quản Lý Học Sinh, Học Phí (VietQR) & Thu Chi Đồng Bộ Google Sheets 2 Chiều

Dự án bao gồm một **Web App độc lập** (hoạt động mượt mà trên cả điện thoại và máy tính) kết nối **đồng bộ 2 chiều** với **Google Sheets** và lưu ảnh biên lai chuyển khoản vào **Google Drive**.

---

## 1. Cấu trúc thư mục dự án

- [index.html](file:///C:/Users/ADMIN/.gemini/antigravity/scratch/quan-ly-hoc-sinh-thu-chi/index.html): Giao diện chính gồm 2 phân hệ **Cổng Phụ huynh / Học sinh** và **Cổng Quản lý / Giáo viên**.
- [styles.css](file:///C:/Users/ADMIN/.gemini/antigravity/scratch/quan-ly-hoc-sinh-thu-chi/styles.css): Giao diện tối ưu cho Mobile & Desktop.
- [app.js](file:///C:/Users/ADMIN/.gemini/antigravity/scratch/quan-ly-hoc-sinh-thu-chi/app.js): Toàn bộ xử lý nghiệp vụ, tạo mã VietQR tự động, nén ảnh biên lai và đồng bộ 2 chiều với Google Sheet.
- [Code.gs](file:///C:/Users/ADMIN/.gemini/antigravity/scratch/quan-ly-hoc-sinh-thu-chi/google-apps-script/Code.gs): Mã nguồn Backend gắn vào Google Sheet để tự động tạo 4 bảng dữ liệu và lưu ảnh biên lai lên Google Drive.

---

## 2. Hướng dẫn kết nối Google Sheet (Đồng bộ 2 chiều trong 2 phút)

### Bước 1: Tạo Google Sheet và dán mã `Code.gs`
1. Mở Google Drive của bạn và tạo một file **Google Trang tính (Google Sheet)** mới.
2. Trên thanh menu của Google Sheet, chọn **Tiện ích mở rộng (Extensions)** $\rightarrow$ **Apps Script**.
3. Xóa đoạn mã mặc định trong cửa sổ Apps Script, sau đó mở file [Code.gs](file:///C:/Users/ADMIN/.gemini/antigravity/scratch/quan-ly-hoc-sinh-thu-chi/google-apps-script/Code.gs) (hoặc bấm nút **"Copy mã Code.gs"** ngay trong tab Cài đặt của Web App) và dán vào.
4. Bấm biểu tượng **Lưu (Ctrl + S)**.
5. Trên thanh công cụ Apps Script, chọn hàm `setupSheets` và bấm **Chạy (Run)** (Cấp quyền truy cập cho tài khoản Google của bạn ở lần chạy đầu tiên). Ngay lập tức file Google Sheet sẽ tự động được tạo 4 bảng chuẩn:
   - `HocSinh_HocPhi`: Quản lý danh sách học sinh, mức học phí, kỳ thu và trạng thái (`Chưa đóng` / `Chờ duyệt` / `Đã hoàn thành`).
   - `SoThuChi`: Sổ thu chi chi tiết của lớp học/trung tâm.
   - `XacNhanChuyenKhoan`: Lưu lịch sử phụ huynh gửi xác nhận và link ảnh biên lai.
   - `CaiDat`: Lưu cấu hình tài khoản ngân hàng VietQR và mật khẩu quản lý.

### Bước 2: Lấy link kết nối (Deploy Web App)
1. Ở góc trên bên phải cửa sổ Apps Script, bấm nút **Triển khai (Deploy)** $\rightarrow$ **Tùy chọn triển khai mới (New deployment)**.
2. Bấm biểu tượng bánh răng $\rightarrow$ Chọn loại **Ứng dụng web (Web app)**:
   - **Thực thi dưới dạng (Execute as)**: Chọn **Tôi (Me)**.
   - **Ai có quyền truy cập (Who has access)**: Chọn **Bất kỳ ai (Anyone)**.
3. Bấm **Triển khai (Deploy)** và sao chép đường link **URL ứng dụng web** (có đuôi `.../exec`).

### Bước 3: Dán link vào Web App
1. Mở Web App, bấm chuyển sang tab **Quản lý** ở góc phải trên cùng (Mật khẩu mặc định: `123456`).
2. Vào mục **Google Sheet & Cài đặt QR**.
3. Dán đường link `.../exec` vừa copy vào ô **Google Apps Script Web App URL** và bấm **Lưu kết nối Sheet**.
4. Từ lúc này:
   - Mọi thao tác thêm/sửa học sinh, ghi thu chi, phụ huynh gửi biên lai, hoặc duyệt học phí trên App sẽ **tự động cập nhật thẳng vào Google Sheet**.
   - Khi bạn sửa trực tiếp trên Google Sheet (thêm dòng học sinh, đổi số tiền, chọn trạng thái `Đã hoàn thành`), chỉ cần bấm nút **"Đồng bộ Sheet"** (hoặc tải lại trang) là App sẽ cập nhật đúng theo Google Sheet.

---

## 3. Hướng dẫn đưa Web App lên mạng miễn phí (Gửi link cho Phụ huynh)

Vì đây là Web App độc lập chuẩn HTML/CSS/JS tĩnh, bạn có thể đưa lên mạng miễn phí chỉ trong 30 giây bằng một trong các cách sau:
- **Cách 1 (Nhanh nhất - Netlify Drop)**: Truy cập `https://app.netlify.com/drop`, kéo thả thư mục `quan-ly-hoc-sinh-thu-chi` vào trình duyệt là có ngay đường link `https://ten-lop-hoc.netlify.app` gửi qua Zalo cho phụ huynh.
- **Cách 2 (Vercel / GitHub Pages)**: Đẩy thư mục lên GitHub và bật GitHub Pages hoặc import vào Vercel.
