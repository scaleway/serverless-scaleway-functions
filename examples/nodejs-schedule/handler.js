module.exports.handle = (event, context, callback) => {
  // The scheduled event data is held in a JSON string in the body field
  var eventBody = JSON.parse(event.body)

  // Log the event data
  console.log("foo = " + eventBody.foo)
  console.log("bar = " + eventBody.bar)

  // Return a success response
  const response = {
    statusCode: 200,
    headers: { "Content-Type": ["application/json"] },
    body: JSON.stringify({message: "Hello from scaleway functions"}),
  };

  return response;
};

/* This is used to test locally and will not be executed on Scaleway Functions */
if (process.env.NODE_ENV === 'test') {
  import("@scaleway/serverless-functions").then(scw_fnc_node => {
    scw_fnc_node.serveHandler(exports.handle, 8080);
  });
}
