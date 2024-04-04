import * as forge from 'node-forge';
import * as context from '../contexts/context.json';
import { IAMClient, UploadServerCertificateCommand, GetServerCertificateCommand, DeleteServerCertificateCommand } from '@aws-sdk/client-iam';

export enum IamServerCertificate {
  ServerCertificateName = 'wp-iam-selfsigned-cert',
  Path = '/bu/wordpress/servercerts/'
}

export interface SelfSignedCertificate {
  certificateBody: string;
  certificateChain: string;
  privateKey: string;
}

/**
 * Look for the iam server certificate by name and indicate if found.
 * @param ServerCertificateName 
 * @returns 
 */
export async function lookupCertificateArn(ServerCertificateName:string=IamServerCertificate.ServerCertificateName): Promise<string> {

  const client = new IAMClient({ });
  const command = new GetServerCertificateCommand({ ServerCertificateName });
  try {
    const response = await client.send(command);
    return response.ServerCertificate?.ServerCertificateMetadata!.Arn || '';
  }
  catch(e:any) {
    if(e.name === 'NoSuchEntityException') {
      return '';
    }
    throw(e);
  }
}

/**
 * Create the iam server certificate.
 * @param ServerCertificateName 
 * @param tags 
 * @returns 
 */
export async function createIamServerCertificate(
  ServerCertificateName:string=IamServerCertificate.ServerCertificateName,
  Path:string=IamServerCertificate.Path): Promise<string> {

  const cert:SelfSignedCertificate = generateSelfSignedCertificate(10);
  const client = new IAMClient({ });
  const command = new UploadServerCertificateCommand({
    Path,
    ServerCertificateName,
    CertificateBody: cert.certificateBody,
    PrivateKey: cert.privateKey,
    CertificateChain: cert.certificateChain,
    Tags: [
      { Key: 'Service', Value: context.TAGS.Service },
      { Key: 'Function', Value: context.TAGS.Function },
    ],
  });
  const response = await client.send(command);
  return response?.ServerCertificateMetadata?.Arn || '';
}

/**
 * Delete the iam server certificate.
 * @param ServerCertificateName 
 * @returns 
 */
export async function deleteIamServerCertificate(ServerCertificateName:string=IamServerCertificate.ServerCertificateName): Promise<boolean> {
  const client = new IAMClient({ });
  const command = new DeleteServerCertificateCommand({ ServerCertificateName });
  try {
    const response = await client.send(command);
    return true;
  }
  catch(e:any) {
    if(e.name === 'NoSuchEntityException') {
      return true;
    }
    return false;
  }
}

/**
 * Lookup the arn of the iam server certificate, else create it, but return the arn in either case.
 * @param ServerCertificateName 
 * @returns 
 */
export async function checkIamServerCertificate(ServerCertificateName:string=IamServerCertificate.ServerCertificateName): Promise<string> {
  console.log(`Looking up iam server certificate ${IamServerCertificate.ServerCertificateName}...`);
  let arn = await lookupCertificateArn();
  if( ! arn) {
    console.log(`Creating iam server certificate ${IamServerCertificate.ServerCertificateName}...`);
    arn = await createIamServerCertificate();
  }
  console.log(`IAM server certificate arn: ${arn}`);
  return arn;
}

/**
 * Create an X509 PEM formatted certificate for ssl transport.
 * @param expireYears Years the certificate is valid for.
 * @returns 
 */
export function generateSelfSignedCertificate(expireYears?: number): SelfSignedCertificate {
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
