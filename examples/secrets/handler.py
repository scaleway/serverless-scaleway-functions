import json
import os


def handle(event, context):
    """handle a request to the function
    Args:
        event (dict): request params
        context (dict): function call metadata
    """

    # print all environment variables beginning with "env"
    return {
        "env_vars": sorted(
            list(
                filter(
                    lambda x: x.startswith("env"),
                    dict(os.environ).keys()
                )
            )
        )
    }
