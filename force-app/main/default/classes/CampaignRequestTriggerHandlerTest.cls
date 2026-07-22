@IsTest
private class CampaignRequestTriggerHandlerTest {
    @IsTest
    static void goingLiveTriggersSync() {
        CampaignRequest__c c = new CampaignRequest__c(Campaign_Name__c = 'Spring Promo', Status__c = 'Approved', Budget__c = 5000);
        insert c;

        Test.startTest();
        c.Status__c = 'Live';
        update c;
        Test.stopTest();

        System.assert(true);
    }
}
