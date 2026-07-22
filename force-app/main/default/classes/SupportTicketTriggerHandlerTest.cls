@IsTest
private class SupportTicketTriggerHandlerTest {
    @IsTest
    static void insertingTicketAssignsOwner() {
        SupportTicket__c t = new SupportTicket__c(Subject__c = 'Cannot log in', Customer_Email__c = 'a@example.com');

        Test.startTest();
        insert t;
        Test.stopTest();

        SupportTicket__c reloaded = [SELECT Status__c FROM SupportTicket__c WHERE Id = :t.Id];
        System.assertEquals('Open', reloaded.Status__c);
    }
}
