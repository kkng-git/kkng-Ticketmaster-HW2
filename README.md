# kkng-Ticketmaster-HW2
CSCI571 HW2

## Running the test Flask server

1. Create and activate a Python virtual environment:

```powershell
python -m venv env; .\env\Scripts\Activate.ps1
```

2. Install dependencies and run:

```powershell
pip install flask flask-cors
python app.py
```

The server will run at http://127.0.0.1:5000 with endpoints:
- GET /health
- POST /api/search
