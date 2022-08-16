## API Gateway Integration

## Request Response Data Mapping

[HERE](https://docs.aws.amazon.com/apigateway/latest/developerguide/request-response-data-mappings.html)

integrate apigw with sqs queue

```tsx
resource.addMethod(
  "POST",
  new aws_apigateway.AwsIntegration({
    service: "sqs",
    path: queue.queueName,
    options: {
      credentialsRole: role,
      requestParameters: {
        "integration.request.header.Content-Type": `'application/x-www-form-urlencoded'`,
      },
      requestTemplates: {
        "application/json": `Action=SendMessage&MessageBody=$util.urlEncode("$method.request.querystring.message")`,
      },
      integrationResponses: [
        {
          statusCode: "200",
        },
      ],
    },
  }),
  // method response
  {
    methodResponses: [
      {
        statusCode: "200",
      },
    ],
  }
);
```
