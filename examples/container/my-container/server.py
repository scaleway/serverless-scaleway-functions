from flask import Flask, jsonify
import os

DEFAULT_PORT = "8080"
MESSAGE = "Hello, World from Scaleway Container !"

app = Flask(__name__)

@app.route("/")
def root():
  return jsonify({
    "message": MESSAGE
  })

@app.route("/health")
def health():
  # You could add more complex logic here, for example checking the health of a database...
  return jsonify({
    "status": "UP"
  })

if __name__ == "__main__":
  # Scaleway's system will inject a PORT environment variable on which your application should start the server.
  port = os.getenv("PORT", DEFAULT_PORT)
  app.run(host="0.0.0.0", port=int(port))
