/**
 * Hesabdar license server — Telegram-bot backed.
 *
 * Replaces the old Firebase/Firestore license backend. This single Node.js
 * process does two things:
 *
 *   1. Runs an Express REST API that the app (app.js) talks to:
 *        GET  /api/license/:id                 – public, used to validate a code
 *        GET  /api/admin/licenses               – admin, list all licenses
 *        POST /api/admin/licenses               – admin, create a license {plan}
 *        PUT  /api/admin/licenses/:id           – admin, change plan {plan}
 *        POST /api/admin/licenses/:id/extend    – admin, extend by one more plan period
 *        POST /api/admin/licenses/:id/revoke    – admin, revoke
 *        POST /api/admin/licenses/:id/activate  – admin, un-revoke
 *      Admin routes require header:  x-admin-password: <ADMIN_PANEL_PASSWORD>
 *
 *   2. Runs your Telegram bot (@hesabyar2026_bot). Only messages from
 *      ADMIN_TELEGRAM_ID are treated as admin commands; everyone else gets
 *      a polite "این ربات خصوصی است" reply. Every license event (creation,
 *      customer activation, extension, revoke) is also pushed to the admin
 *      as a Telegram notification, so you always know what's happening
 *      "from Telegram" as requested.
 *
 * Data is stored in a plain JSON file (data/licenses.json) — no database
 * server needed. Swap loadDB/saveDB for a real DB later if you outgrow it.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_TELEGRAM_ID = Number(process.env.ADMIN_TELEGRAM_ID || 0);
const ADMIN_PANEL_PASSWORD = process.env.ADMIN_PANEL_PASSWORD || "";
const PORT = Number(process.env.PORT || 3000);

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN تنظیم نشده. فایل .env را بر اساس .env.example بساز.");
  process.exit(1);
}
if (!ADMIN_TELEGRAM_ID) {
  console.error("ADMIN_TELEGRAM_ID تنظیم نشده.");
  process.exit(1);
}

// ---------- storage ----------
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "licenses.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]", "utf8");

function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8") || "[]");
  } catch (e) {
    console.error("خواندن دیتابیس لایسنس‌ها ناموفق بود:", e);
    return [];
  }
}
function saveDB(list) {
  fs.writeFileSync(DB_FILE, JSON.stringify(list, null, 2), "utf8");
}

// ---------- license domain logic (mirrors app.js) ----------
const PLANS = {
  "1m": { label: "۱ ماهه", months: 1 },
  "2m": { label: "۲ ماهه", months: 2 },
  "3m": { label: "۳ ماهه", months: 3 },
  "6m": { label: "۶ ماهه", months: 6 },
  "1y": { label: "۱ ساله", months: 12 },
  life: { label: "دائمی", months: null },
};

function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) d.setDate(0);
  return d;
}
function planExpiry(plan, from) {
  const cfg = PLANS[plan];
  if (!cfg) return null;
  return cfg.months ? addMonths(from, cfg.months).toISOString() : null;
}
function randomLicenseId() {
  return crypto.randomBytes(9).toString("hex").toUpperCase(); // 18 hex chars, matches app.js regex
}
function isActive(l) {
  return !!(l && l.status !== "revoked" && (!l.expiresAt || new Date(l.expiresAt) > new Date()));
}
function publicView(l) {
  // Only the fields the app needs — never leak internal notes.
  const { id, plan, createdAt, expiresAt, status, revokedAt, activatedAt } = l;
  return { id, plan, createdAt, expiresAt, status, revokedAt, activatedAt };
}
function findLicense(id) {
  return loadDB().find((l) => l.id === id.toUpperCase());
}
function createLicense(plan) {
  if (!PLANS[plan]) throw new Error("پلن نامعتبر است.");
  const now = new Date();
  const license = {
    id: randomLicenseId(),
    plan,
    createdAt: now.toISOString(),
    expiresAt: planExpiry(plan, now),
    status: "active",
    activatedAt: null,
    revokedAt: null,
  };
  const db = loadDB();
  db.unshift(license);
  saveDB(db);
  return license;
}
function updatePlan(id, plan) {
  if (!PLANS[plan]) throw new Error("پلن نامعتبر است.");
  const db = loadDB();
  const l = db.find((x) => x.id === id.toUpperCase());
  if (!l) throw new Error("لایسنس پیدا نشد.");
  const base = new Date(l.createdAt || new Date());
  l.plan = plan;
  l.expiresAt = planExpiry(plan, base);
  l.status = "active";
  saveDB(db);
  return l;
}
function extendLicense(id) {
  const db = loadDB();
  const l = db.find((x) => x.id === id.toUpperCase());
  if (!l) throw new Error("لایسنس پیدا نشد.");
  if (l.plan === "life") throw new Error("این لایسنس دائمی است و نیازی به تمدید ندارد.");
  const cfg = PLANS[l.plan];
  const base = l.expiresAt && new Date(l.expiresAt) > new Date() ? new Date(l.expiresAt) : new Date();
  l.expiresAt = addMonths(base, cfg.months).toISOString();
  l.status = "active";
  saveDB(db);
  return l;
}
function revokeLicense(id) {
  const db = loadDB();
  const l = db.find((x) => x.id === id.toUpperCase());
  if (!l) throw new Error("لایسنس پیدا نشد.");
  l.status = "revoked";
  l.revokedAt = new Date().toISOString();
  saveDB(db);
  return l;
}
function reactivateLicense(id) {
  const db = loadDB();
  const l = db.find((x) => x.id === id.toUpperCase());
  if (!l) throw new Error("لایسنس پیدا نشد.");
  l.status = "active";
  l.revokedAt = null;
  saveDB(db);
  return l;
}
function markActivated(id) {
  const db = loadDB();
  const l = db.find((x) => x.id === id.toUpperCase());
  if (l && !l.activatedAt) {
    l.activatedAt = new Date().toISOString();
    saveDB(db);
  }
}
function statusLabel(l) {
  if (l.status === "revoked") return "⛔ باطل شده";
  return isActive(l) ? "🟢 فعال" : "🔴 منقضی";
}
function formatDate(v) {
  if (!v) return "بدون انقضا (دائمی)";
  return new Date(v).toLocaleString("fa-IR");
}
function describeLicense(l) {
  return (
    `کد: ${l.id}\n` +
    `پلن: ${PLANS[l.plan]?.label || l.plan}\n` +
    `وضعیت: ${statusLabel(l)}\n` +
    `ساخته‌شده: ${formatDate(l.createdAt)}\n` +
    `انقضا: ${formatDate(l.expiresAt)}` +
    (l.activatedAt ? `\nفعال‌سازی مشتری: ${formatDate(l.activatedAt)}` : "")
  );
}

// ---------- Telegram bot ----------
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function isAdminChat(msg) {
  return msg.from && msg.from.id === ADMIN_TELEGRAM_ID;
}
function notifyAdmin(text) {
  bot.sendMessage(ADMIN_TELEGRAM_ID, text).catch((e) => console.error("notifyAdmin failed:", e.message));
}

const HELP_TEXT =
  "🤖 ربات مدیریت لایسنس حساب‌یار\n\n" +
  "دستورها:\n" +
  "/new <پلن> — ساخت لایسنس جدید. پلن‌ها: 1m 2m 3m 6m 1y life\n" +
  "   مثال: /new 1m\n" +
  "/find <کد> — نمایش وضعیت یک لایسنس\n" +
  "/list — نمایش ۲۰ لایسنس آخر\n" +
  "/extend <کد> — تمدید به‌اندازه‌ی یک دوره‌ی همان پلن\n" +
  "/revoke <کد> — باطل کردن\n" +
  "/activate <کد> — لغو ابطال (فعال‌سازی دوباره)\n";

bot.onText(/^\/start/, (msg) => {
  if (!isAdminChat(msg)) return bot.sendMessage(msg.chat.id, "این ربات خصوصی است.");
  bot.sendMessage(msg.chat.id, HELP_TEXT);
});
bot.onText(/^\/help/, (msg) => {
  if (!isAdminChat(msg)) return bot.sendMessage(msg.chat.id, "این ربات خصوصی است.");
  bot.sendMessage(msg.chat.id, HELP_TEXT);
});

bot.onText(/^\/new(?:\s+(\S+))?/, (msg, match) => {
  if (!isAdminChat(msg)) return bot.sendMessage(msg.chat.id, "این ربات خصوصی است.");
  const plan = (match[1] || "").trim();
  if (!PLANS[plan]) {
    return bot.sendMessage(msg.chat.id, "پلن نامعتبر است. یکی از این‌ها را بفرست: 1m 2m 3m 6m 1y life\nمثال: /new 1m");
  }
  try {
    const l = createLicense(plan);
    bot.sendMessage(msg.chat.id, "✅ لایسنس ساخته شد:\n\n" + describeLicense(l) + "\n\nاین کد را برای مشتری بفرست.");
  } catch (e) {
    bot.sendMessage(msg.chat.id, "خطا: " + e.message);
  }
});

bot.onText(/^\/find(?:\s+(\S+))?/, (msg, match) => {
  if (!isAdminChat(msg)) return bot.sendMessage(msg.chat.id, "این ربات خصوصی است.");
  const id = (match[1] || "").trim();
  if (!id) return bot.sendMessage(msg.chat.id, "کد لایسنس را بعد از دستور بنویس. مثال: /find AABBCCDD11223344");
  const l = findLicense(id);
  if (!l) return bot.sendMessage(msg.chat.id, "لایسنسی با این کد پیدا نشد.");
  bot.sendMessage(msg.chat.id, describeLicense(l));
});

bot.onText(/^\/list/, (msg) => {
  if (!isAdminChat(msg)) return bot.sendMessage(msg.chat.id, "این ربات خصوصی است.");
  const db = loadDB().slice(0, 20);
  if (!db.length) return bot.sendMessage(msg.chat.id, "هنوز لایسنسی ساخته نشده.");
  const text = db.map((l) => `${l.id} — ${PLANS[l.plan]?.label || l.plan} — ${statusLabel(l)}`).join("\n");
  bot.sendMessage(msg.chat.id, "۲۰ لایسنس آخر:\n\n" + text);
});

bot.onText(/^\/extend(?:\s+(\S+))?/, (msg, match) => {
  if (!isAdminChat(msg)) return bot.sendMessage(msg.chat.id, "این ربات خصوصی است.");
  const id = (match[1] || "").trim();
  if (!id) return bot.sendMessage(msg.chat.id, "کد لایسنس را بعد از دستور بنویس.");
  try {
    const l = extendLicense(id);
    bot.sendMessage(msg.chat.id, "🔄 تمدید شد:\n\n" + describeLicense(l));
  } catch (e) {
    bot.sendMessage(msg.chat.id, "خطا: " + e.message);
  }
});

bot.onText(/^\/revoke(?:\s+(\S+))?/, (msg, match) => {
  if (!isAdminChat(msg)) return bot.sendMessage(msg.chat.id, "این ربات خصوصی است.");
  const id = (match[1] || "").trim();
  if (!id) return bot.sendMessage(msg.chat.id, "کد لایسنس را بعد از دستور بنویس.");
  try {
    const l = revokeLicense(id);
    bot.sendMessage(msg.chat.id, "⛔ باطل شد:\n\n" + describeLicense(l));
  } catch (e) {
    bot.sendMessage(msg.chat.id, "خطا: " + e.message);
  }
});

bot.onText(/^\/activate(?:\s+(\S+))?/, (msg, match) => {
  if (!isAdminChat(msg)) return bot.sendMessage(msg.chat.id, "این ربات خصوصی است.");
  const id = (match[1] || "").trim();
  if (!id) return bot.sendMessage(msg.chat.id, "کد لایسنس را بعد از دستور بنویس.");
  try {
    const l = reactivateLicense(id);
    bot.sendMessage(msg.chat.id, "✅ فعال شد:\n\n" + describeLicense(l));
  } catch (e) {
    bot.sendMessage(msg.chat.id, "خطا: " + e.message);
  }
});

// Any other message from a non-admin chat: polite private-bot notice.
bot.on("message", (msg) => {
  if (isAdminChat(msg)) return; // admin commands are handled above
  if (msg.text && msg.text.startsWith("/")) return; // unknown command from a stranger, stay quiet-ish
  bot.sendMessage(msg.chat.id, "این ربات خصوصی مدیریت لایسنس حساب‌یار است و پاسخ‌گوی پیام عمومی نیست.").catch(() => {});
});

bot.on("polling_error", (e) => console.error("Telegram polling error:", e.message));

console.log("🤖 ربات تلگرام حساب‌یار روشن شد.");

// ---------- REST API ----------
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  // simple permissive CORS since this API is called from a packaged app / static site
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-admin-password");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

function requireAdmin(req, res, next) {
  const given = req.header("x-admin-password") || "";
  const expected = ADMIN_PANEL_PASSWORD;
  const ok =
    !!expected &&
    given.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return res.status(401).json({ error: "رمز ادمین نامعتبر است." });
  next();
}

// Public: validate a license code (this is what fetchCloudLicense() in app.js calls)
app.get("/api/license/:id", (req, res) => {
  const l = findLicense(req.params.id);
  if (!l) return res.status(404).json({ error: "not found" });
  if (isActive(l)) {
    markActivated(l.id);
    notifyAdmin(`📥 بررسی/فعال‌سازی لایسنس ${l.id} از داخل برنامه انجام شد (${statusLabel(l)}).`);
  }
  res.json(publicView(l));
});

// Admin: list
app.get("/api/admin/licenses", requireAdmin, (req, res) => {
  res.json(loadDB());
});

// Admin: create
app.post("/api/admin/licenses", requireAdmin, (req, res) => {
  try {
    const l = createLicense(req.body?.plan);
    notifyAdmin(`🆕 لایسنس جدید از پنل ادمین برنامه ساخته شد:\n\n${describeLicense(l)}`);
    res.json(l);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Admin: edit plan
app.put("/api/admin/licenses/:id", requireAdmin, (req, res) => {
  try {
    const l = updatePlan(req.params.id, req.body?.plan);
    notifyAdmin(`✏️ لایسنس ${l.id} ویرایش شد (پلن جدید: ${PLANS[l.plan]?.label}).`);
    res.json(l);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Admin: extend
app.post("/api/admin/licenses/:id/extend", requireAdmin, (req, res) => {
  try {
    const l = extendLicense(req.params.id);
    notifyAdmin(`🔄 لایسنس ${l.id} تمدید شد تا ${formatDate(l.expiresAt)}.`);
    res.json(l);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Admin: revoke
app.post("/api/admin/licenses/:id/revoke", requireAdmin, (req, res) => {
  try {
    const l = revokeLicense(req.params.id);
    notifyAdmin(`⛔ لایسنس ${l.id} باطل شد.`);
    res.json(l);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Admin: reactivate
app.post("/api/admin/licenses/:id/activate", requireAdmin, (req, res) => {
  try {
    const l = reactivateLicense(req.params.id);
    notifyAdmin(`✅ لایسنس ${l.id} دوباره فعال شد.`);
    res.json(l);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/", (req, res) => res.send("Hesabdar license server is running."));

app.listen(PORT, () => {
  console.log(`🌐 سرور لایسنس روی پورت ${PORT} اجرا شد.`);
});
