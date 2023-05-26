from flask import Flask
from flask import request

import os
import json

DEFAULT_PORT = "8080"
MESSAGE = "Hello from the Python event example"

app = Flask(__name__)


@app.route("/", methods=["GET", "POST"])
def root():
    app.logger.info(f"Event data: {request.json}")

    if request.json:
        field_a = request.json.get("field-a")
        field_b = request.json.get("field-b")
        app.logger.info(f"field-a = {field_a}")
        app.logger.info(f"field-b = {field_b}")

    return json.dumps({"message": MESSAGE})


if __name__ == "__main__":
    port_env = os.getenv("PORT", DEFAULT_PORT)
    port = int(port_env)

    app.run(debug=True, host="0.0.0.0", port=port)
