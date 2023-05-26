module.exports.handle = (event, context, callback) => {
  console.log(JSON.stringify(event, null, 4));

  const result = {
    message: "Hello from Scaleway functions",
  };

  const response = {
    statusCode: 200,
    headers: { "Content-Type": ["application/json"] },
    body: JSON.stringify(result),
  };

  return response;
};

/* This is used to test locally and will not be executed on Scaleway Functions */
if (process.env.NODE_ENV === 'test') {
  import("@scaleway/serverless-functions").then(scw_fnc_node => {
    scw_fnc_node.serveHandler(exports.handle, 8080);
  });
}
