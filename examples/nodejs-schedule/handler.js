module.exports.handle = (event, context, callback) => {
  const result = {
    message: "Hello from Serverless Framework and Scaleway Functions :D",
  };

  const response = {
    statusCode: 200,
    headers: { "Content-Type": ["application/json"] },
    body: JSON.stringify(result),
  };

  // either return cb(undefined, response) or return response
  return response;
};

/* This is used to test locally and will not be executed on Scaleway Functions */
if (process.env.NODE_ENV === "test") {
  import("@scaleway/serverless-functions").then((scw_fnc_node) => {
    scw_fnc_node.serveHandler(exports.handle, 8080);
  });
}
