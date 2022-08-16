# haimtran 14 AUG 2022
# response format to support lambda proxy
import uuid


def handler(event, context):
    return {
        "statusCode": 200,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "OPTIONS,GET",
        },
        "body": {
            "id": str(uuid.uuid4()),
            "name": "haimtran",
            "message": "hello lambda api",
        },
    }
