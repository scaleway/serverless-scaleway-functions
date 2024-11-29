const axios = require("axios");
const https = require("https");

const version = "0.4.14";

const invalidArgumentsType = "invalid_arguments";

function getApiManager(apiUrl, token) {
  return axios.create({
    baseURL: apiUrl,
    headers: {
      "User-Agent": `serverless-scaleway-functions/${version}`,
      "X-Auth-Token": token,
    },
    httpsAgent: new https.Agent({
      rejectUnauthorized: false,
    }),
  });
}

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
    let message = err.response.data.message;

    // In case the error is an InvalidArgumentsError, provide some extra information
    if (err.response.data.type === invalidArgumentsType) {
      for (const details of err.response.data.details) {
        const argumentName = details.argument_name;
        const helpMessage = details.help_message;
        message += `\n${argumentName}: ${helpMessage}`;
      }
    }

    throw new CustomError(message, err.response);
  } else if (err.response.data.error_message) {
    throw new CustomError(err.response.data.error_message, err.response);
  }
}

module.exports = {
  getApiManager,
  manageError,
  CustomError,
};
