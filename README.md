# Smart-home — TravelEasy Smart Policy Checker (Salesforce)

TravelEasy replaces spreadsheet-based travel and expense tracking at upquotient.com with a Salesforce app.
Its **Smart Policy Checker** flags travel requests that exceed the ₹10,000 budget or have invalid dates
before they reach the manager for approval, and the **Smart Home** tab gives employees a dashboard on top of it.

## What's inside

| Area | Metadata |
|---|---|
| Objects | `Travel_Request__c` (13 fields), `Expense__c` (master-detail to Travel Request) |
| Formula field | `Budget_Checker__c` — "Over Budget" / "Within Policy" |
| Validation rule | `Check_Travel_Dates` — end date cannot be before start date |
| Flow | `Smart_Policy_Checker` — before-save flow that sets `Policy_Status__c` |
| Approval process | `Travel_Request_Approval` — routes to the `Manager__c` user |
| App | `TravelEasy` Lightning app with tabs, layouts and list views |
| Permission set | `TravelEasy_User` |
| Smart Home | LWC `travelEasyApp` + Apex `TravelEasyController` (tests: `TravelEasyControllerTest`) |

### Smart Home screens

- **Home** — greeting, Total / Approved / Pending / Policy Violations cards, quick actions, recent requests, policy alerts
- **New Travel Request** — live policy check while typing (Invalid Dates / Over Budget / Within Policy)
- **My Requests** — search and All / Pending / Approved / Rejected filters
- **Approvals** — requests waiting for you, approve or reject with comments
- **Request Detail** — Details, Policy Check and Approval History tabs

## Deploy to your org

Requires the [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli).

```bash
sf org login web --alias TravelEasy
sf project deploy start --source-dir force-app --target-org TravelEasy --test-level RunSpecifiedTests --tests TravelEasyControllerTest
sf org assign permset --name TravelEasy_User --target-org TravelEasy
```

Then open the App Launcher → **TravelEasy** → **Smart Home**.
