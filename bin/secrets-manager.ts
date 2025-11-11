import * as contextJSON from '../contexts/context.json';
import { IContext, SecretFieldNames } from "../contexts/IContext";
import { SecretsManagerSecret } from "../lib/Secret";

/**
 * Script to create or update the secrets for this stack in AWS Secrets Manager.
 * The secret name and field names are based on values from the context file.
 * 
 * NOTE: Since this module is not being called as part of the CDK app, it is independent of it.
 * The goal here is to make secrets that survive stack deletion.
 */
export const createOrUpdateSecrets = async () => {
  const context = contextJSON as IContext;

  const { 
    STACK_ID, REGION, TAGS: { Landscape }, WORDPRESS: { 
      secret: { fields: { configExtra, dbPassword } }, env: { dbUser } 
    } } = context;

  const secretName = `${STACK_ID}/${Landscape}`;
  const fldNames = { configExtra, dbPassword, spCert: 'N/A', spKey: 'N/A' } satisfies SecretFieldNames;
  const description = `Stores wordpress database username and password, and wp-config-extra, which contains sensitive values`;

  const { CONFIG_EXTRA, DB_PASSWORD } = process.env;

  if( ! CONFIG_EXTRA ) {
    throw new Error('CONFIG_EXTRA environment variable must be set');
  }

  if( ! DB_PASSWORD ) {
    throw new Error('DB_PASSWORD environment variable must be set');
  }

  const smSecret = new SecretsManagerSecret({ secretName, description, fldNames, region: REGION })
    .setValue(configExtra, CONFIG_EXTRA)
    .setValue(dbPassword, DB_PASSWORD)
    .setValue('username', dbUser || 'root');

  console.log(`Creating or updating secret: ${secretName}: ${await smSecret.getSecretValueJson() }`);

  await smSecret.save();
};