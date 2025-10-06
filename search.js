// search.js
// Contains handlers for the Events Search form

API_URL = "http://127.0.0.1:5000";
// Google Geocoding API URL
GOOGLE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
// NOTE: This file contains a key from the workspace. In production keep keys secret.
GOOGLE_KEY = "AIzaSyD4n3FMcMZcX3-WEqoN_EtwWxbHelJZ-0Y";
IPINFO_TOKEN = "a9fbeef1a25b07";
IPINFO_URL = "https://ipinfo.io/?token="+IPINFO_TOKEN;

// Helper to show/hide elements using DOM properties (keeps aria-hidden in sync)
function setVisible(el, visible) {
  if (!el) return;
  try {
    el.hidden = !visible;
    el.setAttribute('aria-hidden', visible ? 'false' : 'true');
  } catch (e) {
    // ignore
  }
}

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
  // Clear any previous renders before starting a new search
  try { if (typeof window !== 'undefined' && typeof window.clearRenders === 'function') window.clearRenders(); } catch (e) {}
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

  // If auto-detect is checked, ask IP info for approximate location and attach lat/lng.
  // Otherwise, if the user supplied a location string, geocode it as before.
  if (formDetails.autoDetect) {
    try {
      const resp = await fetch(IPINFO_URL, { method: 'GET' });
      if (resp && resp.ok) {
        const data = await resp.json();
        if (data && data.loc) {
          // data.loc is expected to be "<lat>,<lng>" (may include spaces)
          const parts = String(data.loc).split(',').map(s => s.trim());
          const lat = parseFloat(parts[0]);
          const lng = parseFloat(parts[1]);
          if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
            formDetails.latitude = lat;
            formDetails.longitude = lng;
          } else {
            console.warn('IPInfo returned invalid loc value', data.loc);
          }
        } else {
          console.warn('IPInfo response missing loc', data);
        }
      } else {
        const txt = resp ? await resp.text() : 'no response';
        console.warn('IPInfo request failed', resp && resp.status, txt);
      }
    } catch (err) {
      console.error('Error fetching IPInfo', err);
    }
  } else if (formDetails.location) {
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
  // ensure visible
  setVisible(container, true);

  if (!events || events.length === 0) {
    container.innerHTML = '<div style="padding:1rem;background:rgba(0,0,0,0.45);border-radius:8px;text-align:center;">No Results</div>';
  // ensure details panel hidden when no results
  const details = document.getElementById('event-details');
  if (details) { setVisible(details, false); details.innerHTML = ''; }
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

    // Event name (clickable -> fetch event details)
    const nameTd = document.createElement('td');
    nameTd.style.padding = '8px';
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = ev.name || '';
    link.style.color = '#fff';
    link.style.textDecoration = 'underline';
    link.addEventListener('click', function (e) {
      e.preventDefault();
      if (ev.id) {
        fetchEventDetails(ev.id);
      } else {
        console.warn('event id not available for details');
      }
    });
    nameTd.appendChild(link);
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


async function fetchEventDetails(eventId) {
  const detailsContainer = document.getElementById('event-details');
  if (!detailsContainer) return;
  // Hide and clear any existing details/venue renders before rendering new ones
  try {
    // hide existing details panel
    setVisible(detailsContainer, false);
    detailsContainer.innerHTML = '';
    // remove external venue control if present
    const existingExternal = document.getElementById('external-venue-details');
    if (existingExternal) existingExternal.remove();
  } catch (e) {}

  // show loading state for the new details
  detailsContainer.innerHTML = `<div style="padding:1rem;background:rgba(0,0,0,0.45);border-radius:8px;">Loading...</div>`;
  setVisible(detailsContainer, true);
  try {
    const url = `${API_URL}/api/eventDetails?id=${encodeURIComponent(eventId)}`;
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) {
      const text = await resp.text();
      detailsContainer.innerHTML = `<div style="padding:1rem;background:rgba(0,0,0,0.45);border-radius:8px;">Error: ${resp.status}</div>`;
      console.error('eventDetails failed', resp.status, resp.statusText, text);
      return;
    }
    const data = await resp.json();
    // Render a small details summary
    const tm = (data && data.ticketmaster) ? data.ticketmaster : data;
    const title = tm && tm.name ? tm.name : 'Event Details';
    const date = tm && tm.dates && tm.dates.start ? `${tm.dates.start.localDate || ''} ${tm.dates.start.localTime || ''}`.trim() : '';
    const venue = (tm && tm._embedded && tm._embedded.venues && tm._embedded.venues[0] && tm._embedded.venues[0].name) ? tm._embedded.venues[0].name : '';

    // Artist/Team: produce both a plain-text join and an HTML-linked version
    let artists = '';
    let artistsHtml = '';
    if (tm && tm._embedded && Array.isArray(tm._embedded.attractions) && tm._embedded.attractions.length > 0) {
      const items = tm._embedded.attractions.filter(Boolean);
      const names = items.map(a => a.name).filter(Boolean);
      artists = names.join(' | ');
      // Build links: prefer attraction.url or attraction._links.self.href when available, otherwise fallback to search
      artistsHtml = items.map(a => {
        const name = a && a.name ? a.name : '';
        if (!name) return '';
        let href = '';
        if (a.url) href = a.url;
        else if (a._links && a._links.self && a._links.self.href) href = a._links.self.href;
        else href = `https://www.ticketmaster.com/search?q=${encodeURIComponent(name)}`;
        return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color:#3ec0b3;text-decoration:underline;">${escapeHtml(name)}</a>`;
      }).filter(Boolean).join(' | ');
    } else {
      artists = '';
      artistsHtml = 'N/A';
    }

    // Genre: collect subGenre, genre, segment, subType, type from classifications
    let genreParts = [];
    if (tm && Array.isArray(tm.classifications) && tm.classifications.length > 0) {
      const c = tm.classifications[0];
      if (c.subGenre && c.subGenre.name) genreParts.push(c.subGenre.name);
      if (c.genre && c.genre.name) genreParts.push(c.genre.name);
      if (c.segment && c.segment.name) genreParts.push(c.segment.name);
      if (c.subType && c.subType.name) genreParts.push(c.subType.name);
      if (c.type && c.type.name) genreParts.push(c.type.name);
    }
    const genre = genreParts.join(' | ');

    // Ticket Status mapping and color
    let statusCode = '';
    let statusText = '';
    let statusColor = '#fff';
    if (tm && tm.dates && tm.dates.status && tm.dates.status.code) {
      statusCode = tm.dates.status.code;
      // Map to display text and colors
      switch ((statusCode || '').toLowerCase()) {
        case 'onsale':
          statusText = 'On Sale'; statusColor = 'green'; break;
        case 'offsale':
          statusText = 'Off Sale'; statusColor = 'red'; break;
        case 'canceled':
          statusText = 'Canceled'; statusColor = 'black'; break;
        case 'postponed':
          statusText = 'Postponed'; statusColor = 'orange'; break;
        case 'rescheduled':
          statusText = 'Rescheduled'; statusColor = 'orange'; break;
        default:
          statusText = statusCode; statusColor = '#fff';
      }
    }

    // Buy ticket URL
    const buyUrl = tm && tm.url ? tm.url : (tm && tm._links && tm._links.self && tm._links.self.href ? tm._links.self.href : '');

    // Seatmap static URL
    const seatmapUrl = tm && tm.seatmap && tm.seatmap.staticUrl ? tm.seatmap.staticUrl : '';

    // Price ranges placeholder
    const priceRanges = 'N/A';

    // Build HTML layout: title centered above details, left column details, right column seatmap (lowered)
    const html = `
      <div style="background:rgba(24,24,24,0.85);padding:1rem;border-radius:12px;">
        <h2 style="margin:0 0 0.75rem 0;text-align:center;color:#fff;">${escapeHtml(title)}</h2>
        <div style="display:flex;gap:1rem;align-items:flex-start;">
          <div style="flex:1;color:#fff;">
            <div style="color:#3ec0b3;font-weight:700;margin-bottom:6px;">Date</div>
            <div style="color:#ddd;margin-bottom:10px;">${escapeHtml(date)}</div>

            <div style="color:#3ec0b3;font-weight:700;margin-bottom:6px;">Artist/Team</div>
            <div style="color:#ddd;margin-bottom:10px;">${artistsHtml}</div>

            <div style="color:#3ec0b3;font-weight:700;margin-bottom:6px;">Venue</div>
            <div style="color:#ddd;margin-bottom:10px;">${escapeHtml(venue)}</div>

            <div style="color:#3ec0b3;font-weight:700;margin-bottom:6px;">Genres</div>
            <div style="color:#ddd;margin-bottom:10px;">${escapeHtml(genre)}</div>

            <div style="color:#3ec0b3;font-weight:700;margin-bottom:6px;">Price Ranges</div>
            <div style="color:#ddd;margin-bottom:10px;">${escapeHtml(priceRanges)}</div>

            <div style="color:#3ec0b3;font-weight:700;margin-bottom:6px;">Ticket Status</div>
            <div style="margin-bottom:10px;">
              <span style="display:inline-block;padding:6px 14px;border-radius:999px;font-weight:700;color:#fff;background:${statusColor};box-shadow:0 4px 10px rgba(0,0,0,0.25);border:2px solid rgba(255,255,255,0.06);">${escapeHtml(statusText)}</span>
            </div>

            <div style="color:#3ec0b3;font-weight:700;margin-bottom:6px;">Buy Ticket At</div>
            <div style="margin-bottom:10px;"><a href="${escapeHtml(buyUrl)}" target="_blank" style="color:#3ec0b3;">Ticketmaster</a></div>
            
            <!-- NOTE: venue details panel rendered outside this details view (see below) -->
          </div>

          <div style="width:360px;flex-shrink:0;display:flex;align-items:flex-start;justify-content:center;margin-top:18px;">
            ${seatmapUrl ? `<img src="${escapeHtml(seatmapUrl)}" alt="seatmap" style="max-width:100%;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,0.4);" />` : ''}
          </div>
        </div>
      </div>
    `;
    detailsContainer.innerHTML = html;
  setVisible(detailsContainer, true);
    // Remove any existing external venue-details-control to avoid duplicates
    const existingExternal = document.getElementById('external-venue-details');
    if (existingExternal) existingExternal.remove();

    // Create an external, centered details control below the details container
    const external = document.createElement('div');
    external.id = 'external-venue-details';
    external.style.display = 'flex';
    external.style.justifyContent = 'center';
    external.style.marginTop = '12px';
    external.innerHTML = `
      <details style="width:90%;max-width:720px;" id="venue-details-control" data-venue="${escapeHtml(venue)}">
        <summary style="text-align:center;padding:12px 0;font-size:1.1rem;cursor:pointer;color:#fff;">Show Venue Details</summary>
        <div id="venue-details-content" style="padding:12px 18px;color:#222;background:rgba(255,255,255,0.92);border-radius:12px;margin-top:8px;">
          <div style="padding:8px;color:#444;">Click to load venue details.</div>
        </div>
      </details>
    `;
    // Insert external control after the detailsContainer
    detailsContainer.parentNode.insertBefore(external, detailsContainer.nextSibling);
    // Auto-scroll into view and focus for accessibility
    try {
      detailsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // make focusable and focus
      detailsContainer.tabIndex = -1;
      detailsContainer.focus({ preventScroll: true });
    } catch (e) {
      // ignore scrolling focus errors
    }
  } catch (err) {
    detailsContainer.innerHTML = `<div style="padding:1rem;background:rgba(0,0,0,0.45);border-radius:8px;">Error: ${String(err)}</div>`;
    console.error('fetchEventDetails error', err);
  }
}


/**
 * Fetch venue details from server and render inside the venue-details-content div.
 * Calls /api/venueDetails?keyword=<venueName>
 */
async function fetchVenueDetails(venueName) {
  if (!venueName) return;
  const contentEl = document.getElementById('venue-details-content');
  if (!contentEl) return;
  contentEl.innerHTML = '<div style="padding:8px;background:rgba(0,0,0,0.45);border-radius:8px;">Loading venue details...</div>';
  try {
    const url = `${API_URL}/api/venueDetails?keyword=${encodeURIComponent(venueName)}`;
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) {
      const txt = await resp.text();
      contentEl.innerHTML = `<div style="padding:8px;background:rgba(0,0,0,0.45);border-radius:8px;color:#f88;">Error loading venue: ${resp.status}</div>`;
      console.error('venueDetails failed', resp.status, resp.statusText, txt);
      return;
    }
    const data = await resp.json();
    const tm = (data && data.ticketmaster) ? data.ticketmaster : data;
    // Render a card with centered logo/title, left-aligned address/maps and a right-aligned 'More events' link
    let venueHtml = '<div style="padding:12px;border-radius:12px;background:#fff;color:#222;display:flex;flex-direction:column;align-items:center;">';
    const v = (tm && tm._embedded && Array.isArray(tm._embedded.venues) && tm._embedded.venues.length > 0) ? tm._embedded.venues[0] : tm;
    const vname = (v && v.name) ? v.name : 'N/A';
    const addrLine = (v && v.address && (v.address.line1 || v.address.line2)) ? (v.address.line1 || v.address.line2) : '';
    const city = (v && v.city && v.city.name) ? v.city.name : '';
    const state = (v && v.state && (v.state.name || v.state.stateCode)) ? (v.state.name || v.state.stateCode) : '';
    const postal = (v && v.postalCode) ? v.postalCode : '';
    const displayAddress = [vname === 'N/A' ? '' : vname, addrLine, city, state, postal].filter(Boolean).join(', ') || 'N/A';

    // Top: centered title and logo (logo appears under the title)
    venueHtml += '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;">';
    venueHtml += `<div style="font-weight:700;font-size:1.2rem;text-align:center;">${escapeHtml(vname)}</div>`;
    if (v && Array.isArray(v.images) && v.images.length > 0) {
      const logoUrl = v.images[0].url;
      venueHtml += `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(vname)}" style="max-width:180px;max-height:100px;object-fit:contain;"/>`;
    }
    venueHtml += '</div>';

  // Bottom: left (address) and right (more events) columns with a centered vertical divider
  // Make left and right columns both flexible (flex:1) so the divider sits centered in the card
  venueHtml += '<div style="display:flex;width:100%;gap:18px;align-items:stretch;margin-top:12px;">';
  // Left column: address and Google Maps link (centered within its column)
  venueHtml += '<div style="flex:1;color:#333;padding-left:12px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;">';
    venueHtml += `<div style="margin-bottom:8px;text-align:center;">Address: ${escapeHtml(addrLine || 'N/A')} ${addrLine ? '<br/>' : ''}${escapeHtml(city || 'N/A')}${city ? ', ' : ''}${escapeHtml(state || 'N/A')}${(city||state) ? '<br/>' : ''}${escapeHtml(postal || 'N/A')}</div>`;
    const mapsQuery = encodeURIComponent(displayAddress !== 'N/A' ? displayAddress : vname);
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
    venueHtml += `<div><a href="${mapsUrl}" target="_blank" style="color:#1976d2;">Open in Google Maps</a></div>`;
    venueHtml += '</div>';

  // Center divider column (tall vertical line) to visually separate and level columns
  // Make it more visible: wider, medium-gray, rounded with subtle shadow
  venueHtml += '<div style="width:2px;background:#bdbdbd;border-radius:2px;align-self:stretch;box-shadow:inset 0 0 4px rgba(0,0,0,0.06);"></div>';

  // Right column: 'More events at this venue' (centered within its column)
  // Prefer direct venue page URL when available from Ticketmaster response
  let moreHref = `https://www.ticketmaster.com/search?q=${encodeURIComponent(vname)}`;
  if (v && v.url) moreHref = v.url;
  else if (v && v._links && v._links.self && v._links.self.href) moreHref = v._links.self.href;
  // Make this a flexible column so divider remains centered; content is centered in its column
  venueHtml += '<div style="flex:1;max-width:220px;display:flex;align-items:center;justify-content:center;padding-right:12px;">';
    venueHtml += `<div style="text-align:center;"><a href="${moreHref}" target="_blank" style="color:#1976d2;">More events at this venue</a></div>`;
  venueHtml += '</div>';

    venueHtml += '</div>'; // end bottom row
    venueHtml += '</div>';
    contentEl.innerHTML = venueHtml;
  } catch (err) {
    contentEl.innerHTML = `<div style="padding:8px;background:rgba(0,0,0,0.45);border-radius:8px;color:#f88;">Error: ${String(err)}</div>`;
    console.error('fetchVenueDetails error', err);
  }
}

// Wire up the details toggle to lazy-load venue details when expanded
document.addEventListener('click', function (e) {
  const summary = e.target.closest && e.target.closest('summary');
  if (!summary) return;
  const detailsEl = summary.parentElement;
  if (detailsEl && detailsEl.id === 'venue-details-control') {
    // Read the venue name stored when rendering details
    const venueName = detailsEl.getAttribute('data-venue') || '';
    if (venueName) {
      // Lazy-load the venue details the first time the control is expanded
      // If it's already populated, fetchVenueDetails will simply replace content
      fetchVenueDetails(venueName);
    }
  }
});


// Clear all rendered content: results panel, event details, venue details and external control
window.clearRenders = function () {
  try {
  const results = document.getElementById('results');
  if (results) { results.innerHTML = ''; setVisible(results, false); }
  const details = document.getElementById('event-details');
  if (details) { details.innerHTML = ''; setVisible(details, false); }
    const venueContent = document.getElementById('venue-details-content');
    if (venueContent) { venueContent.innerHTML = ''; }
    const external = document.getElementById('external-venue-details');
    if (external) external.remove();
  } catch (e) {
    // ignore errors during cleanup
  }
};


function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, function (s) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[s];
  });
}

// Expose to global scope so the page script can call it
window.handleSearch = handleSearch;
