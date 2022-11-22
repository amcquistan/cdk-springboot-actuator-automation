import { SNSEvent } from "aws-lambda";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

import axios from "axios";

const secretsMgr = new SecretsManagerClient({ region: process.env.AWS_REGION });
const ssm = new SSMClient({ region: process.env.AWS_REGION });


interface LoggerLevel {
  readonly name: string;
  readonly configuredLevel: string;
}

export async function handler(event: SNSEvent) {
  const ssmResponse = await ssm.send(new GetParameterCommand({
    Name: process.env.LOGS_PARAM
  }));
  console.log(`ssmResponse = ${JSON.stringify(ssmResponse, null, 2)}`);

  const loggerLevels = ssmResponse.Parameter?.Value?.split(",").map<LoggerLevel>(item => {
      const [name, configuredLevel] = item.split(":");
      return { name, configuredLevel };
  });
  console.log(`loggerLevels=${JSON.stringify(loggerLevels, null, 2)}`);
  if (!loggerLevels) {
    return;
  }

  const secretsMgrResponse = await secretsMgr.send(new GetSecretValueCommand({
    SecretId: process.env.AWS_ACTUATOR_SECRET
  }));
  const creds = JSON.parse(secretsMgrResponse.SecretString!);

  for (const loggerLevel of loggerLevels) {
    const axiosResponse = await axios.post(
      `${process.env.SERVICE_ENDPOINT}/actuator/loggers/${loggerLevel.name}`,
      { configuredLevel: loggerLevel.configuredLevel },
      { auth: { ...creds } }
    );
    console.log(`axiosResponse status=${axiosResponse.status} for ${loggerLevel.name} set to ${loggerLevel.configuredLevel}`);
  }
}
