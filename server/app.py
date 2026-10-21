import os
from flask import Flask, send_from_directory, request
from server import config, db
from server.responses import json_error
from server.controllers.auth_controller import auth_bp
from server.controllers.sync_controller import sync_bp

app = Flask(__name__, static_folder="../web", static_url_path="")
app.config["SECRET_KEY"] = config.SECRET_KEY
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
is_prod = ("RENDER" in os.environ or os.environ.get("ENVIRONMENT") == "production") and os.environ.get("FLASK_DEBUG") != "1"
app.config["SESSION_COOKIE_SECURE"] = is_prod or os.environ.get("SESSION_COOKIE_SECURE", "").lower() in ("true", "1")
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024

db.check_db()
app.teardown_appcontext(db.close_db)
app.register_blueprint(auth_bp)
app.register_blueprint(sync_bp)

@app.errorhandler(413)
def request_entity_too_large(e):
    return json_error("Request payload exceeds 2 MB limit.", status=413)

@app.errorhandler(404)
def not_found(e):
    if request.path.startswith("/api/"):
        return json_error("Resource not found.", status=404)
    return send_from_directory(app.static_folder, "index.html")

@app.errorhandler(405)
def method_not_allowed(e):
    return json_error("Method not allowed.", status=405)

@app.errorhandler(500)
def internal_server_error(e):
    return json_error("Internal server error.", status=500)

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=not is_prod)