/**
 * Display the right error message, check if error has a response and data attribute
 * to properly display either the global error, or the component-level error (function/container)
 * @param {Error} err - Error thrown
 */
function manageError(err) {
    // eslint-disable-next-line no-param-reassign
    err.response = err.response || {};
    if (!err.response || !err.response.data) {
        throw new Error(err);
    }
    if (err.response.data.message) {
        throw new Error(err.response.data.message);
    } else if (err.response.data.error_message) {
        throw new Error(err.response.data.error_message);
    }
}

module.exports = {
    manageError,
};
