# Upload ảnh lên Discord - bản GitHub Pages + Cloudflare Worker

## Cấu trúc repo
```
.
├── index.html       ← trang đăng nhập (GitHub Pages sẽ chạy file này)
├── kenh.html        ← trang chọn kênh & upload ảnh
├── config.js        ← nơi khai báo URL Worker
├── style.css
├── worker/
│   ├── worker.js    ← code Cloudflare Worker (deploy riêng bằng wrangler)
│   └── wrangler.toml
└── README.md
```
File tĩnh (`index.html`, `kenh.html`, `config.js`, `style.css`) để ở **thư mục gốc** vì
GitHub Pages chỉ chọn được publish từ root hoặc `/docs`, không chọn được thư mục tùy ý.
`worker/` chỉ dùng để lưu code, bạn deploy nó lên Cloudflare bằng Wrangler, không liên quan
tới GitHub Pages.

## Bước 1: Đẩy code lên GitHub
```bash
cd discord-repo
git init
git add .
git commit -m "Discord upload tool"
git branch -M main
git remote add origin https://github.com/<username>/<ten-repo>.git
git push -u origin main
```

## Bước 2: Deploy Cloudflare Worker
1. Tạo tài khoản free tại https://dash.cloudflare.com
2. Cài Wrangler CLI: `npm install -g wrangler`
3. Đăng nhập: `wrangler login`
4. Vào thư mục `worker/`, deploy: `wrangler deploy`
5. Set 2 secret:
   ```
   wrangler secret put BOT_TOKEN
   wrangler secret put APP_PASSWORD
   ```
6. Wrangler in ra URL Worker dạng:
   `https://discord-upload-worker.<ten-tai-khoan>.workers.dev` → copy lại

## Bước 3: Cấu hình & bật GitHub Pages
1. Sửa `config.js` ở root repo, dán URL Worker vào biến `WORKER_URL`
2. Sửa `worker/wrangler.toml`, đổi `ALLOWED_ORIGIN` thành URL GitHub Pages của bạn
   (dạng `https://<username>.github.io/<ten-repo>`), rồi `wrangler deploy` lại
3. Commit + push lại thay đổi:
   ```bash
   git add .
   git commit -m "Cap nhat worker url"
   git push
   ```
4. Vào repo trên GitHub → **Settings → Pages** → Source: chọn nhánh `main`, thư mục `/ (root)` → Save
5. Sau vài phút, trang chạy tại `https://<username>.github.io/<ten-repo>`

## Sử dụng
1. Mở trang GitHub Pages → nhập mật khẩu (APP_PASSWORD) + Guild ID → Đăng nhập
2. Chọn kênh, chọn ảnh, upload theo lô tối đa 10 ảnh/lần
3. Dùng "Up lô ảnh mới" để chọn ảnh mới, "Xóa toàn bộ" để xóa hết ảnh đang chọn,
   tick/bỏ tích từng ảnh để loại ảnh không muốn upload

## Vì sao cần Worker thay vì gọi Discord thẳng từ trình duyệt?
- Discord API chặn CORS với request gọi trực tiếp từ domain khác → phải qua Worker
- Nếu để Bot Token trong file JS tĩnh, ai xem mã nguồn trang web cũng lấy được token
  → Worker giữ token ở phía server, trình duyệt chỉ biết mật khẩu do bạn tự đặt
