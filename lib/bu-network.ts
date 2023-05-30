import {
  ResourceGroupsTaggingAPIClient,
  GetResourcesCommand
} from "@aws-sdk/client-resource-groups-tagging-api";
import { EC2Client, DescribeSubnetsCommand, DescribeSubnetsResult, Subnet } from "@aws-sdk/client-ec2";
import * as context from '../context-css.json';

/**
 * This class represents the pre-existing BU common security services accounts (prod, nonprod, etc) 
 * vpc and subnets, for which lookup methods are provided.
 * Place the following in you app file (ie: bin/bu-wordpress-stack.ts) like this:
 * 
 *   import { BuNetwork } from '../lib/bu-network';
 *
 *   new BuNetwork().getDetails().then(networkDetails => {
 *      // Code that creates a stack
 *      // console.log(networkDetails.vpcId)
 *      // console.log(networkDetails.getCampusSubnetId(0))
 *   } 
 *
 */
export class BuNetwork {

  private details = new BuNetworkDetails();

  /**
   * The network details were acquired elsewhere and are being dependency injected here.
   * @param _details instance of BuNetworkDetails. 
   */
  constructor(_details?: BuNetworkDetails) {
    if(_details && _details.initialized()) {
      this.details = _details;
    }
  }

  /**
   * Get the arn of the first subnet tagged with "Network=Campus". 
   * This subnet belongs to the vpc we are looking for
   * @returns string: The subnet arn.
   */
  private async lookupCampusSubnetArns(): Promise<string[]> {
    const arns: string[] = [];
    const client = new ResourceGroupsTaggingAPIClient({});
    const command = new GetResourcesCommand({
      ResourceTypeFilters: [ 'ec2:subnet' ],
      TagFilters: [ { Key: 'Network', Values: [ 'Campus' ] }]
    });
    try {
      const results = await client.send(command);
      if(results && results.ResourceTagMappingList) {
        results.ResourceTagMappingList.forEach( mapping => {
          if(mapping.ResourceARN) {
            arns.push(mapping.ResourceARN);
          }          
        });
      }              
    } 
    catch (e) {
      console.log(`${(<Error>e).name}: ${(<Error>e).message}`)
    }

    return arns;
  }

  /**
   * Perform a lookup of a subnet identified by arn,
   * @param arn The arn of the subnet
   * @returns Subnet: The subnet identified by arn
   */
  private async lookupSubnet(arn:string): Promise<Subnet> {
    let subnet: Subnet = {};

    const client = new EC2Client({});
    const command = new DescribeSubnetsCommand({
      Filters: [
        {
          Name: 'subnet-arn',
          Values: [ arn ]
        }
      ]
    });
    const results:DescribeSubnetsResult = await client.send(command);
    if(results && results.Subnets) {
      subnet = results.Subnets[0];
    }      

    return subnet;
  }

  private async lookupNetworkDetails() {
    const subnetArns: string[] = await this.lookupCampusSubnetArns();
    this.details.campusSubnetArns = subnetArns;

    const subnet1 = await this.lookupSubnet(subnetArns[0]);
    this.details.vpcId = subnet1.VpcId || '';
  }

  public async getDetails(): Promise<BuNetworkDetails> {   
    if( ! this.details.initialized()) {
      await this.lookupNetworkDetails();
    }
    return this.details;
  }
}

/**
 * Simple properties object for BuNetwork output
 */
export class BuNetworkDetails {
  private _vpcId: string = '';
  private _campusSubnetArns: string[] = [];

  public set vpcId(value: string) {
    this._vpcId = value;
  }
  public get vpcId(): string {
    return this._vpcId;
  }
  public get campusSubnetArns(): string[] {
    return this._campusSubnetArns;
  }
  public set campusSubnetArns(value: string[]) {
    this._campusSubnetArns.push(...value);
  }
  public getCampusSubnetId(i: number): string {
    if(i==0 || i<this._campusSubnetArns.length) {
      return this._campusSubnetArns[i].split('/')[1];
    }
    return '';
  }
  public initialized(): boolean {
    return this._vpcId.length > 1 && this._campusSubnetArns.length == 2;
  }
};


