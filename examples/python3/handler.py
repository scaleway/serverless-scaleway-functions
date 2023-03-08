def handle(event, context):
    """handle a request to the function
    Args:
        event (dict): request params
        context (dict): function call metadata
    """

    return {
        "body": "Hello From Python3 runtime on Serverless Framework and Scaleway Functions",
        "headers": {
            "Content-Type": ["text/plain"],
        }
    }

# run 'pip install scaleway_functions_python' if necessary
if __name__ == "__main__":
    # The import is conditional so that you do not need
    # to package the library when deploying on Scaleway Functions.
    from scaleway_functions_python import local
    local.serve_handler(handle, port=8080)