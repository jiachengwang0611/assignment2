/* ---------------- Core storage ---------------- */
const KEY = 'azoomData';
const log = (...a) => console.log('[AZoom]', ...a);
const $ = (s) => document.querySelector(s);
const show = (el) => { if (el) el.style.display = 'block'; };

/* --- minimal seed just to shape the DB if localStorage is empty --- */
function seed() {
  return {
    nextReservation: 1001,
    cars: [],               // will be filled from Data.json on load
    reservations: [],
    rentals: [],
    returns: []
  };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const db = raw ? JSON.parse(raw) : seed();
    if (!raw) localStorage.setItem(KEY, JSON.stringify(db));
    return db;
  } catch (e) {
    console.error('Failed to load storage. Resetting.', e);
    localStorage.removeItem(KEY);
    return seed();
  }
}
function save(db) { localStorage.setItem(KEY, JSON.stringify(db)); }

/* --- Cars come from Data.json every load --- */
async function fetchCarsFromJson() {
  const PROD_URL = 'https://jiachengwang0611.github.io/assignment2/Data.json';
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

  // Try list of URLs until one succeeds
  const candidates = isLocal
    ? ['./Data.json', '/Data.json', '/assignment2/Data.json', PROD_URL]
    : [PROD_URL, './Data.json', '/Data.json', '/assignment2/Data.json'];

  let lastErr = null;

  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status} at ${url}`);
      const data = await res.json();
      console.log('[AZoom] Loaded cars from', url, data);
      return (data.cars || []).map(c => ({
        id: c.id,
        make: c.make,
        model: c.model,
        seater: c.seater || '',
        pricePerDay: c.ratePerDay ?? c.pricePerDay ?? 0,
        status: c.status || 'available',
        img: c.img || 'https://picsum.photos/seed/car/300/200'
      }));
    } catch (e) {
      console.warn('[AZoom] Data.json candidate failed:', e.message);
      lastErr = e;
      // try next candidate
    }
  }

  // If all failed:
  alert(`Could not load Data.json.\n${lastErr?.message || 'Unknown error'}`);
  throw lastErr || new Error('Data.json fetch failed');
}




/* ---------------- page init ---------------- */
document.addEventListener('DOMContentLoaded', async () => {
  const page = document.body?.dataset?.page || 'unknown';
  log('Page detected:', page);

  const db = load(); // reservations/rentals/returns/state

  try {
    // Always refresh cars from Data.json; preserve any saved status by id
    const carsFromFile = await fetchCarsFromJson();
    const savedStatusById = Object.fromEntries((db.cars || []).map(c => [c.id, c.status]));
    db.cars = carsFromFile.map(c => ({ ...c, status: savedStatusById[c.id] ?? c.status }));
    save(db);

    if (page === 'home') { renderHome(db); return; }
    if (page === 'reserve') setupReserve(db);
    else if (page === 'rent')    setupRent(db);
    else if (page === 'return')  setupReturn(db);
    else log('Unknown page. Did you set data-page on <body>?');
  } catch (e) {
    console.error('Init error on page', page, e);
    alert('Could not load Data.json. Make sure you’re serving the site via a local server (not file://).');
  }
});

/* ---------- Home ---------- */
function renderHome(db) {
  const list = $('#carsList');
  if (!list) { log('No #carsList on this page'); return; }
  list.innerHTML = '';
  db.cars.forEach(c => {
    const card = document.createElement('div');
    card.className = 'card car';
    card.innerHTML = `
      <img src="${c.img}" alt="${c.make} ${c.model}">
      <div style="flex:1">
        <div class="row" style="justify-content:space-between">
          <strong>${c.make} ${c.model}</strong>
          <span class="status s-${c.status}">${c.status}</span>
        </div>
        <div class="subtitle">${c.seater ? c.seater + ' · ' : ''}$${c.pricePerDay}/day</div>
        <div class="row" style="margin-top:8px">
          <a class="btn" href="reserve.html">Reserve</a>
          <span class="pill">ID: ${c.id}</span>
        </div>
      </div>
    `;
    list.appendChild(card);
  });
}

/* ---------- Reserve ---------- */
function setupReserve(db) {
  const form = $('#reserveForm'), msg = $('#reserveMsg'), sel = $('#carId');
  if (!form || !sel) { log('reserve: form/select not found'); return; }

  sel.innerHTML = db.cars
    .filter(c => c.status === 'available')
    .map(c => `<option value="${c.id}">${c.make} ${c.model}${c.seater ? ` (${c.seater})` : ''} - $${c.pricePerDay}/day</option>`)
    .join('') || `<option disabled>No cars available</option>`;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const carId = $('#carId')?.value;
    const days = Math.max(1, parseInt($('#days')?.value || '1', 10));
    const name = $('#name')?.value?.trim();
    const card = $('#card')?.value?.trim();
    if (!carId || !name || !card) { alert('Please fill all fields'); return; }

    const car = db.cars.find(c => c.id === carId);
    if (!car || car.status !== 'available') { alert('Car not available'); return; }

    const rid = 'R-' + db.nextReservation++;
    db.reservations.push({ id: rid, carId, name, days });
    car.status = 'reserved';
    save(db);

    if (msg) {
      msg.textContent = `Reservation confirmed: ${rid} for ${car.make} ${car.model}${car.seater ? ` (${car.seater})` : ''} for ${days} day(s).`;
      show(msg);
    }
    log('Reserved', rid);
  });
}

/* ---------- Rent ---------- */
function setupRent(db) {
  const form = $('#rentForm'), msg = $('#rentMsg');
  if (!form) { log('rent: form not found'); return; }

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const rid = $('#reserveId')?.value?.trim();
    if (!rid) { alert('Enter Reservation ID'); return; }

    const r = db.reservations.find(x => x.id === rid);
    if (!r) { alert('Reservation not found.'); return; }

    const car = db.cars.find(c => c.id === r.carId);
    if (!car) { alert('Car not found'); return; }

    car.status = 'rented';
    db.rentals.push({ reservedId: rid, carId: car.id });
    save(db);

    if (msg) {
      msg.textContent = `Marked as RENTED: ${car.make} ${car.model} (Reservation ${rid}).`;
      msg.style.display = 'block';
    }
    log('Rented', rid);
  });
}


