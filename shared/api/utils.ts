import axios, { AxiosInstance } from "axios";

const version = "0.5.1";

const invalidArgumentsType = "invalid_arguments";

export function getApiManager(apiUrl: string, token: string): AxiosInstance {
  return axios.create({
    baseURL: apiUrl,
    headers: {
      "User-Agent": `serverless-scaleway-functions/${version}`,
      "X-Auth-Token": token,
    },
  });
}

interface ApiErrorResponse {
  status?: number;
  data?: {
    message?: string;
    error_message?: string;
    type?: string;
    details?: { argument_name: string; help_message: string }[];
    [key: string]: unknown;
  };
}

interface ApiErrorLike {
  response?: ApiErrorResponse;
}

/**
 * Custom Error class, to print an error message, and pass the Response if applicable.
 * Only keeps `status`/`data` off the Axios response, not the full object: the full
 * response's `request`/`config` carry the raw HTTP request, headers included, and this
 * error is routinely passed straight to `console.error`/logged by callers, which would
 * otherwise dump the `X-Auth-Token` credential into logs/test output.
 */
export class CustomError extends Error {
  response?: { status?: number; data?: unknown };

  constructor(message: string, response?: ApiErrorResponse) {
    super(message);
    this.response = response
      ? { status: response.status, data: response.data }
      : response;
  }
}

/**
 * Display the right error message, check if error has a response and data attribute
 * to properly display either the global error, or the component-level error (function/container)
 */
export function manageError(err: ApiErrorLike): never {
  err.response = err.response || {};
  if (!err.response || !err.response.data) {
    throw new Error(String(err));
  }
  if (err.response.data.message) {
    let message = err.response.data.message;

    // In case the error is an InvalidArgumentsError, provide some extra information
    if (err.response.data.type === invalidArgumentsType) {
      for (const details of err.response.data.details ?? []) {
        const argumentName = details.argument_name;
        const helpMessage = details.help_message;
        message += `\n${argumentName}: ${helpMessage}`;
      }
    }

    throw new CustomError(message, err.response);
  } else if (err.response.data.error_message) {
    throw new CustomError(err.response.data.error_message, err.response);
  } else {
    throw new CustomError(JSON.stringify(err.response.data), err.response);
  }
}
