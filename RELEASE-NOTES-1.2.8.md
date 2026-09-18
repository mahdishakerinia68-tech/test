# حساب‌یار 1.2.8 — اصلاح و پایدارسازی

- نسخه واحد `1.2.8` در برنامه، PWA و package metadata.
- داده‌های اصلی از localStorage به IndexedDB با transaction اتمیک منتقل شده‌اند؛ localStorage فقط برای تنظیمات کوچک/شناسه دستگاه/وضعیت‌های UI باقی می‌ماند.
- Migration مستقل با `schemaVersion = 4` و مسیرهای V1→V2→V3→V4.
- PIN/Pattern با PBKDF2-SHA-256، salt تصادفی 16 بایتی و 120000 iteration؛ قفل پس از 3 خطا برای 30 ثانیه.
- بکاپ دستی فقط AES-GCM 256 + PBKDF2-SHA-256 و رمز حداقل 8 کاراکتر است؛ بکاپ خودکار خام تولید نمی‌شود.
- یادداشت هوشمند تا آماده شدن Backend امن غیرفعال است و هیچ API Key از کاربر دریافت یا در مرورگر ذخیره نمی‌شود.
- اعتبارسنجی متمرکز مبالغ، درصدها، فاکتور و پرداخت‌ها اضافه شده است.
- snapshot قیمت خرید (`costPriceAtSale`) و توابع موجودی/اختلاف موجودی اضافه شده‌اند.
- Sync شامل revision، updatedAt، updatedBy، deviceId و tombstone است و قوانین Firestore محدود به UID کاربر شده‌اند.
- Service Worker با cache version `hesabdar-1-2-8-offline-v3` و Network-First برای shell اصلی تنظیم شده است.
- ساختار `src/` برای core/modules/security/sync/reports/ui اضافه شده است.
- تست‌های core و smoke اجرا و موفق شده‌اند.

## وضعیت محیط ساخت

در محیط اجرای این بسته، دسترسی رجیستری npm برای نصب dependencyهای جدید در دسترس نبود؛ بنابراین `npm ci` و ساخت native Android (`npx cap sync android` / Gradle) در این محیط قابل اجرا نبودند. این محدودیت محیط اجراست و به‌عنوان موفقیت CI یا APK نهایی ادعا نشده است.
