export {handle};

function handle(event: Record<string, unknown>, context: Record<string, unknown>, cb: unknown) {
    return {
        body: "Hello world!",
        headers: { "Content-Type": ["application/json"] },
        statusCode: 200,
    };
};

/* This is used to test locally and will not be executed on Scaleway Functions */
if (process.env.NODE_ENV === 'test') {
    import("@scaleway/serverless-functions").then(scw_fnc_node => {
        scw_fnc_node.serveHandler(handle, 8080);
    });
}
