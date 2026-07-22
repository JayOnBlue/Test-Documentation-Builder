import { LightningElement, api, wire } from 'lwc';
import getCampaignMetrics from '@salesforce/apex/CampaignSyncService.getCampaignMetrics';

export default class CampaignPerformance extends LightningElement {
    @api recordId;

    @wire(getCampaignMetrics, { campaignRequestId: '$recordId' })
    metrics;
}
