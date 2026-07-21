import { LightningElement, api, wire } from 'lwc';
import getOrderLines from '@salesforce/apex/OrderService.getOrderLines';

export default class OrderSummary extends LightningElement {
    @api recordId;

    @wire(getOrderLines, { orderId: '$recordId' })
    orderLines;

    get hasLines() {
        return this.orderLines?.data?.length > 0;
    }
}
