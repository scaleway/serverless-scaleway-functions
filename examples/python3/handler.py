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
