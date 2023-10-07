import { Construct } from 'constructs';
import * as forge from 'node-forge';
import { IContext } from '../contexts/IContext';
import { CfnServerCertificate } from 'aws-cdk-lib/aws-iam';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { SecretValue } from 'aws-cdk-lib';

export interface SelfSignedCertificate {
  certificateBody: string;
  certificateChain: string;
  privateKey: string;
}

/**
 * Create an X509 PEM formatted certificate for ssl transprot.
 * @param expireYears Years the certificate is valid for.
 * @returns 
 */
function createSelfSignedCertificate(expireYears?: number): SelfSignedCertificate {
  // Generate a key pair
  const keys = forge.pki.rsa.generateKeyPair(2048);

  // Create a certificate
  const cert = forge.pki.createCertificate();
  const yearsToExpire = expireYears || 5;
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + yearsToExpire);

  const attrs = [
    { name: 'commonName', value: 'example.org' },
    { name: 'countryName', value: 'US' },
    { shortName: 'ST', value: 'Massachusetts' },
    { name: 'localityName', value: 'Boston' },
    { name: 'organizationName', value: 'Boston University' },
    { shortName: 'OU', value: 'Test' }
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey);

  // Convert the certificate, certificate chain, and private key to PEM format
  const certificateBody = forge.pki.certificateToPem(cert);
  const certificateChain = forge.pki.certificateToPem(cert);
  const privateKey = forge.pki.privateKeyToPem(keys.privateKey);

  return { certificateBody, certificateChain, privateKey };
}

export interface CertProps { yearsToExpire:number, createSecret?:boolean }

/**
 * Create an iam server certificate for reference by the ssl listeners of albs.
 */
export class IamCertificate extends Construct {

  private _serverCertificateArn:string;

  constructor(scope: Construct, id: string, props?: CertProps) {

    super(scope, id);

    const context: IContext = scope.node.getContext('stack-parms');

    const { certificateBody, certificateChain, privateKey } = createSelfSignedCertificate(props?.yearsToExpire);

    let cert:CfnServerCertificate;

    if(props?.createSecret) {
      // First load the certificate into a secrets manager secret for the ecs wordpress task to get at as environment variables.
      const secret:Secret = new Secret(this, `${id}-iam-selfsigned-cert-secret`, {
        description: `Stores ssl pem content for ${id}-fargate-alb`,
        secretName: `${context.TAGS.Landscape}/wp/pem`,
        secretStringValue: SecretValue.unsafePlainText(JSON.stringify({ 
          certificateBody, 
          certificateChain, 
          privateKey,
        }))
      });
      
      // Create the iam server certificate
      cert = new CfnServerCertificate(this, `${id}-iam-selfsigned-cert`, {
        privateKey: SecretValue.secretsManager(secret.secretArn, { jsonField: 'privateKey' }).unsafeUnwrap(), 
        certificateBody: SecretValue.secretsManager(secret.secretArn, { jsonField: 'certificateBody' }).unsafeUnwrap(), 
        certificateChain: SecretValue.secretsManager(secret.secretArn, { jsonField: 'privateKey' }).unsafeUnwrap(), 
      });
    }
    else {
      // Create the iam server certificate
      cert = new CfnServerCertificate(this, `${id}-iam-selfsigned-cert`, { certificateBody, certificateChain, privateKey});   
    }

    this._serverCertificateArn = cert.attrArn;
  }

  public getIamCertArn(): string {
    return this._serverCertificateArn;
  }
}
