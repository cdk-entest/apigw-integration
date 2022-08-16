#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import {
  ApigwLambdaStack,
  ApigwSqsStack,
} from "../lib/apigw-integration-stack";

const app = new cdk.App();

// apigw lambda integration
const apigw = new ApigwLambdaStack(app, "ApigwIntegrationStack", {});

// apigw sqs integration
const apiSqs = new ApigwSqsStack(app, "ApiSqsIntegration", {
  apigw: apigw.apigw,
});
