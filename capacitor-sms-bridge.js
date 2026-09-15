/* Minimal bridge for this no-bundler Capacitor web app. If a native SMS
 * reading plugin (registered under the name "SmsInbox", e.g. a Capacitor
 * community sms-inbox plugin exposing checkPermissions()/
 * requestPermissions()/getSmsList()) is present in the native Android
 * build, this registers it so app.js can call it to detect new bank SMS
 * and auto-suggest transactions. In a plain browser/PWA (or a native
 * build without that plugin installed) this simply does nothing, and
 * app.js falls back to the existing manual "متن پیامک بانک" entry form.
 * Note: reading SMS also requires the READ_SMS (and usually
 * RECEIVE_SMS) Android permission to be declared in the native project;
 * that lives outside this web bundle. */
(function(){
  try {
    var C=window.Capacitor;
    if(!C || typeof C.registerPlugin!=="function") return;
    if(C.Plugins && C.Plugins.SmsInbox) return;
    var plugin=C.registerPlugin("SmsInbox");
    if(C.Plugins) C.Plugins.SmsInbox=plugin;
  } catch(e) { console.warn("SMS bridge unavailable",e); }
})();
