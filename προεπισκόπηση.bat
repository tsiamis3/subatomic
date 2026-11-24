@echo off
REM Τοπική προεπισκόπηση του site (χρειάζεται Python εγκατεστημένο).
REM Ανοίγει τον browser στο http://localhost:8000 — κλείστε αυτό το παράθυρο για τερματισμό.
cd /d "%~dp0"
start "" http://localhost:8000
python -m http.server 8000
