/**
 * Autogenerated by feeding the context.json file to https://app.quicktype.io/
 */

export interface IContext {
  SCENARIO:           SCENARIO;
  STACK_ID:           string;
  STACK_NAME:         string;
  PREFIXES:           Prefixes;
  ACCOUNT:            string;
  REGION:             string;
  VPC_ID:             string;
  CIDRS:              Cidrs;
  SUBNETS?:           Subnets;
  DNS?:               DNS;
  S3PROXY:            S3Proxy;
  WORDPRESS:          Wordpress;
  TAGS:               Tags;
}

export enum SCENARIO {
  WORDPRESS = 'wordpress',
  WORDPRESS_BU = 'wordpress-bu',
  S3PROXY = 's3proxy',
  S3PROXY_BU = 's3proxy-bu',
  S3PROXY_EC2 = 's3proxy-ec2',
  RDS = 'rds',
  COMPOSITE = 'composite',
  COMPOSITE_BU = 'composite-bu',
}

export interface Cidrs {
  campus1:       string;
  campus2:       string;
  campus3:       string;
  campus4:       string;
  campus5:       string;
  "wp-app-dv02": string;
  dbreport1:     string;
  dbreport2:     string;
}

export interface DNS {
  hostedZone:     string;
  subdomain:      string;
  certificateARN: string;
  cloudfront?:    Cloudfront;
  includeRDS:     boolean;
}

export interface Cloudfront {
  challengeHeaderName: string;
  challengeSecretFld:  string
}

export interface Prefixes {
  wordpress: string;
  s3proxy:   string;
  rds:       string;
}

export interface S3Proxy {
  dockerImage:          string;
  bucketUserSecretName: string;
  recordName:           string;
  OLAP:                 string;
}

export interface Subnets {
  campus1:   string;
  campus2:   string;
}

export interface Tags {
  Service:   string;
  Function:  string;
  Landscape: string;
}

export interface Wordpress {
  dockerImage: string;
  env:         WordpressEnv;
  secret:      WordpressSecret;
}

export interface WordpressEnv {
  spEntityId:       string;
  idpEntityId:      string;
  forwardedForHost: string;
  s3ProxyHost:      string;
  TZ:               string;
  dbType:           WORDPRESS_DB_TYPE;
  dbHost:           string;
  dbUser:           string;
  dbName:           string;
  dbPort:           string;
  debug:            boolean;
}

export interface WordpressSecret {
  arn:         string;
  fields:      WordpressSecretFields;
}

export interface WordpressSecretFields {
  dbPassword:  string;
  configExtra: string;
  spKey:       string;
  spCert:      string;
}

export enum WORDPRESS_DB_TYPE {
  INSTANCE = 'instance',
  CLUSTER = 'cluster',
  SERVERLESS = 'serverless'
}
