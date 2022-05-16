// Important : ES Modules are enabled on node18 and above only.
// If you want to keep your code working with common JS packages, 
// use runtime node < 18.

export {handle};

function handle (event, context, cb) {
    return {
        body: process.version,
        statusCode: 200,
    };
};
