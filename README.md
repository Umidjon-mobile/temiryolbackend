# Temir yo'l Backend (v0.4 — MVP Complete)

O'zbekiston temir yo'l zapravkalarida dizel yoqilg'i hisob-kitobi uchun backend.

**Stack:** Node.js 20 · Express · TypeScript · Mongoose (MongoDB) · Socket.io · JWT · Zod · ExcelJS

**Production deploy:** `DEPLOYMENT.md` ga qarang

---

## Boshlanishi (lokal)

### Talablar
- Node.js ≥ 20
- MongoDB (Atlas tavsiya — transaction uchun replica set kerak)

### O'rnatish

```bash
cd backend
npm install
cp .env.example .env
# .env ni tahrirlang — kamida MONGODB_URI va JWT_SECRET
```

### Seed + ishga tushirish

```bash
npm run seed       # 6 РЖУ + 21 zapravka + 120 kod + admin/dev
npm run dev        # http://localhost:4000/health
```

### Production

```bash
npm run build
npm run seed:prod  # birinchi marta (idempotent)
npm start
```

---

## API endpointlar (jami **59 ta**)

### Public
| Method | Path | Tavsif |
|---|---|---|
| GET | `/` `/health` | Service info, DB status |
| POST | `/auth/login-code` | 4 raqamli kod bilan login |

### Auth (Bearer token)
| Method | Path | Tavsif |
|---|---|---|
| GET | `/auth/me` | Joriy sessiya |
| POST | `/auth/heartbeat` | Onlayn ko'rinish |
| POST | `/auth/logout` | Sessiyani yopish |

### User panel + stations
| Method | Path | Tavsif |
|---|---|---|
| GET | `/user-panel/bootstrap` | Sahifa ochilganda barcha ma'lumot |
| GET | `/stations/nodes` | Barcha РЖУ |
| GET | `/stations/stations?nodeId=` | Zapravkalar |

### Submissions
| Method | Path | Rol |
|---|---|---|
| POST | `/submissions/{lokomotiv,korxona,qurulish,tamirlash}` | worker+ |
| GET | `/submissions?category=&dateISO=` | hammasi (worker scope) |
| PATCH | `/submissions/:id` | worker (shu kun) / admin |
| DELETE | `/submissions/:id` | admin |
| POST | `/submissions/offline-sync` | worker (batch) |

### Limits, approvals
| Method | Path | Rol |
|---|---|---|
| GET | `/limits/settings` | hammasi |
| PATCH | `/limits/settings` | admin/dev |
| GET | `/approvals/active` | hammasi |
| POST | `/approvals` | admin |
| DELETE | `/approvals/:id` | admin |

### Reports
| Method | Path | Tavsif |
|---|---|---|
| GET | `/summaries/daily` | Kunlik aggregate |
| GET | `/summaries/yearly?year=` | Yillik aggregate |
| GET | `/fuel-records` | Y.PDF data |
| GET | `/reports/operativ?dateISO=` | Joriy kun |
| GET | `/reports/svod?startDate=&endDate=` | Davr |
| GET | `/reports/monthly?year=&month=` | Oylik |
| GET | `/reports/yearly?year=` | Yillik |
| GET | `/reports/raw?category=` | Raw submissions |

### Excel Export (5 ta, formatlangan)
| Method | Path |
|---|---|
| GET | `/reports/export/operativ.xlsx?dateISO=` |
| GET | `/reports/export/monthly.xlsx?year=&month=` |
| GET | `/reports/export/yearly.xlsx?year=` |
| GET | `/reports/export/svod.xlsx?startDate=&endDate=` |
| GET | `/reports/export/raw.xlsx?category=&dateISO=` |

### Admin moduli
| Method | Path | Tavsif |
|---|---|---|
| GET/POST/PATCH/DELETE | `/staff[/:id]` | Staff vault CRUD |
| GET/POST/PATCH/DELETE | `/users[/:id]` | Access codes CRUD |
| GET | `/staff/by-tabel/:tabel` | Login uchun lookup |
| GET/POST/DELETE | `/blocked-codes[/:code]` | Bloklangan kodlar |
| GET | `/audit-logs?userId=&entityType=&action=` | Audit logs |
| GET | `/audit-logs/stats` | Statistika |
| GET/POST/PATCH/DELETE | `/rusumlar[/:id]` | Lokomotiv seriyalari |

### Chat va presence
| Method | Path | Rol |
|---|---|---|
| GET/POST | `/chat?stationId=` | hammasi (worker scope) |
| POST | `/chat/:id/read` | hammasi |
| GET | `/chat/unread-count` | hammasi |
| GET | `/presence` | admin |
| POST | `/presence/heartbeat` | hammasi |

---

## Modellar (jami **15 ta**)

```
Node             — РЖУ (6 ta)
Station          — Zapravka (21 ta)
User             — Access codes
Staff            — Staff vault (xodimlar)
Session          — Active sessions (TTL)
BlockedCode      — Bloklangan kodlar
DeviceLock       — Bruteforce (TTL)
AuditLog         — Tizim amallari
Submission       — base + 4 ta discriminator
FuelRecord       — Y.PDF mirror
DailySummary     — kunlik aggregate
YearlySummary    — yillik aggregate
Approval         — limit oshirish ruxsatnomalari
LimitsSettings   — singleton (limit + ro'yxatlar)
ChatMessage      — chat
LocomotiveSeries — rusumlar
```

---

## Modullar (jami **16 ta**)

```
auth          — login, logout, me, heartbeat
user-panel    — bootstrap (initial data)
stations      — nodes, stations
submissions   — 4 kategoriya + transaction
fuel-records  — service + reader
summaries     — delta logic + reader
limits        — settings + checkLimit helper
approvals     — grant, revoke, list
presence      — online list
health        — DB status check
staff         — staff vault CRUD
users         — access codes CRUD
blocked-codes — bloklash CRUD
audit-logs    — viewer + stats
reports       — operativ, svod, monthly, yearly
reports-export — 5 ta Excel endpoint
chat          — messages
rusumlar      — locomotive series CRUD
```

---

## Test (curl)

```bash
# Login admin
curl -s -X POST http://localhost:4000/auth/login-code \
  -H "Content-Type: application/json" \
  -d '{"code":"9999","deviceId":"my-device-001"}'

TOKEN="<token>"

# Lokomotiv submission
curl -s -X POST http://localhost:4000/submissions/lokomotiv \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"stationId":"toshkent","nodeId":"rju-toshkent","harakatTuri":"yuk","rusumi":"TEM2","lokomotivNumber":"1234","poyezdNumber":"7001","poyezdVazni":"2500","qoldiq":"100","qanchaBerildi":"12,5","dizMasla":"0.5"}'

# Excel export
curl -s "http://localhost:4000/reports/export/operativ.xlsx?dateISO=2026-01-15" \
  -H "Authorization: Bearer $TOKEN" \
  -o operativ.xlsx
```

---

## MongoDB transaction

Submission yozish 3 ta operatsiya bir vaqtda:
1. `submissions` insert
2. `fuel_records` insert
3. `daily_summaries` + `yearly_summaries` increment

Transaction faqat replica set'da ishlaydi:
- **Atlas M0 (bepul)** ✓
- **Standalone mongod** — kod fallback rejimida ishlaydi

Production uchun **MongoDB Atlas** majburiy.

---

## Folder strukturasi

```
src/
├── server.ts                # Entry — Express + Socket.io
├── app.ts                   # Routes (18 ta)
├── config/
│   ├── env.ts               # Zod .env validatsiya
│   ├── db.ts                # Mongoose connect
│   └── socket.ts            # Socket.io setup + helpers
├── models/                  # 15 ta Mongoose schema
├── modules/                 # 16 ta modul
├── middleware/              # auth, async-handler, error
├── common/
│   ├── errors/api-error.ts
│   ├── utils/               # jwt, decimal, dates, logger, labels
│   └── types/
├── events/                  # Socket.io constants
└── seed/                    # 6 RJU + 21 zapravka + 120 kod
```

---

## Deploy

`DEPLOYMENT.md` — to'liq qo'llanma (Atlas + Render.com + Vercel).

`render.yaml` Blueprint orqali ham deploy qilish mumkin.

---

## Build statistikasi

- TypeScript strict mode, **0 ta xato**
- 60+ JS fayl `dist/` da
- Boot vaqti: ~1-2s
- 27 ta route to'g'ri ro'yxatdan o'tadi
