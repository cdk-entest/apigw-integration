// haimtran 13 AUG 2022
// apigw with lambda, sqs, eventbridge, stepfunctions

import {
  aws_apigateway,
  aws_events,
  aws_iam,
  aws_lambda,
  aws_logs,
  aws_sqs,
  aws_stepfunctions,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { PassthroughBehavior } from "aws-cdk-lib/aws-apigateway";
import { Effect } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as path from "path";
import * as fs from "fs";

export class ApigwLambdaStack extends Stack {
  public readonly apigw: aws_apigateway.RestApi;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    // lambda target
    const func = new aws_lambda.Function(this, "LambdaBackend", {
      functionName: "LambdaBackend",
      code: aws_lambda.Code.fromAsset(path.join(__dirname, "./../lambda")),
      handler: "index.handler",
      runtime: aws_lambda.Runtime.PYTHON_3_8,
    });

    // role for apigw
    const role = new aws_iam.Role(this, "ApiGwInvokeLambdaRole", {
      roleName: "ApiGwInvokeLambdaRole",
      assumedBy: new aws_iam.ServicePrincipal("apigateway.amazonaws.com"),
    });

    role.addToPolicy(
      new aws_iam.PolicyStatement({
        effect: Effect.ALLOW,
        resources: [func.functionArn],
        actions: ["lambda:InvokeFunction"],
      })
    );

    role.addToPolicy(
      new aws_iam.PolicyStatement({
        effect: Effect.ALLOW,
        resources: ["*"],
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:PutLogEvents",
          "logs:GetLogEvents",
          "logs:FilterLogEvents",
        ],
      })
    );

    // access log group
    const devLogGroup = new aws_logs.LogGroup(this, "DevLogGroup", {
      logGroupName: "DevLogGroup",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // api gateway
    this.apigw = new aws_apigateway.RestApi(this, "ApiGwLambdaIntegration", {
      restApiName: "ApiGwLambdaIntegration",
      deployOptions: {
        stageName: "dev",
        accessLogDestination: new aws_apigateway.LogGroupLogDestination(
          devLogGroup
        ),
        accessLogFormat:
          aws_apigateway.AccessLogFormat.jsonWithStandardFields(),
      },
    });

    // api resource
    const book = this.apigw.root.addResource("lambda");

    // lambda integration
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
                path.resolve(
                  __dirname,
                  "./../template/response-template-lambda"
                ),
                { encoding: "utf-8" }
              ),
            },
          },
        ],
      }),
      {
        // no need for lambda-proxy-true
        methodResponses: [
          {
            statusCode: "200",
          },
        ],
      }
    );
  }
}

export class ApigwSqsStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // log group
    const devLogGroup = new aws_logs.LogGroup(this, "DevLogGroup", {
      logGroupName: "DevLogGroup",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // api gateway
    const apigw = new aws_apigateway.RestApi(this, "ApiGwSqsIntegration", {
      restApiName: "ApiGwSqsIntegration",
      deployOptions: {
        stageName: "dev",
        accessLogDestination: new aws_apigateway.LogGroupLogDestination(
          devLogGroup
        ),
        accessLogFormat:
          aws_apigateway.AccessLogFormat.jsonWithStandardFields(),
      },
    });

    // sqs queue
    const queue = new aws_sqs.Queue(this, "ApiSqsQueue", {
      queueName: "ApiSqsQueue",
    });

    // role for apigw
    const role = new aws_iam.Role(this, "ApiGwSendMessageToQueue", {
      roleName: "ApiGwSendMessageToQueue",
      assumedBy: new aws_iam.ServicePrincipal("apigateway.amazonaws.com"),
    });

    role.addToPolicy(
      new aws_iam.PolicyStatement({
        effect: Effect.ALLOW,
        resources: [queue.queueArn],
        actions: ["sqs:SendMessage"],
      })
    );

    role.addToPolicy(
      new aws_iam.PolicyStatement({
        effect: Effect.ALLOW,
        resources: ["*"],
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:PutLogEvents",
          "logs:GetLogEvents",
          "logs:FilterLogEvents",
        ],
      })
    );

    // apigw add resource
    const resource = apigw.root.addResource("queue");

    // integrate apigw with sqs
    resource.addMethod(
      "POST",
      new aws_apigateway.AwsIntegration({
        service: "sqs",
        path: queue.queueName,
        options: {
          credentialsRole: role,
          passthroughBehavior: PassthroughBehavior.WHEN_NO_TEMPLATES,
          requestParameters: {
            "integration.request.header.Content-Type": `'application/x-www-form-urlencoded'`,
          },
          requestTemplates: {
            "application/json": fs.readFileSync(
              path.resolve(__dirname, "./../template/request-template-sqs"),
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
  }
}

export class ApigwEventStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // log group
    const devLogGroup = new aws_logs.LogGroup(this, "DevLogGroup", {
      logGroupName: "DevLogGroup",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // api gateway
    const apigw = new aws_apigateway.RestApi(this, "ApiGwEventIntegration", {
      restApiName: "ApiGwEventIntegration",
      deployOptions: {
        stageName: "dev",
        accessLogDestination: new aws_apigateway.LogGroupLogDestination(
          devLogGroup
        ),
        accessLogFormat:
          aws_apigateway.AccessLogFormat.jsonWithStandardFields(),
      },
    });

    // eventbridge rule
    const rule = new aws_events.Rule(this, "RuleForEventFromApiGw", {
      ruleName: "RuleForEventFromApiGw",
      eventPattern: {
        source: ["apigateway"],
        detailType: ["*"],
      },
    });

    // role for apigw to put events
    const role = new aws_iam.Role(this, "ApiGwPutEvent", {
      roleName: "ApiGwPutEvent",
      assumedBy: new aws_iam.ServicePrincipal("apigateway.amazonaws.com"),
    });

    role.addToPolicy(
      new aws_iam.PolicyStatement({
        effect: Effect.ALLOW,
        resources: ["*"],
        actions: ["events:PutEvents"],
      })
    );

    role.addToPolicy(
      new aws_iam.PolicyStatement({
        effect: Effect.ALLOW,
        resources: ["*"],
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:PutLogEvents",
          "logs:GetLogEvents",
          "logs:FilterLogEvents",
        ],
      })
    );

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
              path.resolve(
                __dirname,
                "./../template/request-template-eventbridge"
              ),
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
  }
}

export class ApiGwStepFunction extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // simple stepfunctions
    const startState = new aws_stepfunctions.Pass(this, "StartState");

    const stateMachine = new aws_stepfunctions.StateMachine(
      this,
      "StateMachine",
      {
        definition: startState,
      }
    );

    // access log group
    const logGroup = new aws_logs.LogGroup(this, "LogGroup", {
      logGroupName: "ApiGwLogGroup",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // role for apigw
    const role = new aws_iam.Role(this, "ApiGwCallStepfunctionRole", {
      roleName: "ApiGwCallStepFunctionRole",
      assumedBy: new aws_iam.ServicePrincipal("apigateway.amazonaws.com"),
    });

    role.addToPolicy(
      new aws_iam.PolicyStatement({
        effect: Effect.ALLOW,
        resources: [stateMachine.stateMachineArn],
        actions: ["states:StartExecution"],
      })
    );

    role.addToPolicy(
      new aws_iam.PolicyStatement({
        effect: Effect.ALLOW,
        resources: ["*"],
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:PutLogEvents",
          "logs:GetLogEvents",
          "logs:FilterLogEvents",
        ],
      })
    );
    // apigw
    const apigw = new aws_apigateway.RestApi(this, "ApiGw", {
      restApiName: "ApiGwSetpfunction",
      deploy: false,
    });

    // stepfunctions integration
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
  "stateMachineArn": ${stateMachine.stateMachineArn}
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
  }
}
