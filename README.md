---
title: Introduction to API Gateway
description: integrate with lambda, stepfunctions, etc, deployment multiple stage, monitor with access log and execution logs.
author: haimtran
publishedDate: 08/11/2022
date: 2022-08-11
---

## Introduction

[GitHub](https://github.com/entest-hai/lambda-integration) this shows how to integrate apigw with different aws services such as Lambda, Stepfunctions, and SQS. It also covers:

- Integration targets: lambda, stepfunctions, and sqs
- Deployment options: multiple stages, access log groups

To integrate apigw with targets, we need:

- Role for apigw
- Request mapping: proxy, request parameters, request templates
- Response mapping: method response, integration response, reponse template

<LinkedImage
  href="https://youtu.be/9PwT8OkFBA4"
  height={400}
  alt="Hello AWS CDK Construct"
  src="/thumbnail/apigw-integration.png"
/>

## Lambda Backend

create a lambda for backend

```tsx
const func = new aws_lambda.Function(this, "ProcessOrderLambda", {
  functionName: "ProcessOrderLambda",
  code: aws_lambda.Code.fromAsset(path.join(__dirname, "./../lambda")),
  handler: "index.handler",
  runtime: aws_lambda.Runtime.PYTHON_3_8,
});
```

lambda should return a corret header format to support proxy mode

```py
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

```

## Role for ApiGw

role for APIGW to invoke the lambda and put logs

```tsx
const role = new aws_iam.Role(this, "RoleForApiGwInvokeLambda", {
  roleName: "ApiGwInvokeLambda",
  assumedBy: new aws_iam.ServicePrincipal("apigateway.amazonaws.com"),
});

role.addToPolicy(
  new aws_iam.PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["lambda:InvokeFunction"],
    resources: [func.functionArn],
  })
);

role.addToPolicy(
  new aws_iam.PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:DescribeLogGroups",
      "logs:DescribeLogStreams",
      "logs:PutLogEvents",
      "logs:GetLogEvents",
      "logs:FilterLogEvents",
    ],
    resources: ["*"],
  })
);
```

## ApiGw Prod Stage

access log group for production stage

```tsx
const devLogGroup = new aws_logs.LogGroup(this, "DevLogGroup", {
  logGroupName: "DevLogGroup",
  removalPolicy: RemovalPolicy.DESTROY,
});
```

create an apigw and production stage deployment

```tsx
this.apigw = new aws_apigateway.RestApi(this, "ApiGwIntegration", {
  restApiName: "ApiGwIntegration",
  deployOptions: {
    stageName: "dev",
    accessLogDestination: new aws_apigateway.LogGroupLogDestination(
      devLogGroup
    ),
    accessLogFormat: aws_apigateway.AccessLogFormat.jsonWithStandardFields(),
  },
});
```

create api resource

```tsx
const book = this.apigw.root.addResource("lambda");
```

## Development Stage

access log group for development stage

```tsx
const devLogGroup = new aws_logs.LogGroup(this, "ApiAccessLogGroup", {
  logGroupName: "DevLogGroupAccessLog",
});
```

deployment stage

```tsx
const deployment = new aws_apigateway.Deployment(this, "Deployment", {
  api: apiGw,
});

new aws_apigateway.Stage(this, "DevStage", {
  stageName: "dev",
  deployment,
  dataTraceEnabled: true,
  accessLogDestination: new aws_apigateway.LogGroupLogDestination(devLogGroup),
  accessLogFormat: aws_apigateway.AccessLogFormat.jsonWithStandardFields(),
});
```

## Lambda Integration

integrate apigw with the lambda function

```tsx
book.addMethod(
  "GET",
  new aws_apigateway.LambdaIntegration(func, {
    proxy: false,
    allowTestInvoke: false,
    credentialsRole: role,
    // api-input-map
    passthroughBehavior: PassthroughBehavior.WHEN_NO_TEMPLATES,
    requestParameters: {},
    requestTemplates: {},
    // api-output-map
    integrationResponses: [
      {
        statusCode: "200",
        responseTemplates: {
          "application/json": fs.readFileSync(
            path.resolve(__dirname, "./../lambda/response-template"),
            { encoding: "utf-8" }
          ),
        },
      },
    ],
  }),
  {
    // no need for lambda-proxy true
    methodResponses: [
      {
        statusCode: "200",
      },
    ],
  }
);
```

then we want apigw to intercept the response from backend before return to client by using a model/schema as follow. This is called [models and mapping template](https://docs.aws.amazon.com/apigateway/latest/developerguide/models-mappings.html) for payload.

```tsx
#set($inputRoot = $input.path('$'))
{
    "id": "$inputRoot.body.id",
    "message": "$inputRoot.body.message"
}
```

## SQS Integration

create a qeuue

```tsx
const queue = new aws_sqs.Queue(this, "ApiSqsQueue", {
  queueName: "ApiSqsQueue",
});
```

for for apigw to send messages to queue

```tsx
role.addToPolicy(
  new aws_iam.PolicyStatement({
    effect: Effect.ALLOW,
    resources: [queue.queueArn],
    actions: ["sqs:SendMessage"],
  })
);
```

create an api resource

```tsx
const resource = props.apigw.root.addResource("queue");
```

integrate apigw with the queue.

```tsx
// integrate apigw with sqs
resource.addMethod(
  "POST",
  new aws_apigateway.AwsIntegration({
    service: "sqs",
    // exclusive path
    action: "StartExecution",
    options: {
      credentialsRole: role,
      passthroughBehavior: PassthroughBehavior.WHEN_NO_TEMPLATES,
      requestParameters: {
        "integration.request.header.Content-Type": `'application/x-www-form-urlencoded'`,
      },
      requestTemplates: {
        "application/json": fs.readFileSync(
          path.resolve(__dirname, "./../lambda/request-template"),
          { encoding: "utf-8" }
        ),
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

apigw needs to transform the request to match the request format of sqs [here](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_SendMessage.html) by using a request template (mapping), and add a header content-type parameter for POST method. That's whey we need request-template here.

```tsx
Action=SendMessage&MessageBody=$util.urlEncode("$method.request.querystring.message")
```

## EventBridge Integration

role for apigw to put events to the default event bus

```tsx
role.addToPolicy(
  new aws_iam.PolicyStatement({
    effect: Effect.ALLOW,
    resources: ["*"],
    actions: ["events:PutEvents"],
  })
);
```

integrate the sqs queue with apigw. we need a request template to transform client requests into correct request format of [eventbridge](https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutEvents.html)

```tsx
// apigw add resource
const resource = apigw.root.addResource("event");

// integrate apigw with sqs
resource.addMethod(
  "POST",
  new aws_apigateway.AwsIntegration({
    service: "events",
    action: "PutEvents",
    options: {
      credentialsRole: role,
      passthroughBehavior: PassthroughBehavior.WHEN_NO_TEMPLATES,
      requestParameters: {},
      requestTemplates: {
        "application/json": fs.readFileSync(
          path.resolve(__dirname, "./../lambda/request-event-template"),
          { encoding: "utf-8" }
        ),
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

here is my lazy template

```tsx
#set($context.requestOverride.header.X-Amz-Target = "AWSEvents.PutEvents")
#set($context.requestOverride.header.Content-Type = "application/x-amz-json-1.1")
#set($inputRoot = $input.path('$'))
{
  "Entries": [
    {
      "Resources": ["1234"],
      "Detail": "{ \"key1\": \"value1\", \"key2\": \"value2\" }",
      "DetailType": "dev",
      "EventBusName": "default",
      "Source": "apigateway"
    }
  ]
}
```

## Stepfunction Integration
role for apigw to invoke stepfunctions 
```tsx
role.addToPolicy(
    new aws_iam.PolicyStatement({
      effect: Effect.ALLOW,
      resources: [stateMachine.stateMachineArn],
      actions: ["states:StartExecution"],
    })
  );
```

create apigw with no default deployment in cdk 
```tsx
 const apigw = new aws_apigateway.RestApi(this, "ApiGw", {
      restApiName: "ApiGwSetpfunction",
      deploy: false,
    });
```

stepfunction integration 
```tsx
apigw.root.addMethod(
  "POST",
  new aws_apigateway.AwsIntegration({
    service: "states",
    // exclusive path
    action: "StartExecution",
    options: {
      credentialsRole: role,
      passthroughBehavior: PassthroughBehavior.WHEN_NO_TEMPLATES,
      requestParameters: {},
      requestTemplates: {
        "application/json": `#set($inputRoot = $input.path('$'))
          {
            "input": "$util.escapeJavaScript($input.json('$'))",
            "stateMachineArn": "${stateMachine.stateMachineArn}"
          }`,
      },
      integrationResponses: [
        {
          statusCode: "200",
          // responseParameters: {},
          // responseTemplates: {},
          // selectionPattern: "",
        },
      ],
    },
  }),
  {
    methodResponses: [
      {
        statusCode: "200",
      },
    ],
  }
);
```

deployment and starge 
```tsx
// deployment
const deployment = new aws_apigateway.Deployment(this, "deployment", {
  api: apigw,
});

// dev stage
new aws_apigateway.Stage(this, "DevStage", {
  stageName: "dev",
  deployment: deployment,
  accessLogDestination: new aws_apigateway.LogGroupLogDestination(logGroup),
  accessLogFormat: aws_apigateway.AccessLogFormat.jsonWithStandardFields(),
});
```


option 1. the post request body should be

```json
{
  "input": "{}",
  "name": "MyExecution",
  "stateMachineArn": "arn:aws:states:xxx"
}
```

option 2. using request template

```json
#set($inputRoot = $input.path('$'))
{
  "input": "$util.escapeJavaScript($input.json('$'))",
  "stateMachineArn": "arn:aws:states:xxx"
}
```
then body request 
```json
{
    "input": "{}",
    "name": "execution-1",
}
```

## Conclusion

1. Role for apigw
2. Multiple stage deployment
3. Access log group
4. Response mapping - integration response setting (aws console)
5. Request mapping - integration request setting (aws console)
