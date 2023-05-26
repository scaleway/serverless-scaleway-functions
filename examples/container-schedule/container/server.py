from flask import Flask
from flask import request

import os
import json

DEFAULT_PORT = "8080"
MESSAGE = "Hello, World from Scaleway Container !"

app = Flask(__name__)


@app.route("/")
def root():
    print(request)
    print(request.data)
    print(request.json())

    return json.dumps({"message": MESSAGE})


if __name__ == "__main__":
    # Scaleway's system will inject a PORT environment variable on which your application should start the server.
    port_env = os.getenv("PORT", DEFAULT_PORT)
    port = int(port_env)

    app.run(debug=True, host="0.0.0.0", port=port)
