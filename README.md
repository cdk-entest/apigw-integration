---
title: Introduction to API Gateway
description: integrate with lambda, stepfunctions, etc, deployment multiple stage, monitor with access log and execution logs.
author: haimtran
publishedDate: 08/11/2022
date: 2022-08-11
---

## Introduction

[GitHub](https://github.com/entest-hai/apigw-demo)

- Integration targets: Lambda, Stepfunctions, SQS, etc
- Deployment: multiple stages, deployment options
- Monitor: access log and execution log

To integrate APIGW with targets, need to understand

- Role for APIGW
- Proxy mode
- Setup: method request, [method response](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-method-settings.html), [method options](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigateway.MethodOptions.html), [integration options](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigateway.LambdaIntegrationOptions.html)

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

## Role for APIGW

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

## APIGW Prod Stage

access log group for production stage

```tsx
const prodLogGroup = new aws_logs.LogGroup(this, "ProdLogGroup", {
  logGroupName: "ProdLogGroupAccessLog",
});
```

create an apigw and production stage deployment

```tsx
const apiGw = new aws_apigateway.RestApi(this, "HelloApiGw", {
  restApiName: "HelloApiGw",
  deployOptions: {
    stageName: "prod",
    accessLogDestination: new aws_apigateway.LogGroupLogDestination(
      prodLogGroup
    ),
    accessLogFormat: aws_apigateway.AccessLogFormat.jsonWithStandardFields(),
  },
});
```

## Lambda Integration

integrate apigw with the lambda function

```tsx
const book = apiGw.root.addResource("book");
book.addMethod(
  "GET",
  new aws_apigateway.LambdaIntegration(func, {
    proxy: false,
    allowTestInvoke: false,
    credentialsRole: role,
    integrationResponses: [
      {
        statusCode: "200",
      },
    ],
  }),
  {
    methodResponses: [{ statusCode: "200" }],
  }
);
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
