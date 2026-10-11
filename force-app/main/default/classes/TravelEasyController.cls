public with sharing class TravelEasyController {
    @TestVisible
    static final Decimal POLICY_LIMIT = 10000;

    public class Context {
        @AuraEnabled public String firstName;
        @AuraEnabled public String userName;
        @AuraEnabled public Decimal policyLimit;
    }

    public class RequestRow {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String destination;
        @AuraEnabled public String mode;
        @AuraEnabled public String purpose;
        @AuraEnabled public String employeeName;
        @AuraEnabled public Date startDate;
        @AuraEnabled public Date endDate;
        @AuraEnabled public Decimal amount;
        @AuraEnabled public Decimal budgetLimit;
        @AuraEnabled public String policyStatus;
        @AuraEnabled public String approvalStatus;
        @AuraEnabled public String displayStatus;
        @AuraEnabled public Datetime createdDate;

        RequestRow(Travel_Request__c r) {
            id = r.Id;
            name = r.Name;
            destination = r.Destination__c;
            mode = r.Mode_of_Travel__c;
            purpose = r.Purpose_of_Travel__c;
            employeeName = r.Employee_Name__c != null ? r.Employee_Name__r.Name : r.Owner.Name;
            startDate = r.Travel_Start_Date__c;
            endDate = r.Travel_End_Date__c;
            amount = r.Estimated_Budget__c;
            budgetLimit = r.Budget_Limit__c != null ? r.Budget_Limit__c : POLICY_LIMIT;
            policyStatus = r.Policy_Status__c;
            approvalStatus = r.Approval_Status__c;
            displayStatus = statusFor(r.Approval_Status__c, r.Policy_Status__c);
            createdDate = r.CreatedDate;
        }
    }

    public class HistoryRow {
        @AuraEnabled public Id id;
        @AuraEnabled public String status;
        @AuraEnabled public String actor;
        @AuraEnabled public String comments;
        @AuraEnabled public Datetime createdDate;
    }

    public class Detail {
        @AuraEnabled public RequestRow request;
        @AuraEnabled public List<HistoryRow> history = new List<HistoryRow>();
        @AuraEnabled public Id workitemId;
    }

    @TestVisible
    static String statusFor(String approvalStatus, String policyStatus) {
        if (approvalStatus == 'Approved' || approvalStatus == 'Rejected') {
            return approvalStatus;
        }
        if (policyStatus == 'Over Budget') {
            return 'Over Budget';
        }
        return approvalStatus == 'Submitted' ? 'Pending' : 'Draft';
    }

    static List<RequestRow> toRows(List<Travel_Request__c> records) {
        List<RequestRow> rows = new List<RequestRow>();
        for (Travel_Request__c r : records) {
            rows.add(new RequestRow(r));
        }
        return rows;
    }

    static List<Travel_Request__c> queryRequests(Set<Id> ids) {
        String soql = 'SELECT Id, Name, Destination__c, Mode_of_Travel__c, Purpose_of_Travel__c, '
            + 'Employee_Name__c, Employee_Name__r.Name, Owner.Name, Travel_Start_Date__c, Travel_End_Date__c, '
            + 'Estimated_Budget__c, Budget_Limit__c, Policy_Status__c, Approval_Status__c, CreatedDate '
            + 'FROM Travel_Request__c'
            + (ids == null ? '' : ' WHERE Id IN :ids')
            + ' ORDER BY CreatedDate DESC, Name DESC LIMIT 1000';
        return Database.query(soql);
    }

    static AuraHandledException userError(String message) {
        AuraHandledException e = new AuraHandledException(message);
        e.setMessage(message);
        return e;
    }

    @AuraEnabled
    public static Context getContext() {
        Context c = new Context();
        c.firstName = String.isBlank(UserInfo.getFirstName()) ? UserInfo.getName() : UserInfo.getFirstName();
        c.userName = UserInfo.getName();
        c.policyLimit = POLICY_LIMIT;
        return c;
    }

    @AuraEnabled
    public static List<RequestRow> getRequests() {
        return toRows(queryRequests(null));
    }

    @AuraEnabled
    public static List<RequestRow> getPendingApprovals() {
        Set<Id> ids = new Set<Id>();
        for (ProcessInstanceWorkitem w : [
            SELECT ProcessInstance.TargetObjectId
            FROM ProcessInstanceWorkitem
            WHERE ActorId = :UserInfo.getUserId()
            AND ProcessInstance.TargetObject.Type = 'Travel_Request__c'
        ]) {
            ids.add(w.ProcessInstance.TargetObjectId);
        }
        return ids.isEmpty() ? new List<RequestRow>() : toRows(queryRequests(ids));
    }

    @AuraEnabled
    public static Detail getRequestDetail(Id requestId) {
        List<Travel_Request__c> records = queryRequests(new Set<Id>{ requestId });
        if (records.isEmpty()) {
            throw userError('Travel request not found.');
        }
        Detail d = new Detail();
        d.request = new RequestRow(records[0]);
        for (ProcessInstance p : [
            SELECT Id, (SELECT Id, StepStatus, Comments, Actor.Name, CreatedDate
                        FROM StepsAndWorkitems ORDER BY CreatedDate DESC, Id DESC)
            FROM ProcessInstance
            WHERE TargetObjectId = :requestId
            ORDER BY CreatedDate DESC
        ]) {
            for (ProcessInstanceHistory h : p.StepsAndWorkitems) {
                HistoryRow row = new HistoryRow();
                row.id = h.Id;
                row.status = h.StepStatus;
                row.actor = h.Actor.Name;
                row.comments = h.Comments;
                row.createdDate = h.CreatedDate;
                d.history.add(row);
            }
        }
        for (ProcessInstanceWorkitem w : [
            SELECT Id FROM ProcessInstanceWorkitem
            WHERE ProcessInstance.TargetObjectId = :requestId AND ActorId = :UserInfo.getUserId()
            LIMIT 1
        ]) {
            d.workitemId = w.Id;
        }
        return d;
    }

    @AuraEnabled
    public static Id createRequest(String destination, String mode, String startDate, String endDate,
                                   Decimal budget, String purpose, Boolean submitForApproval) {
        User me = [SELECT Id, ManagerId FROM User WHERE Id = :UserInfo.getUserId()];
        Travel_Request__c r = new Travel_Request__c(
            Destination__c = destination,
            Mode_of_Travel__c = mode,
            Purpose_of_Travel__c = purpose,
            Travel_Start_Date__c = String.isBlank(startDate) ? null : Date.valueOf(startDate),
            Travel_End_Date__c = String.isBlank(endDate) ? null : Date.valueOf(endDate),
            Estimated_Budget__c = budget,
            Budget_Limit__c = POLICY_LIMIT,
            Employee_Name__c = me.Id,
            // Demo orgs rarely have managers set up, so fall back to the requester as approver.
            Manager__c = me.ManagerId != null ? me.ManagerId : me.Id,
            Approval_Status__c = 'Draft'
        );
        try {
            insert r;
        } catch (DmlException e) {
            throw userError(e.getDmlMessage(0));
        }
        if (submitForApproval == true) {
            submit(r.Id);
        }
        return r.Id;
    }

    @AuraEnabled
    public static void submitForApproval(Id requestId) {
        submit(requestId);
    }

    static void submit(Id requestId) {
        Approval.ProcessSubmitRequest req = new Approval.ProcessSubmitRequest();
        req.setObjectId(requestId);
        req.setComments('Submitted from TravelEasy');
        try {
            Approval.process(req);
        } catch (Exception e) {
            throw userError('Could not submit for approval: ' + e.getMessage());
        }
    }

    @AuraEnabled
    public static void decide(Id workitemId, String action, String comments) {
        if (action != 'Approve' && action != 'Reject') {
            throw userError('Unknown action: ' + action);
        }
        Approval.ProcessWorkitemRequest req = new Approval.ProcessWorkitemRequest();
        req.setWorkitemId(workitemId);
        req.setAction(action);
        req.setComments(comments);
        try {
            Approval.process(req);
        } catch (Exception e) {
            throw userError('Could not ' + action.toLowerCase() + ' the request: ' + e.getMessage());
        }
    }
}
