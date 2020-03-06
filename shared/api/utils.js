/**
 * Custom Error class, to print an error message, and pass the Response if applicable
 */
class CustomError extends Error {
  constructor(message, response) {
    super(message);
    this.response = response;
  }
}

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
    throw new CustomError(err.response.data.message, err.response);
  } else if (err.response.data.error_message) {
    throw new CustomError(err.response.data.error_message, err.response);
  }
}

module.exports = {
  manageError,
  CustomError,
};
