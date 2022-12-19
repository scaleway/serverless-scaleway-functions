module.exports.handle = (event, context, callback) => {
  const result = {
    message: 'Hello from Serverless Framework and Scaleway Functions :D',
  };
  const response = {
    statusCode: 200,
    headers: {"Content-Type": ["application/json"]},
    body: JSON.stringify(result),
  };

  // either return cb(undefined, response) or return response
  return response;
};
