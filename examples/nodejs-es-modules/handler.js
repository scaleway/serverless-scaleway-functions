export {handle};

function handle (event, context, cb) {
    return {
        body: process.version,
        statusCode: 200,
    };
};
