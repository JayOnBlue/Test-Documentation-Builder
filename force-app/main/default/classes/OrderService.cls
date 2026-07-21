public with sharing class OrderService {

    public static void confirmOrders(List<Order__c> orders) {
        Set<Id> orderIds = new Set<Id>();
        for (Order__c ord : orders) {
            orderIds.add(ord.Id);
        }

        List<Order_Line__c> lines = [
            SELECT Id, Order__c, Product_Name__c, Quantity__c, Price__c
            FROM Order_Line__c
            WHERE Order__c IN :orderIds
        ];


        for (Order_Line__c line : lines) {
            line.Confirmed__c = true;
        }
        update lines;

        OrderNotifier.sendConfirmationEmails(orders);
    }

    @AuraEnabled(cacheable=true)
    public static List<Order_Line__c> getOrderLines(Id orderId) {
        return [
            SELECT Id, Product_Name__c, Quantity__c, Price__c, Confirmed__c
            FROM Order_Line__c
            WHERE Order__c = :orderId
            ORDER BY Product_Name__c
        ];
    }
}
