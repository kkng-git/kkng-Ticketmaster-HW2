"""Minimal Flask server for KKNG Ticketmaster HW2

Endpoints:
- GET /health -> 200 OK
- POST /api/search -> accepts JSON or form data and returns the same payload as JSON

Run:
python -m venv env
# activate the environment then
pip install flask
python app.py

"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import helpers
import json

TICKETMASTER_EVENT_SEARCH_API = "https://app.ticketmaster.com/discovery/v2/events.json"
TICKETMASTER_EVENT_DETAILS_API = "https://app.ticketmaster.com/discovery/v2/events/"
TICKETMASTER_VENUE_DETAILS_API = "https://app.ticketmaster.com/discovery/v2/venues"
TICKETMASTER_API_KEY = "5DjQ1fn5mV9sWLYrsG0i8iWOzlgxcO4l"

app = Flask(__name__)
CORS(app)

@app.route('/home')
def homepage():
    return app.send_static_file("events.html")
    #return app.send_from_directory("/static")

@app.route('/search.js')
def searchJS():
    return app.send_static_file("search.js")

@app.route('/images/background.jpg')
def backgroundImage():
    return app.send_static_file("images/background.jpg")

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'}), 200

@app.route('/api/search', methods=['POST'])
def api_search():
    # Accept JSON payload or form-encoded data
    if request.is_json:
        data = request.get_json()
    else:
        # Convert form/multipart to dict
        data = request.form.to_dict()
        # For checkbox inputs, request.form returns 'on' or value; map to boolean if present
        if 'autoDetect' in data:
            data['autoDetect'] = data['autoDetect'] in ('on', 'true', '1')
    # Echo back the received data for testing
    return jsonify({'received': data}), 200


@app.route('/api/eventSearch', methods=['GET'])
def eventSearch():
    """Accept query parameters or JSON body with the following fields:
    - latitude (float)
    - longitude (float)
    - distance (int)
    - segmentId (str)
    - keyword (str)

    The handler will prefer JSON body if provided; otherwise it will
    look at query parameters. It validates types and returns a JSON
    object with the parsed values or an error with 400 status.
    """
    # Prefer JSON body if present
    payload = {}
    if request.is_json:
        payload = request.get_json()
    else:
        # Pull from query params
        payload = request.args.to_dict()

    errors = []

    # helper to parse numeric types
    def _parse_float(key):
        v = payload.get(key)
        if v is None:
            errors.append(f"missing {key}")
            return None
        try:
            return float(v)
        except Exception:
            errors.append(f"{key} must be a float")
            return None

    def _parse_int(key):
        v = payload.get(key)
        if v is None:
            errors.append(f"missing {key}")
            return None
        try:
            return int(v)
        except Exception:
            errors.append(f"{key} must be an int")
            return None

    def _parse_str(key, required=True):
        v = payload.get(key)
        if v is None:
            if required:
                errors.append(f"missing {key}")
            return None
        return str(v)

    lat = _parse_float('latitude')
    lng = _parse_float('longitude')
    distance = _parse_int('distance')
    # segmentId is optional now
    segmentId = _parse_str('segmentId', required=False)
    keyword = _parse_str('keyword')

    if errors:
        return jsonify({'errors': errors}), 400

    # Build geohash using helpers.geohashHelper (expects lng, lat)
    try:
        geo_point = helpers.geohashHelper(lng, lat)
        # print(geo_point)
    except Exception as exc:
        return jsonify({'error': 'failed to compute geohash', 'details': str(exc)}), 500

    params = {
        'apikey': TICKETMASTER_API_KEY,
        'keyword': keyword,
        'radius': distance,
        'unit': 'miles',
        'geoPoint': geo_point,
    }
    # Include segmentId only if provided
    if segmentId:
        params['segmentId'] = segmentId

    try:
        tm_resp = requests.get(TICKETMASTER_EVENT_SEARCH_API, params=params, timeout=10)
    except requests.RequestException as exc:
        return jsonify({'error': 'ticketmaster request failed', 'details': str(exc)}), 502

    # Try to return the JSON body from Ticketmaster, preserve status code
    try:
        body = tm_resp.json()
    except Exception:
        # Non-JSON response
        return jsonify({'error': 'ticketmaster returned non-json', 'status_code': tm_resp.status_code}), tm_resp.status_code

    # print(json.dumps(body, indent=4, sort_keys=True))
    return jsonify({'ticketmaster': body}), tm_resp.status_code

@app.route('/api/eventDetails', methods=['GET'])
def eventDetails():
    """Fetch event details from Ticketmaster by event id.

    Accepts a query parameter `id` or a JSON body with key `id`.
    Calls: https://app.ticketmaster.com/discovery/v2/events/{id}?apikey=...
    Returns the parsed JSON response from Ticketmaster (wrapped under key 'ticketmaster').
    """
    payload = {}
    if request.is_json:
        payload = request.get_json()
    else:
        payload = request.args.to_dict()

    # Support both 'id' and 'eventId' keys
    event_id = payload.get('id') or payload.get('eventId')
    if not event_id:
        return jsonify({'error': 'missing id parameter'}), 400

    # Build Ticketmaster details URL
    url = f"{TICKETMASTER_EVENT_DETAILS_API}{event_id}"
    params = {'apikey': TICKETMASTER_API_KEY}

    try:
        resp = requests.get(url, params=params, timeout=10)
    except requests.RequestException as exc:
        return jsonify({'error': 'ticketmaster request failed', 'details': str(exc)}), 502

    try:
        body = resp.json()
    except Exception:
        return jsonify({'error': 'ticketmaster returned non-json', 'status_code': resp.status_code}), resp.status_code

    # Optionally print for debugging (keeps consistency with eventSearch)
    try:
        print(json.dumps(body, indent=4, sort_keys=True))
    except Exception:
        pass

    return jsonify({'ticketmaster': body}), resp.status_code

@app.route('/api/venueDetails', methods=['GET'])
def venueDetails():
    """Fetch venue details from Ticketmaster by keyword.

    Accepts a query parameter `keyword` or a JSON body with key `keyword`.
    Calls: https://app.ticketmaster.com/discovery/v2/venues?apikey=...&keyword=...
    Returns the parsed JSON response from Ticketmaster (wrapped under key 'ticketmaster').
    """
    payload = {}
    if request.is_json:
        payload = request.get_json()
    else:
        payload = request.args.to_dict()

    keyword = payload.get('keyword')
    if not keyword:
        return jsonify({'error': 'missing keyword parameter'}), 400

    params = {
        'apikey': TICKETMASTER_API_KEY,
        'keyword': keyword
    }

    try:
        resp = requests.get(TICKETMASTER_VENUE_DETAILS_API, params=params, timeout=10)
    except requests.RequestException as exc:
        return jsonify({'error': 'ticketmaster request failed', 'details': str(exc)}), 502

    try:
        body = resp.json()
    except Exception:
        return jsonify({'error': 'ticketmaster returned non-json', 'status_code': resp.status_code}), resp.status_code

    # Optionally print for debugging
    try:
        print(json.dumps(body, indent=4, sort_keys=True))
    except Exception:
        pass

    return jsonify({'ticketmaster': body}), resp.status_code

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=8080)
