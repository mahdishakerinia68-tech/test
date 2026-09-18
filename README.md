# حساب‌یار / HesabYar — T1

**نسخه فعلی: 1.2.5**  
**طراحی: T1 — دفتر مالی هوشمند ایرانی**

حساب‌یار یک اپلیکیشن حسابداری فارسی، RTL و Mobile-first از نوع **Vanilla JavaScript Web/PWA** است. بازطراحی T1 لایه رابط و تجربه کاربری را نوسازی می‌کند و قراردادهای داده، localStorage، Firebase، bridgeها و منطق حسابداری را حفظ می‌کند.

## قابلیت‌ها
- داشبورد و موجودی کل
- درآمد، هزینه و تراکنش‌ها
- حساب‌ها، بانک و انتقال
- بدهکار/بستانکار
- مشتری‌ها
- کالا و انبار و هشدار کمبود
- فاکتور، پیش‌نمایش، چاپ و اشتراک‌گذاری
- چک و تسویه
- یادداشت، چک‌لیست و یادآوری
- گزارش‌ها، نمودار و بودجه
- audit و زباله‌دان
- import/export و بکاپ دستی/خودکار
- Firebase Authentication/Firestore و sync دو دستگاه
- PIN، الگو و بیومتریک در صورت پشتیبانی native
- اعلان‌ها
- حالت شخصی، کسب‌وکاری و فروشگاهی
- dark/light، فارسی/انگلیسی و RTL
- Service Worker و offline
- سازگاری با GitHub Pages

## اجرای محلی

```bash
npm ci
npm run dev
```

برای اجرای ساده بدون serve:

```bash
python3 -m http.server 8080
```

سپس `localhost` را در مرورگر باز کنید. Service Worker در localhost یا HTTPS فعال می‌شود.

## اعتبارسنجی

```bash
npm run validate
```

یا:

```bash
npm run check
npm run check:sw
npm run check:bridges
```

## داده و localStorage
storage اصلی برنامه `hesabdar-v35` است. legacy keyهای قدیمی نیز برای migration حفظ شده‌اند. ساختار آرایه‌های حساب، تراکنش، شخص، مشتری، کالا، یادآوری، یادداشت، چک، فاکتور، دسته‌بندی، audit و trash با `normalizeData()` سازگار نگه داشته شده است.

قبل از import/restore گرفتن backup توصیه می‌شود. import داده را validate می‌کند و restore پس از ذخیره verify می‌شود.

## Backup و Restore
- بکاپ دستی از تنظیمات قابل دریافت است.
- بکاپ خودکار در محیط native از bridge فایل و در مرورگر از download استفاده می‌کند.
- فایل‌های backup داخل repository نگهداری نمی‌شوند.
- در صورت بروز خطای فضای ذخیره‌سازی، برنامه باید قبل از تغییر داده پیام قابل فهم نمایش دهد.

## Firebase
پروژه از Firebase Authentication و Firestore برای همگام‌سازی استفاده می‌کند. SDKها lazy-load می‌شوند تا startup سبک بماند.

مسیر داده فعلی:
`users/{uid}/records/{recordId}`

فایل `docs/FIRESTORE-RULES.md` وضعیت ruleهای موجود در ZIP و baseline پیشنهادی را مستند می‌کند. Rule مستقر در Firebase Console از داخل این ZIP قابل تأیید نیست.

## محدودیت API Key
کلید API هوش مصنوعی در frontend می‌تواند در localStorage دستگاه ذخیره شود. این روش **امنیت کامل یا محرمانگی کامل کلید را تضمین نمی‌کند**. کلید در URL قرار نمی‌گیرد و body خطای خام API برای کاربر نمایش داده نمی‌شود. برای امنیت قوی‌تر، درخواست‌ها باید از Backend یا Cloud Function عبور کنند.

## Web/PWA
Service Worker، manifest، RTL، offline shell و GitHub Pages حفظ شده‌اند. cache نسخه‌دار است و navigation در حالت آنلاین تلاش می‌کند نسخه جدید را از شبکه دریافت کند.

## Android
در این release پروژه `android/` واقعی وجود ندارد؛ بنابراین workflow ساخت APK فعال نشده است. bridgeهای Capacitor برای استفاده در محیط native نگه داشته شده‌اند، اما APK در این repository ساخته نمی‌شود.

## انتشار در GitHub Pages
پروژه را به‌عنوان static site روی GitHub Pages منتشر کنید. HTTPS برای Service Worker و PWA لازم است.

## GitHub Releases
فایل ZIP release را به GitHub Release پیوست کنید و آن را داخل repository commit نکنید. `.gitignore` فایل‌های ZIP، APK، AAB، build و credential را حذف می‌کند.

## وضعیت تست
تست‌های syntax، npm ci و validate در محیط تحویل با موفقیت اجرا شدند. تست واقعی مرورگر، Firebase و دستگاه native در این محیط انجام نشده است. جزئیات در `docs/TESTING.md` آمده است.

## ساخت ZIP خروجی

از ریشه پروژه:

```bash
zip -r hesabyar-redesigned.zip hesabyar-redesigned   -x 'hesabyar-redesigned/node_modules/*'      'hesabyar-redesigned/.env*'      'hesabyar-redesigned/*.zip'      'hesabyar-redesigned/*.apk'      'hesabyar-redesigned/*.aab'      'hesabyar-redesigned/dist/*'      'hesabyar-redesigned/build/*'
```

نسخه تحویلی T1 با نام `hesabyar-redesigned.zip` و بدون رمز تهیه شده است.
