import { LightningElement } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getContext from '@salesforce/apex/TravelEasyController.getContext';
import getRequests from '@salesforce/apex/TravelEasyController.getRequests';
import getPendingApprovals from '@salesforce/apex/TravelEasyController.getPendingApprovals';
import getRequestDetail from '@salesforce/apex/TravelEasyController.getRequestDetail';
import createRequest from '@salesforce/apex/TravelEasyController.createRequest';
import submitForApproval from '@salesforce/apex/TravelEasyController.submitForApproval';
import decide from '@salesforce/apex/TravelEasyController.decide';

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BADGE = {
    Approved: 'badge badge_green',
    Rejected: 'badge badge_red',
    'Over Budget': 'badge badge_red',
    Pending: 'badge badge_amber',
    Draft: 'badge badge_grey'
};
const FILTERS = {
    All: () => true,
    Pending: (r) => r.approvalStatus === 'Submitted',
    Approved: (r) => r.approvalStatus === 'Approved',
    Rejected: (r) => r.approvalStatus === 'Rejected'
};

const money = (v) => (v === null || v === undefined || v === '' ? '' : INR.format(v));
const day = (d, withYear = true) =>
    d
        ? new Date(`${d}T00:00:00`).toLocaleDateString(
              'en-GB',
              withYear ? { day: '2-digit', month: 'short', year: 'numeric' } : { day: '2-digit', month: 'short' }
          )
        : '';
const emptyForm = () => ({ destination: '', mode: 'Flight', startDate: '', endDate: '', budget: '', purpose: '' });
const errorText = (e) =>
    e?.body?.message || e?.body?.pageErrors?.[0]?.message || e?.message || 'Something went wrong.';

function decorate(r) {
    return {
        ...r,
        amountText: money(r.amount),
        datesText: `${day(r.startDate)} - ${day(r.endDate)}`,
        shortDates: `${day(r.startDate, false)} - ${day(r.endDate, false)}`,
        statusClass: BADGE[r.displayStatus] || BADGE.Draft,
        policyLabel: r.policyStatus || 'Not checked',
        policyClass: r.policyStatus === 'Over Budget' ? BADGE['Over Budget'] : BADGE.Approved,
        isRecent: !!r.createdDate && Date.now() - new Date(r.createdDate).getTime() < WEEK_MS
    };
}

export default class TravelEasyApp extends NavigationMixin(LightningElement) {
    view = 'home';
    returnView = 'my';
    loading = true;
    busy = false;
    context = {};
    requests = [];
    approvals = [];
    filter = 'All';
    search = '';
    detail;
    detailTab = 'policy';
    comment = '';
    form = emptyForm();

    connectedCallback() {
        this.refresh();
    }

    async refresh() {
        this.loading = true;
        try {
            const [ctx, reqs, pending] = await Promise.all([getContext(), getRequests(), getPendingApprovals()]);
            this.context = ctx;
            this.requests = reqs.map(decorate);
            this.approvals = pending.map(decorate);
        } catch (e) {
            this.toast('Could not load TravelEasy', errorText(e), 'error');
        } finally {
            this.loading = false;
        }
    }

    // ---------- shell ----------
    get isHome() {
        return this.view === 'home';
    }
    get isNew() {
        return this.view === 'new';
    }
    get isMy() {
        return this.view === 'my';
    }
    get isApprovals() {
        return this.view === 'approvals';
    }
    get isDetail() {
        return this.view === 'detail' && !!this.detail;
    }

    get navItems() {
        const active = this.view === 'detail' ? this.returnView : this.view;
        return [
            { view: 'home', label: 'Home', icon: 'utility:home' },
            { view: 'new', label: 'New Travel Request', icon: 'utility:add' },
            { view: 'my', label: 'My Requests', icon: 'utility:list' },
            { view: 'approvals', label: 'Approvals', icon: 'utility:approval', badge: this.approvals.length || null },
            { view: 'reports', label: 'Reports', icon: 'utility:chart' }
        ].map((i) => ({ ...i, cls: i.view === active ? 'nav-item nav-item_active' : 'nav-item' }));
    }

    // ---------- home ----------
    get policyLimit() {
        return this.context.policyLimit || 10000;
    }
    get limitText() {
        return money(this.policyLimit);
    }
    get firstName() {
        return this.context.firstName || '';
    }
    get greeting() {
        const h = new Date().getHours();
        if (h < 12) return 'Good Morning';
        return h < 17 ? 'Good Afternoon' : 'Good Evening';
    }

    get stats() {
        const r = this.requests;
        const count = (f) => r.filter(f).length;
        const week = (f) => r.filter((x) => x.isRecent && f(x)).length;
        const approved = (x) => x.approvalStatus === 'Approved';
        const pending = (x) => x.approvalStatus === 'Submitted';
        const violation = (x) => x.policyStatus === 'Over Budget';
        return [
            { label: 'Total Requests', value: r.length, note: `${week(() => true)} this week`, icon: 'utility:description', iconCls: 'stat-icon stat-icon_blue' },
            { label: 'Approved', value: count(approved), note: `${week(approved)} this week`, icon: 'utility:check', iconCls: 'stat-icon stat-icon_green' },
            { label: 'Pending Approval', value: count(pending), note: `${week(pending)} this week`, icon: 'utility:clock', iconCls: 'stat-icon stat-icon_orange' },
            { label: 'Policy Violations', value: count(violation), note: `${week(violation)} this week`, icon: 'utility:warning', iconCls: 'stat-icon stat-icon_red' }
        ];
    }

    get quickActions() {
        return [
            { view: 'new', label: 'New Travel Request', icon: 'utility:add', iconCls: 'qa-icon qa-icon_blue' },
            { view: 'my', label: 'My Requests', icon: 'utility:list', iconCls: 'qa-icon qa-icon_purple' },
            { view: 'approvals', label: 'View Approvals', icon: 'utility:approval', iconCls: 'qa-icon qa-icon_green' },
            { view: 'reports', label: 'Reports', icon: 'utility:chart', iconCls: 'qa-icon qa-icon_teal' }
        ];
    }

    get recentRequests() {
        return this.requests.slice(0, 5);
    }
    get hasRequests() {
        return this.requests.length > 0;
    }
    get overBudget() {
        return this.requests.filter((r) => r.policyStatus === 'Over Budget' && r.approvalStatus !== 'Rejected');
    }
    get overBudgetTop() {
        return this.overBudget.slice(0, 3);
    }
    get hasOverBudget() {
        return this.overBudget.length > 0;
    }
    get overBudgetTitle() {
        const n = this.overBudget.length;
        return n === 1 ? '1 request exceeds budget limit' : `${n} requests exceed budget limit`;
    }

    // ---------- my requests ----------
    get filterTabs() {
        return Object.keys(FILTERS).map((key) => ({
            key,
            label: `${key} (${this.requests.filter(FILTERS[key]).length})`,
            cls: key === this.filter ? 'chip chip_active' : 'chip'
        }));
    }
    get filteredRequests() {
        const term = this.search.trim().toLowerCase();
        return this.requests
            .filter(FILTERS[this.filter])
            .filter((r) => !term || [r.name, r.destination, r.employeeName, r.displayStatus].some((v) => (v || '').toLowerCase().includes(term)));
    }
    get hasFiltered() {
        return this.filteredRequests.length > 0;
    }
    get hasApprovals() {
        return this.approvals.length > 0;
    }

    // ---------- new request ----------
    get modeOptions() {
        return ['Flight', 'Train', 'Bus', 'Cab'].map((v) => ({ label: v, value: v }));
    }
    get userName() {
        return this.context.userName;
    }
    get formCheck() {
        const f = this.form;
        if (f.startDate && f.endDate && f.endDate < f.startDate) {
            return { invalid: true, title: 'Invalid Dates', message: 'The end date is earlier than the start date. The request cannot be saved.', cls: 'result result_red', icon: 'utility:error', variant: 'error' };
        }
        if (f.budget === '' || f.budget === null) {
            return { title: 'Waiting for details', message: 'Enter the budget and travel dates to run the policy check.', cls: 'result result_grey', icon: 'utility:info', variant: '' };
        }
        if (Number(f.budget) > this.policyLimit) {
            return { title: 'Over Budget', message: `The estimated budget (${money(f.budget)}) exceeds the company limit of ${this.limitText}. It will be flagged for review.`, cls: 'result result_red', icon: 'utility:warning', variant: 'error' };
        }
        return { title: 'Within Policy', message: `The dates are valid and ${money(f.budget)} is within the ${this.limitText} limit.`, cls: 'result result_green', icon: 'utility:success', variant: 'success' };
    }
    get saveDisabled() {
        const f = this.form;
        return this.busy || this.formCheck.invalid || !f.destination || !f.startDate || !f.endDate || f.budget === '' || f.budget === null;
    }

    // ---------- detail ----------
    get d() {
        return this.detail?.request;
    }
    get detailTabs() {
        return [
            ['details', 'Details'],
            ['policy', 'Policy Check'],
            ['history', 'Approval History']
        ].map(([key, label]) => ({ key, label, cls: key === this.detailTab ? 'tab tab_active' : 'tab' }));
    }
    get showDetailsTab() {
        return this.detailTab === 'details';
    }
    get showPolicyTab() {
        return this.detailTab === 'policy';
    }
    get overLimit() {
        return !!this.d && this.d.amount > this.d.budgetLimit;
    }
    get policyResult() {
        const d = this.d;
        if (!d) return {};
        return this.overLimit
            ? { title: 'Over Budget', message: `${money(d.amount)} exceeds the limit of ${money(d.budgetLimit)}.`, cls: 'result result_red', icon: 'utility:warning', variant: 'error' }
            : { title: 'Within Policy', message: `${money(d.amount)} is within the limit of ${money(d.budgetLimit)}.`, cls: 'result result_green', icon: 'utility:success', variant: 'success' };
    }
    get policyRules() {
        const d = this.d;
        if (!d) return [];
        return [
            { key: 'budget', label: 'Budget Check', value: `${money(d.amount)} vs limit ${money(d.budgetLimit)}`, ok: !this.overLimit, text: this.overLimit ? `Failed (exceeded by ${money(d.amount - d.budgetLimit)})` : 'Passed' },
            { key: 'dates', label: 'Date Check', value: d.datesText, ok: true, text: 'Passed' },
            { key: 'policy', label: 'Company Policy', value: `Max ${money(d.budgetLimit)}; end date on or after start date`, ok: true, text: 'Applied' }
        ].map((r) => ({
            ...r,
            icon: r.ok ? 'utility:success' : 'utility:error',
            variant: r.ok ? 'success' : 'error',
            cls: r.ok ? 'rule-result rule-result_ok' : 'rule-result rule-result_bad'
        }));
    }
    get history() {
        return (this.detail?.history || []).map((h) => {
            const label = h.status === 'Started' ? 'Submitted' : h.status;
            return {
                ...h,
                label,
                cls: BADGE[label === 'Submitted' ? 'Draft' : label] || BADGE.Draft,
                when: new Date(h.createdDate).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            };
        });
    }
    get hasHistory() {
        return this.history.length > 0;
    }
    get canDecide() {
        return !!this.detail?.workitemId;
    }
    get canSubmit() {
        return this.d?.approvalStatus === 'Draft' || this.d?.approvalStatus === 'Rejected';
    }

    // ---------- handlers ----------
    handleNav(event) {
        const view = event.currentTarget.dataset.view;
        if (view === 'reports') {
            this[NavigationMixin.Navigate]({ type: 'standard__objectPage', attributes: { objectApiName: 'Report', actionName: 'home' } });
            return;
        }
        if (view === 'new') {
            this.form = emptyForm();
        }
        this.view = view;
    }

    handleFilter(event) {
        this.filter = event.currentTarget.dataset.key;
    }

    handleSearch(event) {
        this.search = event.target.value || '';
    }

    handleField(event) {
        const field = event.target.dataset.field;
        this.form = { ...this.form, [field]: event.detail.value ?? '' };
    }

    handleTab(event) {
        this.detailTab = event.currentTarget.dataset.key;
    }

    handleComment(event) {
        this.comment = event.target.value;
    }

    openRecord() {
        this[NavigationMixin.Navigate]({ type: 'standard__recordPage', attributes: { recordId: this.d.id, actionName: 'view' } });
    }

    openRequest(event) {
        if (this.view !== 'detail') {
            this.returnView = this.view;
        }
        this.showDetail(event.currentTarget.dataset.id);
    }

    async showDetail(requestId, tab = 'policy') {
        this.loading = true;
        try {
            const detail = await getRequestDetail({ requestId });
            this.detail = { ...detail, request: decorate(detail.request) };
            this.detailTab = tab;
            this.comment = '';
            this.view = 'detail';
        } catch (e) {
            this.toast('Could not open request', errorText(e), 'error');
        } finally {
            this.loading = false;
        }
    }

    goBack() {
        this.view = this.returnView || 'my';
    }

    saveDraft() {
        this.save(false);
    }

    submitRequest() {
        this.save(true);
    }

    async save(submit) {
        this.busy = true;
        try {
            const f = this.form;
            const id = await createRequest({
                destination: f.destination,
                mode: f.mode,
                startDate: f.startDate,
                endDate: f.endDate,
                budget: Number(f.budget),
                purpose: f.purpose,
                submitForApproval: submit
            });
            this.toast(
                submit ? 'Request submitted' : 'Draft saved',
                submit ? 'Your request was sent to your manager for approval.' : 'Your request was saved as a draft.',
                'success'
            );
            this.form = emptyForm();
            this.returnView = 'my';
            await this.refresh();
            await this.showDetail(id);
        } catch (e) {
            this.toast('Request not saved', errorText(e), 'error');
        } finally {
            this.busy = false;
        }
    }

    async submitExisting() {
        this.busy = true;
        try {
            const id = this.d.id;
            await submitForApproval({ requestId: id });
            this.toast('Request submitted', 'Sent to the manager for approval.', 'success');
            await this.refresh();
            await this.showDetail(id, 'history');
        } catch (e) {
            this.toast('Could not submit', errorText(e), 'error');
        } finally {
            this.busy = false;
        }
    }

    approve() {
        this.decideOn('Approve');
    }

    reject() {
        this.decideOn('Reject');
    }

    async decideOn(action) {
        this.busy = true;
        try {
            const id = this.d.id;
            await decide({ workitemId: this.detail.workitemId, action, comments: this.comment });
            this.toast(action === 'Approve' ? 'Request approved' : 'Request rejected', `${this.d.name} was ${action === 'Approve' ? 'approved' : 'rejected'}.`, 'success');
            await this.refresh();
            await this.showDetail(id, 'history');
        } catch (e) {
            this.toast('Action failed', errorText(e), 'error');
        } finally {
            this.busy = false;
        }
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
