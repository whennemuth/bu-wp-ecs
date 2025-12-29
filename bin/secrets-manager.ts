import * as contextJSON from '../context/context.json';
import { IContext, SecretFieldNames } from "../context/IContext";
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
    STACK_ID, REGION, WORDPRESS: { 
      secret: { fields: { configExtra, dbPassword } }, env: { dbUser } 
    } } = context;

  // Landscape can be overridden by env variable LANDSCAPE.
  let { TAGS: { Landscape } } = context;


  const { WORDPRESS_CONFIG_EXTRA, DB_PASSWORD } = process.env;

  if( ! WORDPRESS_CONFIG_EXTRA ) {
    throw new Error('WORDPRESS_CONFIG_EXTRA environment variable must be set');
  }

  if( ! DB_PASSWORD ) {
    throw new Error('DB_PASSWORD environment variable must be set');
  }

  const args = process.argv.slice(1);
  let secretNameOverride = '';
  args.forEach((arg) => {
    const [key, value] = arg.split('=');
    if( key.trim().toUpperCase() === 'LANDSCAPE' ) {
      console.log(`Overriding Landscape tag from ${Landscape} from context to ${value} from argument`);
      Landscape = value;
    }
    if( key.trim().toUpperCase() === 'SECRET_NAME' ) {
      console.log(`Overriding entire secret name to ${value} from argument`);
      secretNameOverride = value;
    }
  });

  const secretName = secretNameOverride || `${STACK_ID}/${Landscape}`;
  const fldNames = { configExtra, dbPassword, spCert: 'N/A', spKey: 'N/A' } satisfies SecretFieldNames;
  const description = `Stores wordpress database username and password, and wp-config-extra, which contains sensitive values`;

  const smSecret = new SecretsManagerSecret({ secretName, description, fldNames, region: REGION });

  smSecret
    .setValue(configExtra, WORDPRESS_CONFIG_EXTRA)
    .setValue(dbPassword, DB_PASSWORD)
    .setValue('username', dbUser || 'root');

  console.log(`Creating or updating secret: ${secretName}: ${await smSecret.getSecretValueJson() }`);

  await smSecret.save();
};