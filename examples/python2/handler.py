def handle(event, context):
    """handle a request to the function
    Args:
        req (dict): request body
    """

    return {
        "body": "Hello From Python2 runtime on Serverless Framework and Scaleway Functions"
    }
