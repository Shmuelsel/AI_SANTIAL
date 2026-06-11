"""
WSGI entry point for production deployment on Azure App Service (Linux).

Flask-SocketIO runs with async_mode="threading" so the CPU-bound YOLO/torch
inference in the in-process VideoWorker doesn't block Socket.IO — gunicorn
must therefore use a threaded worker, not an eventlet/gevent worker.

Azure App Service Startup Command (Portal → Configuration → General Settings):
    cd /home/site/wwwroot/backend && gunicorn --worker-class gthread --threads 8 -w 1 --timeout 120 --bind 0.0.0.0:$PORT wsgi:app
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from central_server.app import create_app, purge_debug_rules, sync_rules_from_firebase

app = create_app()

# Run startup tasks that were previously in run_server.py's __main__ block.
# Gunicorn never executes __main__, so this is the correct place for them.
purge_debug_rules()
sync_rules_from_firebase()
