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

  console.log(formDetails);
  return formDetails;
}

// Expose to global scope so the page script can call it
window.handleSearch = handleSearch;
