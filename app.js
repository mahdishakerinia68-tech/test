'use strict';
/* ============ همیار مطالعه v2 ============ */
const VERSION = '2.4.1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fa = n => Number(n || 0).toLocaleString('fa-IR');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const DAY = 864e5;
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const setting = (k, d) => { const v = localStorage.getItem('hy_' + k); return v === null ? d : JSON.parse(v); };
const setSetting = (k, v) => localStorage.setItem('hy_' + k, JSON.stringify(v));

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ============ ذخیره‌سازی (IndexedDB) ============ */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('hamyar', 2);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const s of ['decks', 'cards', 'images', 'log', 'lessons']) {
          if (!d.objectStoreNames.contains(s)) {
            const st = d.createObjectStore(s, { keyPath: 'id' });
            if (s === 'cards') st.createIndex('deckId', 'deckId');
          }
        }
      };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode);
      let out; const q = fn(t.objectStore(store));
      if (q) q.onsuccess = () => { out = q.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
    });
  },
  put: (s, o) => DB.tx(s, 'readwrite', st => st.put(o)),
  get: (s, id) => DB.tx(s, 'readonly', st => st.get(id)),
  all: s => DB.tx(s, 'readonly', st => st.getAll()),
  del: (s, id) => DB.tx(s, 'readwrite', st => st.delete(id)),
  byDeck: id => DB.tx('cards', 'readonly', st => st.index('deckId').getAll(id)),
  putMany(s, arr) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(s, 'readwrite'); const st = t.objectStore(s);
      arr.forEach(o => st.put(o)); t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  },
  clear(s) { return DB.tx(s, 'readwrite', st => st.clear()); },
};

/* ============ مرور فاصله‌دار (SM-2 ساده) ============ */
function sched(c, g) { // g: 0 دوباره، 1 سخت، 2 خوب، 3 آسان
  const n = { ...c }, now = Date.now();
  n.ease = c.ease || 2.5;
  if (g === 0) {
    n.lapses = (c.lapses || 0) + 1; n.reps = 0; n.interval = 0;
    n.ease = Math.max(1.3, n.ease - 0.2); n.due = now + 10 * 60000; n.state = 'learn';
  } else {
    let iv;
    if (!c.reps) iv = [0, 1, 2, 4][g];
    else {
      const base = c.interval || 1;
      iv = g === 1 ? Math.max(base + 1, base * 1.2) : g === 2 ? base * n.ease : base * n.ease * 1.3;
    }
    if (g === 1) n.ease = Math.max(1.3, n.ease - 0.15);
    if (g === 3) n.ease += 0.15;
    n.interval = Math.round(iv); n.reps = (c.reps || 0) + 1; n.state = 'review';
    n.due = now + n.interval * DAY;
  }
  return n;
}
function fmtIv(c, g) {
  const n = sched(c, g);
  if (g === 0) return '۱۰ دقیقه';
  return n.interval < 30 ? `${fa(n.interval)} روز` : `${fa(Math.round(n.interval / 30))} ماه`;
}
const isMastered = c => c.state === 'review' && c.interval >= 7;

async function bumpLog(patch) {
  const id = dayKey(); const l = (await DB.get('log', id)) || { id, reviewed: 0, correct: 0, fresh: 0 };
  for (const k in patch) l[k] = (l[k] || 0) + patch[k];
  await DB.put('log', l);
}

/* ============ تولید سؤال (کاملاً آفلاین) ============ */
const TYPE_FA = { mcq: 'تستی', tf: 'درست یا نادرست', type: 'جای خالی (تایپی)', term: 'کدام مفهوم', odd: 'کدام جزو فهرست نیست', qa: 'پرسش‌وپاسخ', image: 'تصویری' };
const AUTO = new Set(['mcq', 'tf', 'type', 'term', 'odd']);
const STOP = new Set(('و در به از که این آن با را برای است بود شد می های ها یک هم یا اگر اما تا بر هر نیز آنها او ما شما من بین روی پس چون کند کرد شده شود باشد دارد دارند هستند بی ای تر ترین بسیار همه چه چنین همین خود آنچه وی همچنین زیرا لذا بنابراین مانند مثل طریق حال دیگر پیش بعد داد داده کنند کنیم شوند بوده بودند نیست نیستند کرده کنیم دارای توسط میان بدون حتی ولی البته فقط باید می‌شود می‌کند می‌شوند می‌توان می‌تواند می‌باشد یعنی عبارت معنای معنی وجود شمار می‌آید آمد گفته گویند نامیده شامل ازجمله جمله').split(' '));
const VERB_END = /(?:است|بود|شد|شود|دارد|دارند|هستند|می‌کند|می‌کنند|می‌آید|می‌باشد|کرد|کردند|شدند|بودند|می‌شوند|می‌شود)$/;
const DIG = '۰۱۲۳۴۵۶۷۸۹';
const toEn = s => s.replace(/[۰-۹]/g, d => DIG.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const toFaDig = s => s.replace(/\d/g, d => DIG[d]);
const norm = t => String(t || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ـ/g, '').replace(/[\u064B-\u065F]/g, '')
  .replace(/\r/g, '').replace(/[ \t\u00a0]+/g, ' ').trim();
const TOK = /[\u0621-\u06FFa-zA-Z0-9\u200c]+/g;
const isWord = w => w.length >= 3 && !STOP.has(w) && !/^[0-9\u06F0-\u06F9\u0660-\u0669]+$/.test(w);
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LET = '\\u0621-\\u06FF\\u200ca-zA-Z0-9';

/* پاک‌سازی خروجی OCR: حذف خطوط زباله، چسباندن خط‌های شکسته، تشخیص تیتر */
function cleanOCR(raw) {
  let t = norm(raw).replace(/[|_~^`¬¦■□●○]+/g, ' ').replace(/[\u200e\u200f]/g, '');
  let lines = t.split('\n').map(l => l.replace(/\s+/g, ' ').trim());
  const ratio = l => { const m = l.match(/[\u0621-\u06FFa-zA-Z0-9]/g); return m ? m.length / l.length : 0; };
  lines = lines.filter(l => !l || (l.length >= 3 && ratio(l) >= 0.6));
  const lens = lines.filter(Boolean).map(l => l.length).sort((a, b) => a - b);
  const med = lens.length ? lens[Math.floor(lens.length / 2)] : 0;
  const endP = /[.!؟?؛:۔]$/;
  const out = []; let buf = '';
  const flush = () => { if (buf) { out.push(endP.test(buf) || buf.split(' ').length < 5 ? buf : buf + '.'); buf = ''; } };
  for (const l of lines) {
    if (!l) { flush(); continue; }
    const short = l.length < med * 0.6 && l.split(' ').length <= 7 && !endP.test(l);
    if (short && !buf) { out.push(l); continue; }
    if (buf.endsWith('-')) buf = buf.slice(0, -1) + l; else buf += (buf ? ' ' : '') + l;
    if (endP.test(l)) flush();
    else if (VERB_END.test(l) && l.split(' ').length >= 4) { buf += '.'; flush(); }
  }
  flush();
  return out.join('\n\n').replace(/\s+([،؛:.!؟?])/g, '$1').replace(/([،؛!؟?])(?=[^\s\n"»)])/g, '$1 ').trim();
}

function parseDoc(text, defTopic) {
  const lines = norm(text).split('\n').map(l => l.trim());
  const out = []; let topic = defTopic, buf = '';
  const flush = () => { if (buf.trim()) out.push({ s: buf.trim(), topic }); buf = ''; };
  const endP = /[.!؟?؛:۔]$/;
  for (const raw of lines) {
    const l = raw.replace(/^#+\s*/, '').replace(/^[-•*]\s+/, '');
    if (!l) { flush(); continue; }
    const words = l.split(' ').length;
    const isHead = (/^#/.test(raw) || (words <= 7 && !endP.test(l) && l.length < 60)) && !buf;
    if (isHead) { flush(); topic = l.replace(/[:：]$/, ''); continue; }
    buf += (buf ? ' ' : '') + l;
    if (endP.test(l)) flush();
  }
  flush();
  const sents = [];
  for (const p of out) {
    p.s.split(/(?<=[.!؟?؛۔])\s+/).forEach(s => {
      s = s.trim().replace(/[؛]$/, '.').replace(/^و\s+/, '');
      const n = s.split(' ').length;
      if (n >= 5 && n <= 45) sents.push({ s, topic: p.topic });
    });
  }
  return sents;
}

function numVariants(str) {
  const v = parseInt(toEn(str), 10); if (isNaN(v)) return [];
  const fa_ = /[۰-۹]/.test(str);
  const steps = v >= 1000 && v <= 2200 ? [-10, 10, -5, 5, -20, 20, -1, 1, 50] : [1, -1, 2, -2, 10, -10, 5, -5];
  let c = steps.map(d => v + d); c.push(v * 2); c.push(Math.round(v / 2));
  c = [...new Set(c)].filter(x => x >= 0 && x !== v);
  return shuffle(c).slice(0, 3).map(x => fa_ ? toFaDig(String(x)) : String(x));
}
function blankOut(sentence, w) {
  const re = new RegExp('(^|[^' + LET + '])' + escRe(w) + '(?![' + LET + '])');
  return re.test(sentence) ? sentence.replace(re, (m, a) => a + '{{blank}}') : null;
}
function swapWord(sentence, w, alt) {
  const re = new RegExp('(^|[^' + LET + '])' + escRe(w) + '(?![' + LET + '])');
  return re.test(sentence) ? sentence.replace(re, (m, a) => a + alt) : null;
}


/* ============ هوش مصنوعی: ساخت سؤال و اصلاح OCR ============ */
const EDUCATION_LEVELS = {
  elementary: 'ابتدایی',
  middle: 'متوسطه اول',
  highschool: 'متوسطه دوم',
  university: 'دانشگاهی',
  general: 'عمومی'
};
function detectTextLanguage(text) {
  const t = String(text || '');
  const faCount = (t.match(/[\u0600-\u06FF]/g) || []).length;
  const enCount = (t.match(/[A-Za-z]/g) || []).length;
  if (faCount >= Math.max(8, enCount * 0.35)) return 'fa';
  if (enCount >= Math.max(8, faCount * 0.35)) return 'en';
  return 'fa';
}
function aiLanguageInstruction(text) {
  return detectTextLanguage(text) === 'en'
    ? 'The source text is English. Produce the entire response in clear, natural English. Do not translate it to Persian.'
    : 'متن منبع فارسی است. تمام پاسخ را کاملاً فارسی و خوانا بنویس و هیچ واژه یا جمله انگلیسی اضافه نکن، مگر اینکه همان واژه عیناً بخشی از متن منبع باشد.';
}
function aiCfg() {
  return {
    enabled: setting('aiEnabled', false),
    endpoint: setting('aiEndpoint', 'https://api.openai.com/v1/chat/completions'),
    key: setting('aiKey', ''),
    model: setting('aiModel', 'gpt-4o-mini'),
    level: setting('educationLevel', 'general')
  };
}
async function callAI(messages, temperature = 0.2) {
  const c = aiCfg();
  if (!c.enabled || !c.endpoint || !c.key) throw new Error('AI_CONFIG');
  const r = await fetch(c.endpoint, {
    method: 'POST',
    headers: {'Content-Type':'application/json', 'Authorization':'Bearer ' + c.key},
    body: JSON.stringify({model:c.model, temperature, messages})
  });
  if (!r.ok) throw new Error('AI_HTTP_' + r.status);
  const d = await r.json();
  const out = d?.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error('AI_EMPTY');
  return out;
}
function extractJSON(text) {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('AI_JSON');
  return JSON.parse(m[0]);
}
async function aiCleanOCR(text) {
  const c = aiCfg();
  const level = EDUCATION_LEVELS[c.level] || EDUCATION_LEVELS.general;
  return callAI([
    {role:'system', content:`تو ویراستار متون درسی هستی. متن OCR را بدون تغییر معنا اصلاح کن. حروف و فاصله‌ها، نیم‌فاصله، علائم نگارشی، اعداد و خطاهای واضح OCR را اصلاح کن. چیزی که در متن نیست اضافه نکن. تیترها را در خط جدا نگه دار. خروجی فقط متن نهایی باشد. سطح آموزشی: ${level}. ${aiLanguageInstruction(text)}`},
    {role:'user', content:text}
  ], 0.1);
}
async function aiGenerateLesson(text, title='آموزش درس') {
  const c = aiCfg();
  const level = EDUCATION_LEVELS[c.level] || EDUCATION_LEVELS.general;
  const lang = aiLanguageInstruction(text);
  const raw = await callAI([
    {role:'system', content:`تو یک معلم حرفه‌ای برای همه مقاطع تحصیلی هستی. ${lang}`},
    {role:'user', content:`از متن کامل این فصل/جزوه یک «آموزش درس» منظم و قابل فهم تهیه کن. فقط بر اساس متن منبع عمل کن و مطلبی را که در منبع نیست به عنوان واقعیت اضافه نکن. سطح آموزشی: ${level}. ساختار خروجی فقط JSON معتبر و بدون markdown باشد:
{"title":"عنوان درس","summary":"خلاصه مفهومی","sections":[{"title":"عنوان بخش","explanation":"توضیح کامل و ساده","keyPoints":["نکته مهم"],"examples":["مثال از متن یا مثال آموزشی روشن"]}],"importantPoints":["نکته‌های مهم فصل"],"reviewQuestions":[{"q":"پرسش","a":"پاسخ"}]}
آموزش باید مرحله‌به‌مرحله، قابل مطالعه، با تیترهای واضح و مناسب سطح باشد. ${lang}
عنوان پیشنهادی: ${title}
متن منبع:
${text}`}
  ], 0.2);
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('AI_JSON');
  const data = JSON.parse(m[0]);
  data.lang = detectTextLanguage(text);
  if (!data || !Array.isArray(data.sections)) throw new Error('AI_JSON');
  return data;
}
function lessonHtml(l) {
  const lang = l.lang || detectTextLanguage((l.summary||'') + ' ' + (l.sections||[]).map(x=>x.explanation||'').join(' '));
  const L = lang === 'en' ? {summary:'Lesson Summary', points:'Key Points', examples:'Examples', important:'Important Points', review:'Final Review', section:'Section'} : {summary:'خلاصه درس', points:'نکته‌های مهم', examples:'مثال‌ها', important:'جمع‌بندی نکته‌های مهم', review:'مرور پایانی', section:'بخش'};
  return `<div class="lesson">
    ${l.summary ? `<div class="lesson-summary"><b>${L.summary}</b><div>${esc(l.summary)}</div></div>` : ''}
    ${(l.sections||[]).map((s,i)=>`<section class="lesson-section"><h3>${lang==='en' ? (i+1)+'. ' : fa(i+1)+'. '}${esc(s.title||L.section)}</h3><p>${esc(s.explanation||'')}</p>
      ${s.keyPoints?.length ? `<h4>${L.points}</h4><ul>${s.keyPoints.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${s.examples?.length ? `<h4>${L.examples}</h4><ul>${s.examples.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>` : ''}</section>`).join('')}
    ${l.importantPoints?.length ? `<div class="card"><h3>${L.important}</h3><ul>${l.importantPoints.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${l.reviewQuestions?.length ? `<div class="card"><h3>${L.review}</h3>${l.reviewQuestions.map((x,i)=>`<details class="lesson-q"><summary>${lang==='en' ? (i+1)+'. ' : fa(i+1)+'. '}${esc(x.q)}</summary><div>${esc(x.a)}</div></details>`).join('')}</div>` : ''}
  </div>`;
}

async function aiGenerateCards(text, deckId, defTopic='عمومی', types) {
  const c = aiCfg();
  const level = EDUCATION_LEVELS[c.level] || EDUCATION_LEVELS.general;
  const wanted = [...(types || new Set(Object.keys(TYPE_FA).filter(t=>t!=='image')))].join(', ');
  const lang = aiLanguageInstruction(text);
  const prompt = `از متن زیر برای سطح «${level}» سؤال‌های آموزشی دقیق بساز. فقط بر اساس متن سؤال بساز و اطلاعات جدید حدس نزن.
نوع‌های مجاز: ${wanted}.
خروجی فقط JSON معتبر به شکل آرایه باشد، بدون markdown:
[{"type":"mcq|tf|type|term|odd|qa","q":"سؤال خوانا و کامل","a":"پاسخ دقیق","options":["گزینه۱","گزینه۲","گزینه۳","گزینه۴"],"topic":"مبحث","src":"جمله منبع"}]
برای tf مقدار a فقط «درست» یا «نادرست» باشد و برای mcq/term/odd دقیقاً ۴ گزینه بده. برای type و qa options را حذف کن. سؤال‌ها را واضح، مناسب سن و بدون ابهام بنویس. حداکثر 40 سؤال. ${lang}
متن:
${text}`;
  const raw = await callAI([
    {role:'system', content:`تو یک طراح آزمون حرفه‌ای برای همه مقاطع تحصیلی هستی. ${lang}`},
    {role:'user', content:prompt}
  ], 0.25);
  const arr = extractJSON(raw);
  const base={deckId,ease:2.5,interval:0,reps:0,lapses:0,due:0,state:'new',created:Date.now()};
  const allowed=types || new Set(Object.keys(TYPE_FA).filter(t=>t!=='image'));
  return arr.filter(x=>x && allowed.has(x.type) && x.q && x.a).slice(0,40).map(x=>({
    ...base,id:uid(),type:x.type,q:String(x.q).trim(),a:String(x.a).trim(),
    options:Array.isArray(x.options)?x.options.map(String).filter(Boolean).slice(0,4):undefined,
    topic:String(x.topic||defTopic).trim(),src:String(x.src||'').trim()
  })).filter(x => ['tf','type','qa'].includes(x.type) || (x.options && x.options.length===4));
}

function generateCards(text, deckId, defTopic = 'عمومی', types) {
  types = types || new Set(Object.keys(TYPE_FA).filter(t => t !== 'image'));
  const sents = parseDoc(text, defTopic);
  const freq = {};
  sents.forEach(({ s }) => (s.match(TOK) || []).filter(isWord).forEach(w => freq[w] = (freq[w] || 0) + 1));
  const pool = Object.keys(freq);
  const tpool = {};
  sents.forEach(({ s, topic }) => (s.match(TOK) || []).filter(isWord).forEach(w => ((tpool[topic] ||= new Set()).add(w))));
  let curTopic = defTopic;
  const out = [], seen = new Set();
  const base = { deckId, ease: 2.5, interval: 0, reps: 0, lapses: 0, due: 0, state: 'new', created: Date.now() };
  const push = c => { if (!types.has(c.type) || seen.has(c.q)) return; seen.add(c.q); out.push({ ...base, id: uid(), ...c }); };
  const near = (w, n = 3, avoid = []) => {
    const ok = x => x !== w && !avoid.includes(x);
    const tp = [...(tpool[curTopic] || [])];
    let d = shuffle(tp.filter(x => ok(x) && Math.abs(x.length - w.length) <= 3));
    if (d.length < n) d = d.concat(shuffle(pool.filter(x => ok(x) && !d.includes(x) && Math.abs(x.length - w.length) <= 3)));
    if (d.length < n) d = d.concat(shuffle(pool.filter(x => ok(x) && !d.includes(x))));
    return d.slice(0, n);
  };
  const defRe = /^(.{2,45}?)\s+(?:یعنی|عبارت است از|عبارت‌است‌از|به معنای|به معنی)\s+(.{8,})$/;
  const isRe = /^((?:\S+\s){0,2}\S+)\s+(?:یک|نوعی|همان)\s+(.{6,}?)\s+(?:است|می‌باشد)$/;
  const strip = s => s.replace(/[.!؟?؛۔]+$/, '');
  const defTerms = sents.map(o => strip(o.s).match(defRe)).filter(Boolean).map(m => m[1].trim());

  sents.forEach(({ s, topic }, i) => {
    curTopic = topic;
    const clean = strip(s);
    const dm = clean.match(defRe);
    if (dm) {
      const term = dm[1].trim(), desc = dm[2].trim();
      push({ type: 'qa', q: `«${term}» یعنی چه؟`, a: desc + '.', src: s, topic });
      let dis = shuffle(defTerms.filter(t => t !== term)).slice(0, 3);
      if (dis.length < 3) dis = dis.concat(near(term, 3 - dis.length, dis));
      if (dis.length >= 3) push({ type: 'term', q: `کدام مفهوم با این توضیح مطابقت دارد؟\n«${desc}»`, a: term, options: shuffle([term, ...dis]), src: s, topic });
      return;
    }
    const im = clean.match(isRe);
    if (im) push({ type: 'qa', q: `«${im[1].trim()}» چیست؟`, a: s, src: s, topic });

    // فهرست‌ها: «الف، ب، ج و د»
    const parts = clean.split('،');
    if (parts.length >= 3 && / و /.test(parts[parts.length - 1])) {
      const first = parts[0].trim().split(' '); const lastP = parts[parts.length - 1].trim();
      const k = lastP.indexOf(' و ');
      const items = [first[first.length - 1], ...parts.slice(1, -1).map(x => x.trim()), lastP.slice(0, k).trim()].filter(x => x && x.split(' ').length <= 3);
      const prefix = first.slice(0, -1).join(' ');
      if (items.length >= 3 && prefix.split(' ').length >= 2) {
        const inS = x => clean.includes(x);
        const intruder = shuffle(pool.filter(x => !inS(x) && x.length >= 3))[0];
        if (intruder) {
          const three = shuffle(items).slice(0, 3);
          push({ type: 'odd', q: `طبق متن، کدام مورد جزو این فهرست نیست؟\n«${prefix} …»`, a: intruder, options: shuffle([intruder, ...three]), src: s, topic });
        }
      }
    }

    const toks = clean.match(TOK) || [];
    const cands = toks.map((w, j) => ({ w, j })).filter(x => isWord(x.w) && x.j > 0)
      .sort((a, b) => (freq[b.w] * 2 + b.w.length) - (freq[a.w] * 2 + a.w.length));
    const nm = clean.match(/[0-9۰-۹]{2,}/g);
    // تستی (عدد یا واژهٔ کلیدی)
    let done = false;
    if (nm && i % 2 === 0) {
      const dis = numVariants(nm[0]); const q = blankOut(clean, nm[0]);
      if (dis.length >= 3 && q) { push({ type: 'mcq', q, a: nm[0], options: shuffle([nm[0], ...dis]), src: s, topic }); done = true; }
    }
    if (!done && cands.length) {
      const ans = cands[0].w, q = blankOut(clean, ans), dis = near(ans);
      if (q && dis.length >= 3) push({ type: 'mcq', q, a: ans, options: shuffle([ans, ...dis]), src: s, topic });
      else if (q) push({ type: 'type', q, a: ans, src: s, topic });
    }
    // یک نوع دیگر برای تنوع
    const k2 = i % 3;
    if (k2 === 0) push({ type: 'tf', q: clean + '.', a: 'درست', src: s, topic });
    else if (k2 === 1 && cands.length) {
      const c2 = cands[Math.min(1, cands.length - 1)].w, q = blankOut(clean, c2);
      if (q) push({ type: 'type', q, a: c2, src: s, topic });
    } else if (cands.length) {
      let fake = null;
      if (nm) { const v = numVariants(nm[0])[0]; if (v) fake = swapWord(clean, nm[0], v); }
      if (!fake) { const w2 = cands[0].w, alt = near(w2, 1)[0]; if (alt) fake = swapWord(clean, w2, alt); }
      if (fake && fake !== clean) push({ type: 'tf', q: fake + '.', a: 'نادرست', src: s, topic });
    }
  });
  return out.slice(0, 300);
}

/* ============ OCR و تصویر ============ */
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res;
    s.onerror = () => rej(new Error('load-fail')); document.head.appendChild(s);
  });
}
async function localExists(p) { try { return (await fetch(p, { method: 'HEAD' })).ok; } catch { return false; } }

async function prepImage(file, max = 3200, q = 0.94, mode = 'enhanced') {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  const x = c.getContext('2d', {willReadFrequently:true});
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(bmp, 0, 0, c.width, c.height);
  if (mode !== 'color') {
    const d=x.getImageData(0,0,c.width,c.height), p=d.data;
    // grayscale + local-ish contrast, while preserving dark Persian glyphs
    let sum=0, count=0;
    for(let i=0;i<p.length;i+=4){ const v=.299*p[i]+.587*p[i+1]+.114*p[i+2]; sum+=v; count++; }
    const mean=sum/count, gain=mode==='bw'?1.65:1.35;
    for(let i=0;i<p.length;i+=4){
      let v=.299*p[i]+.587*p[i+1]+.114*p[i+2];
      v=Math.max(0,Math.min(255,(v-mean)*gain+mean+6));
      if(mode==='bw') v=v>mean?255:Math.max(0,v-20);
      p[i]=p[i+1]=p[i+2]=v;
    }
    x.putImageData(d,0,0);
  }
  return new Promise(r=>c.toBlob(r,'image/jpeg',q));
}
function scriptStats(text) {
  const fa = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const en = (text.match(/[A-Za-z]/g) || []).length;
  const digits = (text.match(/[0-9\u06F0-\u06F9\u0660-\u0669]/g) || []).length;
  const total = fa + en + digits;
  return { fa, en, digits, total, faRatio: total ? fa / total : 0, enRatio: total ? en / total : 0 };
}

function ocrQuality(text, confidence = 0) {
  const st = scriptStats(text);
  const chars = text.replace(/\s/g, '').length;
  const weird = (text.match(/[\[\]{}|_^~`]+/g) || []).join('').length;
  const repeated = (text.match(/(.)\1{3,}/g) || []).length;
  return Number(confidence || 0) + Math.min(chars / 20, 20) - weird * 1.5 - repeated * 2 + (st.fa ? 8 : 0);
}

async function createOCRWorker(lang, onProgress) {
  const V='vendor/tesseract/';
  const local=await localExists(V+'tesseract.min.js');
  if(!window.Tesseract) await loadScript(local?V+'tesseract.min.js':'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
  const opts={logger:onProgress};
  if(local) Object.assign(opts,{workerPath:V+'worker.min.js',corePath:V,langPath:V});
  const w=await Tesseract.createWorker(lang,1,opts);
  await w.setParameters({
    tessedit_pageseg_mode:'6',
    preserve_interword_spaces:'1',
    user_defined_dpi:'300'
  });
  return w;
}

async function recognizeWithWorker(w, blob) {
  const enhanced=await prepImage(blob, 3200, .96, 'enhanced');
  const r1=await w.recognize(enhanced);
  let best=r1.data?.text||'', bestScore=ocrQuality(best, r1.data?.confidence);
  // A thresholded pass is useful for faint/low-contrast Persian print.
  if(best.replace(/\s/g,'').length < 100 || Number(r1.data?.confidence||0) < 58){
    const bw=await prepImage(blob, 3200, .97, 'bw');
    const r2=await w.recognize(bw);
    const score=ocrQuality(r2.data?.text||'', r2.data?.confidence);
    if(score > bestScore) best=r2.data?.text||best;
  }
  return best;
}

async function runOCRMany(blobs,onProgress){
  // مهم: فارسی و انگلیسی را با موتور جدا می‌خوانیم. اجرای همزمان fas+eng باعث
  // می‌شد تسرکت در متن فارسی حروف را لاتین تشخیص دهد و خروجی‌هایی مثل «Le AE...» بدهد.
  let idx=0;
  const progress = m => onProgress && onProgress(idx,m);
  const faWorker = await createOCRWorker('fas', progress);
  const texts=[];
  try {
    for(idx=0; idx<blobs.length; idx++){
      const faText = await recognizeWithWorker(faWorker, blobs[idx]);
      const st = scriptStats(faText);
      let best = faText;

      // اگر خروجی فارسی نیست، همان صفحه را با مدل انگلیسی دوباره می‌خوانیم.
      // این کار متن انگلیسی را هم درست نگه می‌دارد و از قاطی شدن زبان‌ها جلوگیری می‌کند.
      if(st.enRatio > 0.55 && st.faRatio < 0.18){
        let enWorker;
        try {
          enWorker = await createOCRWorker('eng', progress);
          const enText = await recognizeWithWorker(enWorker, blobs[idx]);
          if(ocrQuality(enText) > ocrQuality(best)) best = enText;
        } finally { if(enWorker) await enWorker.terminate(); }
      }
      texts.push(best);
    }
    return texts;
  } finally { await faWorker.terminate(); }
}

async function rotateBlob(blob, deg) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas'); const sw = deg % 180 !== 0;
  c.width = sw ? bmp.height : bmp.width; c.height = sw ? bmp.width : bmp.height;
  const x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2); x.rotate(deg * Math.PI / 180);
  x.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
}

async function pdfText(file) {
  const V = 'vendor/pdfjs/';
  const local = await localExists(V + 'pdf.min.js');
  const base = local ? V : 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/';
  if (!window.pdfjsLib) await loadScript(base + 'pdf.min.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let out = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    out += tc.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('') + '\n\n';
  }
  return out;
}

/* ============ رابط: ابزارها ============ */
const app = $('#app');
function setTab(t) { $$('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.t === t)); }
function view(html, tab) { app.innerHTML = html; setTab(tab); window.scrollTo(0, 0); }
async function deckStats(deck, cards) {
  cards = cards || await DB.byDeck(deck.id);
  const now = Date.now();
  return {
    total: cards.length,
    due: cards.filter(c => c.state !== 'new' && c.due <= now).length,
    fresh: cards.filter(c => c.state === 'new').length,
    mastered: cards.filter(isMastered).length,
  };
}
async function saveDeckWithCards(deckId, title, cards) {
  let deck = deckId ? await DB.get('decks', deckId) : null;
  if (!deck) deck = { id: uid(), title: title || 'جزوه بدون نام', created: Date.now() };
  cards.forEach(c => c.deckId = deck.id);
  await DB.put('decks', deck); await DB.putMany('cards', cards);
  return deck;
}

/* ============ صفحه‌ها ============ */
async function homeView() {
  const decks = (await DB.all('decks')).sort((a, b) => b.created - a.created);
  const cards = await DB.all('cards'); const now = Date.now();
  const due = cards.filter(c => c.state !== 'new' && c.due <= now).length;
  const fresh = cards.filter(c => c.state === 'new').length;
  const streak = await getStreak();
  let list = '';
  for (const d of decks) {
    const cs = cards.filter(c => c.deckId === d.id); const s = await deckStats(d, cs);
    const pct = s.total ? Math.round(s.mastered / s.total * 100) : 0;
    list += `<a class="card link" href="#/deck/${d.id}">
      <div class="row"><b class="grow">${esc(d.title)}</b>${s.due ? `<span class="chip saf">${fa(s.due)} برای مرور</span>` : ''}</div>
      <div class="small mute" style="margin:4px 0 8px">${fa(s.total)} کارت · ${fa(s.fresh)} جدید · تسلط ${fa(pct)}٪</div>
      <div class="bar"><i style="width:${pct}%"></i></div></a>`;
  }
  view(`
    <div class="hero">
      <div><div class="small" style="opacity:.8">کارت‌های آمادهٔ مرور امروز</div>
        <div class="big">${fa(due)}</div>
        <div class="small" style="opacity:.8">${fa(fresh)} کارت جدید · ${fa(streak)} روز پیاپی</div></div>
      <a class="btn" href="#/study/all">${due || fresh ? 'شروع مرور' : 'همه چیز مرور شده'}</a>
    </div>
    <div class="row" style="margin-bottom:6px"><h2 class="grow" style="margin:0">جزوه‌های من</h2>
      <a class="btn sm" href="#/add">جزوهٔ جدید</a></div>
    ${list || `<div class="card empty"><b>هنوز جزوه‌ای نداری</b>متن جزوه را بچسبان، فایل PDF بده یا از صفحهٔ کتاب عکس بگیر؛ همیار سؤال‌هایش را می‌سازد.
      <div class="row" style="justify-content:center;margin-top:14px"><a class="btn" href="#/add">افزودن متن</a><a class="btn sec" href="#/photo">عکس گرفتن</a></div></div>`}
    <div id="installBox"></div>
    <div class="small mute" style="text-align:center;margin:16px 0 80px">همیار مطالعه · نسخه ${VERSION}</div>`, 'home');
  if (window._installEvt) {
    $('#installBox').innerHTML = `<button class="btn fir block" id="inst">نصب برنامه روی گوشی</button>`;
    $('#inst').onclick = async () => { window._installEvt.prompt(); window._installEvt = null; $('#installBox').innerHTML = ''; };
  }
}

async function getStreak() {
  const logs = new Map((await DB.all('log')).map(l => [l.id, l]));
  let n = 0, t = Date.now();
  if (!logs.get(dayKey(t))?.reviewed) t -= DAY;
  while (logs.get(dayKey(t))?.reviewed) { n++; t -= DAY; }
  return n;
}

async function deckView(id) {
  const deck = await DB.get('decks', id);
  if (!deck) return location.hash = '#/';
  const cards = await DB.byDeck(id); const s = await deckStats(deck, cards);
  const byTopic = {};
  cards.forEach(c => { (byTopic[c.topic] ||= []).push(c); });
  const topics = Object.entries(byTopic).map(([t, cs]) => {
    const p = Math.round(cs.filter(isMastered).length / cs.length * 100);
    return `<tr><td>${esc(t)}</td><td class="mute">${fa(cs.length)}</td><td style="width:38%"><div class="bar"><i style="width:${p}%"></i></div></td></tr>`;
  }).join('');
  view(`
    <h1>${esc(deck.title)}</h1>
    <p class="sub">${fa(s.total)} کارت · ${fa(s.due)} آمادهٔ مرور · ${fa(s.fresh)} جدید · ${fa(s.mastered)} مسلط</p>
    <div class="row" style="margin-bottom:12px">
      <a class="btn grow" href="#/study/${id}">مرور</a>
      <a class="btn fir grow" href="#/exam/${id}">آزمون</a>
      <a class="btn sec grow" href="#/lesson/${id}">آموزش درس</a>
    </div>
    <div class="row">
      <a class="btn sec sm" href="#/add?deck=${id}">افزودن متن</a>
      <a class="btn sec sm" href="#/photo?deck=${id}">افزودن عکس</a>
      <button class="btn sec sm" id="ren">تغییر نام</button>
      <button class="btn danger sm" id="del">حذف</button>
    </div>
    ${topics ? `<h2>تسلط به تفکیک مبحث</h2><div class="card"><table class="tbl">${topics}</table></div>` : ''}
    <h2>کارت‌ها</h2>
    ${cards.length ? cards.map(c => `<div class="card"><div class="small mute">${esc(c.topic)} · ${TYPE_FA[c.type] || c.type}</div>
      <div>${qHtml(c)}</div><div class="small" style="color:var(--fir)">${esc(c.a)}</div>
      <button class="btn danger sm" data-del="${c.id}" style="margin-top:8px">حذف کارت</button></div>`).join('') : '<div class="card empty">این جزوه کارتی ندارد.</div>'}`, 'home');
  $('#ren').onclick = async () => { const t = prompt('نام جدید جزوه:', deck.title); if (t?.trim()) { deck.title = t.trim(); await DB.put('decks', deck); deckView(id); } };
  $('#del').onclick = async () => {
    if (!confirm('این جزوه و همهٔ کارت‌هایش حذف شود؟')) return;
    for (const c of cards) await DB.del('cards', c.id);
    await DB.del('decks', id); toast('جزوه حذف شد'); location.hash = '#/';
  };
  $$('[data-del]').forEach(b => b.onclick = async () => { await DB.del('cards', b.dataset.del); deckView(id); });
}

/* افزودن متن / PDF */
async function addView(q) {
  const deckId = q.get('deck'); const deck = deckId ? await DB.get('decks', deckId) : null;
  view(`
    <h1>${deck ? 'افزودن به «' + esc(deck.title) + '»' : 'جزوهٔ جدید'}</h1>
    <p class="sub">متن را بچسبان یا فایل بده. خط کوتاه بدون نقطه به‌عنوان تیتر مبحث شناخته می‌شود.</p>
    ${deck ? '' : '<label class="f" for="title">نام جزوه</label><input type="text" id="title" placeholder="مثلاً زیست‌شناسی فصل ۳">'}
    <label class="f" for="txt">متن جزوه</label>
    <textarea id="txt" placeholder="متن را اینجا بچسبان..."></textarea>
    <div class="row" style="margin-top:10px">
      <label class="btn sec sm" style="cursor:pointer">انتخاب فایل (PDF یا TXT)<input type="file" id="file" accept=".txt,.md,.pdf,text/plain,application/pdf" hidden></label>
      <span class="small mute" id="fstat"></span>
    </div>
    <button class="btn block" id="go" style="margin-top:16px">ساخت سؤال</button>
    <div id="out"></div>`, 'home');
  $('#file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    $('#fstat').textContent = 'در حال خواندن...';
    try {
      const t = /pdf$/i.test(f.name) ? await pdfText(f) : await f.text();
      $('#txt').value = t; $('#fstat').textContent = `${fa(t.length)} نویسه خوانده شد`;
      if (!deck && $('#title') && !$('#title').value) $('#title').value = f.name.replace(/\.[^.]+$/, '');
    } catch { $('#fstat').textContent = 'خواندن فایل ممکن نشد. برای PDF بار اول به اینترنت نیاز است؛ یا متن را مستقیم بچسبان.'; }
  };
  $('#go').onclick = () => {
    const text = $('#txt').value.trim();
    if (text.length < 40) return toast('متن خیلی کوتاه است');
    const title = deck ? deck.title : ($('#title').value.trim() || 'جزوه بدون نام');
    const cards = generateCards(text, deckId, title);
    if (!cards.length) return toast('سؤالی ساخته نشد؛ متن را کامل‌تر یا با جمله‌های بلندتر وارد کن');
    reviewGenerated(cards, deckId, title, $('#out'));
  };
}

function qHtml(c) {
  return esc(c.q).replace('{{blank}}', '<span class="blank">&nbsp;</span>').replace(/\n/g, '<br>');
}

/* مرور و ویرایش سؤال‌های ساخته‌شده، پیش از ذخیره */
function reviewGenerated(cards, deckId, title, host) {
  const types = [...new Set(cards.map(c => c.type))];
  const cnt = t => cards.filter(c => c.type === t).length;
  const BL = '＿＿＿';
  const row = (c, i) => `<div class="gen" data-i="${i}" data-type="${c.type}">
    <input type="checkbox" checked aria-label="انتخاب سؤال">
    <div class="grow"><span class="chip">${TYPE_FA[c.type]}</span>
      <div class="qtxt" style="margin-top:4px">${qHtml(c)}</div>
      ${c.options ? `<div class="small mute">گزینه‌ها: ${c.options.map(esc).join('، ')}</div>` : ''}
      <div class="small" style="color:var(--fir)">پاسخ: ${esc(c.a)}</div>
      <button class="btn sec sm" data-edit="${i}" style="margin-top:6px">ویرایش</button></div></div>`;
  host.innerHTML = `<h2>${fa(cards.length)} سؤال در ${fa(types.length)} نوع ساخته شد</h2>
    <p class="small mute">نوع‌هایی که نمی‌خواهی را خاموش کن، سؤال‌های ضعیف را تیک بزن یا ویرایش کن.</p>
    <div class="chips" id="chips">${types.map(t => `<button class="ch on" data-t="${t}">${TYPE_FA[t]} · ${fa(cnt(t))}</button>`).join('')}</div>
    <div class="row" style="margin:8px 0"><button class="btn sec sm" id="sall">انتخاب همه</button><button class="btn sec sm" id="snone">هیچ‌کدام</button><span class="small mute" id="scnt"></span></div>
    <div class="card" id="glist">${cards.map(row).join('')}</div>
    <button class="btn fir block" id="save">ذخیرهٔ سؤال‌های انتخاب‌شده</button>`;
  host.scrollIntoView({ behavior: 'smooth' });
  const rows = () => $$('.gen', host);
  const live = () => rows().filter(r => !r.hidden && $('input', r).checked);
  const upd = () => { $('#scnt').textContent = `${fa(live().length)} سؤال انتخاب شده`; };
  upd();
  $('#glist').addEventListener('change', upd);
  $$('.ch', host).forEach(b => b.onclick = () => {
    b.classList.toggle('on'); const on = b.classList.contains('on');
    rows().filter(r => r.dataset.type === b.dataset.t).forEach(r => { r.hidden = !on; $('input', r).checked = on; });
    upd();
  });
  $('#sall').onclick = () => { rows().filter(r => !r.hidden).forEach(r => $('input', r).checked = true); upd(); };
  $('#snone').onclick = () => { rows().forEach(r => $('input', r).checked = false); upd(); };
  $('#glist').addEventListener('click', e => {
    const b = e.target.closest('[data-edit]'); if (!b) return;
    const i = +b.dataset.edit, c = cards[i];
    const nq = prompt('متن سؤال:', c.q.replace('{{blank}}', BL));
    if (nq === null) return;
    const hadBlank = c.q.includes('{{blank}}');
    if (hadBlank && !nq.includes(BL)) return toast('جای خالی (＿＿＿) باید در سؤال بماند');
    c.q = nq.replace(BL, '{{blank}}');
    if (c.type === 'qa' || c.type === 'type') {
      const na = prompt('پاسخ:', c.a); if (na !== null && na.trim()) c.a = na.trim();
    }
    const r = b.closest('.gen'); const chk = $('input', r).checked;
    r.outerHTML = row(c, i); if (!chk) $(`.gen[data-i="${i}"] input`, host).checked = false; upd();
  });
  $('#save').onclick = async () => {
    const keep = live().map(r => cards[+r.dataset.i]);
    if (!keep.length) return toast('هیچ سؤالی انتخاب نشده');
    const d = await saveDeckWithCards(deckId, title, keep);
    toast(`${fa(keep.length)} سؤال ذخیره شد`); location.hash = '#/deck/' + d.id;
  };
}

/* عکس: چندصفحه‌ای، OCR، پاک‌سازی، ساخت چند نوع سؤال */
async function photoView(q) {
  const deckId = q.get('deck'); const decks = await DB.all('decks');
  const pages = []; let mode = q.get('lesson') === '1' ? 'lesson' : 'ocr';
  view(`<ol class="steps"><li id="s1">عکس</li><li id="s2">متن</li><li id="s3">سؤال</li></ol><div id="stage"></div>`, 'photo');
  const setStep = n => [1, 2, 3].forEach(i => $('#s' + i).className = i < n ? 'done' : i === n ? 'on' : '');
  const deckSelect = () => `<label class="f" for="dsel">ذخیره در</label>
    <select id="dsel">${decks.map(d => `<option value="${d.id}" ${d.id === deckId ? 'selected' : ''}>${esc(d.title)}</option>`).join('')}<option value="__new" ${decks.length ? '' : 'selected'}>جزوهٔ جدید...</option></select>`;
  const target = async () => {
    const v = $('#dsel').value;
    if (v === '__new') { const t = prompt('نام جزوهٔ جدید:', 'جزوهٔ عکسی'); return t === null ? null : { id: null, title: t.trim() || 'جزوهٔ عکسی' }; }
    const d = await DB.get('decks', v); return { id: d.id, title: d.title };
  };

  function stage1() {
    setStep(1);
    $('#stage').innerHTML = `
      <h1>از عکس سؤال بساز</h1>
      <p class="sub">هر صفحه را جدا بگیر. چند صفحه را می‌توانی با هم بخوانی.</p>
      <div class="row">
        <label class="btn grow" style="cursor:pointer">دوربین<input type="file" id="cam" accept="image/*" capture="environment" hidden></label>
        <label class="btn sec grow" style="cursor:pointer">گالری (چند عکس)<input type="file" id="gal" accept="image/*" multiple hidden></label>
      </div>
      <div class="tips card" style="margin-top:12px"><b>برای خواندن بهتر</b>
        <ul><li>گوشی را موازی صفحه نگه دار و کل صفحه در کادر باشد.</li><li>نور یکنواخت باشد و سایه روی متن نیفتد.</li><li>اگر عکس کج یا خوابیده است، با «چرخش» درستش کن.</li></ul></div>
      <div id="pages" class="pages"></div><div id="go1"></div>`;
    const add = async files => {
      for (const f of files) { try { const b = await prepImage(f, 2400, 0.9, false); pages.push({ blob: b, url: URL.createObjectURL(b) }); } catch { toast('یک تصویر خوانده نشد'); } }
      render();
    };
    $('#cam').onchange = e => { add([...e.target.files]); e.target.value = ''; };
    $('#gal').onchange = e => { add([...e.target.files]); e.target.value = ''; };
    render();
  }
  function render() {
    if (!$('#pages')) return;
    $('#pages').innerHTML = pages.map((p, i) => `<div class="pg"><img src="${p.url}" alt="صفحهٔ ${fa(i + 1)}">
      <div class="pgb"><span class="small">صفحهٔ ${fa(i + 1)}</span><button class="btn sec sm" data-rot="${i}">چرخش</button><button class="btn danger sm" data-rm="${i}">حذف</button></div></div>`).join('');
    $$('[data-rot]').forEach(b => b.onclick = async () => { const p = pages[+b.dataset.rot]; p.blob = await rotateBlob(p.blob, 90); p.url = URL.createObjectURL(p.blob); render(); });
    $$('[data-rm]').forEach(b => b.onclick = () => { pages.splice(+b.dataset.rm, 1); render(); });
    $('#go1').innerHTML = pages.length ? `
      <div class="seg"><label><input type="radio" name="mode" value="ocr" ${mode === 'ocr' ? 'checked' : ''}><span>خواندن متن و ساخت سؤال</span></label>
      <label><input type="radio" name="mode" value="lesson" ${mode === 'lesson' ? 'checked' : ''}><span>آموزش درس از فصل</span></label>
      <label><input type="radio" name="mode" value="img" ${mode === 'img' ? 'checked' : ''}><span>خود عکس، کارت شود</span></label></div>
      <button class="btn block" id="next">${mode === 'ocr' ? `خواندن متن ${fa(pages.length)} صفحه` : 'ادامه'}</button>` : '';
    $$('input[name=mode]').forEach(r => r.onchange = () => { mode = r.value; render(); });
    if (pages.length) $('#next').onclick = () => mode === 'ocr' ? stageOCR() : mode === 'lesson' ? stageOCR('lesson') : stageImg();
  }

  async function stageOCR(targetMode = 'ocr') {
    setStep(2);
    $('#stage').innerHTML = `<h1>در حال خواندن متن</h1><p class="sub" id="ost">آماده‌سازی تصویر...</p><div class="bar"><i id="obar" style="width:0"></i></div>`;
    try {
      const blobs = []; for (const p of pages) blobs.push(await prepImage(p.blob, 2200, 0.92, true));
      const names = { 'loading tesseract core': 'بارگذاری موتور خواندن', 'loading language traineddata': 'بارگذاری زبان فارسی (فقط بار اول)', 'initializing api': 'آماده‌سازی', 'recognizing text': 'در حال خواندن' };
      const texts = await runOCRMany(blobs, (i, m) => {
        $('#ost').textContent = `صفحهٔ ${fa(i + 1)} از ${fa(blobs.length)} · ${names[m.status] || m.status}${m.progress ? ' ' + fa(Math.round(m.progress * 100)) + '٪' : ''}`;
        $('#obar').style.width = Math.round(((i + (m.status === 'recognizing text' ? m.progress : 0)) / blobs.length) * 100) + '%';
      });
      stageText(texts.map(cleanOCR).filter(Boolean).join('\n\n'), targetMode);
    } catch {
      $('#stage').innerHTML = `<div class="card empty"><b>خواندن متن ممکن نشد</b>بار اول به اینترنت نیاز است تا موتور و زبان فارسی دانلود شود. بعد از آن آفلاین هم کار می‌کند.
        <div class="row" style="justify-content:center;margin-top:14px"><button class="btn" id="retry">تلاش دوباره</button><button class="btn sec" id="back">برگشت</button><button class="btn sec" id="asimg">عکس را کارت کن</button></div></div>`;
      $('#retry').onclick = stageOCR; $('#back').onclick = stage1; $('#asimg').onclick = stageImg;
    }
  }

  function stageText(text, targetMode = 'ocr') {
    setStep(2);
    const bad = text.replace(/\s/g, '').length < 80;
    const st = scriptStats(text);
    const dir = st.faRatio >= st.enRatio ? 'rtl' : 'ltr';
    const langName = dir === 'rtl' ? 'فارسی' : 'English';
    $('#stage').innerHTML = `<h1>متن خوانده‌شده</h1>
      <p class="sub">${bad ? 'متن کمی خوانده شد؛ عکس را از نزدیک‌تر و با نور بهتر بگیر، یا متن را خودت کامل کن.' : `زبان تشخیص‌داده‌شده: ${langName} · متن را بررسی و در صورت نیاز ویرایش کن.`}</p>
      <textarea id="otext" dir="${dir}" lang="${dir === 'rtl' ? 'fa' : 'en'}" style="min-height:260px">${esc(text)}</textarea>
      ${deckSelect()}
      <div class="row" style="margin-top:14px"><button class="btn sec" id="back">برگشت</button><button class="btn sec" id="aiclean">اصلاح متن با هوش مصنوعی</button><button class="btn sec" id="lessonBtn">ساخت آموزش درس</button><button class="btn fir grow" id="gen">ساخت سؤال‌ها</button></div>`;
    $('#back').onclick = stage1;
    $('#aiclean').onclick = async () => {
      const btn=$('#aiclean'); btn.disabled=true; btn.textContent='در حال اصلاح...';
      try { $('#otext').value=await aiCleanOCR($('#otext').value); toast('متن با هوش مصنوعی اصلاح شد'); }
      catch(e){ toast(e.message==='AI_CONFIG'?'ابتدا اتصال هوش مصنوعی را در تنظیمات فعال کن':'اصلاح هوش مصنوعی انجام نشد'); }
      finally { btn.disabled=false; btn.textContent='اصلاح متن با هوش مصنوعی'; }
    };
    $('#lessonBtn').onclick = async () => {
      const t = await target(); if (!t) return;
      const text = $('#otext').value.trim(); if (text.length < 80) return toast('متن فصل کافی نیست');
      const btn=$('#lessonBtn'); btn.disabled=true; btn.textContent='در حال ساخت آموزش...';
      try { const data=await aiGenerateLesson(text,t.title); await DB.put('lessons',{id:uid(),deckId:t.id,title:data.title||t.title,data,created:Date.now()}); setStep(3); $('#stage').innerHTML=`<div class="card"><h2>${esc(data.title||t.title)}</h2>${lessonHtml(data)}<div class="row" style="margin-top:14px"><a class="btn sec" href="#/deck/${t.id}">بازگشت به جزوه</a></div></div>`; toast('آموزش درس آماده شد'); }
      catch(e){ toast(e.message==='AI_CONFIG'?'ابتدا اتصال هوش مصنوعی را در تنظیمات فعال کن':'ساخت آموزش درس انجام نشد'); }
      finally { btn.disabled=false; btn.textContent='ساخت آموزش درس'; }
    };
    $('#gen').onclick = async () => {
      const t = await target(); if (!t) return;
      let cards;
      try { cards=await aiGenerateCards($('#otext').value,t.id,t.title); toast('سؤال‌های هوشمند ساخته شد'); }
      catch(e){ cards=generateCards($('#otext').value,t.id,t.title); toast(e.message==='AI_CONFIG'?'هوش مصنوعی متصل نیست؛ ساخت آفلاین انجام شد':'ساخت هوشمند ناموفق بود؛ ساخت آفلاین انجام شد'); }
      if (!cards.length) return toast('سؤالی ساخته نشد؛ متن را کامل‌تر یا با جمله‌های واضح‌تر کن');
      setStep(3); $('#stage').innerHTML = '<div id="rv"></div>'; reviewGenerated(cards, t.id, t.title, $('#rv'));
    };
  }

  function stageImg() {
    setStep(2);
    const p = pages[0];
    $('#stage').innerHTML = `<h1>کارت تصویری</h1><p class="sub">عکس روی کارت می‌آید و باید پاسخ را از حفظ بگویی.${pages.length > 1 ? ' فقط صفحهٔ اول استفاده می‌شود.' : ''}</p>
      <img class="preview" src="${p.url}" alt="پیش‌نمایش">
      <label class="f" for="iq">سؤال</label><input type="text" id="iq" placeholder="مثلاً: بخش‌های این نمودار را نام ببر">
      <label class="f" for="ia">پاسخ</label><textarea id="ia" style="min-height:90px"></textarea>
      ${deckSelect()}
      <div class="row" style="margin-top:14px"><button class="btn sec" id="back">برگشت</button><button class="btn fir grow" id="isave">ذخیرهٔ کارت</button></div>`;
    $('#back').onclick = stage1;
    $('#isave').onclick = async () => {
      const qq = $('#iq').value.trim(), aa = $('#ia').value.trim();
      if (!qq || !aa) return toast('سؤال و پاسخ را بنویس');
      const t = await target(); if (!t) return;
      const imageId = uid(); await DB.put('images', { id: imageId, blob: p.blob });
      const card = { id: uid(), type: 'image', q: qq, a: aa, imageId, topic: t.title, ease: 2.5, interval: 0, reps: 0, lapses: 0, due: 0, state: 'new', created: Date.now() };
      const d = await saveDeckWithCards(t.id, t.title, [card]);
      toast('کارت تصویری ذخیره شد'); location.hash = '#/deck/' + d.id;
    };
  }
  stage1();
}

/* پاسخ‌گویی به انواع سؤال (تستی، درست/نادرست، تایپی، ...) */
const fold = s => norm(s).replace(/[\u200c\s]/g, '').toLowerCase();
function lev(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}
function typedOk(inp, ans) {
  const x = fold(toEn(inp)), y = fold(toEn(ans));
  if (!x) return false; if (x === y) return true;
  return y.length >= 5 && lev(x, y) <= 1;
}
function interactive(c, act, done, last) {
  const q = act.parentElement;
  const reveal = (ok, html) => {
    q.insertAdjacentHTML('beforeend', `<div class="ans ${ok ? '' : 'bad'}">${html}</div>
      <button class="btn block" id="nx" style="margin-top:12px">${last ? 'دیدن نتیجه' : 'ادامه'}</button>`);
    const b = $('#nx'); b.onclick = () => done(ok); b.focus();
  };
  if (c.type === 'tf') {
    act.innerHTML = `<div class="opts two"><button class="opt" data-v="درست">درست</button><button class="opt" data-v="نادرست">نادرست</button></div>`;
    $$('.opt', act).forEach(b => b.onclick = () => {
      const ok = b.dataset.v === c.a;
      $$('.opt', act).forEach(x => { x.disabled = true; if (x.dataset.v === c.a) x.classList.add('right'); });
      if (!ok) b.classList.add('wrong');
      reveal(ok, (ok ? 'آفرین!' : 'اشتباه بود.') + (c.a === 'نادرست' ? `<div class="small" style="margin-top:6px">جملهٔ درست: ${esc(c.src)}</div>` : ''));
    });
  } else if (c.type === 'type') {
    act.innerHTML = `<input type="text" id="ti" autocomplete="off" placeholder="جای خالی را تایپ کن" style="margin-top:14px">
      <div class="row" style="margin-top:10px"><button class="btn grow" id="chk">بررسی</button><button class="btn sec" id="idk">نمی‌دانم</button></div>`;
    const fin = ok => { const v = $('#ti').value; $('#ti').disabled = true; $('#chk').disabled = $('#idk').disabled = true; reveal(ok, ok ? 'درست است!' : `پاسخ درست: <b>${esc(c.a)}</b>`); };
    $('#chk').onclick = () => fin(typedOk($('#ti').value, c.a)); $('#idk').onclick = () => fin(false);
    $('#ti').onkeydown = e => { if (e.key === 'Enter') $('#chk').click(); }; $('#ti').focus();
  } else { // mcq, term, odd
    act.innerHTML = `<div class="opts">${c.options.map(o => `<button class="opt" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
    $$('.opt', act).forEach(b => b.onclick = () => {
      const ok = b.dataset.o === c.a;
      $$('.opt', act).forEach(x => { x.disabled = true; if (x.dataset.o === c.a) x.classList.add('right'); });
      if (!ok) b.classList.add('wrong');
      reveal(ok, ok ? 'آفرین!' : `پاسخ درست: <b>${esc(c.a)}</b>`);
    });
  }
}
const typeTag = c => `<span class="chip" style="margin-inline-start:6px">${TYPE_FA[c.type]}</span>`;

/* مرور */
async function studyView(id) {
  const cards = id === 'all' ? await DB.all('cards') : await DB.byDeck(id);
  const now = Date.now(); const lim = setting('newLimit', 20);
  const log = (await DB.get('log', dayKey())) || { fresh: 0 };
  const due = cards.filter(c => c.state !== 'new' && c.due <= now).sort((a, b) => a.due - b.due);
  const fresh = shuffle(cards.filter(c => c.state === 'new')).slice(0, Math.max(0, lim - (log.fresh || 0)));
  const queue = [...due, ...fresh];
  if (!queue.length) return view(`<div class="card empty"><b>برای الان کاری نمانده</b>کارت آمادهٔ مرور یا جدیدی وجود ندارد.
    <div class="row" style="justify-content:center;margin-top:14px"><a class="btn" href="#/">بازگشت</a></div></div>`, 'study');
  const total = queue.length; let done = 0, okc = 0;
  const next = async () => {
    if (!queue.length) {
      return view(`<div class="card empty"><b>مرور تمام شد</b>${fa(total)} کارت مرور شد و ${fa(okc)} تا درست بود.
        <div class="row" style="justify-content:center;margin-top:14px"><a class="btn" href="#/">خانه</a></div></div>`, 'study');
    }
    const c = queue.shift(); let img = '';
    if (c.type === 'image') { const r = await DB.get('images', c.imageId); if (r) img = `<img src="${URL.createObjectURL(r.blob)}" alt="تصویر کارت">`; }
    view(`<div class="bar prog"><i style="width:${Math.round(done / total * 100)}%"></i></div>
      <div class="q"><div class="topic">${esc(c.topic)}${typeTag(c)}</div>${img}<div>${qHtml(c)}</div>
      ${AUTO.has(c.type) ? '<div id="act"></div>' : '<div id="rev"><button class="btn block" id="show" style="margin-top:16px">نمایش پاسخ</button></div>'}</div>`, 'study');
    const finish = async g => {
      const n = sched(c, g); await DB.put('cards', n);
      await bumpLog({ reviewed: 1, correct: g > 0 ? 1 : 0, fresh: c.state === 'new' ? 1 : 0 });
      if (g > 0) okc++; else queue.push(n);
      done++; next();
    };
    if (AUTO.has(c.type)) interactive(c, $('#act'), ok => finish(ok ? 2 : 0), false);
    else $('#show').onclick = () => {
      $('#rev').innerHTML = `<div class="ans">${esc(c.a)}</div><div class="grades">
        ${['دوباره', 'سخت', 'خوب', 'آسان'].map((t, g) => `<button class="g${g}" data-g="${g}">${t}<small>${fmtIv(c, g)}</small></button>`).join('')}</div>`;
      $$('[data-g]').forEach(b => b.onclick = () => finish(+b.dataset.g));
    };
  };
  next();
}

/* آزمون */
async function lessonView(id) {
  const deck = await DB.get('decks', id); if (!deck) return location.hash='#/';
  const cards = await DB.byDeck(id);
  const source = cards.map(c => `${c.topic ? c.topic+'\n' : ''}${c.q}\n${c.a}${c.options ? '\nگزینه‌ها: '+c.options.join('، ') : ''}`).join('\n\n');
  const saved = (await DB.all('lessons')).filter(x=>x.deckId===id).sort((a,b)=>b.created-a.created)[0];
  view(`<h1>آموزش درس</h1><p class="sub">${esc(deck.title)} · کل محتوای جزوه را به یک درس آموزشی منظم تبدیل کن.</p>
    <div class="card"><b>مرحله ۱: منبع درس</b><textarea id="lessonSrc" placeholder="متن فصل یا جزوه را اینجا وارد کن..."></textarea>
      <div class="row" style="margin-top:10px"><a class="btn sec sm" href="#/photo?deck=${id}&lesson=1">خواندن عکس‌های فصل</a><button class="btn fir grow" id="makeLesson">ساخت آموزش درس با هوش مصنوعی</button></div></div>
    <div id="lessonOut"></div>`, 'home');
  $('#lessonSrc').value=source;
  if(saved?.data){ $('#lessonOut').innerHTML=`<div class="card"><div class="row"><h2 class="grow" style="margin:0">${esc(saved.data.title||'آموزش درس')}</h2><span class="chip">ذخیره‌شده</span></div>${lessonHtml(saved.data)}</div>`; }
  $('#makeLesson').onclick=async()=>{
    const text=$('#lessonSrc').value.trim(); if(text.length<80) return toast('متن فصل یا جزوه کافی نیست');
    const b=$('#makeLesson'); b.disabled=true; b.textContent='در حال آماده‌سازی آموزش...';
    try { const data=await aiGenerateLesson(text,deck.title); await DB.put('lessons',{id:uid(),deckId:id,title:data.title||deck.title,data,created:Date.now()}); $('#lessonOut').innerHTML=`<div class="card"><h2>${esc(data.title||deck.title)}</h2>${lessonHtml(data)}</div>`; toast('آموزش درس آماده شد'); }
    catch(e){ toast(e.message==='AI_CONFIG'?'ابتدا اتصال هوش مصنوعی را در تنظیمات فعال کن':'ساخت آموزش درس انجام نشد'); }
    finally { b.disabled=false; b.textContent='ساخت آموزش درس با هوش مصنوعی'; }
  };
}

async function examView(id) {
  const deck = await DB.get('decks', id); if (!deck) return location.hash = '#/';
  const cards = await DB.byDeck(id);
  if (cards.length < 4) return view(`<div class="card empty"><b>کارت کافی نیست</b>برای آزمون حداقل چهار کارت لازم است.<div class="row" style="justify-content:center;margin-top:14px"><a class="btn" href="#/deck/${id}">بازگشت</a></div></div>`, 'home');
  const types = [...new Set(cards.map(c => c.type))];
  view(`<h1>آزمون «${esc(deck.title)}»</h1><p class="sub">${fa(cards.length)} کارت در این جزوه هست.</p>
    <label class="f" for="cnt">تعداد سؤال</label>
    <select id="cnt">${[10, 20, 30].filter(n => n < cards.length).map(n => `<option value="${n}">${fa(n)} سؤال</option>`).join('')}<option value="${cards.length}">همهٔ کارت‌ها (${fa(cards.length)})</option></select>
    <label class="f">نوع سؤال‌ها</label>
    <div class="chips" id="tchips">${types.map(t => `<button class="ch on" data-t="${t}">${TYPE_FA[t]}</button>`).join('')}</div>
    <button class="btn fir block" id="start" style="margin-top:16px">شروع آزمون</button>`, 'home');
  $$('#tchips .ch').forEach(b => b.onclick = () => b.classList.toggle('on'));
  $('#start').onclick = () => {
    const on = new Set($$('#tchips .ch.on').map(b => b.dataset.t));
    const pick = cards.filter(c => on.has(c.type));
    if (pick.length < 2) return toast('حداقل یک نوع سؤال را روشن بگذار');
    runExam(deck, cards, pick, Math.min(+$('#cnt').value, pick.length));
  };
}
function runExam(deck, allCards, pick, n) {
  const ansPool = allCards.filter(c => c.type === 'qa').map(c => c.a);
  const items = shuffle(pick).slice(0, n).map(c => {
    if (AUTO.has(c.type)) return { c, v: c, mode: 'auto' };
    if (c.type === 'qa') {
      const d = shuffle(ansPool.filter(a => a !== c.a)).slice(0, 3);
      if (d.length >= 3) return { c, v: { ...c, type: 'mcq', options: shuffle([c.a, ...d]) }, mode: 'auto' };
    }
    return { c, v: c, mode: 'self' };
  });
  const res = []; let i = 0;
  const step = async () => {
    if (i >= items.length) return finish();
    const it = items[i], c = it.c; let img = '';
    if (c.type === 'image') { const r = await DB.get('images', c.imageId); if (r) img = `<img src="${URL.createObjectURL(r.blob)}" alt="تصویر سؤال">`; }
    view(`<div class="bar prog"><i style="width:${Math.round(i / items.length * 100)}%"></i></div>
      <div class="small mute" style="margin-bottom:6px">سؤال ${fa(i + 1)} از ${fa(items.length)}</div>
      <div class="q"><div class="topic">${esc(c.topic)}${typeTag(it.v)}</div>${img}<div>${qHtml(c)}</div>
      ${it.mode === 'auto' ? '<div id="act"></div>' : '<div id="rev"><button class="btn block" id="show" style="margin-top:16px">نمایش پاسخ</button></div>'}</div>`, 'home');
    const rec = ok => { res.push({ c, ok }); i++; step(); };
    if (it.mode === 'auto') interactive(it.v, $('#act'), rec, i + 1 === items.length);
    else $('#show').onclick = () => {
      $('#rev').innerHTML = `<div class="ans">${esc(c.a)}</div><div class="row" style="margin-top:12px">
        <button class="btn danger grow" id="no">بلد نبودم</button><button class="btn fir grow" id="yes">بلد بودم</button></div>`;
      $('#no').onclick = () => rec(false); $('#yes').onclick = () => rec(true);
    };
  };
  async function finish() {
    const right = res.filter(r => r.ok).length, pct = Math.round(right / res.length * 100);
    for (const r of res) if (!r.ok) await DB.put('cards', sched(r.c, 0));
    await bumpLog({ reviewed: res.length, correct: right });
    const byT = {}; res.forEach(r => { const t = (byT[r.c.topic] ||= { n: 0, ok: 0 }); t.n++; if (r.ok) t.ok++; });
    const byK = {}; res.forEach(r => { const t = (byK[r.c.type] ||= { n: 0, ok: 0 }); t.n++; if (r.ok) t.ok++; });
    const wrong = res.filter(r => !r.ok);
    const tbl = o => Object.entries(o).map(([t, v]) => `<tr><td>${esc(TYPE_FA[t] || t)}</td><td class="mute">${fa(v.ok)}/${fa(v.n)}</td><td style="width:38%"><div class="bar ${v.ok / v.n < .6 ? 'saf' : ''}"><i style="width:${v.ok / v.n * 100}%"></i></div></td></tr>`).join('');
    view(`<div class="hero" style="justify-content:center;text-align:center"><div><div class="small" style="opacity:.8">نمرهٔ آزمون</div>
      <div class="big">${fa(pct)}٪</div><div class="small" style="opacity:.8">${fa(right)} درست از ${fa(res.length)}</div></div></div>
      <h2>به تفکیک مبحث</h2><div class="card"><table class="tbl">${Object.entries(byT).map(([t, v]) =>
      `<tr><td>${esc(t)}</td><td class="mute">${fa(v.ok)}/${fa(v.n)}</td><td style="width:38%"><div class="bar ${v.ok / v.n < .6 ? 'saf' : ''}"><i style="width:${v.ok / v.n * 100}%"></i></div></td></tr>`).join('')}</table></div>
      <h2>به تفکیک نوع سؤال</h2><div class="card"><table class="tbl">${tbl(byK)}</table></div>
      ${wrong.length ? `<h2>اشتباه‌ها (برای مرور زودتر زمان‌بندی شدند)</h2>${wrong.map(r => `<div class="card"><div>${qHtml(r.c)}</div><div class="small" style="color:var(--fir);margin-top:4px">پاسخ: ${esc(r.c.a)}</div></div>`).join('')}` : '<div class="card empty"><b>بی‌نقص!</b></div>'}
      <div class="row"><a class="btn grow" href="#/deck/${deck.id}">بازگشت به جزوه</a><button class="btn sec grow" id="again">آزمون دوباره</button></div>`, 'home');
    $('#again').onclick = () => examView(deck.id);
  }
  step();
}

/* آمار */
async function statsView() {
  const logs = new Map((await DB.all('log')).map(l => [l.id, l]));
  const decks = await DB.all('decks'), cards = await DB.all('cards');
  const days = []; for (let i = 13; i >= 0; i--) { const k = dayKey(Date.now() - i * DAY); days.push(logs.get(k)?.reviewed || 0); }
  const mx = Math.max(1, ...days);
  const tot = [...logs.values()].reduce((a, l) => ({ r: a.r + l.reviewed, c: a.c + l.correct }), { r: 0, c: 0 });
  const rows = decks.map(d => {
    const cs = cards.filter(c => c.deckId === d.id), m = cs.filter(isMastered).length, p = cs.length ? Math.round(m / cs.length * 100) : 0;
    const weak = cs.filter(c => c.lapses >= 2).length;
    return `<tr><td>${esc(d.title)}</td><td class="mute">${fa(p)}٪</td><td style="width:35%"><div class="bar"><i style="width:${p}%"></i></div></td><td>${weak ? `<span class="chip rose">${fa(weak)} ضعیف</span>` : ''}</td></tr>`;
  }).join('');
  view(`<h1>آمار یادگیری</h1>
    <div class="row" style="margin:10px 0">
      <div class="card grow"><div class="small mute">روز پیاپی</div><b style="font-size:1.6rem">${fa(await getStreak())}</b></div>
      <div class="card grow"><div class="small mute">مرور کل</div><b style="font-size:1.6rem">${fa(tot.r)}</b></div>
      <div class="card grow"><div class="small mute">دقت</div><b style="font-size:1.6rem">${fa(tot.r ? Math.round(tot.c / tot.r * 100) : 0)}٪</b></div></div>
    <h2>مرورهای ۱۴ روز اخیر</h2><div class="card"><div class="spark" role="img" aria-label="نمودار مرور روزانه">${days.map(v => `<i style="height:${Math.max(4, v / mx * 100)}%" title="${v}"></i>`).join('')}</div></div>
    <h2>تسلط جزوه‌ها</h2><div class="card">${rows ? `<table class="tbl">${rows}</table>` : '<div class="empty">هنوز داده‌ای نیست.</div>'}</div>
    <p class="small mute">«مسلط» یعنی فاصلهٔ مرور کارت دست‌کم هفت روز شده باشد.</p>`, 'stats');
}

/* تنظیمات و پشتیبان */
async function settingsView() {
  const c=aiCfg();
  view(`<h1>تنظیمات</h1>
    <div class="card"><b>نسخه برنامه</b><p style="font-size:1.35rem;margin:.45rem 0 0"><strong>v${VERSION}</strong></p><p class="small mute">این نسخهٔ نصب‌شده و فعال برنامه است.</p></div>
    <div class="card"><b>سطح آموزشی</b><p class="small mute">هوش مصنوعی سؤال‌ها را متناسب با این سطح می‌سازد.</p>
      <select id="edu"><option value="elementary">ابتدایی</option><option value="middle">متوسطه اول</option><option value="highschool">متوسطه دوم</option><option value="university">دانشگاهی</option><option value="general">عمومی</option></select></div>
    <div class="card"><b>اتصال هوش مصنوعی</b><p class="small mute">برای اصلاح متن OCR و ساخت سؤال‌های دقیق‌تر. این بخش با API سازگار با OpenAI کار می‌کند.</p>
      <label class="f" for="aien">فعال‌سازی</label><select id="aien"><option value="false">خاموش</option><option value="true">روشن</option></select>
      <label class="f" for="aiep">آدرس API</label><input id="aiep" value="${esc(c.endpoint)}" placeholder="https://api.openai.com/v1/chat/completions">
      <label class="f" for="aim">نام مدل</label><input id="aim" value="${esc(c.model)}" placeholder="نام مدل">
      <label class="f" for="aik">کلید API</label><input id="aik" type="password" value="${esc(c.key)}" placeholder="کلید API">
      <button class="btn fir block" id="aisave" style="margin-top:12px">ذخیره و تست اتصال</button>
      <p class="small mute">کلید فقط در حافظهٔ محلی همین مرورگر ذخیره می‌شود. برای انتشار عمومی، بهتر است API را پشت سرور/Worker خودت قرار بدهی.</p></div>
    <div class="card"><label class="f" for="nl" style="margin-top:0">حداکثر کارت جدید در روز</label>
      <input type="number" id="nl" min="0" max="200" value="${setting('newLimit',20)}"></div>
    <div class="card"><b>پشتیبان‌گیری</b><p class="small mute">همهٔ جزوه‌ها، عکس‌ها و پیشرفتت در یک فایل ذخیره می‌شود.</p>
      <div class="row"><button class="btn sm" id="exp">گرفتن پشتیبان</button>
      <label class="btn sec sm" style="cursor:pointer">بازیابی از فایل<input type="file" id="imp" accept=".json,application/json" hidden></label></div></div>
    <div class="card"><b>پاک‌کردن همه‌چیز</b><p class="small mute">همهٔ داده‌ها از این دستگاه حذف می‌شود.</p><button class="btn danger sm" id="wipe">حذف کامل</button></div>
    <p class="small mute" style="text-align:center">همیار مطالعه · نسخه ${VERSION}</p>`, 'settings');
  $('#edu').value=c.level; $('#aien').value=String(c.enabled);
  $('#nl').onchange=e=>{setSetting('newLimit',Math.max(0,+e.target.value||0));toast('ذخیره شد');};
  $('#aisave').onclick=async()=>{
    setSetting('educationLevel',$('#edu').value); setSetting('aiEnabled',$('#aien').value==='true');
    setSetting('aiEndpoint',$('#aiep').value.trim()); setSetting('aiModel',$('#aim').value.trim()); setSetting('aiKey',$('#aik').value.trim());
    if($('#aien').value!=='true') return toast('تنظیمات ذخیره شد');
    try { await callAI([{role:'user',content:'پاسخ بده فقط: OK'}],0); toast('اتصال هوش مصنوعی موفق بود'); }
    catch(e){ toast('تنظیمات ذخیره شد؛ تست اتصال ناموفق بود'); }
  };
  $('#exp').onclick=async()=>{const imgs=await DB.all('images');const conv=await Promise.all(imgs.map(i=>new Promise(r=>{const fr=new FileReader();fr.onload=()=>r({id:i.id,data:fr.result});fr.readAsDataURL(i.blob);})));const data={app:'hamyar',version:VERSION,decks:await DB.all('decks'),cards:await DB.all('cards'),log:await DB.all('log'),lessons:await DB.all('lessons'),images:conv};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));a.download=`hamyar-backup-${dayKey()}.json`;a.click();toast('پشتیبان آماده شد');};
  $('#imp').onchange=async e=>{try{const d=JSON.parse(await e.target.files[0].text());if(d.app!=='hamyar')throw 0;if(!confirm('اطلاعات فعلی با پشتیبان ادغام می‌شود. ادامه؟'))return;await DB.putMany('decks',d.decks||[]);await DB.putMany('cards',d.cards||[]);await DB.putMany('log',d.log||[]);await DB.putMany('lessons',d.lessons||[]);const imgs=await Promise.all((d.images||[]).map(async i=>({id:i.id,blob:await(await fetch(i.data)).blob()})));await DB.putMany('images',imgs);toast('بازیابی شد');location.hash='#/';}catch{toast('فایل پشتیبان معتبر نیست');}};
  $('#wipe').onclick=async()=>{if(!confirm('مطمئنی؟ این کار برگشت‌پذیر نیست.'))return;for(const x of ['decks','cards','images','log','lessons'])await DB.clear(x);toast('همه‌چیز پاک شد');location.hash='#/';};
}

/* ============ مسیریابی و راه‌اندازی ============ */
async function router() {
  const [path, qs] = (location.hash.slice(1) || '/').split('?'); const q = new URLSearchParams(qs || '');
  const p = path.split('/').filter(Boolean);
  try {
    if (!p.length) await homeView();
    else if (p[0] === 'deck') await deckView(p[1]);
    else if (p[0] === 'add') await addView(q);
    else if (p[0] === 'photo') await photoView(q);
    else if (p[0] === 'study') await studyView(p[1] || 'all');
    else if (p[0] === 'exam') await examView(p[1]);
    else if (p[0] === 'lesson') await lessonView(p[1]);
    else if (p[0] === 'stats') await statsView();
    else if (p[0] === 'settings') await settingsView();
    else location.hash = '#/';
  } catch (e) { console.error(e); view(`<div class="card empty"><b>خطایی پیش آمد</b>${esc(e.message)}<div class="row" style="justify-content:center;margin-top:14px"><a class="btn" href="#/">خانه</a></div></div>`, 'home'); }
}
function netState() { const n = $('#net'); n.textContent = navigator.onLine ? 'آنلاین' : 'آفلاین'; n.classList.toggle('off', !navigator.onLine); }
window.addEventListener('online', netState); window.addEventListener('offline', netState);
window.addEventListener('hashchange', router);
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window._installEvt = e; });

(async () => {
  netState();
  try { await DB.open(); } catch { app.innerHTML = '<div class="card empty"><b>ذخیره‌سازی در این مرورگر در دسترس نیست</b>از حالت ناشناس خارج شو یا مرورگر دیگری امتحان کن.</div>'; return; }
  if (navigator.storage?.persist) navigator.storage.persist();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  router();
})();

if (typeof module !== 'undefined') module.exports = { generateCards, sched, parseDoc, cleanOCR };
