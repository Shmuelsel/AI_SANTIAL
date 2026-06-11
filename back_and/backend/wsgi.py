"""
WSGI entry point for production deployment on Azure App Service (Linux).

gevent.monkey.patch_all() MUST be called before any other import so that
the standard library is patched for cooperative I/O before Flask-SocketIO
or any network code is imported.

Azure App Service Startup Command (Portal → Configuration → General Settings):
    cd /home/site/wwwroot/backend && gunicorn --worker-class geventwebsocket.gunicorn.workers.GeventWebSocketWorker -w 1 --timeout 120 --bind 0.0.0.0:$PORT wsgi:app
"""
from gevent import monkey
monkey.patch_all()

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from central_server.app import create_app, purge_debug_rules, sync_rules_from_firebase

app = create_app()

# Run startup tasks that were previously in run_server.py's __main__ block.
# Gunicorn never executes __main__, so this is the correct place for them.
purge_debug_rules()
sync_rules_from_firebase()
