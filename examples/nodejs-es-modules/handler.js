export { handle };

function handle(event, context, cb) {
  return {
    body: process.version,
    headers: { "Content-Type": ["text/plain"] },
    statusCode: 200,
  };
}

/* This is used to test locally and will not be executed on Scaleway Functions */
if (process.env.NODE_ENV === "test") {
  import("@scaleway/serverless-functions").then((scw_fnc_node) => {
    scw_fnc_node.serveHandler(handle, 8080);
  });
}
