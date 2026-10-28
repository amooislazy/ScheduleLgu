/**
 * Standalone probe for the LGU student portal attendance flow.
 *
 * This is the VERIFIED method (proven against the live portal) that the app's
 * attendanceClient/attendanceParser implementation must mirror.
 *
 * Workflow of the portal (verified):
 *   1. GET  /Login/Login                -> login page with the Batch <select>
 *   2. POST /login/DegreeBatch id=<b>   -> flat JSON [id,label,id,label,...]
 *   3. POST /login/Login  degree=<batchId>&batch=<degreeId>&sequence=<roll>
 *                                        -> password page (field names are
 *                                           swapped on the portal's side)
 *   4. POST /login/LoginP password=<pw> -> "Student Dashboard" HTML
 *   5. Attendance lives in the dashboard's "Current Course Enrolled" table
 *      (columns: Course Name | Teacher Name | T/L | P | A | %), cells built
 *      from <th class="courseName|courseTeacher|coursetype|persentage">.
 *
 * The portal never issues a session cookie, but step 3 only renders the
 * password page when a non-empty ASP.NET_SessionId cookie is present, so we
 * mint one ourselves and replay it on steps 3 and 4.
 *
 * Usage:
 *   node attendance-probe.mjs <sequence> <password> [batchLabel] [degreeLabel]
 *   e.g. node attendance-probe.mjs 010 "Rubychan321#" "Fa-2026" "BS CySec"
 *   (password may also be supplied via ATTENDANCE_PASSWORD env var)
 */

const ORIGIN = 'https://student.lgu.edu.pk';
const PATHS = {
  loginPage: '/Login/Login',
  loginSubmit: '/login/Login',
  passwordSubmit: '/login/LoginP',
  degreeBatch: '/login/DegreeBatch',
};
const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36';

const [, , sequence, passwordArg, batchLabel = 'Fa-2026', degreeLabel = 'BS CySec'] = process.argv;
const password = passwordArg ?? process.env.ATTENDANCE_PASSWORD;
if (!sequence || !password) {
  console.error('Usage: node attendance-probe.mjs <sequence> <password> [batchLabel] [degreeLabel]');
  process.exit(1);
}

// ---------------------------------------------------------------- helpers --

function encodeForm(fields) {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

function createSessionId() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  let id = '';
  for (let i = 0; i < 24; i += 1) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return id;
}

async function send({ method = 'GET', path, cookie, form }) {
  const headers = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'User-Agent': USER_AGENT,
    'Accept-Language': 'en-US,en;q=0.9',
    Origin: ORIGIN,
    Referer: ORIGIN + PATHS.loginPage,
    ...(form != null ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
  };
  const res = await fetch(ORIGIN + path, { method, headers, body: form ?? undefined });
  if (res.status >= 400) throw new Error(`HTTP ${res.status} on ${path}`);
  return res.text();
}

// ------------------------------------------------------------ HTML/JSON -----

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(value) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body) => {
    const key = body.toLowerCase();
    if (ENTITIES[key] !== undefined) return ENTITIES[key];
    if (key.startsWith('#x')) {
      const n = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    if (key.startsWith('#')) {
      const n = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return match;
  });
}
function cellText(fragment) {
  return decodeEntities(fragment.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Reads <option> elements out of a <select> fragment (tolerates stray markup). */
function parseOptions(fragment) {
  const options = [];
  for (const chunk of fragment.split(/<option\b/i).slice(1)) {
    const gt = chunk.indexOf('>');
    if (gt === -1) continue;
    const attrs = chunk.slice(0, gt);
    const rest = chunk.slice(gt + 1);
    const label = cellText(rest.split(/<option\b/i)[0].replace(/<\/select>[\s\S]*$/i, ''));
    const vm = attrs.match(/\bvalue\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const id = (vm?.[1] ?? vm?.[2] ?? vm?.[3] ?? '').trim();
    if (!id || !label) continue;
    options.push({ id, label });
  }
  return options;
}

function parseBatches(html) {
  const select =
    html.match(/<select[^>]*\bid=["']batch["'][^>]*>([\s\S]*?)<\/select>/i) ??
    html.match(/<select[^>]*\bname=["']degree["'][^>]*>([\s\S]*?)<\/select>/i);
  return select ? parseOptions(select[1]) : [];
}

function parseDegrees(body) {
  let parsed;
  try {
    parsed = JSON.parse(body.trim());
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out = [];
  for (let i = 0; i + 1 < parsed.length; i += 2) {
    const id = String(parsed[i] ?? '').trim();
    const label = String(parsed[i + 1] ?? '').trim();
    if (id && label) out.push({ id, label });
  }
  return out;
}

/** Normalises a label for matching: "Fa-2026" ~ "FA2026", "BS CySec" ~ "bscysec". */
function norm(label) {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Same class-driven row reading as src/services/attendance/attendanceParser.ts. */
function parseAttendanceRows(html) {
  const ROW = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const CELL = /<t[hd]\b([^>]*)>([\s\S]*?)<\/t[hd]>/gi;
  const CLASS_ATTR = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

  const records = [];
  let rowMatch;
  while ((rowMatch = ROW.exec(html)) !== null) {
    const cells = [];
    CELL.lastIndex = 0;
    let cellMatch;
    while ((cellMatch = CELL.exec(rowMatch[1])) !== null) {
      const cm = cellMatch[1].match(CLASS_ATTR);
      cells.push({
        className: cm?.[1] ?? cm?.[2] ?? cm?.[3] ?? '',
        text: cellText(cellMatch[2]),
      });
    }
    if (cells.length === 0) continue;

    const courseIndex = cells.findIndex((c) => /courseName/i.test(c.className));
    if (courseIndex === -1) continue; // header row / unrelated table
    const course = cells[courseIndex].text;
    if (!course) continue;

    const typeIndex = cells.findIndex((c) => /coursetype/i.test(c.className));
    const percentIndex = cells.findIndex((c) => /persentage\b/i.test(c.className));
    const percent = Number.parseFloat(
      (percentIndex === -1 ? '' : cells[percentIndex].text).replace(/%/g, '').trim(),
    );
    if (!Number.isFinite(percent)) continue;

    const toCount = (v) => {
      const n = Number.parseInt((v ?? '').trim(), 10);
      return Number.isFinite(n) ? n : 0;
    };

    records.push({
      course,
      teacher: cells[courseIndex + 1]?.text ?? null,
      kind: typeIndex !== -1 && /lab/i.test(cells[typeIndex].text) ? 'lab' : 'theory',
      present: toCount(typeIndex === -1 ? undefined : cells[typeIndex + 1]?.text),
      absent: toCount(typeIndex === -1 ? undefined : cells[typeIndex + 2]?.text),
      percent,
    });
  }
  return records;
}

// ------------------------------------------------------------------ flow ---

async function main() {
  // 1. Login page -> batch list
  const loginPage = await send({ path: PATHS.loginPage });
  const batches = parseBatches(loginPage);
  const batch = batches.find((b) => norm(b.label) === norm(batchLabel));
  if (!batch) {
    throw new Error(`Batch "${batchLabel}" not found. Options: ${batches.map((b) => b.label).join(', ')}`);
  }

  // 2. Degrees for that batch
  const degrees = parseDegrees(
    await send({ method: 'POST', path: PATHS.degreeBatch, form: encodeForm({ id: batch.id }) }),
  );
  const degree = degrees.find((d) => norm(d.label) === norm(degreeLabel));
  if (!degree) {
    throw new Error(`Degree "${degreeLabel}" not found. Options: ${degrees.map((d) => d.label).join(', ')}`);
  }

  // 3. batch/degree/sequence -> password page (minted session cookie required)
  const cookie = `ASP.NET_SessionId=${createSessionId()}`;
  const passwordPage = await send({
    method: 'POST',
    path: PATHS.loginSubmit,
    cookie,
    form: encodeForm({ degree: batch.id, batch: degree.id, sequence }),
  });
  if (!/name=["']password["']/i.test(passwordPage)) {
    throw new Error('Portal did not recognise that batch/degree/sequence (no password page).');
  }
  const rollShown = (passwordPage.match(/value="([^"]*)" disabled placeholder="Roll Number"/) || [])[1];

  // 4. password -> dashboard
  const dashboard = await send({
    method: 'POST',
    path: PATHS.passwordSubmit,
    cookie,
    form: encodeForm({ password }),
  });
  const title = (dashboard.match(/<title>([^<]*)<\/title>/i) || [])[1] ?? '';
  if (!/Student Dashboard/i.test(title)) {
    if (/Wrong Password/i.test(dashboard) || /id=["']loginForm["']/i.test(dashboard)) {
      throw new Error('Portal rejected that password.');
    }
    throw new Error(`Unexpected page after password step (title: "${title}").`);
  }

  // 5. Attendance from the dashboard's "Current Course Enrolled" table
  const records = parseAttendanceRows(dashboard);
  if (records.length === 0) throw new Error('Dashboard reached but no attendance rows found.');

  console.log(`Roll number : ${rollShown}`);
  console.log(`Batch/Degree: ${batch.label} / ${degree.label}   (ids ${batch.id}/${degree.id})`);
  console.log('');
  const w = (s, n) => String(s).padEnd(n);
  console.log(w('Course', 62) + w('Teacher', 26) + w('T/L', 8) + w('P', 4) + w('A', 4) + '%');
  console.log('-'.repeat(110));
  for (const r of records) {
    console.log(
      w(r.course, 62) + w(r.teacher ?? '', 26) + w(r.kind === 'lab' ? 'Lab' : 'Theory', 8) +
      w(r.present, 4) + w(r.absent, 4) + r.percent,
    );
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
