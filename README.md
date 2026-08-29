# 📱 Responsive Design Audit Tool

Công cụ phân tích và đánh giá độ tương thích Responsive của website chuyên sâu với Puppeteer & Express.

## ✨ Tính năng chính
- 📊 Đánh giá 4 loại màn hình: Mobile (375px), Mobile Large (414px), Tablet (768px), Desktop (1440px).
- 🔍 Kiểm tra lỗi tràn layout ngang (Horizontal Overflow).
- 🔤 Kiểm tra kích cỡ chữ và khả năng đọc (Font sizing & readability).
- 👆 Kiểm tra kích thước và khoảng cách vùng chạm (Touch targets).
- 📐 Kiểm tra thẻ meta Viewport & Media Queries.
- 🖼️ Chụp ảnh toàn màn hình thực tế (Screenshots) ở từng độ phân giải.
- 📄 Xuất báo cáo chi tiết trực quan.

## 🚀 Cài đặt & Chạy Local

```bash
# 1. Cài đặt thư viện
npm install

# 2. Chạy ứng dụng
npm start
```

Mở trình duyệt tại: `http://localhost:3000`

## ☁️ Deploy lên Render
Dự án đã có sẵn [Dockerfile](file:///c:/Tools/responsive-audit/Dockerfile), chỉ cần liên kết với GitHub và chọn Runtime là **Docker** trên Render.com!
