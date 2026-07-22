import { LightningElement, wire } from 'lwc';
import getLowStockProducts from '@salesforce/apex/InventoryService.getLowStockProducts';

export default class InventoryDashboard extends LightningElement {
    @wire(getLowStockProducts)
    products;

    get hasProducts() {
        return this.products?.data?.length > 0;
    }
}
