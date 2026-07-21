@IsTest
private class OrderTriggerHandlerTest {
    @IsTest
    static void confirmingAnOrderConfirmsItsLines() {
        Order__c ord = new Order__c(Status__c = 'Draft', Customer_Email__c = 'test@example.com');
        insert ord;

        Order_Line__c line = new Order_Line__c(Order__c = ord.Id, Product_Name__c = 'Widget', Quantity__c = 2, Price__c = 9.99);
        insert line;

        Test.startTest();
        ord.Status__c = 'Confirmed';
        update ord;
        Test.stopTest();

        Order_Line__c updated = [SELECT Confirmed__c FROM Order_Line__c WHERE Id = :line.Id];
        System.assert(updated.Confirmed__c);
    }
}
