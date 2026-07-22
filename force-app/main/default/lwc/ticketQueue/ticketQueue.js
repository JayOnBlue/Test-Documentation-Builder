import { LightningElement, wire } from 'lwc';
import getOpenTickets from '@salesforce/apex/TicketAssignmentService.getOpenTickets';

export default class TicketQueue extends LightningElement {
    @wire(getOpenTickets)
    tickets;
}
