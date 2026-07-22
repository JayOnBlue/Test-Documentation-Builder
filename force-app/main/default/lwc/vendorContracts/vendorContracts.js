import { LightningElement, wire } from 'lwc';
import getExpiringContracts from '@salesforce/apex/ContractRenewalService.getExpiringContracts';

export default class VendorContracts extends LightningElement {
    @wire(getExpiringContracts)
    contracts;
}
