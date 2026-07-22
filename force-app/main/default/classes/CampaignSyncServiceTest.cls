@IsTest
private class CampaignSyncServiceTest {
    @IsTest
    static void getCampaignMetricsReturnsRelatedRows() {
        CampaignRequest__c c = new CampaignRequest__c(Campaign_Name__c = 'Summer Sale', Status__c = 'Live', Budget__c = 2000);
        insert c;
        CampaignMetric__c m = new CampaignMetric__c(CampaignRequest__c = c.Id, Impressions__c = 1000, Clicks__c = 50);
        insert m;

        Test.startTest();
        List<CampaignMetric__c> result = CampaignSyncService.getCampaignMetrics(c.Id);
        Test.stopTest();

        System.assertEquals(1, result.size());
    }
}
