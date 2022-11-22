import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmgr from 'aws-cdk-lib/aws-secretsmanager';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as lambdaNodeJs from 'aws-cdk-lib/aws-lambda-nodejs';

import * as path from 'path';


export class CdkSpringbootActuatorAutomationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const authSecret = new secretsmgr.Secret(this, "auth-secret", {
      secretName: "/greeter/actuator/auth-creds",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "awslambda" }),
        generateStringKey: "password"
      }
    });

    const vpc = new ec2.Vpc(this, "vpc", {
      maxAzs: 2
    });
    const cluster = new ecs.Cluster(this, "cluster", {
      vpc
    });

    const taskRole = new iam.Role(this, "task-role", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com")
    });
    authSecret.grantRead(taskRole);

    const logGroup = new logs.LogGroup(this, "app-logs", {
      logGroupName: "greeter-loggroup",
      retention: logs.RetentionDays.THREE_DAYS,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const fargateSvc = new ecs_patterns.ApplicationLoadBalancedFargateService(this, "fargate-svc", {
      cluster,
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset("actuator-aws-automation"),
        containerName: "app",
        containerPort: 8080,
        environment: {
          AWS_ACTUATOR_SECRET: authSecret.secretName
        },
        logDriver: ecs.LogDriver.awsLogs({
          logGroup,
          streamPrefix: "app-"
        }),
        taskRole
      },
      taskSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_NAT
      }
    });
    fargateSvc.node.addDependency(authSecret);

    fargateSvc.targetGroup.configureHealthCheck({ path: "/actuator/health" });

    new CfnOutput(this, "greeter-endpoint", {
      value: `http://${fargateSvc.loadBalancer.loadBalancerDnsName}/greet/joker`
    });

    const verboseLogsParam = new ssm.StringListParameter(this, "verbose-logs", {
      parameterName: "/greeter/verbose-logs",
      stringListValue: [
        "org.springframework.security:DEBUG",
        "com.thecodinginterface.actuatorawsautomation:DEBUG"
      ]
    });
    const tidyLogsParam = new ssm.StringListParameter(this, "tidy-logs", {
      parameterName: "/greeter/tidy-logs",
      stringListValue: [
        "org.springframework.security:WARN",
        "com.thecodinginterface.actuatorawsautomation:ERROR"
      ]
    });

    const errorAlarmTransitionFn = new lambdaNodeJs.NodejsFunction(this, "error-alarm-fn", {
      entry: path.resolve(__dirname, "handlers", "loglevel-transition-handler.ts"),
      handler: "handler",
      logRetention: logs.RetentionDays.THREE_DAYS,
      environment: {
        AWS_ACTUATOR_SECRET: authSecret.secretName,
        LOGS_PARAM: verboseLogsParam.parameterName,
        SERVICE_ENDPOINT: `http://${fargateSvc.loadBalancer.loadBalancerDnsName}`
      }
    });
    const okAlarmTransitionFn = new lambdaNodeJs.NodejsFunction(this, "ok-alarm-fn", {
      entry: path.resolve(__dirname, "handlers", "loglevel-transition-handler.ts"),
      handler: "handler",
      logRetention: logs.RetentionDays.THREE_DAYS,
      environment: {
        AWS_ACTUATOR_SECRET: authSecret.secretName,
        LOGS_PARAM: tidyLogsParam.parameterName,
        SERVICE_ENDPOINT: `http://${fargateSvc.loadBalancer.loadBalancerDnsName}`
      }
    });
    errorAlarmTransitionFn.node.addDependency(authSecret, verboseLogsParam, fargateSvc);
    okAlarmTransitionFn.node.addDependency(authSecret, tidyLogsParam, fargateSvc);

    authSecret.grantRead(errorAlarmTransitionFn);
    authSecret.grantRead(okAlarmTransitionFn);
    verboseLogsParam.grantRead(errorAlarmTransitionFn);
    tidyLogsParam.grantRead(okAlarmTransitionFn);

    const filter = logGroup.addMetricFilter("error-filter", {
      filterPattern: logs.FilterPattern.anyTerm("ERROR"),
      metricName: "greeter-log-errors",
      metricNamespace: "GREETER",
      defaultValue: 0
    });

    const errorAlarmMetric = filter.metric({ statistic: "sum" });
    const errorAlarm = errorAlarmMetric.createAlarm(this, "error-alarm", {
      threshold: 1,
      evaluationPeriods: 1
    });

    const errorTopic = new sns.Topic(this, "error-topic", {
      topicName: "greeter-error-topic",
      displayName: "Integrates CloudWatch Alarm to Lambda on Alarm State Transition"
    });
    const okTopic = new sns.Topic(this, "ok-topic", {
      topicName: "greeter-ok-topic",
      displayName: "Integrates CloudWatch Alarm to Lambda on Ok State Transition"
    });
    errorTopic.addSubscription(new snsSubs.LambdaSubscription(errorAlarmTransitionFn));
    okTopic.addSubscription(new snsSubs.LambdaSubscription(okAlarmTransitionFn));

    errorAlarm.addAlarmAction(new cwActions.SnsAction(errorTopic));
    errorAlarm.addOkAction(new cwActions.SnsAction(okTopic));
  }
}
