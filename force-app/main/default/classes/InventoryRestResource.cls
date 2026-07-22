@RestResource(urlMapping='/inventory/*')
global with sharing class InventoryRestResource {

    @HttpGet
    global static List<Product__c> getLowStockProducts() {
        return InventoryService.getLowStockProducts();
    }
}
