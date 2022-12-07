export { handle };

function handle(event, context, cb) {
  return {
    body: process.version,
    headers: { "Content-Type": ["text/plain"] },
    statusCode: 200,
  };
}
