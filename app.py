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

app = Flask(__name__)
CORS(app)

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

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
