@IsTest
private class InvoiceServiceTest {
    @IsTest
    static void applyPaymentMarksInvoicePaidWhenFullyCovered() {
        Invoice__c inv = new Invoice__c(Status__c = 'Sent', Total_Amount__c = 100, Due_Date__c = Date.today().addDays(10));
        insert inv;
        Payment__c p = new Payment__c(Invoice__c = inv.Id, Amount__c = 100, Payment_Method__c = 'Credit Card');

        Test.startTest();
        insert p;
        Test.stopTest();

        Invoice__c reloaded = [SELECT Status__c FROM Invoice__c WHERE Id = :inv.Id];
        System.assertEquals('Paid', reloaded.Status__c);
    }
}
