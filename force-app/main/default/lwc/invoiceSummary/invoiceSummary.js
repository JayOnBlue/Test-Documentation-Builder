import { LightningElement, wire } from 'lwc';
import getOpenInvoices from '@salesforce/apex/InvoiceService.getOpenInvoices';

export default class InvoiceSummary extends LightningElement {
    @wire(getOpenInvoices)
    invoices;
}
