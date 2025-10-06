// search.js
// Contains handlers for the Events Search form

API_URL = "http://127.0.0.1:5000";
// Google Geocoding API URL
GOOGLE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
// NOTE: This file contains a key from the workspace. In production keep keys secret.
GOOGLE_KEY = "AIzaSyD4n3FMcMZcX3-WEqoN_EtwWxbHelJZ-0Y";

/**
 * Geocode an address using Google Maps Geocoding API.
 * Returns an object { lat, lng } when status is OK, otherwise null.
 */
async function geocodeAddress(address) {
  if (!address) return null;
  const params = new URLSearchParams({ address: address, key: GOOGLE_KEY });
  const url = `${GOOGLE_URL}?${params.toString()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error('Geocoding request failed', res.status, res.statusText);
      return null;
    }
    const data = await res.json();
    if (data.status === 'OK' && Array.isArray(data.results) && data.results.length > 0) {
      const loc = data.results[0].geometry && data.results[0].geometry.location;
      if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
        return { lat: loc.lat, lng: loc.lng };
      }
    } else {
      console.warn('Geocoding returned non-OK status', data.status);
    }
  } catch (err) {
    console.error('Geocoding error', err);
  }
  return null;
}

async function handleSearch() {
  const form = document.getElementById('eventsForm');
  if (!form) {
    console.error('eventsForm not found');
    return;
  }

  // Use built-in HTML5 validation: if invalid, report and abort
  if (!form.checkValidity()) {
    // This will show the browser's validation UI for the first invalid control
    form.reportValidity();
    return null;
  }

  const formDetails = {
    keyword: (form.elements['keyword'] && form.elements['keyword'].value) || '',
    distance: (form.elements['distance'] && form.elements['distance'].value) || 10,
    category: (form.elements['category'] && form.elements['category'].value) || '',
    location: (form.elements['location'] && form.elements['location'].value) || '',
    autoDetect: !!(form.elements['autoDetect'] && form.elements['autoDetect'].checked)
  };

  // Ensure distance is a number when provided
  if (formDetails.distance !== '') {
    const n = Number(formDetails.distance);
    formDetails.distance = Number.isFinite(n) ? n : formDetails.distance;
  }

  // If we have a location string, attempt to geocode it and attach lat/lng
  if (formDetails.location) {
    const coords = await geocodeAddress(formDetails.location);
    if (coords) {
      formDetails.latitude = coords.lat;
      formDetails.longitude = coords.lng;
    }
  }

  // Build query to backend eventSearch endpoint
  try {
    const params = new URLSearchParams();

    // latitude & longitude are expected by the backend
    if (typeof formDetails.latitude !== 'undefined') params.append('latitude', String(formDetails.latitude));
    if (typeof formDetails.longitude !== 'undefined') params.append('longitude', String(formDetails.longitude));

    // distance and keyword (keyword may be empty string)
    params.append('distance', String(formDetails.distance));
    params.append('keyword', String(formDetails.keyword || ''));

    // Map category -> segmentId using SEGMENT_MAP, but skip if category is "Default"
    const category = formDetails.category || '';
    if (category && category !== 'Default' && window.SEGMENT_MAP && window.SEGMENT_MAP[category]) {
      params.append('segmentId', window.SEGMENT_MAP[category]);
    }

    const url = `${API_URL}/api/eventSearch?${params.toString()}`;
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) {
      const text = await resp.text();
      console.error('eventSearch failed', resp.status, resp.statusText, text);
      return { error: true, status: resp.status, statusText: resp.statusText, body: text };
    }
    const data = await resp.json();
    // If Ticketmaster returned events, render them
    if (data && data.ticketmaster && data.ticketmaster._embedded && Array.isArray(data.ticketmaster._embedded.events)) {
      renderResults(data.ticketmaster._embedded.events);
    } else if (data && data._embedded && Array.isArray(data._embedded.events)) {
      // Some server responses may not nest under ticketmaster
      renderResults(data._embedded.events);
    } else if (data && data.ticketmaster && data.ticketmaster.page && data.ticketmaster.page.totalElements === 0) {
      renderResults([]);
    }
    return data;
  } catch (err) {
    console.error('handleSearch error', err);
    return { error: true, message: String(err) };
  }
}


function renderResults(events) {
  const container = document.getElementById('results');
  if (!container) return;

  // Clear previous
  container.innerHTML = '';

  if (!events || events.length === 0) {
    container.innerHTML = '<div style="padding:1rem;background:rgba(0,0,0,0.45);border-radius:8px;text-align:center;">No Results</div>';
    return;
  }

  // Build table
  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Date', 'Icon', 'Event', 'Genre', 'Venue'].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    th.style.textAlign = 'left';
    th.style.padding = '8px';
    th.style.borderBottom = '1px solid rgba(255,255,255,0.12)';
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  events.forEach(ev => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid rgba(255,255,255,0.06)';

    // Date: localDate and localTime
    const dateTd = document.createElement('td');
    const localDate = ev.dates && ev.dates.start && ev.dates.start.localDate ? ev.dates.start.localDate : '';
    const localTime = ev.dates && ev.dates.start && ev.dates.start.localTime ? ev.dates.start.localTime : '';
    dateTd.textContent = `${localDate} ${localTime}`.trim();
    dateTd.style.padding = '8px';
    tr.appendChild(dateTd);

    // Icon: first image url
    const iconTd = document.createElement('td');
    iconTd.style.padding = '8px';
    if (Array.isArray(ev.images) && ev.images.length > 0) {
      const img = document.createElement('img');
      img.src = ev.images[0].url;
      img.alt = ev.name || 'event image';
      img.style.width = '48px';
      img.style.height = '48px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '6px';
      iconTd.appendChild(img);
    }
    tr.appendChild(iconTd);

    // Event name
    const nameTd = document.createElement('td');
    nameTd.textContent = ev.name || '';
    nameTd.style.padding = '8px';
    tr.appendChild(nameTd);

    // Genre: segment name if available
    const genreTd = document.createElement('td');
    let genre = '';
    if (ev.classifications && ev.classifications[0] && ev.classifications[0].segment && ev.classifications[0].segment.name) {
      genre = ev.classifications[0].segment.name;
    }
    genreTd.textContent = genre;
    genreTd.style.padding = '8px';
    tr.appendChild(genreTd);

    // Venue: first venue name from _embedded.venues
    const venueTd = document.createElement('td');
    let venueName = '';
    if (ev._embedded && Array.isArray(ev._embedded.venues) && ev._embedded.venues.length > 0) {
      venueName = ev._embedded.venues[0].name || '';
    }
    venueTd.textContent = venueName;
    venueTd.style.padding = '8px';
    tr.appendChild(venueTd);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  // Wrap in a panel for readability
  const panel = document.createElement('div');
  panel.style.background = 'rgba(24,24,24,0.7)';
  panel.style.padding = '0.75rem';
  panel.style.borderRadius = '8px';
  panel.appendChild(table);

  container.appendChild(panel);
}

// Expose to global scope so the page script can call it
window.handleSearch = handleSearch;
