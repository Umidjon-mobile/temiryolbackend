# Production Deployment Qo'llanmasi

Bu qo'llanma temir yo'l yoqilg'i tizimini noldan productionga deploy qilish bo'yicha to'liq yo'l-yo'riq.

---

## 1️⃣ MongoDB Atlas (bepul cluster)

**Nima uchun Atlas?** Submission yozish 3 ta operatsiya bir vaqtda (submission + fuel_record + summaries) — buni atomic qilish uchun MongoDB transaction kerak. Transaction faqat **replica set**'da ishlaydi, lokal `mongod` da emas. Atlas M0 (bepul) replica set bilan keladi.

### Qadamma-qadam:

1. https://cloud.mongodb.com → ro'yxatdan o'ting (Google/GitHub bilan tezroq)
2. **Build a Database** → **M0 FREE** → Provider: AWS, Region: **Frankfurt** (Markaziy Osiyoga eng yaqin)
3. Cluster nomi: `temiryol-prod`
4. **Database Access**:
   - Add New Database User
   - Username: `temiryol-app`
   - Password: **kuchli** parol generatsiya qiling (Atlas o'zi generate qilishi mumkin)
   - Database User Privileges: `Read and write to any database`
5. **Network Access**:
   - Add IP Address → **Allow access from anywhere** (0.0.0.0/0)
   - Production'da Render IP rangelari bilan cheklash ham mumkin
6. **Connect** → **Drivers** → **Node.js** → connection stringni nusxalang:
   ```
   mongodb+srv://temiryol-app:<password>@temiryol-prod.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
7. `<password>` o'rniga real parolni qo'ying, oxiriga `/temiryol` qo'shing:
   ```
   mongodb+srv://temiryol-app:PAROL@temiryol-prod.xxxxx.mongodb.net/temiryol?retryWrites=true&w=majority
   ```

Bu URI ni saqlab qo'ying — keyin `MONGODB_URI` env var bo'ladi.

---

## 2️⃣ Backend deploy — Render.com

### Variant A: render.yaml Blueprint (oson)

1. Loyihani GitHub'ga push qiling (private repo OK)
2. https://render.com → ro'yxatdan o'ting (GitHub bilan)
3. **New** → **Blueprint** → repoyingizni tanlang
4. `render.yaml` avtomatik o'qiladi
5. **Environment Variables**'da:
   - `MONGODB_URI` → 1-bosqichdagi Atlas string
   - `CORS_ORIGINS` → keyinroq frontend URL bilan to'ldirish
6. **Apply** → 3-5 daqiqa kutib turing

### Variant B: Qo'lda

1. **New** → **Web Service** → repo tanlang
2. Settings:
   - **Name**: `temiryol-backend`
   - **Region**: Frankfurt
   - **Branch**: `main`
   - **Root Directory**: `backend` (yoki bo'sh, agar backend repo ildizida bo'lsa)
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Free
3. **Environment Variables**:
   ```
   NODE_ENV=production
   MONGODB_URI=mongodb+srv://...
   JWT_SECRET=<random-32+-belgi>     ← MUHIM: noldan generatsiya
   JWT_EXPIRES_IN=7d
   CORS_ORIGINS=https://temiryol.vercel.app   ← keyinroq qo'shasiz
   MAX_LOGIN_ATTEMPTS=3
   LOGIN_LOCK_MINUTES=15
   ALLOW_DATE_OVERRIDE=false                   ← productionda false!
   SEED_ADMIN_CODE=9999
   SEED_ADMIN_NAME=Bosh Admin
   SEED_DEVELOPER_CODE=9998
   SEED_DEVELOPER_NAME=Tizim Boshqaruvchisi
   ```

**JWT_SECRET generatsiya** (lokal):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

4. **Create Web Service** → 3-5 daqiqa kutib turing
5. Deploy tugagach URL'ni nusxalang (masalan `https://temiryol-backend-abc.onrender.com`)
6. **Health check**:
   ```bash
   curl https://temiryol-backend-abc.onrender.com/health
   ```
   `{"ok":true, ...}` qaytishi kerak.

### Birinchi marotaba seed

Render Dashboard → loyihangiz → **Shell** tab → quyidagini bajaring:
```bash
npm run seed:prod
```

Bu yozadi:
- 6 ta РЖУ + 21 ta zapravka
- ~120 ta worker access kodi
- Admin kod: `9999`
- Developer kod: `9998`

---

## 3️⃣ Frontend deploy — Vercel (eng oson)

1. https://vercel.com → ro'yxatdan o'ting (GitHub bilan)
2. **Add New Project** → GitHub repo tanlang
3. **Framework Preset**: Next.js (avtomatik)
4. **Root Directory**: `frontend` (agar monorepo bo'lsa)
5. **Environment Variables**:
   ```
   NEXT_PUBLIC_API_URL=https://temiryol-backend-abc.onrender.com
   NEXT_PUBLIC_SOCKET_URL=https://temiryol-backend-abc.onrender.com
   ```
6. **Deploy** → 2-3 daqiqa
7. URL'ni nusxalang (masalan `https://temiryol.vercel.app`)

### Backend'ga frontend URL'ni qo'shish

Backend Render env vars'ga qaytib:
```
CORS_ORIGINS=https://temiryol.vercel.app
```
Saqlash → backend avtomatik qayta deploy bo'ladi.

---

## 4️⃣ Birinchi sinov

1. Browser'da frontend URL ochiladi → `/login` ga redirect
2. Admin kodini kiriting: **9999**
3. Operativ sahifaga tushadi
4. **Birinchi qadam**: Limit sozlamalari (`/a/limits`):
   - Korxona ro'yxatini qo'shing (masalan: `Predpriyatie`, `O'TY`, `Boshqa`)
   - Default limit'ni belgilang (1000 kg)
   - Korxona limitlarini qo'shing
5. **Ikkinchi qadam**: Xodimlar sahifa (`/a/staff`) → workerlarni qo'shing:
   - tabelNumber = access code (1225, 1233, ...)
   - F.I.O., zapravka nomi
6. **Uchinchi qadam**: Rusumlar (`/a/rusumlar`) — lokomotiv seriyalarini kiriting

---

## 5️⃣ Workerlar bilan ulashish

Har bir zapravka workeriga:
1. URL'ni jo'nating: `https://temiryol.vercel.app`
2. Ularning 4 raqamli kodini bering (masalan Toshkent uchun: `1225`)
3. Mobil telefonida brauzerda ochib, "Add to Home Screen" → PWA sifatida ishlatadi

---

## 6️⃣ Production checklist

- [ ] MongoDB Atlas M0 cluster (Frankfurt region)
- [ ] Atlas Database User parol kuchli
- [ ] Atlas IP whitelist (0.0.0.0/0 yoki Render IP rangelari)
- [ ] Backend Render'da deploy
- [ ] `JWT_SECRET` random 32+ belgi
- [ ] `NODE_ENV=production`
- [ ] `ALLOW_DATE_OVERRIDE=false`
- [ ] `CORS_ORIGINS` frontend URL bilan
- [ ] `npm run seed:prod` ishga tushirilgan (admin kod yaratilgan)
- [ ] Frontend Vercel'da deploy
- [ ] `NEXT_PUBLIC_API_URL` backend URL
- [ ] Admin sifatida login ishlaydi
- [ ] `/a/limits` da limitlar va ro'yxatlar kiritilgan
- [ ] `/a/staff` da xodimlar kiritilgan
- [ ] `/a/rusumlar` da lokomotiv seriyalari kiritilgan
- [ ] 1 ta test workeri login qila olardi
- [ ] Test submission ishlaydi (lokomotiv)
- [ ] Excel export tugmasi ishlaydi
- [ ] Chat ishlaydi (worker → admin)
- [ ] PWA "Add to Home Screen" tugmasi browserdai ko'rinadi

---

## 7️⃣ Monitoring va xavfsizlik

### Logs
- Backend: Render Dashboard → loyihangiz → **Logs** tab
- Frontend: Vercel Dashboard → loyihangiz → **Logs**

### Backup
MongoDB Atlas M0 da avtomatik daily backup yo'q. Production'da haftalik manual backup:
```bash
# Mahalliy mongo CLI dan
mongodump --uri "mongodb+srv://..." --out=./backup-2026-01-15
```

### Rotation
- **JWT_SECRET** ni 3 oyda 1 marta yangilash
- **Atlas Database User** parolini 6 oyda 1 marta yangilash
- Blocked codes ni davriy ko'rib chiqish

### Render free tier eslatma
Render Free plan: 15 daqiqa inaktivlik dan keyin server **uxlatib qo'yiladi**. Birinchi so'rov 30-60 sekund kutadi. Production uchun **Starter ($7/oy)** rejasiga o'tish tavsiya etiladi.

---

## 8️⃣ Maxsus stsenariylar

### Yangi zapravka qo'shish
Hozircha 21 ta zapravka seed orqali kiritilgan. Yangi zapravka qo'shish uchun:
1. `backend/src/seed/stations.data.ts` faylga yangi qator qo'shing
2. `npm run seed:prod` qayta ishlatish (idempotent — eski yozuvlarni o'chirmaydi)

### Excel formatlarini moslashtirish
`backend/src/modules/reports/reports-export.routes.ts` faylda:
- Sarlavhalar, ranglar, kenglik — `styleHeader`, `ws.columns`
- Yangi ustun — `ws.getRow(...).values = [...]`

### FCM push notifications (kelajakda)
Hozir hech qaerda implementatsiya yo'q, lekin asoslar bor:
- Backend: Socket.io eventlari (`submission.created`, `chat.message`)
- Frontend: service worker ro'yxatdan o'tgan
- Qo'shish kerak: Firebase Cloud Messaging setup (Backend FCM SDK + Frontend push subscribe)

---

## 🆘 Yordam

Muammo bo'lsa:
- Backend logs Render'da
- Frontend Network tab brauzerda (F12 → Network)
- MongoDB Atlas Logs
- `/health` endpoint orqali backend tirikligini tekshirish

Eng tez-tez chiqadigan muammolar:
- **CORS xato** → `CORS_ORIGINS` da frontend URL aniq mosmi?
- **401 hammada** → `JWT_SECRET` ikkala muhitda mos kelmaydi (frontend yangi tokenni qabul qilmaydi)
- **MongoDB ulanish xatosi** → Atlas IP whitelist + parol to'g'rimi?
- **Render 502** → Server boot bo'lmagan, env vars to'liq emas (ayniqsa `JWT_SECRET` < 32 belgi)
