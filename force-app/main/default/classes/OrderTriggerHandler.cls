public class OrderTriggerHandler {
    public static void handleAfterUpdate(List<Order__c> newOrders, Map<Id, Order__c> oldMap) {
        List<Order__c> confirmed = new List<Order__c>();
        for (Order__c ord : newOrders) {
            if (ord.Status__c == 'Confirmed' && oldMap.get(ord.Id).Status__c != 'Confirmed') {
                confirmed.add(ord);
            }
        }
        if (!confirmed.isEmpty()) {
            OrderService.confirmOrders(confirmed);
        }
    }
}
