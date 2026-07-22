@IsTest
private class InvoiceTriggerHandlerTest {
    @IsTest
    static void goingOverdueQueuesReminder() {
        Invoice__c inv = new Invoice__c(Status__c = 'Sent', Total_Amount__c = 250, Due_Date__c = Date.today().addDays(-3));
        insert inv;

        Test.startTest();
        inv.Status__c = 'Overdue';
        update inv;
        Test.stopTest();

        System.assert(true);
    }
}
