@IsTest
private class TravelEasyControllerTest {
    @IsTest
    static void createSubmitAndApprove() {
        Id requestId = TravelEasyController.createRequest(
            'Hyderabad', 'Flight', '2026-10-15', '2026-10-17', 12000, 'Client Meeting', true);

        Travel_Request__c r = [SELECT Policy_Status__c, Approval_Status__c FROM Travel_Request__c WHERE Id = :requestId];
        Assert.areEqual('Over Budget', r.Policy_Status__c);
        Assert.areEqual('Submitted', r.Approval_Status__c);
        Assert.areEqual(1, TravelEasyController.getPendingApprovals().size());

        TravelEasyController.Detail d = TravelEasyController.getRequestDetail(requestId);
        Assert.isNotNull(d.workitemId);
        Assert.areEqual('Over Budget', d.request.displayStatus);

        TravelEasyController.decide(d.workitemId, 'Approve', 'Looks good');
        Assert.areEqual('Approved', [SELECT Approval_Status__c FROM Travel_Request__c WHERE Id = :requestId].Approval_Status__c);
        Assert.areEqual('Approved', TravelEasyController.getRequests()[0].displayStatus);
        Assert.areEqual(10000, TravelEasyController.getContext().policyLimit);
    }

    @IsTest
    static void draftThenSubmit() {
        Id requestId = TravelEasyController.createRequest(
            'Chennai', 'Train', '2026-10-15', '2026-10-17', 8000, null, false);
        Assert.areEqual('Draft', TravelEasyController.getRequestDetail(requestId).request.displayStatus);

        TravelEasyController.submitForApproval(requestId);
        Assert.areEqual('Pending', TravelEasyController.getRequestDetail(requestId).request.displayStatus);
    }

    @IsTest
    static void invalidDatesAreBlocked() {
        try {
            TravelEasyController.createRequest('Bengaluru', 'Bus', '2026-10-20', '2026-10-18', 8000, null, false);
            Assert.fail('Expected the validation rule to block the save');
        } catch (AuraHandledException e) {
            Assert.isTrue(e.getMessage().contains('cannot be earlier'), e.getMessage());
        }
    }
}
